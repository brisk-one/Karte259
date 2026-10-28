// Tests für den Rechenkern des Prägerechners. Aufruf: node --test tests/praegen.test.js
// Nur Kunstdaten: Dörfer, Namen und Koordinaten sind erfunden.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../site/praegen-core.js");

const WELT = {speed: 1.6, coin: {wood: 28000, stone: 30000, iron: 25000}, base_min_per_field: 6, merchant_carry: 1000};
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, a + " ist nicht " + b);

// Gebäudestufen in Spielreihenfolge (mit Wachturm):
// HG, Kaserne, Stall, Werkstatt, Wachturm, Adelshof, Schmiede, VP, Statue, Markt, Holz, Lehm, Eisen, Bauernhof, Speicher, Versteck, Wall
function zeile(name, x, y, k, punkte, stufen) { return name + " (" + x + "|" + y + ") K" + k + " \t" + punkte + "\t" + stufen.join("\t") + "\t"; }
const VOLL = [20, 25, 20, 15, 0, 1, 20, 1, 1, 25, 30, 30, 30, 30, 30, 10, 20];

test("Tabellen und Formeln", () => {
  assert.equal(K.storageCap(30), 400000);
  assert.equal(K.storageCap(26), 175047);
  assert.equal(K.merchantsAt(25), 235);
  assert.equal(K.merchantsAt(16), 46);
  assert.equal(K.merchantsAt(10), 10);
  near(K.baseProd(30), 2400, 1);
});

test("Gebäudeübersicht wird eingelesen", () => {
  const text = [
    "[099] Aktives Dorf\t\t(101|102) K11\t",          // Kopfzeile des aktiven Dorfes
    "79274\t\t84163\t\t148974\t\t400000\t\t(0)24000/24000",
    " Holz Σ = 9.000 pro/Stunde | 216.000 pro/Tag",
    " Lehm Σ = 9.000 pro/Stunde | 216.000 pro/Tag",
    " Eisen Σ = 9.000 pro/Stunde | 216.000 pro/Tag",
    "Dorf (3)\tPunkte",
    zeile("[001] Nordburg", 101, 102, 11, "10.393", VOLL),
    "", " ",
    // ohne Wachturm-Spalte: 16 Stufen, Zuordnung vom Ende her bleibt richtig
    zeile("[002] Südhof", 110, 120, 11, "1.233", [20, 5, 0, 0, 0, 1, 1, 1, 4, 17, 11, 11, 12, 26, 3, 6]),
    zeile("[001] Nordburg", 101, 102, 11, "10.393", VOLL),   // doppelt
    zeile("[003] Kaputt", 105, 105, 11, "500", [20, 25, 20, 15, 0, 1, 20, 1, 1, 31, 30, 30, 30, 30, 30, 10, 20]),
  ].join("\n");
  const p = K.parseOverview(text);
  assert.equal(p.villages.length, 2);
  const [a, b] = p.villages;
  assert.deepEqual([a.name, a.x, a.y, a.points], ["[001] Nordburg", 101, 102, 10393]);
  assert.deepEqual([a.b.snob, a.b.smith, a.b.market, a.b.storage, a.b.wall], [1, 20, 25, 30, 20]);
  assert.deepEqual([b.b.main, b.b.snob, b.b.market, b.b.wood, b.b.storage, b.b.watchtower], [20, 0, 4, 17, 26, undefined]);
  assert.equal(p.problems.length, 1);                      // Markt 31 ist unmöglich
  assert.deepEqual(p.prodSum, {wood: 9000, stone: 9000, iron: 9000});
});

test("Händler laufen mit der Weltgeschwindigkeit, Bonus × 1,5 (Stichprobe aus dem Spiel)", () => {
  const P = K.params({merchantBonus: true, flagLevel: 9}, WELT);
  near(P.minPerField, 2.5);
  near(P.carry, 1500);
  // 34,48 Felder: im Spiel 1:26:12 je Weg
  const t = K.travelHours({x: 0, y: 0}, {x: 10, y: 33}, P) * 3600;
  assert.ok(Math.abs(t - (3600 + 26 * 60 + 12)) < 1, "Laufzeit " + t + " s");
  const ohne = K.params({merchantBonus: false}, WELT);
  near(ohne.minPerField, 3.75);
  near(ohne.carry, 1000);
});

test("Münzpreis: Flagge verdoppelt, Erlass addiert sich", () => {
  const P = K.params({flagLevel: 9, decree: true}, WELT);
  near(K.coinPrice(1, P), 83000 * 0.42);       // 48 % + 10 %
  near(K.coinPrice(30, P), 83000 * 0.52);      // nach 24 h nur noch der Flaggendoppler
  assert.equal(P.deadline, 24);
  assert.equal(K.params({flagLevel: 9}, WELT).deadline, 48);
});

