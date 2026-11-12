// Dörfer sortieren: Off, Deff, noch nicht zugeordnet (Wunsch Dennis 12.11.2026)
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../site/angriff-core.js");
const S = require("../site/sortieren.js");

const truppen = o => Object.assign(Object.fromEntries(K.UNITS.map(u => [u, 0])), o);
const z = o => K.OVERVIEW_COLUMNS.map(c => o[c] || 0).join("\t");
// Dorf in der Truppenübersicht, Ansicht „Alle“: eigene, im Dorf, auswärts, unterwegs, insgesamt.
// heim steht im Dorf, aus ist auswärts, weg ist unterwegs, fremd ist Unterstützung anderer Dörfer im Dorf.
// Wie im Spiel: im Dorf = eigene + fremd, insgesamt = im Dorf + auswärts + unterwegs.
function block(name, x, y, k, heim, opt) {
  const o = opt || {}, aus = o.aus || {}, weg = o.weg || {}, fremd = o.fremd || {};
  const plus = (...t) => { const s = {}; K.OVERVIEW_COLUMNS.forEach(c => { s[c] = t.reduce((a, q) => a + (q[c] || 0), 0); }); return s; };
  return [name + " (" + x + "|" + y + ") K" + k + "  \teigene\t" + z(heim) + "\tBefehle", "im Dorf\t" + z(plus(heim, fremd)) + "\tTruppen",
          "auswärts\t" + z(aus), "unterwegs\t" + z(weg) + "\tBefehle", "insgesamt\t" + z(plus(heim, fremd, aus, weg)) + "\tTruppen"].join("\n");
}
// Vorlagen nach Dennis' echter Übersicht vom 12.11.2026 (Zahlen gerundet, keine echten Dörfer)
const OFF = truppen({spear: 1000, sword: 5, axe: 6400, spy: 80, light: 3300, heavy: 2, ram: 400, catapult: 20});
const DEFF = truppen({spear: 3200, sword: 3200, archer: 2700, spy: 160, light: 596, heavy: 2, catapult: 300});

test("Off und Deff nach dem Kern, Begleiter folgen ihm", () => {
  const off = S.einordnen(OFF);
  assert.equal(off.art, "off");
  assert.equal(off.begleitZu, "off");
  assert.equal(off.offBH, 6400 + 2000 + 13200 + 12 + 160);
  assert.equal(off.deffBH, 5);
  // Deff mit LKav und Katapulten (Dennis 18:49, Dorf 40): Begleiter zählen zur Deff
  const deff = S.einordnen(DEFF);
  assert.deepEqual([deff.art, deff.begleitZu, deff.offBH], ["deff", "deff", 0]);
  assert.equal(deff.deffBH, 2200 + 3200 + 2700 + 2384 + 12 + 2400);
  // vorher wäre das „gemischt“ gewesen (LKav und Katapulte als Off)
  assert.ok(S.offAnteil(deff) === 0);
});

test("Ohne nennenswerten Kern zählen Begleiter zu ihrer eigenen Seite", () => {
  // LKav-Dorf mit 5 Schwert und AGs bleibt Off (Dennis' Dorf 66)
  const lkav = S.einordnen(truppen({sword: 5, spy: 80, light: 2750, heavy: 2, snob: 3}));
  assert.deepEqual([lkav.art, lkav.begleitZu, lkav.offBH, lkav.deffBH], ["off", "eigen", 11000, 17]);
  assert.equal(S.einordnen(truppen({heavy: 500})).art, "deff");
  assert.equal(S.einordnen(truppen({catapult: 100})).art, "off");
  // Kern ab der Grenze „zuordnen ab“: 1.427 Schwert holen 596 LKav zur Deff
  assert.equal(S.einordnen(truppen({spear: 1000, sword: 1427, light: 596})).art, "deff");
  // Kern unter der Grenze: 400 Schwert, 294 LKav, 66 Katapulte zählen getrennt
  const klein = S.einordnen(truppen({spear: 251, sword: 400, light: 294, catapult: 66}));
  assert.deepEqual([klein.begleitZu, klein.offBH, klein.deffBH, klein.art], ["eigen", 1704, 400, "off"]);
});

