// Fakes aufstocken: AG-Begleitschutz aufstocken (Dennis 14.11.2026 00:52, 1b mit 30 LKav und 2b um 01:08)
// und Ankunft von Hand (01:08)
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../site/angriff-core.js");

const MIN = {sword: 60, axe: 50, light: 30};
// Befehl im DS-Ultimate-Format wie aus dem Export (Einheiten als Text, wie DS-Ultimate sie schreibt)
function befehl(source, destination, units, opt) {
  const o = Object.assign({source, destination, slowest_unit: K.UNITS.indexOf("snob"), arrival_time: 1763100000 + (opt && opt.s || 0),
                           type: K.DSU_TYPE.ag, support_boost: 0, tribe_skill: 0, ms: opt && opt.ms || 0}, opt && opt.roh);
  K.UNITS.forEach(u => { o[u] = units[u] != null ? units[u] : "0"; });
  return o;
}
const plan = items => K.parsePlan(JSON.stringify({title: "Op", uvMode: 0, world: "de259", twWorld: "de259", items}));
const leer = o => Object.assign(Object.fromEntries(K.UNITS.map(u => [u, 0])), o);
const kurz = r => r.aenderungen.map(a => [a.it.source, a.u, a.alt, a.neu, a.grund]);

test("eine Schutz-Einheit unter dem Mindestwert wird aufgestockt", () => {
  const p = plan([
    befehl(1, 9, {snob: "1", sword: "20"}),                       // Deff-Dorf: auf 60 Schwert
    befehl(2, 9, {snob: "1", axe: "30"}, {ms: 200}),              // Off-Dorf: auf 50 Axt
    befehl(3, 9, {snob: "1", axe: "6000", ram: "250", sword: "5"}),   // AG mit ganzer Off: genug Axt
    befehl(4, 9, {snob: "1", sword: "60"}),                       // genau der Mindestwert
    befehl(5, 9, {snob: "1", light: "10"}),                       // nur LKav: auf 30
    befehl(6, 9, {snob: "1", light: "30", spear: "5"}),           // 30 LKav reichen
    befehl(7, 9, {axe: "10", ram: "1"}, {roh: {type: K.DSU_TYPE.clean, slowest_unit: K.UNITS.indexOf("ram")}}),   // Off, kein AG
  ]);
  assert.deepEqual(p.fehler, []);
  const r = K.begleitAufstocken(p.items, MIN);
  assert.deepEqual(kurz(r), [[1, "sword", 20, 60, "nur"], [2, "axe", 30, 50, "nur"], [5, "light", 10, 30, "nur"]]);
  assert.deepEqual(r.ohne, []);
  assert.deepEqual(r.knapp, []);
  assert.equal(p.items[0].units.sword, 20, "Eingabe bleibt unverändert");
});

test("2b: mehrere Schutz-Einheiten unter dem Wert, die größte wird aufgestockt", () => {
  const p = plan([befehl(1, 9, {snob: "1", sword: "30", axe: "20"}), befehl(2, 9, {snob: "1", sword: "10", axe: "40", light: "5"}),
                  befehl(3, 9, {snob: "1", sword: "20", axe: "20"})]);
  assert.deepEqual(kurz(K.begleitAufstocken(p.items, MIN)), [[1, "sword", 30, 60, "mehr"], [2, "axe", 40, 50, "mehr"], [3, "axe", 20, 50, "mehr"]]);
  // LKav abgeschaltet: zählt nicht als Schutz
  assert.deepEqual(kurz(K.begleitAufstocken(plan([befehl(1, 9, {snob: "1", light: "10", sword: "5"})]).items, {sword: 60, axe: 50, light: 0})),
                   [[1, "sword", 5, 60, "nur"]]);
});

test("1b: ohne Schutz nach dem Dorf, sonst 30 LKav, sonst unverändert", () => {
  const p = plan([
    befehl(1, 9, {snob: "1"}), befehl(1, 9, {snob: "1"}, {ms: 200}),   // Off-Dorf mit 80 freien Axt: einmal 50 Axt, dann LKav
    befehl(2, 9, {snob: "1"}),                                         // Deff-Dorf: 60 Schwert
    befehl(3, 9, {snob: "1"}),                                         // nichts frei: unverändert
    befehl(4, 9, {snob: "1"}),                                         // ohne Übersicht: unverändert
    befehl(3, 8, {axe: "all", light: "all", ram: "all"}, {roh: {type: K.DSU_TYPE.clean, slowest_unit: K.UNITS.indexOf("ram")}}),
  ]);
  p.items.forEach((it, i) => { it.sendMs = 1000 + i; });
  const doerfer = new Map([[1, leer({axe: 80, sword: 5, light: 100})], [2, leer({sword: 4000, spear: 4000})], [3, leer({axe: 6000, light: 2000, sword: 5})]]);
  const r = K.begleitAufstocken(p.items, MIN, doerfer);
  assert.deepEqual(kurz(r), [[1, "axe", 0, 50, "dorf"], [1, "light", 0, 30, "dorf"], [2, "sword", 0, 60, "dorf"]]);
  assert.deepEqual(r.ohne.map(o => [o.it.source, o.grund]), [[3, "zuWenig"], [4, "ohneUebersicht"]]);
  assert.deepEqual(r.knapp, []);
  // ohne Truppenübersicht: alle unverändert
  assert.deepEqual(K.begleitAufstocken(p.items, MIN).ohne.map(o => o.grund), ["ohneUebersicht", "ohneUebersicht", "ohneUebersicht", "ohneUebersicht", "ohneUebersicht"]);
});

