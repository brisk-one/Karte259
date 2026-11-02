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

test("Fakes aus Katapulten und Spähern", () => {
  const f = K.fakeAus({catapult: 50, spy: 100, ram: 0}, 105, W.pop, "kata");
  assert.deepEqual(f, {catapult: 13, spy: 1, ram: 0});              // 104 + 2 BH
  const s = K.fakeAus({catapult: 50, spy: 100, ram: 0}, 105, W.pop, "spaeher");
  assert.deepEqual(s, {catapult: 1, spy: 49, ram: 0});
  assert.equal(K.fakeAus({catapult: 0, spy: 100, ram: 0}, 105, W.pop, "kata"), null);   // ohne Katapult kein Fake
  assert.deepEqual(K.fakeAus({catapult: 0, spy: 0, ram: 30}, 105, W.pop, "kata"), {catapult: 0, spy: 0, ram: 21});
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
  const input = szenario({extra_fakes: true}, {extraFakeTargets: [
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
  ausserhalb.forEach(i => assert.equal(i.units.ram, 0));
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
