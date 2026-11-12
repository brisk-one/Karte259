// Tests für den Rechenkern des Angriffsplaners. Aufruf: node --test tests/angriff.test.js
// Nur Kunstdaten: Spieler, Dörfer, Namen und Koordinaten sind erfunden.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../site/angriff-core.js");

const W = K.makeWorld();

test("Zeitfelder: Tag und Uhrzeit getrennt, Prüfung und Format", () => {
  assert.deepEqual(K.parseDatum("3.11.26"), {y: 2026, mo: 11, d: 3});
  assert.equal(K.parseDatum("31.11.2026"), null);
  assert.equal(K.parseDatum("03.11.2026 08:00"), null);
  assert.deepEqual(K.parseUhrzeit("8"), {h: 8, mi: 0, s: 0, ms: 0});
  assert.deepEqual(K.parseUhrzeit("08:00:10:2"), {h: 8, mi: 0, s: 10, ms: 200});
  assert.equal(K.parseUhrzeit("24:00"), null);
  assert.equal(K.parseUhrzeit("08:60"), null);
  assert.equal(K.fmtDatum({y: 2026, mo: 11, d: 3}), "03.11.2026");
  assert.equal(K.fmtUhrzeit({h: 8, mi: 5, s: 0, ms: 0}), "08:05");
  assert.equal(K.fmtUhrzeit({h: 8, mi: 5, s: 0, ms: 0}, true), "08:05:00:000");
  assert.equal(K.fmtUhrzeit({h: 8, mi: 5, s: 1, ms: 20}), "08:05:01:020");
});

test("Zeitraum aus Feldern: gleiche Ergebnisse wie die Texteingabe, Zeitpunkt nur mit Freigabe", () => {
  const f = (vonDatum, vonZeit, bisDatum, bisZeit) => ({vonDatum, vonZeit, bisDatum, bisZeit});
  assert.ok(K.zeitraumAusFeldern(f("", "", "", ""), true).leer);
  const alt = K.parseAnkunft("03.11.2026 08:00:00:000 bis 09:00:00:000");
  assert.deepEqual(K.zeitraumAusFeldern(f("03.11.2026", "08:00:00:000", "", "09:00:00:000"), true), alt);
  const punkt = K.zeitraumAusFeldern(f("03.11.2026", "08:00:10:200", "", ""), true);
  assert.equal(punkt.from, punkt.to);
  assert.equal(K.zeitraumAusFeldern(f("03.11.2026", "08:00", "", ""), false).fehler, "Ende fehlt");
  const nacht = K.zeitraumAusFeldern(f("03.11.2026", "23:30", "", "00:30"), false);    // über Mitternacht
  assert.equal(nacht.to - nacht.from, 3600000);
  assert.equal(K.zeitraumAusFeldern(f("03.11.2026", "23:30", "03.11.2026", "00:30")).fehler, "Ende liegt vor dem Anfang");
  const lang = K.zeitraumAusFeldern(f("03.11.2026", "22:00", "05.11.2026", "01:00"), false);
  assert.equal(lang.to - lang.from, 27 * 3600000);
  assert.equal(K.zeitraumAusFeldern(f("", "08:00", "", "")).fehler, "Starttag fehlt");
  assert.equal(K.zeitraumAusFeldern(f("03.11.2026", "", "", "")).fehler, "Startzeit fehlt");
  assert.equal(K.zeitraumAusFeldern(f("03.11.2026", "08:00", "04.11.2026", "")).fehler, "Endzeit fehlt");
  assert.match(K.zeitraumAusFeldern(f("31.11.2026", "08:00", "", "")).fehler, /Tag nicht erkannt/);
  assert.match(K.zeitraumAusFeldern(f("03.11.2026", "25:00", "", "")).fehler, /Uhrzeit nicht erkannt/);
});

test("Abschickzeiträume aus Zeilen: leere Zeilen zählen nicht, Fehler nennen die Zeile", () => {
  const z = (vonDatum, vonZeit, bisDatum, bisZeit) => ({vonDatum, vonZeit, bisDatum, bisZeit});
  const r = K.fensterAusZeilen([z("02.11.2026", "16:00", "", "20:00"), z("", "", "", ""), z("02.11.2026", "22:00", "", "23:30")]);
  assert.deepEqual(r.fehler, []);
  assert.deepEqual(r.fenster, K.parseFenster("02.11.2026 16:00 bis 20:00\n02.11.2026 22:00 bis 23:30").fenster);
  const f = K.fensterAusZeilen([z("02.11.2026", "16:00", "", "20:00"), z("02.11.2026", "22:00", "", "")]);
  assert.deepEqual(f.fehler, ["Zeitraum 2: Ende fehlt"]);
  assert.equal(f.fenster.length, 1);
});
const leer = () => Object.fromEntries(K.UNITS.map(u => [u, 0]));
const truppen = o => Object.assign(leer(), o);
const OFF = () => truppen({axe: 6000, light: 3000, ram: 300, catapult: 50, spy: 100});              // 19.900 BH
const DEFF = n => truppen({spear: 5000, sword: 5000, archer: 3000, spy: 150, heavy: 200, catapult: 100, snob: n});

// Zeile der Truppenübersicht, Ansicht „Alle“: Kopfzeile mit „eigene“, dann vier weitere Zeilen
function block(name, x, y, k, u) {
  const z = K.OVERVIEW_COLUMNS.map(c => u[c] || 0).join("\t");
  const nullen = K.OVERVIEW_COLUMNS.map(() => 0).join("\t");
  return [name + " (" + x + "|" + y + ") K" + k + "  \teigene\t" + z + "\tBefehle", "im Dorf\t" + z + "\tTruppen",
          "auswärts\t" + nullen, "unterwegs\t" + nullen + "\tBefehle", "insgesamt\t" + z + "\tTruppen"].join("\n");
}

test("Spielwerte und Formeln", () => {
  assert.equal(K.popOf(truppen({axe: 5000, light: 2500, ram: 250})), 16250);           // Off-Richtwert
  assert.equal(K.travelS(W, "ram", 10), 18000);                                       // 30 min je Feld
  assert.equal(K.travelS(W, "snob", Math.hypot(3, 4)), 10500);
  assert.equal(K.travelS(W, "snob", Math.hypot(1, 1)), Math.round(35 * 60 * Math.SQRT2));
  assert.ok(Math.abs(K.erfolgsChance(4) - 0.867) < 0.001);
  assert.equal(K.erfolgsChance(5), 1);
  assert.ok(Math.abs(K.moral(3, 10000, 1000, 1) - 0.552) < 1e-9);                     // wie Moral-Seite: 55 %
  assert.equal(K.moral(3, 100000, 90000, 10), 1);
  assert.equal(K.moral(0, 100000, 1, 0), 1);
});

test("Zeiten in Serverzeit", () => {
  const a = K.parseAnkunft("03.11.2026 08:00:10:200");
  assert.equal(a.from, Date.UTC(2026, 10, 3, 7, 0, 10, 200));                         // MEZ = UTC+1
  assert.equal(a.to, a.from);
  assert.equal(K.fmtZeit(a.from, true), "03.11.2026 08:00:10:200");
  const s = K.parseAnkunft("15.07.2026 08:00:00:000 bis 09:30:00:000");               // MESZ = UTC+2
  assert.equal(s.from, Date.UTC(2026, 6, 15, 6, 0, 0));
  assert.equal(s.to - s.from, 90 * 60000);
  const m = K.parseAnkunft("03.11.2026 23:30:00:000 bis 00:30:00:000");               // über Mitternacht
  assert.equal(m.to - m.from, 3600000);
  const f = K.parseFenster("02.11.2026 16:00 bis 20:00\n02.11.2026 22:00-23:30; 03.11.2026 23:00 bis 01:00");
  assert.deepEqual(f.fehler, []);
  assert.equal(f.fenster.length, 3);
  assert.equal(f.fenster[2][1] - f.fenster[2][0], 2 * 3600000);
  assert.ok(K.parseAnkunft("08:00").fehler);
  assert.ok(K.istNacht(W, K.parseAnkunft("03.11.2026 07:59:59").from));
  assert.ok(!K.istNacht(W, K.parseAnkunft("03.11.2026 08:00:00").from));
});

