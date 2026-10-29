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
  const steps = [{min: 5, share: [1]}, {min: 30, share: [1]}, {min: 60, share: [0.97]}];
  assert.deepEqual(K.requiredInterval(steps, 1), {kind: "voll", min: 30});
  const plat = K.requiredInterval([{min: 5, share: [0.9, 1]}, {min: 30, share: [0.89, 1]}, {min: 60, share: [0.8, 0.99]}], 1);
  assert.equal(plat.kind, "plateau");
  assert.equal(plat.min, 30);
  assert.deepEqual(K.requiredInterval([{min: 5, share: [0.9, 1]}, {min: 30, share: [0.89, 1]}], 2), {kind: "voll", min: 30});
});

// Drei Haufen, je 70 bis 90 Felder auseinander, je fünf Dörfer, zwei davon mit Adelshof
function dreiHaufen() {
  const v = [];
  [[100, 100], [180, 110], [140, 190]].forEach(([cx, cy], h) => {
    [[0, 0], [1, 0], [0, 1], [-1, 1], [1, -1]].forEach(([dx, dy], j) => {
      v.push({name: "D" + h + "-" + j, x: cx + dx, y: cy + dy, b: {main: 20, smith: 20, market: 20, storage: 30,
               wood: 30, stone: 30, iron: 30, snob: j < 2 ? 1 : 0}});
    });
  });
  return v;
}

test("Drei weit entfernte Haufen: drei Prägedörfer, je eines pro Haufen", () => {
  const P = K.params({pkgPct: 300, flagLevel: 9, intervalMin: 60, merchantBonus: true, production: true, minGainPct: 10}, WELT);
  const r = K.plan(dreiHaufen(), P);
  assert.equal(r.recommend, 3);
  const haufen = r.configs[2].sites.map(i => r.src[i].name[1]).sort().join("");
  assert.equal(haufen, "012");
  assert.ok(r.configs[2].gainPct >= 10);
  assert.ok(r.configs.length >= 3 && r.configs.length <= 4, "gerechnet bis zur ersten Aufstellung unter der Schwelle");
  assert.equal(r.details.length, r.configs.length);
  if (r.configs[3]) assert.ok(r.configs[3].gainPct < 10);
});

test("Schwelle stoppt die Suche: bei hoher Schwelle bleibt es bei einem", () => {
  const P = K.params({pkgPct: 300, flagLevel: 9, intervalMin: 60, merchantBonus: true, production: true, minGainPct: 500}, WELT);
  const r = K.plan(dreiHaufen(), P);
  assert.equal(r.recommend, 1);
  assert.equal(r.configs.length, 2);
});

