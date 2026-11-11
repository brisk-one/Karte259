// Tests für die Sitzungsanzahlplanung im Prägerechner. Aufruf: node --test tests/praegen-sitzungen.test.js
// Nur Kunstdaten: Dörfer, Namen und Koordinaten sind erfunden.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../site/praegen-core.js");
const S = require("../site/praegen-sitzungen.js");

const WELT = {speed: 1.6, coin: {wood: 28000, stone: 30000, iron: 25000}, base_min_per_field: 6, merchant_carry: 1000};
const ZIEL = {main: 22, market: 22, storage: 30};

test("Bauwerte: Kosten, Bevölkerung, Bauernhof und Punkte wie in den Tabellen der Hilfe", () => {
  const g = S.bauwerte(null);
  assert.deepEqual(S.kosten(g.main, 22), [11535, 13146, 8972]);       // Hauptgebäude Stufe 22
  assert.deepEqual(S.kosten(g.farm, 30), [90692, 125517, 48331]);     // Bauernhof Stufe 30
  assert.equal(S.bevoelkerung(g.main, 22), 135);
  assert.equal(S.bevoelkerung(g.main, 30), 475);
  assert.equal(S.bauernhof(20), 4904);
  assert.equal(S.bauernhof(30), 24000);
  // Punkte je Stufe laut Punktetabelle, aufsummiert
  const hg = [10, 2, 2, 3, 4, 4, 5, 6, 7, 9, 10, 12, 15, 18, 21, 26, 31, 37, 44, 53, 64, 77];
  const speicher = [6, 1, 2, 1, 2, 3, 3, 3, 5, 5, 6, 8, 8, 11, 13, 15, 19, 22, 27, 32, 38, 46, 55, 66, 80, 95, 115, 137, 165, 198];
  assert.equal(S.punkte("main", 22), hg.reduce((a, v) => a + v, 0));
  assert.equal(S.punkte("market", 22), hg.reduce((a, v) => a + v, 0));
  assert.equal(S.punkte("storage", 30), speicher.reduce((a, v) => a + v, 0));
  // Bauwerte der Welt ersetzen die Standardwerte je Gebäude
  assert.equal(S.bauwerte({gebaeude: {main: Object.assign({}, g.main, {build_time: 450})}}).main.build_time, 450);
});

test("Bauzeit: jede Stufe Hauptgebäude verkürzt um den Faktor 1,05, Weltgeschwindigkeit teilt", () => {
  const g = S.bauwerte(null).storage;
  const a = S.bauzeit(g, 25, 10, 1), b = S.bauzeit(g, 25, 11, 1);
  assert.ok(Math.abs(a / b - 1.05) < 1e-9);
  assert.ok(Math.abs(S.bauzeit(g, 25, 10, 1.6) * 1.6 - a) < 1e-9);
  // Stufe 1 und 2 gleich (Exponent −13 laut Formel), danach jede Stufe länger
  for (let L = 2; L <= 30; L++) assert.ok(S.bauzeit(g, L, 0, 1) > S.bauzeit(g, L - 1, 0, 1) - (L === 2 ? 1e-9 : 0), "Stufe " + L);
});

test("Ausbau erreicht die Zielstufen, der Bauernhof reicht für die Bevölkerung", () => {
  const g = S.bauwerte(null), a = S.ausbau(ZIEL, g, 1.6);
  assert.deepEqual([a.stufen.main, a.stufen.market, a.stufen.storage], [22, 22, 30]);
  const bev = S.bevoelkerung(g.main, 22) + S.bevoelkerung(g.market, 22);
  assert.ok(S.bauernhof(a.bauernhof) >= bev);
  assert.ok(S.bauernhof(a.bauernhof - 1) < bev, "nicht mehr Bauernhof als nötig");
  assert.equal(a.punkte, S.punkte("main", 22) + S.punkte("market", 22) + S.punkte("storage", 30) + S.punkte("farm", a.bauernhof) - S.punkte("farm", 1));
  assert.ok(a.dauer > 24 && a.dauer < 24 * 30);
  // Punkte wachsen mit der Zeit bis zum Ende des Ausbaus
  assert.equal(S.punkteNach(a, 0), 0);
  assert.ok(S.punkteNach(a, a.dauer / 2) < a.punkte);
  assert.equal(S.punkteNach(a, a.dauer + 1), a.punkte);
});