test("Truppenübersicht, Ansicht Alle", () => {
  const text = [
    "Rangliste", "(12.|345.678 P)",
    "[007] Aktives Dorf\t(101|102) K11\t",                     // Kopfzeile des aktiven Dorfes, darunter Rohstoffe
    "29805\t\t65211\t\t452\t\t400000\t\t(738)19738/20476",
    "Dorf (3)\t\t\tAktion",
    block("[001] Erstes Dorf", 101, 102, 11, OFF()),
    block("[002] Zweites Dorf, mit Komma", 103, 104, 11, DEFF(3)),
    block("Frisch geadelt", 99, 100, 10, truppen({axe: 135, snob: 2})),
    "Dörfer pro Seite:", "100",
  ].join("\n");
  const r = K.parseOverview(text);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.header, {rank: 12, points: 345678});
  assert.equal(r.villages.length, 3);
  assert.deepEqual(r.villages.map(v => [v.x, v.y]), [[101, 102], [103, 104], [99, 100]]);
  assert.equal(r.villages[0].units.axe, 6000);
  assert.equal(r.villages[1].units.snob, 3);
  assert.equal(r.villages[1].name, "[002] Zweites Dorf, mit Komma");
  assert.equal(r.villages[2].units.snob, 2);
});

test("Stammes-Truppenübersicht eines Spielers (Dennis 12.11.2026): Punkte vorn, Einheiten ohne Miliz, Rest ignoriert", () => {
  // Kunstdaten im Format von Stamm › Mitglieder › Truppen (Kopf, Spielername, Erklärsatz, Kopfzeile, eine Zeile je Dorf)
  const z = (u, rest) => K.UNITS.map(c => u[c] || 0).concat(rest).join("\t");
  const text = [
    "Rangliste", "(12.|345.678 P)", "Truppen", "Kunstspieler",
    "Die Truppenübersicht zeigt die Anzahl der Truppen jedes Dorfes, einschließlich der Truppen, die sich derzeit nicht im Dorf befinden.",
    "Dorf\tPunkte\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t (0)",
    "0001.01 (101|102) K11\t9.866\t" + z(OFF(), [0, 3, 0]),
    "0001.02 (103|104) K11\t706\t" + z(DEFF(1), [0, 0, 0]),
    "Serverzeit: 18:24:07 12/11/2026",
  ].join("\n");
  const r = K.parseOverview(text);
  assert.equal(r.stamm, true);
  assert.deepEqual(r.errors, []);
  assert.equal(r.villages.length, 2);
  assert.deepEqual(r.villages[0].units, Object.assign(truppen({}), OFF()));
  assert.equal(r.villages[1].units.snob, 1);
  assert.equal(r.villages[1].units.spear, DEFF(1).spear);
  assert.match(r.warnings.join(" "), /Stammes-Truppenübersicht: zählt auch Truppen/);
  // ohne Kopfzeile: Hinweis statt stiller Fehllesung
  const ohne = K.parseOverview("0001.01 (101|102) K11\t9.866\t" + z(OFF(), [0, 3, 0]));
  assert.equal(ohne.stamm, false);
  assert.match(ohne.warnings.join(" "), /Kopfzeile „Dorf Punkte“/);
  // zu wenige Zahlen
  const kurz = K.parseOverview("Dorf\tPunkte\n0001.01 (101|102) K11\t9.866\t1\t2\t3");
  assert.match(kurz.errors[0], /3 Zahlen nach den Punkten, erwartet 12/);
});

test("Truppenübersicht, Ansicht Eigene und Fehlerfälle", () => {
  const z = K.OVERVIEW_COLUMNS.map(c => OFF()[c] || 0).join("\t");
  const r = K.parseOverview("[001] Eins (10|20) K21\t" + z + "\tBefehle\n[002] Zwei (11|20) K21\t" + z);
  assert.equal(r.villages.length, 2);
  assert.equal(r.villages[1].units.ram, 300);
  const kurz = K.parseOverview("[001] Eins (10|20) K21\teigene\t1\t2\t3");
  assert.equal(kurz.villages.length, 0);
  assert.match(kurz.errors[0], /3 Zahlen, erwartet 13/);
  const falsch = K.parseOverview("[001] Eins (10|20) K21\tim Dorf\t" + z);
  assert.match(falsch.errors[0], /Ansicht/);
  const doppelt = K.parseOverview([block("A", 1, 1, 0, OFF()), block("B", 1, 1, 0, OFF())].join("\n"));
  assert.equal(doppelt.villages.length, 1);
  assert.equal(doppelt.warnings.length, 1);
  const seiten = K.parseOverview("Dorf (5)\n" + block("A", 1, 1, 0, OFF()));
  assert.match(seiten.warnings[0], /nennt 5 Dörfer, gelesen 1/);
});

test("Einordnung: Off, knappe Off, Fakelimit", () => {
  const rw = {units: truppen({axe: 5000, light: 2500, ram: 250}), pts: 10000};
  const c = K.classify(rw, W, {}, 0);
  assert.equal(c.offPop, 16250);
  assert.ok(c.isOff);
  assert.equal(c.fakeMin, 105);                                     // 1 % von 10.000 plus 5 Zuschlag
  const knapp = {units: truppen({axe: 5000, light: 2500, ram: 240}), pts: 10000};
  assert.ok(!K.classify(knapp, W, {}, 0).isOff);
  assert.ok(!K.classify(knapp, W, {}, 0).knapp);
  assert.ok(K.classify(knapp, W, {}, 0.5).knapp);                  // 240 + 0,5 × 20 Rammen
  assert.equal(K.classify(knapp, W, {}, 0).fehltRammen, 10);
  const deff = {units: DEFF(0), pts: 9000};
  const d = K.classify(deff, W, {}, 10);
  assert.ok(!d.isOff);
  assert.equal(d.offPop, 100 * 8);                                  // SKav zählt im Deff-Dorf nicht
});

test("Fakes aus Katapulten und Spähern: immer ein Späher, höchstens eine Ramme und nur ohne Katapult (Dennis 10.11.2026)", () => {
  const f = K.fakeAus({catapult: 50, spy: 100, ram: 0}, 105, W.pop, "kata");
  assert.deepEqual(f, {catapult: 13, spy: 1, ram: 0});              // 104 + 2 BH
  const s = K.fakeAus({catapult: 50, spy: 100, ram: 0}, 105, W.pop, "spaeher");
  assert.deepEqual(s, {catapult: 1, spy: 49, ram: 0});
  assert.deepEqual(K.fakeAus({catapult: 50, spy: 100, ram: 0}, 104, W.pop, "kata"), {catapult: 13, spy: 1, ram: 0});   // Katapulte allein reichen: Späher trotzdem
  assert.equal(K.fakeAus({catapult: 50, spy: 0, ram: 30}, 105, W.pop, "kata"), null);   // ohne Späher kein Fake
  assert.equal(K.fakeAus({catapult: 0, spy: 100, ram: 0}, 105, W.pop, "kata"), null);   // ohne Katapult und Ramme kein Fake
  assert.deepEqual(K.fakeAus({catapult: 0, spy: 100, ram: 30}, 105, W.pop, "kata"), {catapult: 0, spy: 50, ram: 1});   // eine Ramme, Rest Späher
  assert.deepEqual(K.fakeAus({catapult: 2, spy: 100, ram: 30}, 105, W.pop, "kata"), {catapult: 2, spy: 45, ram: 0});   // Katapult vor Ramme
  assert.equal(K.fakeAus({catapult: 0, spy: 10, ram: 30}, 105, W.pop, "kata"), null);   // Standard: höchstens eine Ramme
  // Rammen je Fake je Spieler einstellbar (Dennis 10.11.2026 01:17): erst Katapulte und Späher, dann Rammen bis zur Grenze
  assert.deepEqual(K.fakeAus({catapult: 0, spy: 10, ram: 30}, 105, W.pop, "kata", 20), {catapult: 0, spy: 10, ram: 17});
  assert.equal(K.fakeAus({catapult: 0, spy: 10, ram: 30}, 105, W.pop, "kata", 10), null);
  assert.deepEqual(K.fakeAus({catapult: 5, spy: 10, ram: 30}, 105, W.pop, "kata", 20), {catapult: 5, spy: 10, ram: 9});
  assert.equal(K.fakeAus({catapult: 0, spy: 100, ram: 30}, 105, W.pop, "kata", 0), null);   // 0: keine Rammen
  assert.equal(K.fakeAus({catapult: 5, spy: 10, ram: 0}, 105, W.pop, "kata"), null);   // reicht nicht
});

