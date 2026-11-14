// Deffplaner (Dennis 14.11.2026 04:46): Deff aus Deff-Dörfern 1 s hinter den letzten AG, ganze Dörfer, Paladin-Laufzeit,
// Fake-Unterstützungen, Export für DS-Ultimate. Nur Kunstdaten.
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../site/angriff-core.js");
const So = require("../site/sortieren.js");
const D = require("../site/deff-core.js");

const W = K.makeWorld();
const T0 = Date.UTC(2026, 10, 20, 9, 0);                 // 10:00 Berlin
const leer = o => Object.assign(Object.fromEntries(K.UNITS.map(u => [u, 0])), o);
const ag = (nach, von, ms, n) => ({nach, von, arrivalMs: ms, units: leer({snob: n || 1, sword: 50})});
// Truppenübersicht Ansicht „Alle“ als Text: je Dorf eigene, im Dorf, auswärts, unterwegs, insgesamt
const SP = K.OVERVIEW_COLUMNS;
const zeile = (label, u) => label + "\t" + SP.filter(c => c !== "militia").map(c => u[c] || 0).join("\t");
function uebersicht(doerfer) {
  return ["Dorf (" + doerfer.length + ")"].concat(doerfer.flatMap(d => [
    d.name + " (" + d.x + "|" + d.y + ") K55\t" + zeile("eigene", d.eigene),
    zeile("im Dorf", d.eigene), zeile("auswärts", d.weg || {}), zeile("unterwegs", {}),
    zeile("insgesamt", Object.fromEntries(K.UNITS.map(u => [u, (d.eigene[u] || 0) + ((d.weg || {})[u] || 0)])))])).join("\n");
}
const DEFF = {spear: 5000, sword: 5000, archer: 4000, heavy: 0, light: 500, catapult: 300, spy: 50};
function lage(doerfer) { return So.leseDorfTruppen(uebersicht(doerfer)).villages; }

test("AG-Ziele: letzte Ankunft je Ziel, Offs und Fakes zählen nicht", () => {
  const z = D.agZiele([ag({x: 500, y: 500}, {x: 510, y: 510}, T0), ag({x: 500, y: 500}, {x: 510, y: 510}, T0 + 600),
                       {nach: {x: 500, y: 500}, von: {x: 1, y: 1}, arrivalMs: T0 + 9000, units: leer({axe: 5000})},
                       ag({x: 490, y: 500}, {x: 510, y: 510}, T0 - 5000)]);
  assert.deepEqual(z.map(x => [x.t, x.letzteAG, x.ags]), [[{x: 490, y: 500}, T0 - 5000, 1], [{x: 500, y: 500}, T0 + 600, 2]]);
});

test("Deff-Dörfer: Zeile „eigene“, mit allen Spähern, ohne LKav und Katapulte; Paladin läuft mit, Off-Dörfer und Raubzug-Speer nicht", () => {
  const v = lage([{name: "D1", x: 505, y: 505, eigene: DEFF},
                  {name: "P1", x: 506, y: 505, eigene: Object.assign({}, DEFF, {knight: 1})},
                  {name: "O1", x: 507, y: 505, eigene: {axe: 6000, light: 3000, ram: 300, sword: 5}},
                  {name: "R1", x: 508, y: 505, eigene: {spear: 1000}},
                  {name: "W1", x: 509, y: 505, eigene: {spear: 200}, weg: {spear: 6000, sword: 6000}}]);
  assert.equal(v[0].eigene.light, 500, "Zeile eigene gelesen");
  const d = D.deffDoerfer(v, null, W);
  assert.deepEqual(d.map(x => [x.name, x.bh, x.pala, x.slow]), [["D1", 14100, false, "sword"], ["P1", 14110, true, "knight"]]);
  assert.deepEqual([d[0].units.light, d[0].units.catapult, d[0].units.spy, d[1].units.knight], [0, 0, 50, 1]);
  // Wert: allgemeine plus Kavallerie-Verteidigung (Speer 15+45, Schwert 50+15, Bogen 50+40, Späher 2+1, Paladin 250+400)
  assert.equal(d[0].wert, 5000 * 60 + 5000 * 65 + 4000 * 90 + 50 * 3);
  assert.equal(d[1].wert, d[0].wert + 650);
});