test("Noch nicht zugeordnet: leer, nur Raubzug-Speer, zu wenig, gemischt", () => {
  const leer = S.einordnen(truppen({}));
  assert.deepEqual([leer.art, leer.grund], ["offen", "keine Truppen"]);
  assert.equal(S.einordnen(truppen({spy: 20, knight: 1, snob: 2})).grund, "keine Truppen");
  const rz = S.einordnen(truppen({spear: 1000}));
  assert.deepEqual([rz.art, rz.grund], ["offen", "nur Raubzug-Speer"]);
  const etwas = S.einordnen(truppen({spear: 1050}));
  assert.deepEqual([etwas.art, etwas.grund, etwas.deffBH], ["offen", "zu wenig Truppen", 50]);
  assert.equal(S.einordnen(truppen({spear: 1000, sword: 401})).grund, "zu wenig Truppen");
  assert.equal(S.einordnen(truppen({spear: 1000, axe: 499})).art, "offen");
  assert.equal(S.einordnen(truppen({spear: 1000, axe: 500})).art, "off");
  const gem = S.einordnen(truppen({spear: 1000, sword: 3000, axe: 2000, light: 100}));   // Kern Deff 3.000, Off 2.000
  assert.deepEqual([gem.art, gem.grund, S.offAnteil(gem)], ["offen", "gemischt", 37]);
  assert.equal(S.offAnteil(leer), null);
});

test("Einstellungen: Grenzen, leere Felder, eigene Werte", () => {
  assert.deepEqual(S.einstellungen({}), S.STANDARD);
  assert.deepEqual(S.einstellungen({raubzug: "", min_bh: "abc", anteil: 120}), Object.assign({}, S.STANDARD, {anteil: 100}));
  assert.equal(S.einstellungen({raubzug: -5}).raubzug, 0);
  assert.equal(S.einordnen(truppen({spear: 1500}), {raubzug: 1500}).grund, "nur Raubzug-Speer");
  assert.equal(S.einordnen(truppen({spear: 2000}), {raubzug: 0, min_bh: 0}).art, "deff");
  assert.equal(S.einordnen(truppen({spear: 1000, sword: 3000, axe: 2000}), {anteil: 50}).art, "deff");
  assert.equal(S.einordnen(truppen({light: 100}), {min_bh: 0}, Object.assign({}, K.POP, {light: 5})).offBH, 500);
});

test("Truppen des Dorfs: eigene + auswärts + unterwegs, fremde Unterstützung zählt nicht", () => {
  const text = [
    "[006] Aktives Dorf\t\t(500|500) K55\t",                         // Kopfzeile des aktiven Dorfs
    "212744\t\t221641\t\t224482\t\t400000\t\t(3)23997/24000",
    "Truppen", "Alle", "Eigene", "Im Dorf",                          // Menüzeilen ohne Zahlen
    "Dorf (4)\t\t\tAktion",
    // Off greift gerade an: Axt und LKav unterwegs
    block("[001] Hammer", 501, 500, 55, truppen({spear: 1000, ram: 400}), {weg: truppen({axe: 6000, light: 3000})}),
    // Deff steht als Unterstützung woanders
    block("[002] Wall", 502, 500, 55, truppen({spear: 200}), {aus: truppen({spear: 6000, sword: 6000, heavy: 1000})}),
    // Raubzug-Dorf, in dem eine fremde Deff steht: bleibt nicht zugeordnet
    block("[003] Stapel", 503, 500, 55, truppen({spear: 1000}), {fremd: truppen({spear: 800, sword: 1900, archer: 1400})}),
    // kleine Off mit großer fremder Deff im Dorf: bleibt Off
    block("[004] Ziel", 504, 500, 55, truppen({sword: 5, axe: 3750, light: 1900, ram: 300}), {fremd: truppen({spear: 19000, sword: 18000})}),
  ].join("\n");
  const r = S.sortieren(text);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);                                  // auch keine Meldung zum aktiven Dorf
  assert.deepEqual([r.off.map(v => v.name), r.deff.map(v => v.name), r.offen.map(v => v.name)],
                   [["[001] Hammer", "[004] Ziel"], ["[002] Wall"], ["[003] Stapel"]]);
  assert.deepEqual([r.off[0].units.axe, r.off[0].units.ram], [6000, 400]);
  assert.equal(r.deff[0].units.spear, 6200);
  assert.equal(r.offen[0].e.grund, "nur Raubzug-Speer");
  assert.deepEqual(r.offen[0].units, truppen({spear: 1000}));
  assert.equal(r.offen[0].fremd, 800 + 1900 + 1400);
  assert.equal(r.off[1].fremd, 37000);
  assert.equal(S.koordText(r.off), "501|500 504|500");
});