/* ---------- Kunstszenario ----------
   Zielspieler „Ziel“ bei 470|500, AG-Dörfer 22 Felder östlich, Offs 29 bis 30 Felder östlich.
   Ankunft 03.11.2026 08:00 bis 09:00, Abschicken 02.11.2026 16:00 bis 20:00 und 22:00 bis 23:30. */
function szenario(cfg, extra) {
  const v = (id, x, y, units, pts) => ({id, name: "D" + id, x, y, pts: pts || 10000, units, nobles: units.snob});
  const alpha = {id: 101, name: "Alpha", points: 300000, villages: [
    v(1, 492, 500, DEFF(5)), v(2, 492, 502, Object.assign(OFF(), {snob: 4})),
    v(3, 499, 500, OFF()), v(4, 499, 502, OFF()), v(5, 499, 498, OFF()), v(6, 500, 501, OFF()), v(7, 500, 499, OFF()),
    v(8, 498, 503, OFF()), v(9, 495, 496, DEFF(0)), v(10, 496, 505, truppen({axe: 3000, light: 1500, ram: 120, catapult: 40, spy: 30}))]};
  const beta = {id: 102, name: "Beta", points: 250000, villages: [
    v(21, 492, 498, DEFF(4)), v(22, 499, 504, OFF()), v(23, 499, 496, OFF()), v(24, 497, 494, DEFF(0))]};
  const z = (id, x, y) => ({id, x, y, owner: 900});
  const agTargets = [z(901, 470, 500), z(902, 471, 502), z(903, 469, 498), z(904, 472, 499)];
  const fakeTargets = [z(905, 468, 503), z(906, 473, 504), z(907, 466, 497), z(908, 474, 495)];
  return Object.assign({world: W, cfg: Object.assign({seed: 3}, cfg), attackers: [alpha, beta], agTargets, fakeTargets,
    arrival: K.parseAnkunft("03.11.2026 08:00:00:000 bis 09:00:00:000"),
    windows: K.parseFenster("02.11.2026 16:00 bis 20:00\n02.11.2026 22:00 bis 23:30").fenster,
    now: Date.UTC(2026, 10, 2, 12, 0)}, extra);
}
const ofZiel = (r, id) => r.items.filter(i => i.t.id === id && i.kind !== "fake").sort((a, b) => a.arrivalMs - b.arrivalMs);

test("Plan: Abschickzeiträume je Angreifer, ohne eigene gelten die gemeinsamen", () => {
  const input = szenario({}, {windows: K.parseFenster("02.11.2026 16:00 bis 20:00").fenster});
  const eigen = K.parseFenster("02.11.2026 19:00 bis 20:00").fenster;
  input.attackers[1].windows = eigen;
  const r = K.plan(input);
  assert.deepEqual(K.pruefePlan(r, input), []);
  const von = id => r.items.filter(i => i.att === id);
  assert.ok(von(102).length > 0);
  von(102).forEach(i => assert.ok(K.ivHas(eigen, i.sendMs), "Beta nur im eigenen Zeitraum"));
  assert.ok(von(101).some(i => i.sendMs < eigen[0][0]), "Alpha nutzt den gemeinsamen Zeitraum");
});

test("Plan: ganze Trains, Clean-Offs vorneweg, alle Regeln eingehalten", () => {
  const input = szenario({});
  const r = K.plan(input);
  assert.deepEqual(K.pruefePlan(r, input), []);
  assert.equal(r.stats.geadelt, 3);                                 // Trains: D1 (5 AGs), D2 (4), D21 (4)
  r.ziele.filter(z => z.geadelt).forEach(z => {
    const its = ofZiel(r, z.id);
    const offs = its.filter(i => i.kind === "clean"), ags = its.filter(i => i.kind === "ag");
    assert.equal(offs.length, 2, "Richtwert 2 Clean-Offs");
    assert.equal(ags.length, 4);
    assert.equal(new Set(ags.map(i => i.v.id)).size, 1, "ganzer Train aus einem Dorf");
    assert.equal(ags[0].arrivalMs - offs[1].arrivalMs, 200, "letzte Clean-Off 200 ms vor dem ersten AG");
    for (let i = 1; i < 4; i++) assert.equal(ags[i].arrivalMs - ags[i - 1].arrivalMs, 200);
    assert.equal(offs[0].units.ram > 0, true);
  });
  const nicht = r.ziele.filter(z => !z.geadelt);
  assert.equal(nicht.length, 1);
  assert.match(nicht[0].grund, /AG/);
  // Train mit Off: D2 (Off-Dorf mit 4 AGs) trägt seine Off komplett beim ersten AG, ist keine Clean-Off
  const d2 = r.items.filter(i => i.v.id === 2);
  assert.ok(d2.every(i => i.kind === "ag" || i.kind === "fake"));
  const d2ags = d2.filter(i => i.kind === "ag").sort((a, b) => a.offset - b.offset);
  assert.ok(d2ags[0].units.axe > 5000 && d2ags[0].units.ram === 300);
  assert.deepEqual([d2ags[1].units.axe, d2ags[2].units.axe, d2ags[3].units.axe], [100, 100, 100]);
  // Fakes: Pflichtziele plus das nicht geadelte AG-Ziel
  [905, 906, 907, 908, nicht[0].id].forEach(id => assert.equal(r.items.filter(i => i.kind === "fake" && i.t.id === id).length, 2));
  r.items.filter(i => i.kind === "fake").forEach(i => assert.equal(i.units.ram, 0, "keine Rammen aus Off-Dörfern"));
});

test("Plan: Off splitten, 2er-Trains und einzeln", () => {
  const split = K.plan(szenario({split_full: true}));
  const d2 = split.items.filter(i => i.v.id === 2 && i.kind === "ag");
  assert.equal(d2.length, 4);
  assert.deepEqual(d2.map(i => i.units.ram), [75, 75, 75, 75]);
  assert.ok(Math.max(...d2.map(i => i.units.axe)) - Math.min(...d2.map(i => i.units.axe)) <= 3);

  const zwei = szenario({train_form: "zwei"});
  const rz = K.plan(zwei);
  assert.deepEqual(K.pruefePlan(rz, zwei), []);
  rz.ziele.filter(z => z.geadelt).forEach(z => {
    const ags = ofZiel(rz, z.id).filter(i => i.kind === "ag");
    const jeDorf = new Map();
    ags.forEach(i => jeDorf.set(i.v.id, (jeDorf.get(i.v.id) || 0) + 1));
    assert.ok([...jeDorf.values()].every(n => n <= 2), "höchstens 2 AGs je Dorf und Ziel");
  });
  // 2er-Train aus dem Off-Dorf D2: Off Hälfte und Hälfte
  // D2 hat 4 AGs, also zwei 2er-Trains; nur der erste trägt die Off, Hälfte und Hälfte
  const d2z = rz.items.filter(i => i.v.id === 2 && i.kind === "ag");
  const jeZiel = new Map();
  d2z.forEach(i => { if (!jeZiel.has(i.t.id)) jeZiel.set(i.t.id, []); jeZiel.get(i.t.id).push(i); });
  const mitOff = [...jeZiel.values()].filter(g => g.some(i => i.units.ram > 0));
  if (d2z.length) {
    assert.equal(mitOff.length, 1);
    assert.deepEqual(mitOff[0].map(i => i.units.ram), [150, 150]);
  }

  const einzeln = szenario({train_form: "einzeln"});
  const re = K.plan(einzeln);
  assert.deepEqual(K.pruefePlan(re, einzeln), []);
  re.ziele.filter(z => z.geadelt).forEach(z => {
    const ags = ofZiel(re, z.id).filter(i => i.kind === "ag");
    assert.equal(new Set(ags.map(i => i.v.id)).size, ags.length, "jedes AG aus einem anderen Dorf");
  });
});

test("Plan: Clean-Off ist Pflicht, Richtwert wird mit den Offs abgeglichen", () => {
  const wenig = szenario({clean_per_target: 3});
  wenig.attackers[0].villages = wenig.attackers[0].villages.filter(v => ![4, 5, 6, 7, 8].includes(v.id));
  wenig.attackers[1].villages = wenig.attackers[1].villages.filter(v => v.id !== 23);
  const r = K.plan(wenig);
  assert.deepEqual(K.pruefePlan(r, wenig), []);
  // Offs: D3 und D22, dazu D2 nur, wenn sein Train nicht gebraucht wird
  r.ziele.filter(z => z.geadelt).forEach(z => assert.ok(ofZiel(r, z.id).some(i => i.kind === "clean")));
  assert.ok(r.warnings.some(w => w.art === "richtwert"));
  const keine = szenario({});
  keine.attackers.forEach(a => { a.villages = a.villages.filter(v => v.units.snob > 0 && !(v.units.axe > 0)); });
  const r2 = K.plan(keine);
  assert.equal(r2.stats.geadelt, 0);
  // zwei Ziele hätten einen Train (D1, D21), aber keine Clean-Off; die anderen beiden haben kein AG mehr
  assert.equal(r2.ziele.filter(z => /Clean-Off/.test(z.grund)).length, 2);
  assert.equal(r2.ziele.filter(z => /AG/.test(z.grund)).length, 2);
});