test("Simulation eines Dorfes, von Hand nachgerechnet", () => {
  // Speicher 30, Paket 30 %: je Rohstoff 120.000, prägbar 4 Münzen (Lehm begrenzt) = 332.000 Rohstoffe.
  // Markt 20 ohne Bonus: 110 Händler × 1.000 = 110.000 je Fahrt, 1 h Laufzeit, Klick stündlich.
  // Fahrten bei 0, 2, 4, 6 h (Händler nach 2 h zurück), Ankünfte 1, 3, 5, 7 h.
  const P = K.params({pkgPct: 30, flagLevel: 9, intervalMin: 60, production: false, merchantBonus: false}, WELT);
  const v = {name: "A", x: 0, y: 0, b: Object.assign({}, {market: 20, storage: 30, wood: 30, stone: 30, iron: 30, snob: 0})};
  const [s] = K.prepare([v], P);
  const r = K.simulate(s, 1, P, K.LONG_HORIZON, null, true);
  near(r.pkgUnits, 4);
  assert.deepEqual(r.arrivals.map(a => a[0]), [1, 3, 5, 7]);
  near(r.arrivals[0][2] * 83000, 110000, 1e-3);
  near(r.doneAt, 7);
  near(r.coins, 4 / 0.52);
  near(r.inTime, 4);
  // Als Prägedorf selbst: alles sofort
  const lokal = K.simulate(s, 0, P, K.LONG_HORIZON);
  assert.equal(lokal.doneAt, 0);
  near(lokal.coins, 4 / 0.52);
});

test("Zu kleiner Markt verpasst die Frist", () => {
  const P = K.params({pkgPct: 300, flagLevel: 9, intervalMin: 60, production: false, merchantBonus: true}, WELT);
  const v = {name: "Klein", x: 0, y: 0, b: {market: 4, storage: 30, wood: 30, stone: 30, iron: 30, snob: 0}};
  const [s] = K.prepare([v], P);
  const r = K.simulate(s, 0.5, P, P.window);
  assert.ok(r.inTime < r.pkgUnits);
  assert.equal(r.doneAt, Infinity);
});

// Zwei Haufen, 80 Felder auseinander (rund 3,3 h Laufzeit mit Bonus), je drei Dörfer mit Adelshof
function haufen() {
  const v = [];
  [[100, 100], [180, 100]].forEach(([cx, cy], h) => {
    [[0, 0], [1, 0], [0, 1]].forEach(([dx, dy], j) => {
      v.push({name: "H" + h + "-" + j, x: cx + dx, y: cy + dy, b: {main: 20, smith: 20, market: 25, storage: 30,
               wood: 30, stone: 30, iron: 30, snob: 1}});
    });
  });
  return v;
}

test("Zwei weit entfernte Haufen: je ein Prägedorf, Empfehlung zwei Flaggendoppler", () => {
  const P = K.params({pkgPct: 300, flagLevel: 9, intervalMin: 60, merchantBonus: true, production: true, minGainPct: 10}, WELT);
  const r = K.plan(haufen(), P);
  const [a, b] = r.pair.sites.map(i => r.src[i].x);
  assert.ok((a < 150) !== (b < 150), "je ein Prägedorf pro Haufen");
  assert.equal(r.recommend, 2);
  assert.ok(r.gainPct >= 10);
  assert.ok(!r.singleComplete);
});

test("Kleine Pakete: ein Flaggendoppler genügt", () => {
  const P = K.params({pkgPct: 10, flagLevel: 9, intervalMin: 60, merchantBonus: true, production: false, minGainPct: 10}, WELT);
  const r = K.plan(haufen(), P);
  assert.equal(r.recommend, 1);
  assert.ok(r.single.share > 0.999);
});

test("Prägedorf nur mit Adelshof, sonst Hinweis", () => {
  // Vier Dörfer ohne Adelshof in der Mitte, zwei mit Adelshof je 30 Felder außerhalb
  const b = snob => ({main: 20, smith: snob ? 20 : 5, market: 25, storage: 30, wood: 30, stone: 30, iron: 30, snob});
  const v = [[100, 100], [101, 100], [100, 101], [101, 101]].map(([x, y], j) => ({name: "M" + j, x, y, b: b(0)}));
  v.push({name: "West", x: 70, y: 100, b: b(1)}, {name: "Ost", x: 131, y: 101, b: b(1)});
  const P = K.params({pkgPct: 300, flagLevel: 9, intervalMin: 60, merchantBonus: true, production: false}, WELT);
  const r = K.plan(v, P);
  assert.ok(r.src[r.single.sites[0]].snob, "Empfehlung nur mit Adelshof");
  assert.ok(r.singleAny, "Hinweis auf besseres Dorf ohne Adelshof");
  assert.ok(!r.src[r.singleAny.sites[0]].snob);
});