test("Verteilung: Deff 1 s nach dem letzten AG, ganze Dörfer, kleinstes passendes zuerst, nur rechtzeitig erreichbare", () => {
  const v = lage([{name: "Gross", x: 505, y: 505, eigene: {spear: 8000, sword: 8000, archer: 2000}},       // 18000
                  {name: "Passt", x: 506, y: 506, eigene: {spear: 7000, sword: 7000}},                      // 14000
                  {name: "Klein1", x: 495, y: 495, eigene: {spear: 4000, sword: 4000}},                     // 8000
                  {name: "Klein2", x: 494, y: 495, eigene: {spear: 3000, sword: 3500}},                     // 6500
                  {name: "Weit", x: 600, y: 600, eigene: {spear: 9000, sword: 9000}}]);                     // zu weit
  const ziele = D.agZiele([ag({x: 500, y: 500}, {x: 510, y: 510}, T0 + 400), ag({x: 490, y: 490}, {x: 510, y: 510}, T0 + 800)]);
  const now = T0 - 5 * 3600000;
  const p = D.planen({ziele, villages: v, world: W, now});
  const z1 = p.ziele.find(z => z.t.x === 500), z2 = p.ziele.find(z => z.t.x === 490);
  assert.equal(z1.ankunft, T0 + 1400);
  // 490|490 erreichen nur die kleinen Dörfer: dieses Ziel zuerst, zwei Dörfer; 500|500 dann das kleinste, das allein reicht
  assert.deepEqual(z2.echt.map(e => e.von.name), ["Klein1", "Klein2"]);
  assert.equal(z2.bh, 14500);
  assert.deepEqual(z1.echt.map(e => e.von.name), ["Passt"], "kleinstes Dorf, das allein reicht");
  assert.ok(z1.erreicht && z2.erreicht);
  assert.deepEqual(p.ungenutzt.map(q => q.name), ["Gross", "Weit"]);
  const e = z1.echt[0];
  assert.equal(e.sendMs, T0 + 1400 - K.travelS(W, "sword", K.dist({x: 506, y: 506}, {x: 500, y: 500})) * 1000);
  assert.equal(e.units.spear + e.units.sword, 14000, "ganze Deff");
  assert.ok(!p.befehle.some(b => b.art === "deff" && b.von.name === "Weit"));
  // Soll niedriger: ein kleines Dorf reicht je Ziel
  const p2 = D.planen({ziele, villages: v, world: W, now, cfg: {speer: 3000, schwert: 3000}});
  assert.deepEqual(p2.ziele.map(z => z.echt.length), [1, 1]);
  // Abschick vorbei: nichts, Ziel nicht erreicht
  const p3 = D.planen({ziele, villages: v, world: W, now: T0});
  assert.deepEqual(p3.ziele.map(z => [z.echt.length, z.erreicht]), [[0, false], [0, false]]);
});

test("Paladin: Laufzeit des Paladins, damit auch weiter weg noch rechtzeitig", () => {
  const ziele = D.agZiele([ag({x: 500, y: 500}, {x: 510, y: 510}, T0)]);
  const ohne = lage([{name: "Fern", x: 520, y: 500, eigene: {spear: 7000, sword: 7000}}]);
  const mit = lage([{name: "Fern", x: 520, y: 500, eigene: {spear: 7000, sword: 7000, knight: 1}}]);
  const now = T0 + 1000 - K.travelS(W, "sword", 20) * 1000;           // mit Schwert-Laufzeit schon zu spät
  assert.equal(D.planen({ziele, villages: ohne, world: W, now}).ziele[0].echt.length, 0);
  const p = D.planen({ziele, villages: mit, world: W, now});
  assert.deepEqual([p.ziele[0].echt.length, p.ziele[0].echt[0].slow, p.ziele[0].echt[0].units.knight], [1, "knight", 1]);
  assert.equal(p.ziele[0].echt[0].sendMs, T0 + 1000 - K.travelS(W, "knight", 20) * 1000);
});