test("Plan: Abschicken der Clean-Off vor den AGs, Mindestabstand je Angreifer", () => {
  const input = szenario({min_send_gap_s: 30});
  const r = K.plan(input);
  assert.deepEqual(K.pruefePlan(r, input), []);
  r.ziele.filter(z => z.geadelt).forEach(z => assert.ok(z.offZuerst, "Off-Dörfer liegen 7/6 weiter weg"));
});

test("Plan: fester Zeitpunkt, zugewiesene Ziele, übrige Offs auf Nicht-AG-Dörfer", () => {
  const fest = szenario({}, {arrival: K.parseAnkunft("03.11.2026 08:30:00:000")});
  const rf = K.plan(fest);
  assert.deepEqual(K.pruefePlan(rf, fest).filter(x => !/Mindestabstand/.test(x)), []);
  rf.ziele.filter(z => z.geadelt).forEach(z => assert.equal(ofZiel(rf, z.id)[0].arrivalMs, fest.arrival.from));

  const zu = szenario({});
  zu.agTargets.forEach(t => { t.assignee = 102; });
  const rz = K.plan(zu);
  assert.equal(rz.stats.geadelt, 1);                                // Beta hat nur D21 mit 4 AGs
  assert.ok(rz.items.filter(i => i.kind === "ag").every(i => i.att === 102));

  const rest = szenario({rest_offs: "nicht_ag"});
  const rr = K.plan(rest);
  assert.deepEqual(K.pruefePlan(rr, rest), []);
  const restOffs = rr.items.filter(i => i.kind === "rest");
  assert.ok(restOffs.length > 0);
  assert.equal(new Set(restOffs.map(i => i.t.id)).size, restOffs.length);
  assert.equal(rr.freieOffs.length + restOffs.length, K.plan(szenario({})).freieOffs.length);
});

test("Plan: zusätzliche Fakeziele nur bei ausreichender Moral", () => {
  // seit 10.11.2026 eigene Zahl je Zieldorf für Stammesmitglieder (Standard 1), hier 2 wie zuvor
  const input = szenario({extra_fakes: true, extra_fakes_per_village: 2}, {extraFakeTargets: [
    {id: 950, x: 470, y: 510, owner: 951, ownerPoints: 200000, ownerDays: 60},   // stark: Moral 100 %
    {id: 960, x: 471, y: 511, owner: 961, ownerPoints: 5000, ownerDays: 60}]}); // schwach: Moral unter 100 %
  const r = K.plan(input);
  assert.equal(r.items.filter(i => i.kind === "fake" && i.t.id === 950).length, 2);
  assert.equal(r.items.filter(i => i.kind === "fake" && i.t.id === 960).length, 0);
});

test("Plan ist mit gleichem Startwert gleich, mit anderem verteilt", () => {
  const a = K.plan(szenario({seed: 5})), b = K.plan(szenario({seed: 5})), c = K.plan(szenario({seed: 6}));
  const sig = r => r.items.map(i => i.v.id + ">" + i.t.id + "@" + i.arrivalMs).join(",");
  assert.equal(sig(a), sig(b));
  assert.notEqual(sig(a), sig(c));
});

test("Export im Format von DS-Ultimate", () => {
  const r = K.plan(szenario({}));
  const d = K.toDSU(r.items);
  assert.deepEqual(Object.keys(d), ["title", "uvMode", "world", "twWorld", "items"]);
  assert.equal(d.world, "de259");
  assert.equal(d.items.length, r.items.length);
  const keys = ["source", "destination", "slowest_unit", "arrival_time", "type", "support_boost", "tribe_skill", "ms"].concat(K.UNITS);
  d.items.forEach(x => assert.deepEqual(Object.keys(x), keys));
  const typ = new Set(d.items.map(x => x.type + "/" + x.slowest_unit));
  assert.deepEqual([...typ].sort(), ["11/11", "14/8", "8/8"]);
  const ag = d.items.find(x => x.type === 11);
  assert.equal(ag.snob, "1");
  assert.equal(typeof ag.axe, "string");
  const it = r.items[0];
  assert.equal(d.items[0].arrival_time * 1000 + d.items[0].ms, it.arrivalMs);
  // DS-Ultimate rechnet die Abschickzeit selbst: Ankunft minus round(Minuten je Feld × 60 × Entfernung)
  d.items.forEach((x, i) => {
    const src = r.items[i].v, dst = r.items[i].t;
    const lauf = Math.round(W.speed[K.UNITS[x.slowest_unit]] * 60 * Math.hypot(src.x - dst.x, src.y - dst.y));
    assert.equal((x.arrival_time - lauf) * 1000 + x.ms, r.items[i].sendMs);
  });
});

test("Plan: zwei gleich weit entfernte Dörfer eines Angreifers nicht im selben Block", () => {
  // 499|501 und 499|499 liegen gleich weit von 470|500: Abschicken fast gleichzeitig, also nicht beide als Clean-Off
  const v = (id, x, y, units) => ({id, name: "D" + id, x, y, pts: 10000, units, nobles: units.snob});
  const input = {world: W, cfg: {seed: 1, clean_per_target: 2}, attackers: [{id: 101, name: "Alpha", points: 300000, villages: [
      v(1, 492, 500, DEFF(4)), v(2, 499, 501, OFF()), v(3, 499, 499, OFF())]}],
    agTargets: [{id: 901, x: 470, y: 500, owner: 900}], fakeTargets: [],
    arrival: K.parseAnkunft("03.11.2026 08:00:00:000 bis 09:00:00:000"),
    windows: K.parseFenster("02.11.2026 16:00 bis 20:00\n02.11.2026 22:00 bis 23:30").fenster};
  const r = K.plan(input);
  assert.deepEqual(K.pruefePlan(r, input), []);
  assert.equal(r.items.filter(i => i.kind === "clean").length, 1);
  assert.ok(r.warnings.some(w => w.art === "richtwert"));
});

test("Plan: zu wenige Offs, Variante weniger Clean-Offs oder weniger Ziele", () => {
  const knapp = cfg => {
    const input = szenario(Object.assign({clean_per_target: 2}, cfg));
    input.attackers[0].villages = input.attackers[0].villages.filter(v => ![5, 6, 7, 8].includes(v.id));
    input.attackers[1].villages = input.attackers[1].villages.filter(v => v.id !== 23);
    return input;
  };
  const a = knapp({}), ra = K.plan(a);                              // Standard: weniger Clean-Offs je Ziel
  const b = knapp({clean_knapp: "weniger_ziele"}), rb = K.plan(b);
  assert.deepEqual(K.pruefePlan(ra, a), []);
  assert.deepEqual(K.pruefePlan(rb, b), []);
  assert.ok(ra.knapp.unterRichtwert > 0);
  assert.ok(rb.knapp.gestrichen > 0);
  assert.ok(rb.stats.geadelt < ra.stats.geadelt);
  rb.ziele.filter(z => z.geadelt).forEach(z => assert.equal(z.clean, 2));
  assert.ok(rb.ziele.some(z => /weniger Ziele/.test(z.grund || "")));
});

test("Dorfliste aus Links oder Koordinaten", () => {
  const text = [
    "[Probe 033 (639|602) K66](https://de259.die-staemme.de/game.php?village=1&screen=info_village&id=26656)",
    "[Probe 034 (640|603) K66](https://de259.die-staemme.de/game.php?village=1&screen=info_village&id=28767)",
    "634|605", "Probe 012 (635|605) K66", "(639|602)", "Rangliste (104.|420.855 P)"].join("\n");
  const r = K.parseKoordListe(text);
  assert.deepEqual(r.keys, [639602, 640603, 634605, 635605]);
  assert.equal(r.doppelt, 1);
});

