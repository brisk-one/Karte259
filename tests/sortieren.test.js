// Dörfer sortieren: Off, Deff, noch nicht zugeordnet (Wunsch Dennis 12.11.2026)
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../site/angriff-core.js");
const S = require("../site/sortieren.js");

const truppen = o => Object.assign(Object.fromEntries(K.UNITS.map(u => [u, 0])), o);
// Dorf in der Truppenübersicht, Ansicht „Alle“: Kopfzeile mit „eigene“, dann im Dorf, auswärts, unterwegs, insgesamt.
// u steht im Dorf, aus ist auswärts (Unterstützung), weg ist unterwegs; insgesamt ist die Summe.
function block(name, x, y, k, u, aus, weg) {
  aus = aus || {}; weg = weg || {};
  const z = o => K.OVERVIEW_COLUMNS.map(c => o[c] || 0).join("\t");
  const summe = {};
  K.OVERVIEW_COLUMNS.forEach(c => { summe[c] = (u[c] || 0) + (aus[c] || 0) + (weg[c] || 0); });
  return [name + " (" + x + "|" + y + ") K" + k + "  \teigene\t" + z(u) + "\tBefehle", "im Dorf\t" + z(u) + "\tTruppen",
          "auswärts\t" + z(aus), "unterwegs\t" + z(weg) + "\tBefehle", "insgesamt\t" + z(summe) + "\tTruppen"].join("\n");
}

test("Off und Deff, Raubzug-Speer zählt nicht", () => {
  const off = S.einordnen(truppen({spear: 1000, axe: 5000, light: 2000, ram: 250, spy: 50, snob: 1}));
  assert.equal(off.art, "off");
  assert.equal(off.offBH, 5000 + 8000 + 1250);
  assert.equal(off.deffBH, 0);
  assert.equal(off.raubzug, 1000);
  const deff = S.einordnen(truppen({spear: 6000, sword: 5000, archer: 2000, heavy: 300, axe: 200}));
  assert.equal(deff.art, "deff");
  assert.equal(deff.deffBH, 5000 + 5000 + 2000 + 1800);
  assert.equal(deff.offBH, 200);
  assert.ok(!deff.heavyOff);
});

test("Noch nicht zugeordnet: leer, nur Raubzug-Speer, zu wenig, gemischt", () => {
  const leer = S.einordnen(truppen({}));
  assert.deepEqual([leer.art, leer.grund], ["offen", "keine Truppen"]);
  assert.deepEqual([S.einordnen(truppen({spy: 20, knight: 1})).grund], ["keine Truppen"]);
  const rz = S.einordnen(truppen({spear: 1000}));
  assert.deepEqual([rz.art, rz.grund], ["offen", "nur Raubzug-Speer"]);
  const etwas = S.einordnen(truppen({spear: 1050}));           // „ca. 1.000“: Überhang unter 500 BH
  assert.deepEqual([etwas.art, etwas.grund, etwas.deffBH], ["offen", "zu wenig Truppen", 50]);
  assert.equal(S.einordnen(truppen({spear: 1000, axe: 499})).art, "offen");
  assert.equal(S.einordnen(truppen({spear: 1000, axe: 500})).art, "off");      // Grenze 500 BH erreicht
  const gem = S.einordnen(truppen({spear: 1000, sword: 800, axe: 600}));     // 57 % Deff
  assert.deepEqual([gem.art, gem.grund], ["offen", "gemischt"]);
  assert.equal(S.offAnteil(gem), 43);
  assert.equal(S.offAnteil(leer), null);
  assert.equal(S.einordnen(truppen({sword: 670, axe: 330})).art, "deff");      // genau 67 %
});

test("Schwere Kavallerie zur stärkeren Infanterie, nach Abzug des Raubzug-Speers", () => {
  const e = S.einordnen(truppen({spear: 1000, axe: 600, heavy: 100}));
  assert.ok(e.heavyOff);
  assert.equal(e.offBH, 1200);
  assert.equal(S.einordnen(truppen({sword: 2000, axe: 600, heavy: 100})).deffBH, 2600);
  assert.equal(S.einordnen(truppen({heavy: 500})).art, "deff");                 // ohne Infanterie Deff
});

test("Einstellungen: Grenzen, leere Felder, eigene Werte", () => {
  assert.deepEqual(S.einstellungen({}), S.STANDARD);
  assert.deepEqual(S.einstellungen({raubzug: "", min_bh: "abc", anteil: 120}), Object.assign({}, S.STANDARD, {anteil: 100}));
  assert.equal(S.einstellungen({raubzug: -5}).raubzug, 0);
  assert.equal(S.einordnen(truppen({spear: 1500}), {raubzug: 1500}).grund, "nur Raubzug-Speer");
  assert.equal(S.einordnen(truppen({spear: 2000}), {raubzug: 0, min_bh: 0}).art, "deff");
  assert.equal(S.einordnen(truppen({spear: 1000, sword: 800, axe: 600}), {anteil: 50}).art, "deff");
  // Bevölkerung je Einheit aus den Welteinstellungen
  assert.equal(S.einordnen(truppen({light: 100}), {min_bh: 0}, Object.assign({}, K.POP, {light: 5})).offBH, 500);
});