test("Fakes: je Ziel aus verschiedenen Dörfern, Schwert vor Speer, nicht aus Dörfern, die ihre Deff schicken", () => {
  const v = lage([{name: "Deff", x: 505, y: 505, eigene: {spear: 7000, sword: 7000}},
                  {name: "A", x: 503, y: 503, eigene: {sword: 5, axe: 6000}}, {name: "B", x: 504, y: 503, eigene: {spear: 1000}},
                  {name: "C", x: 503, y: 504, eigene: {sword: 1}}, {name: "E", x: 502, y: 503, eigene: {}}]);
  const ziele = D.agZiele([ag({x: 500, y: 500}, {x: 510, y: 510}, T0), ag({x: 501, y: 500}, {x: 510, y: 510}, T0 + 2000)]);
  const p = D.planen({ziele, villages: v, world: W, now: T0 - 3 * 3600000, cfg: {fakes: 3}});
  assert.deepEqual(p.ziele.map(z => z.fakes.length), [3, 2], "beim zweiten Ziel hat C kein Schwert mehr");
  p.ziele.forEach(z => {
    assert.equal(new Set(z.fakes.map(f => f.von.name)).size, z.fakes.length, "verschiedene Dörfer");
    assert.ok(!z.fakes.some(f => f.von.name === "Deff" || f.von.name === "E"));
    z.fakes.forEach(f => { assert.equal(f.arrivalMs, z.ankunft); assert.equal(K.UNITS.reduce((s, u) => s + f.units[u], 0), 1); });
  });
  const art = p.ziele[0].fakes.map(f => [f.von.name, f.slow]).sort();
  assert.deepEqual(art, [["A", "sword"], ["B", "spear"], ["C", "sword"]]);
  assert.deepEqual(p.ziele[1].fakes.map(f => f.von.name).sort(), ["A", "B"]);
});

test("Export DS-Ultimate: Typ 0 Unterstützung, 46 Fake-Unterstützung, Einheiten als Zahlen, langsamste Einheit", () => {
  const v = lage([{name: "P", x: 505, y: 505, eigene: {spear: 7000, sword: 7000, knight: 1}}, {name: "F", x: 503, y: 503, eigene: {sword: 3}}]);
  const ziele = D.agZiele([ag({x: 500, y: 500}, {x: 510, y: 510}, T0 + 250)]);
  const p = D.planen({ziele, villages: v, world: W, now: T0 - 3 * 3600000, cfg: {fakes: 1}});
  const ids = {"505|505": 11, "503|503": 12, "500|500": 99};
  const ex = D.exportDSU(p.befehle, (x, y) => ids[x + "|" + y], {title: "Deff Test", world: "de259"});
  const j = JSON.parse(ex.text);
  assert.deepEqual([j.title, j.world, j.twWorld, j.uvMode, ex.n, ex.fehlt.length], ["Deff Test", "de259", "de259", 0, 2, 0]);
  const echt = j.items.find(i => i.type === 0), fake = j.items.find(i => i.type === 46);
  assert.deepEqual([echt.source, echt.destination, echt.slowest_unit, echt.arrival_time, echt.ms, echt.knight, echt.spear, echt.light],
                   [11, 99, K.UNITS.indexOf("knight"), Math.floor((T0 + 1250) / 1000), 250, 1, 7000, 0]);
  assert.deepEqual([fake.source, fake.slowest_unit, fake.sword, fake.spear], [12, K.UNITS.indexOf("sword"), 1, 0]);
  assert.ok(j.items.every(i => K.UNITS.every(u => typeof i[u] === "number")));
  assert.equal(D.exportDSU(p.befehle, () => null).fehlt.length, 2, "ohne Dorf-ID nicht exportiert");
});

test("Kein kleiner Rest allein (Dennis 04:53): unter der Hälfte des Solls verstärkt das Dorf ein anderes Ziel", () => {
  const v = lage([{name: "Gross", x: 505, y: 505, eigene: {spear: 7000, sword: 7000}},
                  {name: "Klein", x: 497, y: 497, eigene: {spear: 1500, sword: 1600}}]);
  // Ziel A erreicht nur Klein (Gross zu weit), Ziel B erreichen beide
  const ziele = D.agZiele([ag({x: 480, y: 480}, {x: 510, y: 510}, T0), ag({x: 500, y: 500}, {x: 510, y: 510}, T0 + 500)]);
  const now = T0 - K.travelS(W, "sword", K.dist({x: 497, y: 497}, {x: 480, y: 480})) * 1000 - 600000;
  const p = D.planen({ziele, villages: v, world: W, now});
  const a = p.ziele.find(z => z.t.x === 480), b = p.ziele.find(z => z.t.x === 500);
  assert.deepEqual([a.echt.length, a.geloestBH, a.erreicht], [0, 3100, false]);
  assert.deepEqual(b.echt.map(e => [e.von.name, !!e.verstaerkung]), [["Gross", false], ["Klein", true]]);
  assert.equal(b.bh, 17100);
  // Mindestanteil 0: der kleine Rest bleibt
  const p0 = D.planen({ziele, villages: v, world: W, now, cfg: {minAnteil: 0}});
  assert.deepEqual(p0.ziele.find(z => z.t.x === 480).echt.map(e => e.von.name), ["Klein"]);
});