// 24 erfundene Dörfer in einem Haufen und Barbarendörfer ringsum
function konto() {
  const v = [];
  let seed = 5;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 24; i++) v.push({name: "Kunst " + i, x: 600 + Math.round(rnd() * 14), y: 600 + Math.round(rnd() * 14), points: 9000,
    b: {main: 22, snob: i % 4 === 0 ? 1 : 0, smith: 20, market: 18 + (i % 7), wood: 27, stone: 27, iron: 27, storage: 28, farm: 30}});
  return v;
}
function barbaren(n) {
  const b = [];
  let seed = 9;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) b.push({x: 570 + Math.round(rnd() * 75), y: 570 + Math.round(rnd() * 75), pts: 26 + Math.round(rnd() * 474)});
  return b;
}
const P = K.params({mode: "pct", pkgSize: 30, merchantBonus: true, flagLevel: 9, intervalMin: 60, maxOverflow: 1}, WELT);

test("Strategie: nie mehr Pakete als Vorrat und Zugang, Dörfer aus den Adelsgeschlechtern", () => {
  const V = konto(), aus = S.ausbau(ZIEL, S.bauwerte(null), P.speed), b = barbaren(400);
  const st = S.staende(V, P, b, ZIEL, aus);
  for (const [vorrat, zugang] of [[0, 0], [300, 0], [600, 140]]) {
    for (const m of [1, 2, 4]) {
      const r = S.strategie(V, P, {vorrat, zugang, tage: 16, ziel: ZIEL, barbaren: b, muenzen: 0, naechstes: 25, ausbau: aus}, m, st);
      assert.ok(r.pakete <= vorrat + zugang * 16 / 7 + 1e-6, "m=" + m + ": " + r.pakete + " % gezogen");
      assert.ok(r.genutzt <= vorrat + zugang * 16 / 7 + 1e-6);
      assert.equal(r.doerfer, r.sitzungen.reduce((a, s) => a + s.erobert, 0));
      r.sitzungen.forEach(s => { assert.ok(s.erobert <= s.ag); assert.ok(s.start + 48 <= 16 * 24 + 1e-9); });
      if (vorrat === 0 && zugang === 0) r.sitzungen.forEach(s => assert.equal(s.n, 0));
      // Runden: nach m Sitzungen wird gewartet, sofern neue Dörfer kamen
      const proRunde = new Map();
      r.sitzungen.forEach(s => proRunde.set(s.runde, (proRunde.get(s.runde) || 0) + 1));
      for (const n of proRunde.values()) assert.ok(n <= m);
    }
  }
});

test("Planung: Ergebnis je Zahl der Sitzungen, Empfehlung und Empfindlichkeit", () => {
  const schritte = [];
  const r = S.plane({villages: konto(), P, welt: null, vorrat: 900, zugang: 0, tage: 12, ziel: ZIEL, barbaren: barbaren(400), muenzen: 0, naechstes: 25, mMax: 4},
                    (i, n) => schritte.push([i, n]));
  assert.equal(r.quelle, "standard");
  assert.equal(r.ergebnisse.length, 4);
  assert.ok(r.beste >= 1 && r.beste <= 4);
  const best = r.ergebnisse[r.beste - 1];
  r.ergebnisse.forEach(x => assert.ok(best.punkte >= x.punkte - 0.5));
  assert.ok(best.doerfer > 0 && best.punkte > 0);
  assert.ok(r.empfindlich.kurz >= 1 && r.empfindlich.lang >= 1);
  assert.equal(schritte[schritte.length - 1][0], schritte[schritte.length - 1][1]);
  assert.equal(r.punkteJetzt, 24 * 9000);
  assert.ok(r.naechstes === 25 && !r.naechstesGeschaetzt);
});