test("Truppenübersicht sortieren und Koordinaten zum Kopieren", () => {
  const text = [
    "Dorf (5)\t\t\tAktion",
    block("[010] Zehn", 510, 490, 45, truppen({spear: 1000, axe: 4000, light: 1500, ram: 200})),
    block("[002] Zwei", 502, 490, 45, truppen({spear: 1000, axe: 3000, ram: 100})),
    block("[003] Drei", 503, 491, 45, truppen({spear: 4000, sword: 3000})),
    block("Neu geadelt", 499, 488, 44, truppen({})),
    block("[001] Eins", 501, 492, 45, truppen({spear: 980})),
  ].join("\n");
  const r = S.sortieren(text);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.gelesen, 5);
  assert.deepEqual(r.off.map(v => v.name), ["[002] Zwei", "[010] Zehn"]);    // nach Name, Zahlen natürlich sortiert
  assert.deepEqual(r.deff.map(v => v.name), ["[003] Drei"]);
  assert.deepEqual(r.offen.map(v => [v.name, v.e.grund]), [["[001] Eins", "nur Raubzug-Speer"], ["Neu geadelt", "keine Truppen"]]);
  assert.equal(S.koordText(r.off), "502|490 510|490");
  assert.equal(S.koordText([]), "");
});

test("Gezählt wird die Zeile „insgesamt“: Truppen, die zum Dorf gehören (Dennis 12.11.2026 18:38)", () => {
  const text = [
    "[007] Aktives Dorf\t(500|500) K55\t",                                   // Kopfzeile des aktiven Dorfs, wird übergangen
    "29805\t\t65211\t\t452\t\t400000\t\t(738)19738/20476",
    "Dorf (3)\t\t\tAktion",
    // Off greift gerade an: im Dorf nur Raubzug-Speer, Axt, LKav und Rammen unterwegs
    block("[001] Hammer", 501, 500, 55, truppen({spear: 1000}), {}, truppen({axe: 5000, light: 2000, ram: 250})),
    // Deff steht als Unterstützung woanders
    block("[002] Wall", 502, 500, 55, truppen({spear: 200}), truppen({spear: 5000, sword: 4000}), {}),
    // fremde Unterstützung im Dorf zählt nicht (im Dorf ≠ eigene), nur eigene Raubzug-Speer
    block("[003] Raubzug", 503, 500, 55, truppen({spear: 1000})).replace(/^im Dorf\t\d+/m, "im Dorf\t9000"),
  ].join("\n");
  const r = S.sortieren(text);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual([r.off.map(v => v.name), r.deff.map(v => v.name), r.offen.map(v => v.name)],
                   [["[001] Hammer"], ["[002] Wall"], ["[003] Raubzug"]]);
  assert.equal(r.off[0].units.axe, 5000);
  assert.equal(r.deff[0].units.spear, 5200);
  assert.equal(r.offen[0].e.grund, "nur Raubzug-Speer");
});

test("Leser: andere Ansichten, fehlende Zeile, zu wenige Zahlen, Miliz darf fehlen", () => {
  const z = o => K.OVERVIEW_COLUMNS.map(c => o[c] || 0).join("\t");
  const eig = S.sortieren("[001] Eins (10|20) K21\t" + z({axe: 3000}) + "\tBefehle\n[002] Zwei (11|20) K21\t" + z({sword: 3000}));
  assert.equal(eig.gelesen, 0);
  assert.equal(eig.errors.length, 1);
  assert.match(eig.errors[0], /Ansicht „Eigene“ erkannt \(2 Dörfer\).*„Alle“.*„insgesamt“/);
  const imDorf = S.sortieren("[001] Eins (10|20) K21\tim Dorf\t" + z({}));
  assert.match(imDorf.errors[0], /^Ansicht „Im Dorf“ erkannt \(1 Dorf\)/);
  // eine Zeile „insgesamt“ direkt am Dorf wird gelesen
  const direkt = S.leseInsgesamt("[001] Eins (10|20) K21\tinsgesamt\t" + z({axe: 700}));
  assert.deepEqual([direkt.errors, direkt.villages.length, direkt.villages[0].units.axe], [[], 1, 700]);
  const abgeschnitten = S.sortieren(block("A", 1, 1, 0, truppen({axe: 3000})).split("\n").slice(0, 3).join("\n") + "\n" +
                                    block("B", 2, 2, 0, truppen({sword: 3000})));
  assert.equal(abgeschnitten.gelesen, 1);
  assert.match(abgeschnitten.warnings[0], /Ohne Zeile „insgesamt“, nicht gelesen: A/);
  const kurz = S.sortieren("[001] Eins (10|20) K21\teigene\t1\t2\ninsgesamt\t1\t2\t3");
  assert.match(kurz.errors[0], /Zeile 2: 3 Zahlen, erwartet 12/);
  const ohneMiliz = S.leseInsgesamt("[001] Eins (10|20) K21\teigene\t" + z({}) + "\ninsgesamt\t" + K.UNITS.map(u => u === "ram" ? 300 : 0).join("\t"));
  assert.deepEqual(ohneMiliz.errors, []);
  assert.equal(ohneMiliz.villages[0].units.ram, 300);
  const doppelt = S.leseInsgesamt([block("A", 1, 1, 0, truppen({axe: 1})), block("B", 1, 1, 0, truppen({axe: 2}))].join("\n"));
  assert.equal(doppelt.villages.length, 1);
  assert.match(doppelt.warnings[0], /doppelt/);
  const seiten = S.leseInsgesamt("Dorf (5)\n" + block("A", 1, 1, 0, truppen({axe: 1})));
  assert.match(seiten.warnings[0], /nennt 5 Dörfer, gelesen 1/);
  assert.match(S.sortieren("").errors[0], /Keine Dörfer erkannt/);
});