test("Sortierung nach Name und Koordinaten zum Kopieren", () => {
  const r = S.sortieren([block("[010] Zehn", 510, 490, 45, OFF), block("[002] Zwei", 502, 490, 45, OFF),
                         block("[001] Eins", 501, 492, 45, truppen({spear: 980}))].join("\n"));
  assert.deepEqual(r.off.map(v => v.name), ["[002] Zwei", "[010] Zehn"]);
  assert.equal(S.koordText(r.off), "502|490 510|490");
  assert.equal(S.koordText([]), "");
});

test("Leser: andere Ansichten, fehlende Zeile, zu wenige Zahlen, Miliz darf fehlen", () => {
  const eig = S.sortieren("[001] Eins (10|20) K21\t" + z({axe: 3000}) + "\tBefehle\n[002] Zwei (11|20) K21\t" + z({sword: 3000}));
  assert.equal(eig.gelesen, 0);
  assert.equal(eig.errors.length, 1);
  assert.match(eig.errors[0], /^Ansicht „Eigene“ erkannt \(2 Dörfer\).*„Alle“/);
  assert.match(S.sortieren("[001] Eins (10|20) K21\tim Dorf\t" + z({})).errors[0], /^Ansicht „Im Dorf“ erkannt \(1 Dorf\)/);
  // eine Zeile „insgesamt“ am Dorf enthält fremde Unterstützung und wird nicht als Dorftruppen gelesen
  assert.match(S.sortieren("[001] Eins (10|20) K21\tinsgesamt\t" + z({axe: 700})).errors[0], /^Ansicht „Insgesamt“ erkannt/);
  const abgeschnitten = S.sortieren(block("A", 1, 1, 0, truppen({axe: 3000})).split("\n").slice(0, 3).join("\n") + "\n" +
                                    block("B", 2, 2, 0, truppen({sword: 3000})));
  assert.equal(abgeschnitten.gelesen, 1);
  assert.match(abgeschnitten.warnings[0], /Ohne Zeile „insgesamt“, nicht gelesen: A/);
  const kurz = S.sortieren("[001] Eins (10|20) K21\teigene\t1\t2\t3\ninsgesamt\t1\t2\t3");
  assert.match(kurz.errors[0], /Zeile 1: 3 Zahlen, erwartet 12/);
  assert.equal(kurz.gelesen, 0);
  const ohneMiliz = S.leseDorfTruppen("[001] Eins (10|20) K21\teigene\t" + K.UNITS.map(u => u === "ram" ? 300 : 0).join("\t") +
                                      "\ninsgesamt\t" + K.UNITS.map(u => u === "ram" ? 300 : 0).join("\t"));
  assert.deepEqual(ohneMiliz.errors, []);
  assert.equal(ohneMiliz.villages[0].units.ram, 300);
  // Probe: mehr Truppen als in „insgesamt“ deutet auf vertauschte Spalten oder Zeilen
  const falsch = S.leseDorfTruppen("[001] Eins (10|20) K21\teigene\t" + z({axe: 500}) + "\ninsgesamt\t" + z({axe: 100}));
  assert.match(falsch.warnings[0], /Mehr Truppen als in „insgesamt“/);
  const doppelt = S.leseDorfTruppen([block("A", 1, 1, 0, truppen({axe: 1})), block("B", 1, 1, 0, truppen({axe: 2}))].join("\n"));
  assert.equal(doppelt.villages.length, 1);
  assert.match(doppelt.warnings[0], /doppelt/);
  assert.match(S.leseDorfTruppen("Dorf (5)\n" + block("A", 1, 1, 0, truppen({axe: 1}))).warnings[0], /nennt 5 Dörfer, gelesen 1/);
  assert.match(S.sortieren("").errors[0], /Keine Dörfer erkannt/);
});