test("Teilnahme je Spieler und Dorfauswahl für Offs und AGs", () => {
  const input = szenario({});
  input.attackers[1].rollen = {off: false, ag: false, fake: true};          // Beta schickt nur Fakes
  input.attackers[0].auswahl = [492 * 1000 + 500, 499 * 1000 + 500, 499 * 1000 + 502, 499 * 1000 + 498];
  const r = K.plan(input);
  assert.deepEqual(K.pruefePlan(r, input), []);
  const beta = r.items.filter(i => i.att === 102);
  assert.ok(beta.length > 0 && beta.every(i => i.kind === "fake"));
  const alphaAngriff = r.items.filter(i => i.att === 101 && i.kind !== "fake");
  assert.ok(alphaAngriff.length > 0);
  assert.ok(alphaAngriff.every(i => [492500, 499500, 499502, 499498].includes(i.v.x * 1000 + i.v.y)), "nur Dörfer aus der Auswahl");
  // Fakes dürfen aus allen Dörfern kommen; Offs außerhalb der Auswahl geben keine Rammen her und bleiben über dem Richtwert
  const ausserhalb = r.items.filter(i => i.kind === "fake" && i.att === 101 && ![492500, 499500, 499502, 499498].includes(i.v.x * 1000 + i.v.y));
  assert.ok(ausserhalb.length > 0);
  ausserhalb.filter(i => [2, 6, 7, 8].includes(i.v.id)).forEach(i => assert.equal(i.units.ram, 0));   // Off-Dörfer; D10 ist keine Off
  const nurAG = szenario({});
  nurAG.attackers[0].rollen = {off: false, ag: true, fake: false};          // AGs ohne Offs: Train ohne mitlaufende Off
  const r2 = K.plan(nurAG);
  assert.deepEqual(K.pruefePlan(r2, nurAG), []);
  r2.items.filter(i => i.att === 101).forEach(i => assert.equal(i.kind, "ag"));
  r2.items.filter(i => i.att === 101).forEach(i => assert.equal(i.units.ram, 0));
});

test("Export getrennt: alles, Offs und AGs, Fakes, je Angreifer", () => {
  const r = K.plan(szenario({}));
  const alle = K.exportAuswahl(r.items, "alle"), angriff = K.exportAuswahl(r.items, "angriff"), fake = K.exportAuswahl(r.items, "fake");
  assert.equal(angriff.length + fake.length, alle.length);
  assert.ok(angriff.every(i => i.kind !== "fake") && fake.every(i => i.kind === "fake"));
  const beta = K.exportAuswahl(r.items, "angriff", 102);
  assert.ok(beta.every(i => i.att === 102 && i.kind !== "fake"));
  assert.deepEqual(new Set(K.toDSU(fake).items.map(x => x.type)), new Set([14]));
});

test("Plan: keine Abschickzeit vor jetzt", () => {
  const input = szenario({}, {now: Date.UTC(2026, 10, 2, 17, 30)});     // 18:30 Serverzeit, erstes Fenster läuft schon
  const r = K.plan(input);
  assert.ok(r.items.length > 0);
  assert.ok(r.items.every(i => i.sendMs >= input.now + 60000));
  assert.ok(!r.warnings.some(w => w.art === "vergangen"));
});

/* ---------- v0.5: Abschickzeiten bündeln (Spezifikation 15) ---------- */
const vorgaenge = (r, att, nurKern) => {
  const m = new Map();
  r.items.filter(i => i.att === att && (!nurKern || i.kind !== "fake")).forEach(i => { const k = i.aktion; if (!m.has(k)) m.set(k, i.sendMs); });
  return [...m.values()].sort((a, b) => a - b);
};

test("v0.5: Zeiträume sind Wunsch, Befehle außerhalb markiert, Hinweise zum Erweitern", () => {
  const breit = K.plan(szenario({}));
  const input = szenario({}, {windows: K.parseFenster("02.11.2026 16:00 bis 17:00").fenster});
  const r = K.plan(input);
  assert.deepEqual(K.pruefePlan(r, input), []);
  assert.equal(r.stats.geadelt, breit.stats.geadelt, "zu kurze Zeiträume kosten keine Ziele");
  const aussen = r.items.filter(i => i.ausserhalb && i.kind !== "fake");
  assert.ok(aussen.length > 0);
  assert.ok(r.items.filter(i => !i.ausserhalb).every(i => K.ivHas(input.windows, i.sendMs)));
  assert.ok(r.hinweise.length > 0 && r.hinweise.every(h => /länger: bis|früher beginnen|zusätzlicher Zeitraum/.test(h.text)));
  // jeder Befehl außerhalb liegt in einem der vorgeschlagenen Zeiträume oder in der vorgeschlagenen Verlängerung
  const abgedeckt = s => r.hinweise.some(h => s >= h.von && s <= h.bis) || input.windows.some(w => s >= w[0] && s <= r.hinweise.reduce((m, h) => Math.max(m, h.bis), w[1]));
  aussen.forEach(i => assert.ok(abgedeckt(i.sendMs), "Hinweis deckt " + K.fmtZeit(i.sendMs) + " ab"));
  assert.ok(r.warnings.some(w => w.art === "ausserhalb"));
  // streng: wie bis v0.4, nichts außerhalb, dafür weniger Ziele
  const st = K.plan(szenario({zeitraeume: "streng"}, {windows: input.windows}));
  assert.ok(st.items.every(i => !i.ausserhalb) && st.stats.geadelt < r.stats.geadelt);
});

test("v0.5: Sitzungen gebündelt, Fakes nur in den Sitzungen, Abstände", () => {
  const input = szenario({});
  const r = K.plan(input);
  assert.deepEqual(K.pruefePlan(r, input), []);
  [101, 102].forEach(a => {
    const kern = K.sitzungenAus(vorgaenge(r, a, true));
    const alle = vorgaenge(r, a, false);
    assert.ok(kern.length <= 2, "höchstens zwei Sitzungen für Offs und AGs bei " + a + ": " + kern.length);
    // Fakes höchstens 10 Minuten vor oder nach einer Sitzung der Offs und AGs
    r.items.filter(i => i.att === a && i.kind === "fake").forEach(i =>
      assert.ok(kern.some(([x, y]) => i.sendMs >= x - 600000 && i.sendMs <= y + 600000), "Fake in Sitzung"));
    for (let i = 1; i < alle.length; i++) assert.ok(alle[i] - alle[i - 1] >= 3000, "Mindestabstand");
    const gaps = alle.slice(1).map((s, i) => s - alle[i]).filter(g => g <= K.SITZUNG_PAUSE_MS).sort((p, q) => p - q);
    if (gaps.length) assert.ok(gaps[gaps.length >> 1] >= 10000, "Mindestabstandtendenz im Mittel eingehalten");
  });
  assert.ok(r.sitzungen[101].length >= 1 && r.sitzungen[101].every(z => z.bis >= z.von && z.n > 0));
  // Rangfolge „sitzungen“: nie mehr Sitzungen als „standard“
  const s2 = K.plan(szenario({zeit_rangfolge: "sitzungen"}));
  assert.ok(s2.bewertung.sitzungen <= r.bewertung.sitzungen);
});

test("v0.5: nachts außerhalb, Rangfolge Nachtruhe", () => {
  // Ankunft 14:00: AGs müssten etwa 01:10 bis 02:10 los, außerhalb der Zeiträume und nachts
  const input = szenario({}, {arrival: K.parseAnkunft("03.11.2026 14:00:00:000 bis 15:00:00:000")});
  const r = K.plan(input);
  assert.deepEqual(K.pruefePlan(r, input), []);
  assert.ok(r.stats.geadelt > 0);
  const nachts = r.items.filter(i => i.kind === "ag" && i.ausserhalb && i.nachtSenden);
  assert.ok(nachts.length > 0, "AGs nachts außerhalb markiert");
  assert.ok(r.hinweise.some(h => h.nachts));
  const ruhe = K.plan(szenario({zeit_rangfolge: "nachtruhe"}, {arrival: input.arrival}));
  assert.ok(ruhe.stats.geadelt < r.stats.geadelt);
  assert.ok(!ruhe.items.some(i => i.kind !== "fake" && i.ausserhalb && i.nachtSenden && K.istNacht(W, i.sendMs)), "keine Offs und AGs nachts außerhalb");
});