test("Engpass-Einstufung nennt die nötige Marktstufe", () => {
  // Das Dorf mit kleinem Markt hat keinen Adelshof, kann also nicht selbst Prägedorf werden
  const v = haufen().slice(0, 3);
  v[2].b = Object.assign({}, v[2].b, {market: 6, snob: 0});
  v[2].x = 106;
  const P = K.params({pkgPct: 100, flagLevel: 9, intervalMin: 60, merchantBonus: true, production: false}, WELT);
  const r = K.plan(v, P);
  const row = r.d1.rows.find(x => r.src[x.i].b.market === 6);
  assert.equal(row.status, "markt");
  assert.ok(row.need > 6 && row.need <= 25);
});

test("Mindeststufe Marktplatz hebt kleine Märkte an, senkt keine", () => {
  const v = haufen().slice(0, 3);
  v[1].b = Object.assign({}, v[1].b, {market: 10});
  v[2].b = Object.assign({}, v[2].b, {market: 6, snob: 0});
  v[2].x = 106;
  const ohne = K.params({pkgPct: 100, flagLevel: 9, intervalMin: 60, merchantBonus: true, production: false}, WELT);
  const mit = K.params({pkgPct: 100, flagLevel: 9, intervalMin: 60, merchantBonus: true, production: false, minMarket: 20}, WELT);
  assert.equal(ohne.minMarket, 0);
  const [a, b, c] = K.prepare(v, mit);
  assert.deepEqual([a.b.market, b.b.market, c.b.market], [25, 20, 20]);
  assert.deepEqual([a.marketFrom, b.marketFrom, c.marketFrom], [25, 10, 6]);
  assert.equal(c.merchants, K.merchantsAt(20));
  assert.equal(v[2].b.market, 6, "Eingabe bleibt unverändert");
  const r0 = K.plan(v, ohne), r1 = K.plan(v, mit);
  assert.deepEqual(r0.marketUp, {count: 0, levels: 0});
  assert.deepEqual(r1.marketUp, {count: 2, levels: 24});
  assert.equal(r0.d1.rows.find(x => x.i === 2).status, "markt");
  assert.equal(r1.d1.rows.find(x => x.i === 2).status, "ok");
  assert.ok(r1.single.coins >= r0.single.coins);
});

test("Nötige Klickfrequenz", () => {
  const steps = [{min: 5, share1: 1}, {min: 30, share1: 1}, {min: 60, share1: 0.97}];
  assert.deepEqual(K.requiredInterval(steps, "share1"), {kind: "voll", min: 30});
  const plat = K.requiredInterval([{min: 5, share1: 0.9}, {min: 30, share1: 0.89}, {min: 60, share1: 0.8}], "share1");
  assert.equal(plat.kind, "plateau");
  assert.equal(plat.min, 30);
});

test("Großes Konto: 400 Dörfer, 160 mit Adelshof, Rechnung bleibt schnell", () => {
  const v = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let j = 0; j < 400; j++) {
    const h = j % 2, cx = h ? 260 : 200, cy = h ? 260 : 200;
    v.push({name: "G" + j, x: Math.round(cx + (rnd() - 0.5) * 30), y: Math.round(cy + (rnd() - 0.5) * 30) + (j % 7) * 0,
            b: {main: 20, smith: 20, market: 15 + (j % 11), storage: 26 + (j % 5), wood: 28, stone: 28, iron: 28, snob: j % 5 < 2 ? 1 : 0}});
  }
  // doppelte Koordinaten sind im Spiel unmöglich, hier unschädlich
  const P = K.params({pkgPct: 150, flagLevel: 9, intervalMin: 60, merchantBonus: true, production: true}, WELT);
  const t0 = Date.now();
  const r = K.plan(v, P);
  const ms = Date.now() - t0;
  assert.ok(r.pair && r.single);
  const [a, b] = r.pair.sites.map(i => r.src[i].x);
  assert.ok((a < 230) !== (b < 230), "je ein Prägedorf pro Haufen");
  assert.ok(ms < 8000, "Rechnung dauerte " + ms + " ms");
});