test("Schon laufende Unterstützungen aus der Befehlsübersicht zählen mit (nur nach dem letzten AG, keine Fakes)", () => {
  const text = ["Befehl\tHerkunftsdorf\tAnkunft",
    "   Unterstützung für Ziel (500|500) K55 \t[001] D (505|505) K55\tam 20.11. um 10:00:01:000\t7000\t7000\t0\t0\t0\t0\t0\t0\t0\t0\t0\t0",
    "   Unterstützung für Ziel (500|500) K55 \t[002] F (503|503) K55\tam 20.11. um 10:00:01:000\t0\t1\t0\t0\t0\t0\t0\t0\t0\t0\t0\t0",
    "   Angriff auf Ziel (500|500) K55 \t[003] A (510|510) K55\tam 20.11. um 10:00:00:000\t0\t50\t0\t0\t0\t0\t0\t0\t0\t0\t0\t1",
    "Serverzeit: 05:00:00 20/11/2026"].join("\n");
  const l = D.laufendeUnterstuetzung(text, T0, K.UNITS);
  assert.equal(l.length, 2);
  const ziele = D.agZiele(K.parseBefehle(text, T0, K.UNITS).befehle);
  assert.equal(ziele.length, 1);
  const p = D.planen({ziele, villages: lage([{name: "X", x: 504, y: 504, eigene: {spear: 7000, sword: 7000}}]), world: W, now: T0 - 3 * 3600000, laufend: l});
  assert.deepEqual([p.ziele[0].laufendBH, p.ziele[0].laufend, p.ziele[0].echt.length, p.ziele[0].erreicht], [14000, 1, 0, true]);
});

test("Wert (Dennis 05:08): Infanterie plus Kavallerie, Bogen-Verteidigung zählt nicht; Soll aus Speer und Schwert", () => {
  assert.equal(D.sollWert(D.einstellungen()), 7000 * (15 + 45) + 7000 * (50 + 15));
  assert.equal(D.wert(leer({archer: 100})), 100 * (50 + 40));
  assert.equal(D.bh(D.PAKET), 500, "typisches Deffpaket: 500 BH");
  // ein Dorf aus 25 typischen Paketen erreicht das Soll
  const paket25 = Object.fromEntries(Object.entries(D.PAKET).map(([u, n]) => [u, n * 25]));
  assert.ok(D.wert(paket25) >= D.sollWert(D.einstellungen()));
  assert.ok(D.wert(leer({spear: 14000})) < D.sollWert(D.einstellungen()), "nur Speer: zu wenig gegen Infanterie");
});

test("Export als Workbench-Zeilen (Dennis 05:45: Liste direkt nach DS-Ultimate): Symbol, Einheit, Ankunft in ms, Einheiten Base64", () => {
  const v = lage([{name: "P", x: 505, y: 505, eigene: {spear: 7000, sword: 7000, knight: 1}}, {name: "F", x: 503, y: 503, eigene: {sword: 3}}]);
  const ziele = D.agZiele([ag({x: 500, y: 500}, {x: 510, y: 510}, T0 + 250)]);
  const p = D.planen({ziele, villages: v, world: W, now: T0 - 3 * 3600000, cfg: {fakes: 1}});
  const ids = {"505|505": 11, "503|503": 12, "500|500": 99};
  const wb = D.exportWB(p.befehle, (x, y) => ids[x + "|" + y]);
  assert.equal(wb.n, 2);
  const zeilen = wb.text.split("\n").map(z => z.split("&"));
  const echt = zeilen.find(z => z[4] === "0"), fake = zeilen.find(z => z[4] === "46");
  assert.deepEqual(echt.slice(0, 7), ["11", "99", "knight", String(T0 + 1250), "0", "false", "false"]);
  const einheiten = Object.fromEntries(echt[7].split("/").map(x => x.split("=")).map(([u, b]) => [u, Buffer.from(b, "base64").toString()]));
  assert.deepEqual([einheiten.spear, einheiten.sword, einheiten.knight, einheiten.light, einheiten.militia], ["7000", "7000", "1", "0", "0"]);
  assert.deepEqual(fake.slice(0, 5), ["12", "99", "sword", String(T0 + 1250), "46"]);
  assert.ok(!echt[7].split("/").some(x => x.split("=")[1].includes("/")), "Base64 ohne Schrägstrich (DS-Ultimate trennt daran)");
});