test("v0.5: Ankunftszeitraum ab 1 h mit Hinweis (1,5 h nur Orientierung seit 10.11.2026), Vorschläge nie im Nachtbonus", () => {
  assert.ok(!K.parseAnkunft("03.11.2026 08:00 bis 09:31").fehler, "über 1,5 h erlaubt (Dennis 10.11.2026)");
  assert.ok(!K.parseAnkunft("03.11.2026 08:00 bis 09:30").fehler);
  const r = K.plan(szenario({}, {arrival: K.parseAnkunft("03.11.2026 08:00 bis 09:10")}));
  assert.ok(r.warnings.some(w => w.art === "ankunft"));
  const A = K.parseAnkunft("03.11.2026 08:00 bis 09:00");
  const kand = K.ankunftKandidaten(A, W, {jetzt: Date.UTC(2026, 10, 2, 12, 0)});
  assert.ok(kand.length > 0);
  kand.forEach(k => {
    assert.equal(k.to - k.from, A.to - A.from);
    for (let t = k.from; t <= k.to; t += 60000) assert.ok(!K.istNacht(W, t), "kein Nachtbonus " + K.fmtZeit(t));
  });
  const b = K.bewerteAnkunft(szenario({}), kand[0]);
  assert.ok(b && typeof b.geadelt === "number" && typeof b.sitzungen === "number");
  assert.ok(K.besser({geadelt: 3, aussen: 5, nachtAussen: 0, sitzungen: 4, dauerMin: 9}, {geadelt: 2, aussen: 0, nachtAussen: 0, sitzungen: 1, dauerMin: 1}, "standard"));
  assert.ok(K.besser({geadelt: 2, aussen: 0, nachtAussen: 0, sitzungen: 1, dauerMin: 1}, {geadelt: 3, aussen: 5, nachtAussen: 2, sitzungen: 4, dauerMin: 9}, "nachtruhe"));
});

/* ---------- Einstellungen je Spieler, gleicher Spieler für Clean-Off und Train (Dennis 03.11.2026 15:00/15:12) ---------- */
const vomTrainSpieler = r => r.items.filter(i => i.kind === "clean" && r.items.some(x => x.kind === "ag" && x.t.id === i.t.id && x.att === i.att)).length;

test("Je Spieler: Clean-Offs als Beitrag je Ziel (2b) oder für eigene AG-Ziele (2a)", () => {
  const ohne = szenario({});
  ohne.attackers[0].cleanModus = "beitrag"; ohne.attackers[0].cleanN = 0;      // Alpha stellt keine Clean-Offs
  const r = K.plan(ohne);
  assert.deepEqual(K.pruefePlan(r, ohne), []);
  assert.ok(r.items.filter(i => i.kind === "clean").every(i => i.att === 102));
  const eins = szenario({});
  eins.attackers.forEach(a => { a.cleanModus = "beitrag"; a.cleanN = 1; });   // je Ziel höchstens eine von jedem
  const r1 = K.plan(eins);
  assert.deepEqual(K.pruefePlan(r1, eins), []);
  r1.ziele.filter(z => z.geadelt).forEach(z => {
    const offs = r1.items.filter(i => i.kind === "clean" && i.t.id === z.id);
    assert.ok(new Set(offs.map(i => i.att)).size === offs.length, "höchstens eine Clean-Off je Spieler und Ziel");
  });
  const eigene = szenario({});
  eigene.attackers[0].cleanModus = "eigene"; eigene.attackers[0].cleanN = 1;   // Alphas AG-Ziele mit einer Clean-Off
  const r2 = K.plan(eigene);
  assert.deepEqual(K.pruefePlan(r2, eigene), []);
  r2.ziele.filter(z => z.geadelt).forEach(z => {
    const train = r2.items.find(i => i.kind === "ag" && i.t.id === z.id);
    assert.equal(z.clean, train.att === 101 ? 1 : 2, "Ziel von " + train.att);
  });
  assert.ok(!r2.warnings.some(w => w.art === "richtwert"));
});

test("Je Spieler: Fakes höchstens je Dorf (3a) oder je Fakeziel (3b)", () => {
  const dorf = szenario({});
  dorf.attackers[0].fakeModus = "dorf"; dorf.attackers[0].fakeN = 1;
  const r = K.plan(dorf);
  assert.deepEqual(K.pruefePlan(r, dorf), []);
  const je = new Map();
  r.items.filter(i => i.kind === "fake" && i.att === 101).forEach(i => je.set(i.v.id, (je.get(i.v.id) || 0) + 1));
  assert.ok([...je.values()].every(n => n <= 1) && je.size > 0);
  const ziel = szenario({fakes_per_village: 1});
  ziel.attackers[1].fakeModus = "ziel"; ziel.attackers[1].fakeN = 1;          // Beta je Fakeziel 1, Alpha 1 aus der Konfig
  const r2 = K.plan(ziel);
  assert.deepEqual(K.pruefePlan(r2, ziel), []);
  const proZiel = new Map();
  r2.items.filter(i => i.kind === "fake").forEach(i => { const k = i.t.id + ":" + i.att; proZiel.set(k, (proZiel.get(k) || 0) + 1); });
  assert.ok([...proZiel.values()].every(n => n <= 1), "je Ziel höchstens 1 von Beta und 1 von den übrigen");
  assert.ok([...proZiel.keys()].some(k => k.endsWith(":102")) && [...proZiel.keys()].some(k => k.endsWith(":101")));
});

test("Clean-Offs möglichst vom Spieler des Trains", () => {
  const r = K.plan(szenario({}));
  const clean = r.items.filter(i => i.kind === "clean").length;
  assert.ok(vomTrainSpieler(r) * 2 > clean, vomTrainSpieler(r) + " von " + clean + " vom Train-Spieler");
});

test("Export für DS Workbench: Format aus Dennis' Beispielzeilen (09.11.2026, Dorf-IDs ersetzt) und gleiche Befehle wie im DS-Ultimate-Export", () => {
  const u = x => Object.assign(Object.fromEntries(K.UNITS.map(n => [n, 0])), x);
  const T = 1793603100000;
  const items = [
    {kind: "clean", slow: "ram", v: {id: 1001}, t: {id: 2001}, arrivalMs: T, units: u({axe: 6000, spy: 10, light: 2700, ram: 350})},
    {kind: "ag", slow: "snob", v: {id: 1002}, t: {id: 2002}, arrivalMs: T, units: u({axe: 100, snob: 1})},
    {kind: "fake", slow: "catapult", v: {id: 1003}, t: {id: 2003}, arrivalMs: T, units: u({spy: 22, catapult: 17})},
  ];
  assert.equal(K.toWB(items),
    "1001&2001&ram&1793603100000&8&false&false&spear=MA==/sword=MA==/axe=NjAwMA==/archer=MA==/spy=MTA=/light=MjcwMA==/marcher=MA==/heavy=MA==/ram=MzUw/catapult=MA==/knight=MA==/snob=MA==/militia=MA==\n" +
    "1002&2002&snob&1793603100000&11&false&false&spear=MA==/sword=MA==/axe=MTAw/archer=MA==/spy=MA==/light=MA==/marcher=MA==/heavy=MA==/ram=MA==/catapult=MA==/knight=MA==/snob=MQ==/militia=MA==\n" +
    "1003&2003&ram&1793603100000&14&false&false&spear=MA==/sword=MA==/axe=MA==/archer=MA==/spy=MjI=/light=MA==/marcher=MA==/heavy=MA==/ram=MA==/catapult=MTc=/knight=MA==/snob=MA==/militia=MA==\n");
  const d = K.toDSU(items).items;
  assert.deepEqual(d.map(x => [x.source, x.destination, x.slowest_unit, x.arrival_time, x.type, x.ms]),
    [[1001, 2001, 8, 1793603100, 8, 0], [1002, 2002, 11, 1793603100, 11, 0], [1003, 2003, 8, 1793603100, 14, 0]]);
  // Millisekunden der AG-Abstände bleiben in der Ankunft erhalten, leere Auswahl ergibt leeren Text
  assert.ok(K.toWB([Object.assign({}, items[1], {arrivalMs: T + 200})]).startsWith("1002&2002&snob&1793603100200&11&"));
  assert.equal(K.toWB([]), "");
});

// v0.6 (Dennis 09.11.2026): mehrere Ankunftszeiträume, Fakes verteilt (1a), reine Fake-Pläne, Fakes je Herkunftsdorf
const zweiZeitraeume = () => [K.parseAnkunft("03.11.2026 08:00:00:000 bis 09:00:00:000"), K.parseAnkunft("03.11.2026 11:00:00:000 bis 12:00:00:000")];
const reinerFakePlan = cfg => {
  const input = szenario(Object.assign({fake_modus: "herkunft", fakes_per_village: 2}, cfg),
    {windows: K.parseFenster("02.11.2026 16:00 bis 23:30").fenster, arrivals: zweiZeitraeume()});
  input.fakeTargets = input.fakeTargets.concat(input.agTargets);
  input.agTargets = [];
  return input;
};