test("abgeschickt, Einheit als Text und Mindestwert 0 bleiben unverändert", () => {
  const p = plan([befehl(1, 9, {snob: "1", sword: "20"}), befehl(2, 9, {snob: "1", axe: "all"}), befehl(3, 9, {snob: "1", axe: "10"})]);
  p.items[0].gesendet = 1763100000000;
  assert.deepEqual(K.begleitAufstocken(p.items, MIN).aenderungen.map(a => a.it.source), [3]);
  assert.deepEqual(K.begleitAufstocken(p.items, {sword: 60, axe: 0, light: 0}).aenderungen, []);
  // ein AG-Symbol ohne AG im Befehl zählt laut importArt trotzdem als AG
  assert.deepEqual(K.begleitAufstocken(plan([befehl(4, 9, {sword: "40"})]).items, {sword: 70}).aenderungen.map(a => a.neu), [70]);
});

test("Export: DS-Ultimate mit neuer Zahl im Rohobjekt, DS Workbench aus den Einheiten", () => {
  const roh = [befehl(1, 9, {snob: "1", sword: "20"}), befehl(2, 9, {snob: "1", axe: 30}, {ms: 200})];
  const p = plan(roh);
  K.begleitAufstocken(p.items, MIN).aenderungen.forEach(a => { a.it.units[a.u] = a.neu; a.it.begleit = {[a.u]: a.neu}; });
  const ex = K.importDSU(p.items, p.meta).items;
  assert.deepEqual(ex[0], Object.assign({}, roh[0], {sword: "60"}), "Text bleibt Text");
  assert.deepEqual(ex[1], Object.assign({}, roh[1], {axe: 50}), "Zahl bleibt Zahl");
  const wb = K.parsePlan(K.importWB(p.items)).items;
  assert.deepEqual(wb.map(it => [it.units.sword, it.units.axe, it.units.snob]), [[60, 0, 1], [0, 50, 1]]);
  assert.deepEqual(K.importDSU(plan(roh).items).items, roh, "ohne Aufstocken unverändert");
});

test("Truppenübersicht: Hinweis, wenn das Dorf nicht genug frei hat", () => {
  const p = plan([
    befehl(1, 9, {snob: "1", sword: "20"}), befehl(1, 9, {snob: "1", sword: "20"}, {ms: 200}),   // braucht 2 × 40 = 80
    befehl(2, 9, {snob: "1", axe: "30"}),                                                     // braucht 20
    befehl(2, 8, {axe: "all", light: "all", ram: "all"}, {roh: {type: K.DSU_TYPE.clean}}),      // Standard-Off nimmt alle Äxte
    befehl(3, 9, {snob: "1", axe: "10"}),                                                     // braucht 40, frei 990
  ]);
  const doerfer = new Map([[1, leer({sword: 100})], [2, {axe: 6000}], [3, {axe: 1000}]]);
  const r = K.begleitAufstocken(p.items, MIN, doerfer);
  assert.equal(r.aenderungen.length, 4);
  assert.deepEqual(r.knapp, [{source: 1, u: "sword", braucht: 80, frei: 60, alle: false}, {source: 2, u: "axe", braucht: 20, frei: 0, alle: true}]);
  assert.deepEqual(K.begleitAufstocken(p.items, MIN, new Map([[9, {sword: 0}]])).knapp, [], "Dorf nicht in der Übersicht: kein Hinweis");
});

test("Ankunft von Hand: mit und ohne Jahr, nur Uhrzeit, Fehler", () => {
  const bezug = K.ankunftEingabe("17.11.2026 01:00:09:000").ms;
  assert.equal(K.fmtZeit(bezug, true), "17.11.2026 01:00:09:000");
  assert.equal(K.fmtZeit(K.ankunftEingabe("18.11. 06:30:00:250", bezug).ms, true), "18.11.2026 06:30:00:250");
  assert.equal(K.fmtZeit(K.ankunftEingabe("18.11 6:30", bezug).ms, true), "18.11.2026 06:30:00:000");
  assert.equal(K.fmtZeit(K.ankunftEingabe("02:15:30:5", bezug).ms, true), "17.11.2026 02:15:30:500", "nur Uhrzeit: Tag des Bezugs");
  assert.equal(K.fmtZeit(K.ankunftEingabe("17.11.26 01:00:09", bezug).ms, true), "17.11.2026 01:00:09:000");
  // ohne Jahr: das nächstgelegene (Bezug Ende Dezember, Eingabe Anfang Januar)
  const dez = K.ankunftEingabe("30.12.2026 22:00").ms;
  assert.equal(K.fmtZeit(K.ankunftEingabe("02.01. 08:00", dez).ms), "02.01.2027 08:00:00");
  // Sommerzeit: 01.07. 12:00 Serverzeit ist 10:00 UTC
  assert.equal(new Date(K.ankunftEingabe("01.07.2026 12:00").ms).toISOString(), "2026-07-01T10:00:00.000Z");
  assert.match(K.ankunftEingabe("31.02. 01:00", bezug).fehler, /Tag nicht erkannt/);
  assert.match(K.ankunftEingabe("25:00", bezug).fehler, /Uhrzeit nicht erkannt/);
  assert.match(K.ankunftEingabe("morgen früh", bezug).fehler, /nicht erkannt/);
});
