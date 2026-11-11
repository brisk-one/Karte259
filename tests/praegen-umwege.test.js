// Tests für die Lieferung über Zwischendörfer im Prägerechner (inaktiv bis Supportfreigabe).
// Aufruf: node --test tests/praegen-umwege.test.js. Nur Kunstdaten: Dörfer, Namen und Koordinaten sind erfunden.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../site/praegen-core.js");
const U = require("../site/praegen-umwege.js");

const WELT = {speed: 1.6, coin: {wood: 28000, stone: 30000, iron: 25000}, base_min_per_field: 6, merchant_carry: 1000};
const rel = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), a + " ist nicht " + b);
const dorf = (name, x, y, market, storage, snob) =>
  ({name, x, y, b: {main: 20, snob: snob ? 1 : 0, smith: 20, market, wood: 25, stone: 25, iron: 25, storage}});

// 40 erfundene Dörfer in einem Haufen, wie im Test des Rechenkerns
function haufen() {
  const v = [];
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 40; i++) {
    v.push({name: "Kunst " + i, x: 630 + Math.round(rnd() * 20), y: 600 + Math.round(rnd() * 40) + i % 3,
            b: {main: 20, snob: i % 3 === 0 ? 1 : 0, smith: 20, market: i % 6 === 0 ? 8 + (i % 5) : 15 + (i % 11),
                wood: 27, stone: 27, iron: 26, storage: 25 + (i % 6), farm: 30}});
  }
  return v;
}

// Prägedorf in der Mitte, ein Ring mit großen Märkten, dahinter ferne Dörfer mit kleinem Markt und vollem Speicher
function verstreut() {
  const v = [dorf("Präge", 500, 500, 25, 30, true)];
  for (let i = 0; i < 10; i++) { const a = i / 10 * 2 * Math.PI; v.push(dorf("Mitte " + i, Math.round(500 + 14 * Math.cos(a)), Math.round(500 + 14 * Math.sin(a)), 25, 22)); }
  for (let i = 0; i < 10; i++) { const a = (i + 0.2) / 10 * 2 * Math.PI; v.push(dorf("Fern " + i, Math.round(500 + 24 * Math.cos(a)), Math.round(500 + 24 * Math.sin(a)), 12, 30)); }
  return v;
}

test("LP: kleines Beispiel mit bekanntem Optimum", () => {
  // max 3x + 2y mit x + y <= 4, x + 3y <= 6, x <= 3: Optimum x = 3, y = 1, Wert 11
  const cols = [[[0, 1], [1, 1], [2, 1]], [[0, 1], [1, 3]]];
  const r = U.maximiere(3, cols, Float64Array.from([4, 6, 3]), Float64Array.from([3, 2]));
  assert.equal(r.status, "optimal");
  rel(r.obj, 11, 1e-6); rel(r.x[0], 3, 1e-6); rel(r.x[1], 1, 1e-6);
});

test("Politik direkt trifft das Anfordern des Rechenkerns", () => {
  const faelle = [
    [{pkgPct: 0, startPct: 0}, 1, [0, 0, 1, 1, 2, 2, 3, 3]],
    [{mintLocal: true, decreeN: 1}, 2, [0, 0, 0, 1, 1, 1, 2, 5, 9, 9]],
    [{production: false, startPct: 20, intervalMin: 30}, 1, [0, 1, 2, 3, 4, 5]],
    [{merchantBonus: false, decreeN: 2, minMarket: 20}, 3, [1, 1, 4, 4, 8, 8, 12]],
  ];
  for (const [extra, nSites, pos] of faelle) {
    const P = K.params(Object.assign({pkgSize: 30, merchantBonus: true, flagLevel: 9, intervalMin: 60, prodFactor: 1.2}, extra), WELT);
    const R = K.plan(haufen(), Object.assign({}, P, {pkgPct: 150}));
    const sites = R.configs[Math.min(nSites, R.configs.length) - 1].sites;
    const cnt = K.toCnt(pos, K.lastClick(P));
    const ls = K.lockstep(R.src, P, sites, cnt);
    const d = U.lauf(R.src, P, sites, cnt, {politik: "direkt"});
    rel(d.coins, ls.coins, 1e-9);
    rel(d.units, ls.units, 1e-9);
    assert.equal(d.anZwischen, 0);
  }
});