test("v0.6: reiner Fake-Plan über zwei Ankunftszeiträume, Spieler verteilt, alle Regeln eingehalten", () => {
  const input = reinerFakePlan({});
  const r = K.plan(input);
  assert.ok(!r.fehler, r.fehler);
  assert.ok(r.items.length > 0 && r.items.every(i => i.kind === "fake"));
  assert.deepEqual(K.pruefePlan(r, input), []);
  const A = input.arrivals, inZeitraum = ms => A.findIndex(a => ms >= a.from && ms <= a.to);
  r.items.forEach(i => assert.ok(inZeitraum(i.arrivalMs) >= 0, "Ankunft in einem der Zeiträume"));
  assert.equal(new Set(r.items.map(i => inZeitraum(i.arrivalMs))).size, 2, "beide Zeiträume genutzt");
  [101, 102].forEach(a => {
    const s = r.items.filter(i => i.att === a).map(i => i.sendMs).sort((p, q) => p - q);
    assert.ok(s.length && s[s.length - 1] - s[0] <= 3600000, "reiner Fake-Spieler " + a + " schickt innerhalb einer Stunde (Fake-Sitzung wie v0.5)");
  });
});

test("v0.6: Fakes je Herkunftsdorf: höchstens N je Dorf, nie zweimal dasselbe Ziel, Ziele gleichmäßig", () => {
  const input = reinerFakePlan({});
  const r = K.plan(input);
  const jeDorf = new Map(), jeZiel = new Map(), paare = new Set();
  r.items.forEach(i => {
    jeDorf.set(i.v.id, (jeDorf.get(i.v.id) || 0) + 1);
    jeZiel.set(i.t.id, (jeZiel.get(i.t.id) || 0) + 1);
    assert.ok(!paare.has(i.v.id + ">" + i.t.id), "Dorf " + i.v.id + " zweimal auf Ziel " + i.t.id); paare.add(i.v.id + ">" + i.t.id);
  });
  assert.ok([...jeDorf.values()].every(n => n <= 2));
  assert.ok([...jeDorf.values()].filter(n => n === 2).length >= jeDorf.size / 2, "die meisten Dörfer schicken 2");
  const z = [...jeZiel.values()];
  assert.ok(Math.max(...z) - Math.min(...z) <= 2, "Ziele gleichmäßig: " + z.join(","));
  // Einstellung je Spieler „höchstens 1 je eigenem Dorf“ gibt dessen Zahl vor
  const i2 = reinerFakePlan({}); i2.attackers[0].fakeModus = "dorf"; i2.attackers[0].fakeN = 1;
  const r2 = K.plan(i2);
  r2.items.filter(i => i.att === 101).forEach(i => assert.ok(r2.items.filter(x => x.v.id === i.v.id).length <= 1));
  assert.deepEqual(K.pruefePlan(r2, i2), []);
});

test("v0.6: gemischter Plan mit zwei Zeiträumen: Offs und AGs im ersten, Fakes in beiden erlaubt", () => {
  const input = szenario({}, {arrivals: zweiZeitraeume()});
  const r = K.plan(input);
  assert.ok(!r.fehler, r.fehler);
  assert.deepEqual(K.pruefePlan(r, input), []);
  const A = input.arrivals[0];
  r.items.filter(i => i.kind !== "fake").forEach(i => assert.ok(i.arrivalMs >= A.from && i.arrivalMs <= A.to + 10000));
  assert.ok(r.ziele.some(z => z.geadelt));
  // Zeitraum über 1,5 Stunden ist erlaubt (Dennis 10.11.2026), Fakes dürfen dort ankommen
  const lang = szenario({}, {arrivals: [zweiZeitraeume()[0], K.parseAnkunft("03.11.2026 11:00:00:000 bis 13:00:00:000")]});
  const rl = K.plan(lang);
  assert.ok(!rl.fehler, rl.fehler);
  assert.deepEqual(K.pruefePlan(rl, lang), []);
});

test("Stammesmitglieder: eigene Zahl je Zieldorf, nachrangig, von Hand gewählte auch unter der Moral-Schwelle (Dennis 10.11.2026)", () => {
  const extra = manuell => [{id: 950, x: 470, y: 506, owner: 950, ownerPoints: 1000, ownerDays: 100, manuell},
                            {id: 951, x: 468, y: 506, owner: 951, ownerPoints: 400000, ownerDays: 100}];
  const plan = (manuell, n) => {
    const input = szenario({extra_fakes: true, moral_threshold: 0.95, fakes_per_village: 2, extra_fakes_per_village: n}, {extraFakeTargets: extra(manuell)});
    return [K.plan(input), input];
  };
  const auf = (r, id) => r.items.filter(i => i.kind === "fake" && i.t.id === id).length;
  const [r1, i1] = plan(false, 1);
  assert.equal(auf(r1, 950), 0, "unter der Moral-Schwelle ohne Auswahl kein Fake");
  assert.ok(auf(r1, 951) <= 1, "Stammesmitglied höchstens 1 Fake");
  assert.deepEqual(K.pruefePlan(r1, i1), []);
  const [r2, i2] = plan(true, 1);
  assert.ok(auf(r2, 950) === 1, "von Hand gewählt: 1 Fake trotz Moral");
  const fern = szenario({extra_fakes: true, moral_threshold: 0.95}, {extraFakeTargets: [{id: 970, x: 300, y: 300, owner: 970, ownerPoints: 1000, ownerDays: 100, manuell: true}]});
  assert.ok(K.plan(fern).warnings.some(w => /von Hand gewähltes Stammesmitglied ohne Fake/.test(w.text)), "Hinweis bei Mitglied ohne Fake");
  const [r3] = plan(true, 3);
  assert.ok(auf(r3, 951) > 1, "Zahl je Zieldorf für Stammesmitglieder einstellbar");
  // Pflicht- und weitere Fakeziele haben Vorrang: sie bekommen mit und ohne Stammesmitglieder gleich viele Fakes
  const ohne = K.plan(szenario({fakes_per_village: 2}));
  i2.fakeTargets.forEach(t => assert.ok(auf(r2, t.id) >= Math.min(2, auf(ohne, t.id)), "Ziel " + t.id));
});

test("Nie im Nachtbonus ankommen: „bis 23:00:00“ heißt höchstens 22:59:59, sonst kürzen oder ablehnen (Dennis 10.11.2026)", () => {
  const mit = ank => szenario({}, {arrival: K.parseAnkunft(ank)});
  const a = mit("03.11.2026 22:00:00:000 bis 23:00:00:000"), r = K.plan(a);
  assert.ok(!r.fehler && r.items.length > 0);
  r.items.forEach(i => assert.ok(!K.istNacht(W, i.arrivalMs) && i.arrivalMs < a.arrival.to, "Ankunft vor 23 Uhr"));
  assert.ok(!r.warnings.some(w => /ragt in den Nachtbonus/.test(w.text)), "Ende 23:00:00 gilt nicht als Kürzung");
  assert.deepEqual(K.pruefePlan(r, a), []);
  const b = K.plan(mit("03.11.2026 22:30:00:000 bis 23:30:00:000"));
  assert.ok(b.warnings.some(w => /ragt in den Nachtbonus/.test(w.text)) && b.items.every(i => !K.istNacht(W, i.arrivalMs)));
  const c = K.plan(mit("04.11.2026 07:30:00:000 bis 08:30:00:000"));
  assert.ok(c.items.length > 0 && c.items.every(i => !K.istNacht(W, i.arrivalMs)), "morgens erst ab 08:00");
  assert.ok(/Nachtbonus/.test(K.plan(mit("03.11.2026 23:30:00:000 bis 00:30:00:000")).fehler || ""), "ganz in der Nacht abgelehnt");
  assert.ok(/Nachtbonus/.test(K.plan(mit("03.11.2026 23:00:00:000")).fehler || ""), "Zeitpunkt 23:00:00 abgelehnt");
  const e = K.parseAnkunft("03.11.2026 22:00:00:000 bis 23:00:00:000"), z = K.tagesTeile(W, e);
  assert.equal(z.length, 1);
  assert.equal(K.fmtZeit(z[0].to, true).slice(11), "22:59:59:999");
  assert.equal(K.nachtGekuerzt(e, z), false);
  // langer Zeitraum über die Nacht: zwei Tagesteile, reiner Fake-Plan landet nur darin
  const ueber = K.parseAnkunft("03.11.2026 20:00:00:000 bis 04.11.2026 10:00:00:000"), t2 = K.tagesTeile(W, ueber);
  assert.deepEqual(t2.map(x => [K.fmtZeit(x.from).slice(11, 19), K.fmtZeit(x.to).slice(11, 19)]), [["20:00:00", "22:59:59"], ["08:00:00", "10:00:00"]]);
  const fp = reinerFakePlan({}); fp.arrivals = [ueber];
  const rf = K.plan(fp);
  assert.ok(!rf.fehler && rf.items.length > 0 && rf.items.every(i => !K.istNacht(W, i.arrivalMs)));
  assert.deepEqual(K.pruefePlan(rf, fp), []);
});