test("Frequenzleiter liefert Anteile je Zahl der Prägedörfer", () => {
  const P = K.params({pkgPct: 300, flagLevel: 9, intervalMin: 60, merchantBonus: true, production: false}, WELT);
  const st = K.ladderStep(dreiHaufen(), P, 60, 3);
  assert.equal(st.share.length, 3);
  assert.ok(st.share[2] >= st.share[1] - 1e-9 && st.share[1] >= st.share[0] - 1e-9);
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

/* ---------- v0.5: Konto im Gleichschritt, Zeitplan der Pakete (Kunstdaten) ---------- */
// 63 erfundene Dörfer in einem Haufen, jedes dritte mit Adelshof, jedes sechste mit kleinem Markt
function konto63() {
  const v = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 63; i++) {
    v.push({name: "Kunst " + i, x: 630 + Math.round(rnd() * 20), y: 600 + Math.round(rnd() * 45) + i % 3,
            b: {main: 20, snob: i % 3 === 0 ? 1 : 0, smith: 20, market: i % 6 === 0 ? 8 + (i % 5) : 15 + (i % 11),
                wood: 27, stone: 27, iron: 26, storage: 25 + (i % 6), farm: 30}});
  }
  return v;
}
const V5 = extra => K.params(Object.assign({pkgSize: 30, merchantBonus: true, flagLevel: 9, intervalMin: 60, prodFactor: 1.2}, extra), WELT);
const dorf = (name, x, y, market, storage, snob) =>
  ({name, x, y, b: {main: 20, snob: snob ? 1 : 0, smith: 20, market, wood: 25, stone: 25, iron: 25, storage}});

test("v0.5: nie mehr als 3 Pakete gleichzeitig, mehr Pakete bringen nie weniger Münzen", () => {
  const R = K.planPackages(konto63(), V5({}), []);
  const c = R.pkg.curve;
  assert.ok(c.length > 10);
  c.forEach(x => { const cnt = K.toCnt(x.pos, R.pkg.K); assert.ok(Math.max(0, ...cnt) <= 3, "Klick mit " + Math.max(...cnt) + " Paketen"); });
  for (let n = 1; n < c.length; n++) assert.ok(c[n].coins >= c[n - 1].coins - 1e-6, n + " Pakete bringen weniger als " + (n - 1));
  assert.equal(K.maxPerClick(V5({})), 3);
  assert.equal(K.maxPerClick(V5({pkgSize: 50})), 2);
});

test("v0.5: das Prägedorf läuft nie über", () => {
  const P = V5({});
  const src = K.prepare([dorf("Präge", 500, 500, 25, 10, true), dorf("Lieferant", 503, 500, 25, 30)], P);
  const r = K.lockstep(src, P, [0], K.toCnt([0, 0, 0, 1, 1, 1, 2, 2, 2], K.lastClick(P)), true);
  assert.equal(r.overflow[0], 0);
  assert.ok(r.overflow[1] > 0, "der Lieferant mit vollem Speicher läuft dagegen über");
});

test("v0.5: der optimierte Zeitplan bringt nie weniger als der gleichmäßige Start", () => {
  const P = V5({});
  const R = K.plan(konto63(), Object.assign({}, P, {pkgPct: 180}));
  const sites = R.configs[R.recommend - 1].sites, KK = K.lastClick(P);
  const f = c => K.lockstep(R.src, P, sites, c).coins;
  for (const N of [2, 6, 12]) {
    const start = K.evenSchedule(N, 36, KK, 3);
    const opt = K.improveSchedule(start, f, KK, 3, 4);
    assert.ok(opt.coins >= f(K.toCnt(start, KK)) - 1e-9);
    assert.equal(opt.pos.length, N);
  }
});

test("v0.5: ein Dorf mit großem Markt läuft bei gleichmäßigen Abständen nicht über", () => {
  const P = V5({});
  const [s] = K.prepare([dorf("Groß", 500, 500, 25, 26)], P);
  const KK = K.lastClick(P);
  const r = K.villageRun(s, 0.3, P, K.toCnt(K.evenSchedule(12, 44, KK, 3), KK), s.merchants, null);
  assert.equal(r.overflow, 0);
  const [klein] = K.prepare([dorf("Klein", 500, 500, 5, 26)], P);
  const q = K.villageRun(klein, 0.3, P, K.toCnt(K.evenSchedule(12, 44, KK, 3), KK), klein.merchants, null);
  assert.ok(q.overflow > 0, "mit Markt 5 dagegen schon");
});

test("v0.5: Erlass 2× verbilligt bis 48 h, 1× nur bis 24 h", () => {
  const P1 = V5({decreeN: 1}), P2 = V5({decreeN: 2}), P0 = V5({});
  near(K.reduction(30, P1), K.reduction(30, P0));
  near(K.reduction(30, P2), K.reduction(30, P0) + 0.1);
  near(K.reduction(47.5, P2), K.reduction(47.5, P0) + 0.1);
  assert.equal(P1.deadline, 24); assert.equal(P2.deadline, 48);
  assert.equal(K.params({decree: true}, WELT).decreeN, 1);              // alte Eingabe gilt als einmal
  const v = konto63(), pos = [0, 10, 20, 30];
  const coins = P => { const R = K.plan(v, Object.assign({}, P, {pkgPct: 120})); return K.lockstep(R.src, P, R.configs[0].sites, K.toCnt(pos, K.lastClick(P))).coins; };
  assert.ok(coins(P2) > coins(P1) && coins(P1) > coins(P0));
});

test("v0.5: Mindeststufe Speicher vergrößert die Pakete", () => {
  const [a] = K.prepare([dorf("D", 500, 500, 20, 20)], V5({}));
  const [b] = K.prepare([dorf("D", 500, 500, 20, 20)], V5({minStorage: 28}));
  assert.equal(a.cap, K.storageCap(20)); assert.equal(b.cap, K.storageCap(28));
  assert.equal([b.storageFrom, b.b.storage].join(), "20,28");
  const KK = K.lastClick(V5({}));
  const ra = K.villageRun(a, 0.5, V5({}), K.toCnt([0], KK), a.merchants, null);
  const rb = K.villageRun(b, 0.5, V5({minStorage: 28}), K.toCnt([0], KK), b.merchants, null);
  assert.ok(rb.pkgRes > ra.pkgRes * 1.5);
});

test("v0.5: Rohstoffverhältnis ignorieren schickt den Bestand, geprägt wird nach dem knappsten Rohstoff", () => {
  const P = V5({ignoreRatio: true, production: false}), KK = K.lastClick(P);
  const [s] = K.prepare([dorf("Lieferant", 500, 500, 25, 26)], P);
  const got = [];
  K.villageRun(s, 0.5, P, K.toCnt([0], KK), s.merchants, (t, a, b, c) => got.push([a, b, c]));
  near(got[0][0], got[0][1]); near(got[0][1], got[0][2]);                // gleiche Mengen, wie sie im Dorf liegen
  const R = K.prepare([dorf("Präge", 500, 500, 25, 30, true), dorf("Lieferant", 501, 500, 25, 26)], P);
  const r = K.lockstep(R, P, [0], K.toCnt([0], KK), true);
  assert.equal(r.overflow[0], 0);                                       // überschüssiges Holz und Eisen zählt nicht
  // Münzen nach Lehm (30.000 je Münze): je Dorf 30 % des Speichers Lehm
  const lehm = 0.3 * (K.storageCap(30) + K.storageCap(26));
  near(r.coins, lehm / 30000 / (1 - 0.48), 1e-6);
  // Im Prägeverhältnis dagegen bleibt der Überschuss im Lieferdorf
  const Q = V5({production: false}), RQ = K.prepare([dorf("Präge", 500, 500, 25, 30, true), dorf("Lieferant", 501, 500, 25, 26)], Q);
  near(K.lockstep(RQ, Q, [0], K.toCnt([0], KK)).coins, r.coins, 1e-6);
});

test("v0.5: die Schwelle stoppt die Paketzahl", () => {
  const v = konto63();
  const R90 = K.planPackages(v, V5({}), []), R80 = K.planPackages(v, V5({optThreshold: 80}), []);
  const c = R90.pkg;
  for (let n = 1; n <= c.optimal; n++) assert.ok(c.curve[n].gain >= 0.9 - 1e-9);
  assert.ok(c.curve[c.optimal + 1].gain < 0.9);
  assert.ok(R80.pkg.optimal > c.optimal);
  assert.ok(c.maximal >= R80.pkg.optimal);
  assert.ok(c.curve[c.maximal + 1] == null || c.curve[c.maximal + 1].gain < 0.05);
  assert.equal(R90.pkg.chosen, c.optimal);
  const fest = K.planPackages(v, V5({pkgCount: 5}), []);
  assert.equal(fest.pkg.chosen, 5); assert.equal(fest.pkg.pos.length, 5);
});

test("v0.5: Dörfer ohne Haken bekommen Pakete, ihr Überlauf wird gezeigt, Rechenzeit unter 2 s", () => {
  const v = konto63(), off = [dorf("Aus", 640, 610, 3, 24)];
  const t0 = Date.now();
  const R = K.planPackages(v, V5({}), off);
  const ms = Date.now() - t0;
  assert.equal(R.pkg.detail.passive.length, 1);
  assert.ok(R.pkg.detail.passive[0].pkgRes > 0);
  assert.ok(ms < 2000, "Rechnung dauerte " + ms + " ms");
});

test("v0.5: unter 1 h Klickabstand liegt der Zeitplan auf vollen Stunden des Klickrasters", () => {
  const R = K.planPackages(konto63(), V5({intervalMin: 15}), []);
  assert.equal(R.pkg.grid, 4);
  assert.ok(R.pkg.pos.every(k => k % 4 === 0));
  assert.ok(R.pkg.chosen === R.pkg.optimal && R.pkg.curve[R.pkg.chosen].pos.length === R.pkg.chosen);
  near(R.pkg.detail.coins, R.pkg.curve[R.pkg.chosen].coins, 1e-6);
});

test("v0.5 automatisch: jede Aufstellung mit eigener Paketzahl, weiterer Flaggendoppler nur ab Mehrertrag", () => {
  const R = K.planPackages(konto63(), V5({}), []);
  const pK = R.pkg.perK;
  assert.ok(pK.length >= 1 && pK[0].k === 1);
  for (let k = 2; k <= R.recommend; k++) assert.ok(pK[k - 1].coins >= pK[k - 2].coins * 1.1 - 1e-6, k + " Flaggendoppler ohne 10 % Mehrertrag");
  const nxt = pK[R.recommend];
  if (nxt) assert.ok(nxt.coins < pK[R.recommend - 1].coins * 1.1);
  near(R.pkg.detail.coins, pK[R.recommend - 1].coins, 1e-6);
  assert.equal(R.pkg.chosen, pK[R.recommend - 1].n);
  assert.equal(K.planPackages(konto63(), V5({pkgCount: 4}), []).pkg.perK, null);   // feste Zahl: einfache Rechnung wählt
});