test("Umwege bringen bei verstreuten Dörfern mit kleinen Märkten mehr als das Anfordern", () => {
  const P = K.params({pkgSize: 30, merchantBonus: true, flagLevel: 9, intervalMin: 60}, WELT);
  const src = K.prepare(verstreut(), P);
  const cnt = K.toCnt([0, 0, 0, 6, 6, 6, 12, 12, 12, 18, 18, 18], K.lastClick(P));
  const r = U.vergleich(src, P, [0], cnt, {fenster: 8});
  rel(r.direkt.coins, K.lockstep(src, P, [0], cnt).coins, 1e-9);
  assert.ok(r.umwege.coins > r.direkt.coins * 1.05, "Umwege " + r.umwege.coins.toFixed(0) + ", Anfordern " + r.direkt.coins.toFixed(0));
  assert.ok(r.umwege.anZwischen > 0);
  assert.ok(r.umwege.anfragen.mittel >= 1 && r.umwege.anfragen.max >= r.umwege.anfragen.mittel);
  // nie mehr geprägt, als es überhaupt gibt: Start, Pakete und Produktion aller Dörfer
  let gesamt = 0;
  src.forEach(s => { gesamt += 3 * (s.cap * P.startPct / 100 + 12 * P.pkgSize / 100 * s.cap) + 48 * (s.prod.wood + s.prod.stone + s.prod.iron); });
  assert.ok(r.umwege.units * P.unitRes <= gesamt, "geprägt " + r.umwege.units * P.unitRes + ", vorhanden " + gesamt);
});

test("Umwege: ein Klick hält Bestand und freie Händler ein", () => {
  const P = K.params({merchantBonus: true}, WELT);
  const src = K.prepare(verstreut(), P);
  const d = src.map((s, i) => ({x: s.x, y: s.y, holz: i ? 200000 : 0, lehm: i ? 150000 : 0, eisen: i ? 180000 : 0, cap: s.cap,
    frei: i ? Math.floor(s.merchants / 2) : 0, gesamt: s.merchants, prod: [0, 0, 0], zufluss: 0}));
  const E = {d, mint: 0, carry: P.carry, mpf: P.minPerField, T: 60, H: 48 * 60, reserve: 0, fenster: 8, kNb: 30, maxZiele: 0, ratio: [28, 30, 25]};
  const pl = U.plane(E), menge = new Float64Array(d.length), haendler = new Float64Array(d.length);
  for (const [i, j, u] of pl.sends) {
    assert.ok(i !== 0 && i !== j);
    menge[i] += u;
    haendler[i] += Math.ceil(u * 83 / P.carry - 1e-9);
  }
  d.forEach((v, i) => {
    if (!i) return;
    assert.ok(menge[i] <= Math.min(v.holz / 28, v.lehm / 30, v.eisen / 25) + 1e-9, "Dorf " + i + " schickt mehr, als es hat");
    assert.ok(haendler[i] <= v.frei, "Dorf " + i + " braucht " + haendler[i] + " Händler, frei sind " + v.frei);
  });
  assert.ok(pl.sends.some(([, j]) => j !== 0), "mindestens ein Umweg");
});

test("Umwege: mit „Verhältnis ignorieren“ nicht gerechnet", () => {
  const P = K.params({ignoreRatio: true}, WELT);
  const src = K.prepare(verstreut(), P);
  assert.equal(U.vergleich(src, P, [0], K.toCnt([0], K.lastClick(P))).fehler, "verhaeltnis");
});