test("Fakes: höchstens 4 je Dorf, Ziele je Angreifer über die Zielspieler gestreut (Dennis 10.11.2026)", () => {
  const dorf = (id, x, y) => ({id, name: "D" + id, x, y, pts: 9000, units: truppen({catapult: 200, spy: 200, axe: 100}), nobles: 0});
  const A = {id: 101, name: "A", points: 300000, villages: [], rollen: {off: false, ag: false, fake: true}};
  const B = {id: 102, name: "B", points: 300000, villages: [], rollen: {off: false, ag: false, fake: true}};
  for (let k = 0; k < 8; k++) { A.villages.push(dorf(1 + k, 490 + (k % 3), 498 + k)); B.villages.push(dorf(21 + k, 490 + (k % 3), 516 + k)); }
  // A liegt näher an Spieler 900, B näher an Spieler 950; ohne Streuung fakt A nur 900 und B nur 950
  const ziele = [];
  for (let k = 0; k < 10; k++) { ziele.push({id: 901 + k, x: 468 + (k % 4), y: 497 + k, owner: 900}); ziele.push({id: 951 + k, x: 468 + (k % 4), y: 515 + k, owner: 950}); }
  const input = {world: W, cfg: {seed: 3, fakes_per_village: 2}, attackers: [A, B], agTargets: [], fakeTargets: ziele, extraFakeTargets: [],
    arrival: K.parseAnkunft("03.11.2026 08:00:00:000 bis 14:00:00:000"), windows: K.parseFenster("02.11.2026 08:00 bis 23:30").fenster, now: Date.UTC(2026, 10, 2, 6, 0)};
  const r = K.plan(input);
  assert.deepEqual(K.pruefePlan(r, input), []);
  assert.equal(r.items.length, 40, "jedes Ziel 2 Fakes");
  const jeDorf = new Map(); r.items.forEach(i => jeDorf.set(i.v.id, (jeDorf.get(i.v.id) || 0) + 1));
  assert.ok(Math.max(...jeDorf.values()) <= 4, "höchstens 4 Fakes je Dorf");
  r.items.forEach(i => assert.ok(i.units.spy >= 1 && i.units.ram === 0, "Späher dabei, keine Ramme bei freien Katapulten"));
  [101, 102].forEach(a => {
    const m = {}; r.items.filter(i => i.att === a).forEach(i => { m[i.t.owner] = (m[i.t.owner] || 0) + 1; });
    const n = Object.values(m), s = n.reduce((x, y) => x + y, 0);
    assert.equal(n.length, 2, "Angreifer " + a + " fakt beide Zielspieler: " + JSON.stringify(m));
    assert.ok(Math.max(...n) / s <= 0.75, "Angreifer " + a + " höchstens 75 % auf einem Zielspieler: " + JSON.stringify(m));
  });
  input.cfg.fakes_max_je_dorf = 2;
  const r2 = K.plan(input), je2 = new Map(); r2.items.forEach(i => je2.set(i.v.id, (je2.get(i.v.id) || 0) + 1));
  assert.ok(Math.max(...je2.values()) <= 2, "Obergrenze aus der Konfig");
});

test("Laufzeit-Richtwerte für Offs und AGs: überschritten nur, wenn nötig, dann markiert (Dennis 11.11.2026, 2.1a und 2.2a)", () => {
  const ohne = K.plan(szenario({}));
  const lauf = (r, k) => Math.max(...r.items.filter(i => i.kind === k).map(i => i.travelMs));
  // Grenze über allen Laufzeiten: nichts markiert, gleicher Plan
  const weit = K.plan(szenario({max_lauf_off_h: 20, max_lauf_ag_h: 20}));
  assert.equal(weit.items.filter(i => i.zuLang).length, 0);
  assert.deepEqual(weit.items.map(i => i.sendMs), ohne.items.map(i => i.sendMs));
  // Grenze unter allen Laufzeiten: genauso viele Ziele geadelt, alle Clean-Offs und AGs markiert, Hinweis
  const input = szenario({max_lauf_off_h: 1, max_lauf_ag_h: 1});
  const eng = K.plan(input);
  assert.deepEqual(K.pruefePlan(eng, input), []);
  assert.equal(eng.stats.geadelt, ohne.stats.geadelt);
  assert.equal(eng.items.filter(i => i.kind === "clean").length, ohne.items.filter(i => i.kind === "clean").length, "Clean-Offs bleiben beim Richtwert");
  eng.items.filter(i => i.kind !== "fake").forEach(i => assert.ok(i.zuLang, "markiert"));
  eng.items.filter(i => i.kind === "fake").forEach(i => assert.ok(!i.zuLang, "Fakes nie"));
  assert.ok(eng.warnings.some(w => w.art === "laufzeit" && /Offs 1 h, AGs 1 h/.test(w.text)));
  // nur die AG-Grenze: Offs bleiben unmarkiert (Off im Train zählt wie der AG)
  const ag = K.plan(szenario({max_lauf_ag_h: 1}));
  ag.items.forEach(i => assert.equal(!!i.zuLang, i.kind === "ag"));
  assert.ok(lauf(ag, "ag") > 3600000);
  // übrige Offs auf Nicht-AG-Dörfer: nie über dem Richtwert
  const rest0 = K.plan(szenario({rest_offs: "nicht_ag"})), rest1 = K.plan(szenario({rest_offs: "nicht_ag", max_lauf_off_h: 1}));
  assert.ok(rest0.items.some(i => i.kind === "rest"));
  assert.equal(rest1.items.filter(i => i.kind === "rest").length, 0);
});

test("Fake-Vorlauf: erste Fakes etwa so viele Stunden vor der ersten Off, der Rest in den Sitzungen (Dennis 11.11.2026, 1.1a und 1.2a)", () => {
  const input = szenario({fakes_per_village: 3, fake_vorlauf_h: 2});
  const r = K.plan(input);
  assert.deepEqual(K.pruefePlan(r, input), []);
  const t0 = Math.min(...r.items.filter(i => i.kind !== "fake").map(i => i.sendMs));
  const f = r.items.filter(i => i.kind === "fake"), frueh = f.filter(i => i.sendMs < t0 - 3600000);
  assert.ok(frueh.length > 0, "frühe Fakes vorhanden");
  assert.ok(frueh.length <= Math.ceil(f.length / 2), "nicht alle Fakes früh: " + frueh.length + " von " + f.length);
  const erste = Math.min(...f.map(i => i.sendMs));
  assert.ok(t0 - erste >= 1.5 * 3600000 && t0 - erste <= 3 * 3600000, "erste Fakes rund 2 h vorher: " + (t0 - erste) / 3600000);
  assert.ok(r.warnings.some(w => w.art === "vorlauf" && /Fake-Vorlauf 2 h/.test(w.text)));
  // ohne Vorlauf kein Fake so früh
  const r0 = K.plan(szenario({fakes_per_village: 3}));
  const t00 = Math.min(...r0.items.filter(i => i.kind !== "fake").map(i => i.sendMs));
  assert.equal(r0.items.filter(i => i.kind === "fake" && i.sendMs < t00 - 3600000).length, 0);
  // so früh nicht erreichbar: Hinweis statt Fehler
  const r10 = K.plan(szenario({fakes_per_village: 3, fake_vorlauf_h: 10}));
  assert.ok(r10.warnings.some(w => w.art === "vorlauf" && /so früh keine Fakes möglich/.test(w.text)));
  assert.equal(r10.items.filter(i => i.kind === "fake").length, r0.items.filter(i => i.kind === "fake").length);
});
