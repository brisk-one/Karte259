// Fakes aufstocken: AG-Begleitschutz aufstocken (Dennis 14.11.2026 00:52)
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../site/angriff-core.js");

const MIN = {sword: 60, axe: 50};
// Befehl im DS-Ultimate-Format wie aus dem Export (Einheiten als Text, wie DS-Ultimate sie schreibt)
function befehl(source, destination, units, opt) {
  const o = Object.assign({source, destination, slowest_unit: K.UNITS.indexOf("snob"), arrival_time: 1763100000 + (opt && opt.s || 0),
                           type: K.DSU_TYPE.ag, support_boost: 0, tribe_skill: 0, ms: opt && opt.ms || 0}, opt && opt.roh);
  K.UNITS.forEach(u => { o[u] = units[u] != null ? units[u] : "0"; });
  return o;
}
const plan = items => K.parsePlan(JSON.stringify({title: "Op", uvMode: 0, world: "de259", twWorld: "de259", items}));

test("nur Schwert oder nur Axt unter dem Mindestwert wird aufgestockt", () => {
  const p = plan([
    befehl(1, 9, {snob: "1", sword: "20"}),                       // Deff-Dorf: auf 60 Schwert
    befehl(2, 9, {snob: "1", axe: "30"}, {ms: 200}),              // Off-Dorf: auf 50 Axt
    befehl(3, 9, {snob: "1", axe: "6000", ram: "250", sword: "5"}),   // AG mit ganzer Off: genug Axt
    befehl(4, 9, {snob: "1", sword: "60"}),                       // genau der Mindestwert
    befehl(5, 9, {snob: "1", sword: "30", axe: "20"}),            // beides unter dem Wert: unverändert, gemeldet
    befehl(6, 9, {snob: "1", light: "100"}),                      // ohne Schwert und Axt: unverändert, gemeldet
    befehl(7, 9, {axe: "10", ram: "1"}, {roh: {type: K.DSU_TYPE.clean, slowest_unit: K.UNITS.indexOf("ram")}}),   // Off, kein AG
  ]);
  assert.deepEqual(p.fehler, []);
  const r = K.begleitAufstocken(p.items, MIN);
  assert.deepEqual(r.aenderungen.map(a => [a.it.source, a.u, a.alt, a.neu]), [[1, "sword", 20, 60], [2, "axe", 30, 50]]);
  assert.deepEqual(r.beide.map(it => it.source), [5]);
  assert.deepEqual(r.ohne.map(it => it.source), [6]);
  assert.deepEqual(r.knapp, []);
  assert.equal(p.items[0].units.sword, 20, "Eingabe bleibt unverändert");
});

test("abgeschickt, Einheit als Text und Mindestwert 0 bleiben unverändert", () => {
  const p = plan([befehl(1, 9, {snob: "1", sword: "20"}), befehl(2, 9, {snob: "1", axe: "all"}), befehl(3, 9, {snob: "1", axe: "10"})]);
  p.items[0].gesendet = 1763100000000;
  assert.deepEqual(K.begleitAufstocken(p.items, MIN).aenderungen.map(a => a.it.source), [3]);
  assert.deepEqual(K.begleitAufstocken(p.items, {sword: 60, axe: 0}).aenderungen, []);
  // ein AG-Symbol ohne AG im Befehl zählt laut importArt trotzdem als AG
  const q = plan([befehl(4, 9, {sword: "40"})]);
  assert.deepEqual(K.begleitAufstocken(q.items, {sword: 70}).aenderungen.map(a => a.neu), [70]);
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
  // ohne Aufstocken unverändert durchgereicht
  assert.deepEqual(K.importDSU(plan(roh).items).items, roh);
});

test("Truppenübersicht: Hinweis, wenn das Dorf nicht genug frei hat", () => {
  const p = plan([
    befehl(1, 9, {snob: "1", sword: "20"}), befehl(1, 9, {snob: "1", sword: "20"}, {ms: 200}),   // braucht 2 × 40 = 80
    befehl(2, 9, {snob: "1", axe: "30"}),                                                     // braucht 20
    befehl(2, 8, {axe: "all", light: "all", ram: "all"}, {roh: {type: K.DSU_TYPE.clean}}),      // Standard-Off nimmt alle Äxte
    befehl(3, 9, {snob: "1", axe: "10"}),                                                     // braucht 40, frei 1000
  ]);
  const doerfer = new Map([[1, Object.assign(K.UNITS.reduce((o, u) => (o[u] = 0, o), {}), {sword: 100})],
                           [2, {axe: 6000}], [3, {axe: 1000}]]);
  const r = K.begleitAufstocken(p.items, MIN, doerfer);
  assert.equal(r.aenderungen.length, 4);
  // Dorf 1: 100 Schwert, die beiden AGs tragen schon 40, frei 60, braucht 80
  assert.deepEqual(r.knapp, [{source: 1, u: "sword", braucht: 80, frei: 60, alle: false}, {source: 2, u: "axe", braucht: 20, frei: 0, alle: true}]);
  // Dorf nicht in der Übersicht: kein Hinweis
  assert.deepEqual(K.begleitAufstocken(p.items, MIN, new Map([[9, {sword: 0}]])).knapp, []);
});
