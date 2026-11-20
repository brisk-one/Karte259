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
  assert.equal(r.configs.length, 3);                       // gerechnet wird immer mindestens bis 3 (Dennis 8a, 17.11.2026)
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

test("v0.5: Dörfer ohne Haken bekommen Pakete, ihr Überlauf wird gezeigt, Rechenzeit unter 3 s", () => {
  const v = konto63(), off = [dorf("Aus", 640, 610, 3, 24)];
  const t0 = Date.now();
  const R = K.planPackages(v, V5({}), off);
  const ms = Date.now() - t0;
  assert.equal(R.pkg.detail.passive.length, 1);
  assert.ok(R.pkg.detail.passive[0].pkgRes > 0);
  // 3 s statt 2 s (20.11.2026): auf den GitHub-Rechnern schwankt die Zeit stark (17.11. 1,4 s, 20.11. 2,2 s bei gleichem Code)
  assert.ok(ms < 3000, "Rechnung dauerte " + ms + " ms");
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
  const g = 1 + R.P.minGainPct / 100;
  assert.equal(R.P.minGainPct, 6);                                   // Standard seit 17.11.2026 16:46
  for (let k = 2; k <= R.recommend; k++) assert.ok(pK[k - 1].coins >= pK[k - 2].coins * g - 1e-6, k + " Flaggendoppler ohne 6 % Mehrertrag");
  const nxt = pK[R.recommend];
  if (nxt) assert.ok(nxt.coins < pK[R.recommend - 1].coins * g);
  near(R.pkg.detail.coins, pK[R.recommend - 1].coins, 1e-6);
  assert.equal(R.pkg.chosen, pK[R.recommend - 1].n);
  assert.equal(K.planPackages(konto63(), V5({pkgCount: 4}), []).pkg.perK, null);   // feste Zahl: einfache Rechnung wählt
});

test("Adelsgeschlechter: jedes weitere kostet eine Münze mehr (Dennis 1a)", () => {
  // Vorrat 4 + 50,7 geprägt = 54 ganze Münzen; nächstes kostet 10: 10+11+12+13 = 46, das fünfte (14) bräuchte 60
  const a = K.adelsgeschlechter(4, 50.7, 10);
  assert.deepEqual([a.n, a.muenzen, a.verbraucht, a.rest, a.naechstesKostet, a.fehlen], [4, 54, 46, 8, 14, 6]);
  assert.equal(K.adelsgeschlechter(0, 9.99, 10).n, 0);
  assert.equal(K.adelsgeschlechter(0, 10, 10).n, 1);
  assert.equal(K.adelsgeschlechter(0, 6, 1).n, 3);           // 1+2+3
});

/* ---------- 10.11 Überlaufgrenze und Zeitplan in Berechnung 1 ---------- */
test("10.11: der gewählte Plan liegt nie über der Grenze, wenn ein zulässiger Plan existiert", () => {
  for (const g of [3, 1, 0.5]) {
    const R = K.planPackages(konto63(), V5({maxOverflow: g}), []);
    assert.ok(R.pkg.grenze.ok, "Grenze " + g + " nicht eingehalten");
    assert.ok(R.pkg.detail.overflowShare * 100 <= g + 1e-9, "Überlauf " + R.pkg.detail.overflowShare * 100 + " über " + g);
    R.pkg.curve.slice(0, R.pkg.optimal + 1).forEach(c => assert.ok(c.ok, c.n + " Pakete bis optimal unzulässig"));
  }
});

test("10.11: eine kleinere Grenze erhöht weder den Überlauf noch die Paketzahl „optimal“", () => {
  let vor = null;
  for (const g of [100, 3, 1, 0.3, 0]) {
    const pk = K.planPackages(konto63(), V5({maxOverflow: g}), []).pkg;
    const jetzt = {ov: pk.detail.overflowShare, n: pk.chosen};
    if (vor) {
      assert.ok(jetzt.ov <= vor.ov + 1e-9, "Grenze " + g + ": Überlauf steigt");
      assert.ok(jetzt.n <= vor.n, "Grenze " + g + ": mehr Pakete");
    }
    vor = jetzt;
  }
});

test("10.11: nicht erreichbare Grenze liefert den Plan mit kleinstem Überlauf und die Angaben für den Hinweis", () => {
  const frei = K.planPackages(konto63(), V5({pkgCount: 12}), []).pkg;
  const pk = K.planPackages(konto63(), V5({pkgCount: 12, maxOverflow: 1}), []).pkg;
  assert.equal(pk.chosen, 12);
  assert.equal(pk.grenze.ok, false);
  assert.ok(pk.grenze.ov * 100 > 1);
  assert.ok(pk.detail.overflowShare <= frei.detail.overflowShare + 1e-9, "Überlauf nicht kleiner als ohne Grenze");
  assert.ok(pk.grenze.maxOk >= 1 && pk.grenze.maxOk < 12);
  assert.ok(pk.curve[pk.grenze.maxOk].ok);
});

test("10.11: Berechnung 1 rechnet N aus Prozentpunkten und Paketgröße und liefert einen Zeitplan", () => {
  const P = V5({mode: "pct", pkgPct: 100, maxOverflow: 1});
  const R = K.planPct(konto63(), P, []);
  assert.equal(R.zeitplan.n, 3);                       // 100 % ÷ 30 % = 3,33 → 3 Pakete = 90 %
  assert.equal(R.zeitplan.sumPct, 90);
  assert.equal(R.zeitplan.detail.rows.reduce((a, r) => a + r.n, 0), 3);
  assert.ok(R.zeitplan.detail.coins > 0 && R.configs[R.recommend - 1].coins > 0);
  assert.equal(K.planPct(konto63(), V5({mode: "pct", pkgPct: 50, pkgSize: 20}), []).zeitplan.n, 3);   // 2,5 → 3
  assert.equal(K.planPct(konto63(), V5({mode: "pct", pkgPct: 10}), []).zeitplan.n, 0);
  assert.equal(K.planPct(konto63(), V5({mode: "pct", pkgPct: 10}), []).zeitplan.detail.rows.length, 0);
});

test("10.11: Grenze 100 % ergibt das bisherige Ergebnis", () => {
  const a = K.planPackages(konto63(), V5({}), []).pkg, b = K.planPackages(konto63(), V5({maxOverflow: 100}), []).pkg;
  const kurz = pk => JSON.stringify([pk.chosen, pk.optimal, pk.maximal, pk.pos, pk.curve.map(c => [c.n, c.pos, Math.round(c.coins)])]);
  assert.equal(kurz(b), kurz(a));
  assert.equal(V5({}).maxOverflow, 100);
  assert.equal(V5({maxOverflow: 1}).maxOverflow, 1);
  assert.equal(V5({maxOverflow: 250}).maxOverflow, 100);
});

/* ---------- 10.12 Aufstellung wählen, Kennzahlen folgen ---------- */
test("10.12: Kennzahlen einer gewählten Aufstellung stimmen mit ihrer Spalte im Vergleich überein", () => {
  const v = konto63(), P = V5({maxOverflow: 1});
  const R = K.planPackages(v, P, []), pK = R.pkg.perK;
  assert.ok(pK.length >= 2);
  pK.forEach(o => {
    const x = K.packagesForK(v, P, o.k, [], pK);
    assert.equal(x.pkg.chosen, o.n, o.k + " FD: Pakete");
    near(x.pkg.detail.coins, o.coins, 1e-6);
    assert.deepEqual(x.sites, o.sites.map(s => R.src.findIndex(t => t.x === s.x && t.y === s.y)));
  });
  const rec = K.packagesForK(v, P, R.recommend, [], pK);
  near(rec.pkg.detail.coins, R.pkg.detail.coins, 1e-6);
  assert.deepEqual(rec.pkg.pos, R.pkg.pos);
  // feste Paketzahl: dieselbe Zahl für jede Aufstellung
  const Pf = V5({pkgCount: 4});
  const Rf = K.planPackages(v, Pf, []);
  for (let k = 1; k <= Math.min(3, Rf.configs.length); k++) assert.equal(K.packagesForK(v, Pf, k, [], null).pkg.chosen, 4);
  // Berechnung 1: Zeitplan mit derselben Paketzahl, Prägedörfer der Spalte
  const Pp = V5({mode: "pct", pkgPct: 150});
  const Rp = K.planPct(v, Pp, []);
  for (let k = 1; k <= Rp.configs.length; k++) {
    const z = K.packagesForK(v, Pp, k, [], null).zeitplan;
    assert.equal(z.n, 5);
    if (k === Rp.recommend) near(z.detail.coins, Rp.zeitplan.detail.coins, 1e-6);
  }
});

test("10.12: Wahl bleibt nach einer Eingabe, fällt bei fehlender Zahl auf die Empfehlung zurück", () => {
  const R = {configs: [{}, {}, {}], recommend: 2};
  assert.equal(K.wahlNach(3, R), 3);
  assert.equal(K.wahlNach(1, R), 1);
  assert.equal(K.wahlNach(4, R), 2);
  assert.equal(K.wahlNach(null, R), 2);
  assert.equal(K.wahlNach(3, {configs: [{}], recommend: 1}), 1);
});

test("10.12: Zwischenspeicher wird bei geänderter Eingabe verworfen", () => {
  const c = K.aufstellungsCache();
  c.set("a", 2, {x: 1});
  assert.deepEqual(c.get("a", 2), {x: 1});
  assert.equal(c.has("b", 2), false);
  assert.equal(c.size(), 0);
  assert.equal(c.get("a", 2), undefined);
});

/* ---------- Zahl der Flaggendoppler vorgeben (Dennis 1b, 29.10.2026) ---------- */
test("Vorgabe Flaggendoppler: genau diese Zahl, auch gegen die automatische Regel", () => {
  const v = konto63(), auto = K.planPackages(v, V5({}), []);
  for (const f of [1, 2, 3]) {
    const P = V5({fdCount: f}), R = K.planPackages(v, P, []);
    assert.equal(R.recommend, f, "Vorgabe " + f);
    assert.equal(R.configs[f - 1].sites.length, f);
    assert.equal(R.pkg.perK.length, Math.max(f, 3));             // mindestens bis 3 gerechnet (8a)
    const x = K.packagesForK(v, P, f, [], R.pkg.perK);          // nachgerechnet wie die Gesamtrechnung
    near(x.pkg.detail.coins, R.pkg.detail.coins, 1e-6);
    if (f === auto.recommend) near(R.pkg.detail.coins, auto.pkg.detail.coins, 1e-6);
  }
  const fest = K.planPackages(v, V5({fdCount: 3, pkgCount: 4}), []);
  assert.equal(fest.recommend, 3);
  assert.equal(fest.pkg.chosen, 4);
  assert.equal(V5({fdCount: 2, mode: "pct"}).fdCount, null);    // nur bei „maximieren“
  assert.equal(V5({fdCount: 0}).fdCount, null);
});

/* ---------- 10.14 Rohstoffmengen und Wahl (Wunsch Dennis 07.11.2026) ---------- */
test("10.14: Ansicht folgt der Empfehlung ohne aktive Wahl, aktive Wahl bleibt", () => {
  const R = {configs: [{}, {}, {}], recommend: 2};
  assert.equal(K.wahlNach(1, R, false), 2);          // nie aktiv gewählt: folgt der Empfehlung
  assert.equal(K.wahlNach(3, R, true), 3);           // aktiv gewählt: bleibt
  assert.equal(K.wahlNach(4, R, true), 2);           // Zahl nicht mehr gerechnet: zurück zur Empfehlung
  assert.equal(K.wahlNach(null, R, false), 2);
});

const summe = v => v[0] + v[1] + v[2];
function pruefeMengen(m, P, text) {
  for (let r = 0; r < 3; r++) {
    // Paket-Rohstoffe = Überlauf + rechtzeitig + nicht rechtzeitig + nicht prägbarer Rest
    near(m.G[r], m.O[r] + (m.L ? m.L[r] : 0) + m.A[r] + m.N[r] + m.S[r], 1e-3 * Math.max(1, m.G[r]));
    assert.ok(m.A[r] >= -1e-6 && m.N[r] >= -1e-6 && m.S[r] >= -1e-6 && m.O[r] >= -1e-6, text + ": keine negativen Mengen");
  }
  if (!P.ignoreRatio) {
    // im Prägeverhältnis stehen rechtzeitig und nicht rechtzeitig je Rohstoff im Verhältnis der Münzkosten
    near(m.A[1] / P.coin.stone, m.A[0] / P.coin.wood, 1e-6 * Math.max(1, m.A[0]));
    near(m.N[2] / P.coin.iron, m.N[0] / P.coin.wood, 1e-6 * Math.max(1, m.N[0]));
  }
  near(m.share, summe(m.A) / Math.max(1e-9, summe(m.A) + summe(m.N)), 1e-9);
}

test("10.14: Rohstoffmengen im Gleichschritt summieren sich und passen zum Überlauf", () => {
  const v = konto63();
  for (const extra of [{maxOverflow: 1}, {maxOverflow: 10, optThreshold: 70}, {maxOverflow: 10, ignoreRatio: true}]) {
    const P = V5(extra), R = K.planPackages(v, P, []), d = R.pkg.detail, m = d.mengen;
    pruefeMengen(m, R.P, JSON.stringify(extra));
    // Paket-Rohstoffe und Überlauf wie die bisherigen Summen je Dorf
    near(summe(m.G), d.pkgRes.reduce((a, x) => a + x, 0), 1);
    near(summe(m.O), d.overflow.reduce((a, x) => a + x, 0), 1);
    near(summe(m.O) / summe(m.G), d.overflowShare, 1e-9);
    // Vergleich (perK) und Kennzahlen (detail) zeigen für die Empfehlung dieselben Mengen
    const o = R.pkg.perK[R.recommend - 1];
    near(summe(o.mengen.A), summe(m.A), 1e-6 * summe(m.G));
    near(summe(o.mengen.N), summe(m.N), 1e-6 * summe(m.G));
    // feste Paketzahl: je Aufstellung derselbe Zeitplan, Mengen vorhanden
    assert.equal(R.pkg.configMengen.length, R.configs.length);
    R.pkg.configMengen.forEach((x, i) => pruefeMengen(x, R.P, "Aufstellung " + (i + 1)));
  }
});

test("10.14: Rohstoffmengen der einfachen Rechnung (Berechnung 1)", () => {
  const v = konto63();
  for (const ignoreRatio of [false, true]) {
    const P = V5({mode: "pct", pkgPct: 300, ignoreRatio}), R = K.planPct(v, P, []);
    R.configs.forEach(r => {
      const m = K.mengenEinfach(R.src, r, R.P);
      pruefeMengen(m, R.P, "einfach " + ignoreRatio);
      assert.equal(summe(m.O), 0);                                        // ohne Speichergrenze kein Überlauf
      near(m.share, r.share, 1e-9);
      near(summe(m.G), R.src.reduce((a, s) => a + s.pkg.wood + s.pkg.stone + s.pkg.iron, 0), 1);
      if (ignoreRatio) near(summe(m.S), 0, 1);                             // alles verschickbar
      else near(summe(m.A) + summe(m.N), r.pkg * R.P.unitRes, 1);          // prägbare Paketmenge
    });
  }
});

test("10.14: Mehrertrag in Rohstoffen passt zu den Münzen (ohne Erlass)", () => {
  const v = konto63(), P = V5({maxOverflow: 10}), R = K.planPackages(v, P, []), pK = R.pkg.perK;
  assert.ok(pK.length >= 2);
  const rabatt = K.reduction(1, R.P);
  for (let i = 1; i < pK.length; i++) {
    const res = K.rohstoffeAus(pK[i].units - pK[i - 1].units, R.P);
    near(summe(res), (pK[i].coins - pK[i - 1].coins) * R.P.unitRes * (1 - rabatt), 1e-6 * R.P.unitRes * pK[i].coins);
    near(res[1] / res[0], 30000 / 28000, 1e-9);
  }
  // einfache Rechnung: geprägte Einheiten der Aufstellungen
  const Rp = K.planPct(v, V5({mode: "pct", pkgPct: 300}), []);
  for (let i = 1; i < Rp.configs.length; i++) {
    const a = Rp.configs[i - 1], b = Rp.configs[i];
    near(summe(K.rohstoffeAus(b.minted - a.minted, Rp.P)), (b.coins - a.coins) * Rp.P.unitRes * (1 - K.reduction(1, Rp.P)), 1e-6 * Rp.P.unitRes * b.coins);
  }
});

/* ---------- 10.15 Überlauf nach Art und Reaktion (Dennis 1a, 2a, 3a am 07.11.2026) ---------- */
test("10.15: Lieferdörfer mit Adelshof prägen ihren Überlauf zum Grundpreis", () => {
  const v = konto63(), aus = V5({maxOverflow: 10, optThreshold: 70}), an = V5({maxOverflow: 10, optThreshold: 70, mintLocal: true});
  assert.equal(aus.mintLocal, false);
  const R = K.planPackages(v, aus, []), src = R.src, sites = R.configs[R.recommend - 1].sites;
  const cnt = K.toCnt(R.pkg.pos, R.pkg.K);
  const a = K.lockstep(src, R.P, sites, cnt, true);
  const Pan = Object.assign({}, R.P, {mintLocal: true});
  const b = K.lockstep(src, Pan, sites, cnt, true);
  assert.equal(a.lokal, 0);
  assert.ok(b.lokal > 0, "es wird lokal geprägt");
  const sum = x => x.reduce((s, y) => s + y, 0);
  // nur Lieferdörfer mit Adelshof prägen selbst, Dörfer ohne Adelshof und Prägedörfer nicht
  src.forEach((s, i) => { if (!s.snob || sites.includes(i)) assert.equal(b.lokalDorf[i], 0, s.name); });
  // gleicher Plan: mehr Münzen um genau die lokal geprägten, weniger Überlauf um genau das Geprägte
  near(b.coins, a.coins + b.lokal, 1e-6 * a.coins);
  near(sum(a.overflow) - sum(b.overflow), b.lokal * Pan.unitRes, 1e-3 * Pan.unitRes);
  const m = b.mengen;
  pruefeMengen(m, Pan, "lokal");
  near(m.L[0] / Pan.coin.wood, m.L[1] / Pan.coin.stone, 1e-6 * Math.max(1, m.L[0]));    // im Prägeverhältnis
  near((m.L[0] + m.L[1] + m.L[2]) / Pan.unitRes, b.lokal, 1e-6 * b.lokal);
  for (let r = 0; r < 3; r++) near(m.G[r], m.O[r] + m.L[r] + m.A[r] + m.N[r] + m.S[r], 1e-3 * m.G[r]);
  // Gesamtrechnung mit Option: Münzen enthalten das lokale Prägen, Überlaufgrenze bleibt eingehalten
  const Rb = K.planPackages(v, an, []);
  assert.ok(Rb.pkg.detail.lokal > 0);
  assert.ok(Rb.pkg.detail.overflowShare * 100 <= 10 + 1e-9);
  assert.ok(Rb.pkg.detail.coins >= R.pkg.detail.coins - 1e-6, Rb.pkg.detail.coins + " < " + R.pkg.detail.coins);
  assert.ok(Rb.pkg.perK.every(o => o.lokal >= 0));
  assert.equal(Rb.pkg.configLokal.length, Rb.configs.length);
});

test("10.15: Markttausch als Obergrenze aus dem nicht prägbaren Überschuss", () => {
  const v = konto63();
  for (const ignoreRatio of [false, true]) {
    const R = K.planPackages(v, V5({maxOverflow: 10, ignoreRatio}), []), m = R.pkg.detail.mengen, P = R.P;
    const t = K.tauschObergrenze(m, P);
    for (let r = 0; r < 3; r++) near(t.res[r], m.S[r] + (ignoreRatio ? m.sov[r] : 0), 1e-6);
    near(t.units, (t.res[0] + t.res[1] + t.res[2]) / P.unitRes, 1e-9);
    near(t.coins, t.units / (1 - K.reduction(P.window, P)), 1e-9);
    if (!ignoreRatio) assert.ok(t.res[0] + t.res[2] > t.res[1], "Überschuss ist vor allem Holz und Eisen");
  }
});

/* ---------- 10.16 Tausch vor dem Start (Wunsch Dennis 08.11.2026, 1a, 2a, 3b) ---------- */
test("10.16: Lagerstand aus der Produktionsübersicht", () => {
  const txt = [
    "Dorf (3)\tPunkte\tRohstoffe\tSpeicher\tHändler\tBauernhof",
    "[001] Erstes Dorf (500|501) K55 \t10.393\t123.456 234.567 345.678\t400.000\t110/235\t24.000/24.000",
    "[002] Dorf 22 (502|503) K55",
    "8.792", "12.000 400.000 99.999", "400.000", "235/235", "23.950/24.000",
    "[003] Leer (504|505) K55 \t10.362\t0 0 0\t400000\t0/235\t24000/24000",
  ].join("\n");
  const r = K.parseLager(txt);
  assert.equal(r.count, 3);
  assert.deepEqual(r.lager["500|501"], {wood: 123456, stone: 234567, iron: 345678, storage: 400000, frei: 110, gesamt: 235});
  assert.deepEqual(r.lager["502|503"], {wood: 12000, stone: 400000, iron: 99999, storage: 400000, frei: 235, gesamt: 235});
  assert.deepEqual(r.lager["504|505"], {wood: 0, stone: 0, iron: 0, storage: 400000, frei: 0, gesamt: 235});
  // Gebäudezeilen (viele kleine Stufen) sind kein Lagerstand
  const geb = "[001] Shoppington D.C. (631|601) K66  \t10.393\t22\t25\t20\t15\t0\t1\t20\t1\t1\t23\t30\t30\t30\t30\t30\t10\t20";
  assert.equal(K.parseLager(geb).count, 0);
  assert.equal(K.parseLager("").count, 0);
});

test("Bonus auf Händler und Speicher aus der Produktionsübersicht (12.11.2026)", () => {
  // Kunstdaten: ein Bonusdorf mit +25 % Speicher und Händlern, ein normales Dorf
  const txt = ["[001] Kunst Bonus (500|500) K55 \t10.636\t405.429 440.081 459.134\t500000\t0/294\t26174/26400",
               "[002] Kunst Normal (503|504) K55\t9.410\t100.000 120.000 90.000\t400000\t12/179\t23734/24000"].join("\n");
  const L = K.parseLager(txt);
  assert.deepEqual(L.lager["500|500"], {wood: 405429, stone: 440081, iron: 459134, storage: 500000, frei: 0, gesamt: 294});
  assert.deepEqual(L.lager["503|504"], {wood: 100000, stone: 120000, iron: 90000, storage: 400000, frei: 12, gesamt: 179});
  const b = (market, storage) => ({main: 22, snob: 1, smith: 20, market, wood: 30, stone: 30, iron: 30, farm: 30, storage});
  const mit = (v, l) => Object.assign(v, {lager: [l.wood, l.stone, l.iron], lagerSpeicher: l.storage, haendlerGesamt: l.gesamt});
  const vs = [mit({name: "Kunst Bonus", x: 500, y: 500, b: b(25, 30)}, L.lager["500|500"]),
              mit({name: "Kunst Normal", x: 503, y: 504, b: b(23, 30)}, L.lager["503|504"])];
  const P = K.params({mode: "pct", pkgPct: 30, merchantBonus: true, flagLevel: 9, intervalMin: 60}, WELT);
  let s = K.prepare(vs, P);
  assert.equal(s[0].cap, 500000); assert.equal(s[0].merchants, 294);
  near(s[0].sFaktor, 1.25, 1e-9); near(s[0].mFaktor, 294 / 235, 1e-9);
  assert.deepEqual(s[0].lager, [405429, 440081, 459134], "Lager über 400.000 bleibt erhalten");
  near(s[0].pkg.wood, 0.3 * 500000 + 405429, 1e-6);                     // Paket nach dem echten Speicher
  assert.equal(s[1].cap, 400000); assert.equal(s[1].merchants, 179); assert.equal(s[1].mFaktor, 1);
  // Mindeststufen mit Bonus: Markt 25 beim Bonusdorf 294, Speicher bleibt 30
  s = K.prepare(vs, Object.assign({}, P, {minMarket: 25}));
  assert.equal(s[1].merchants, 235);
  assert.equal(s[0].merchants, 294);
  // unplausibel (Übersichten passen nicht zusammen): wie bisher nach Stufen
  s = K.prepare([Object.assign({}, vs[0], {lagerSpeicher: 900000, haendlerGesamt: 600})], P);
  assert.equal(s[0].cap, 400000); assert.equal(s[0].merchants, 235);
  // ohne Produktionsübersicht unverändert
  s = K.prepare([{name: "Kunst", x: 1, y: 1, b: b(25, 30)}], P);
  assert.equal(s[0].cap, 400000); assert.equal(s[0].merchants, 235);
});

test("10.16: Vorrat vor dem Start bringt Münzen, ohne mehr Überlauf, und wird geprägt", () => {
  const v = konto63();
  for (const extra of [{maxOverflow: 10, optThreshold: 70}, {maxOverflow: 1}, {maxOverflow: 10, ignoreRatio: true}]) {
    const R = K.planPackages(v, V5(extra), []), d = R.pkg.detail, x = d.vorab, P = R.P;
    assert.ok(x, "Vorrat im Ergebnis");
    near(x.coins0, d.coins, 1e-6 * d.coins);                             // gleicher Zeitplan wie die Kennzahlen
    assert.ok(x.coins1 >= x.coins0 - 1e-9);
    assert.ok(x.ov1 <= x.ov0 + 1e-9, "kein zusätzlicher Überlauf");
    const z = x.vorab;
    assert.equal(z[2], 0, "kein Eisen als Vorrat");
    x.dorf.forEach(o => {
      const s = R.src[o.i];
      assert.ok(o.vorab[0] <= s.cap + 1e-6 && o.vorab[1] <= s.cap + 1e-6 && o.plus > 0.5, s.name);
    });
    if (x.dorf.length) {
      assert.ok(x.coins1 > x.coins0 + 0.5);
      // mindestens 90 % des Vorrats wird geprägt (Lehm über Lehmkosten, Holz über Holzkosten)
      const du = x.units1 - x.units0;
      assert.ok(du * P.coin.stone >= 0.9 * z[1] - x.dorf.length - 1, JSON.stringify(extra));
      assert.ok(du * P.coin.wood >= 0.9 * z[0] - x.dorf.length - 1, JSON.stringify(extra));
      // es bleibt weniger Eisen liegen
      assert.ok(x.rest1[2] < x.rest0[2]);
      if (!P.ignoreRatio) near(x.coins1 - x.coins0, x.dorf.reduce((a, o) => a + o.plus, 0), 1e-6 * x.coins1);
    }
    // ohne Nebenwirkung: Rechnung danach wie vorher
    assert.ok(R.src.every(s => !s.vorab));
    const nach = K.lockstep(R.src, P, R.configs[R.recommend - 1].sites, K.toCnt(R.pkg.pos, K.lastClick(P)), false);
    near(nach.coins, d.coins, 1e-6 * d.coins);
  }
});

test("10.16: am Markt trägt ein Händler ohne Bonus (Hinweis Dennis 10.11.2026)", () => {
  const mit = V5({}), ohne = K.params({pkgSize: 30, merchantBonus: false, flagLevel: 9, intervalMin: 60}, WELT);
  assert.equal(mit.carry, 1500);
  assert.equal(mit.carryMarkt, 1000);
  assert.equal(ohne.carryMarkt, 1000);
});

test("10.16: mit „Verhältnis ignorieren“ tauschen auch Lieferdörfer, nicht nur das Prägedorf", () => {
  const R = K.planPackages(konto63(), V5({maxOverflow: 10, ignoreRatio: true}), []), x = R.pkg.detail.vorab;
  assert.ok(x.dorf.some(o => !o.site), "mindestens ein Lieferdorf tauscht");
  assert.ok(x.coins1 > x.coins0 + 0.5);
  near(x.coins1 - x.coins0, x.dorf.reduce((a, o) => a + o.plus, 0), 1e-6 * x.coins1);
});

test("10.16 Nachtrag: mit Lagerstand nur vorhandenes Eisen tauschen (Wunsch Dennis 10.11.2026)", () => {
  for (const extra of [{maxOverflow: 10}, {maxOverflow: 10, ignoreRatio: true}, {maxOverflow: 1}]) {
    const R = K.planPackages(konto63(), V5(extra), []), d = R.pkg.detail, P = R.P, src = R.src;
    assert.deepEqual(d.sites, R.configs[R.recommend - 1].sites);
    // Kunst-Lagerstand: wenig Lehm und Holz, Eisen je Dorf verschieden; ein Dorf fehlt, eines hat zu wenig Eisen
    const lager = {};
    src.forEach((s, i) => {
      if (i === 3) return;
      lager[s.x + "|" + s.y] = {wood: Math.round(0.1 * s.cap), stone: Math.round(0.05 * s.cap), iron: i === 4 ? 999 : Math.round((0.3 + (i % 5) * 0.15) * s.cap)};
    });
    for (const kurs of [1, 0.8]) {
      const v = K.lagerTausch(src, P, d.sites, d.cnt, lager, kurs), tag = JSON.stringify(extra) + " Kurs " + kurs;
      assert.equal(v.einheit, 1000, "Händlerlast ohne Bonus");
      assert.equal(v.pro, Math.round(1000 * kurs));
      assert.ok(v.dorf.length > 0, tag);
      assert.ok(v.coins1 > v.coins0 + 0.5, tag);
      assert.ok(v.ov1 <= v.ov0 + 1e-4, tag);
      assert.equal(v.ohneLager, src.filter(s => !lager[s.x + "|" + s.y]).length);
      assert.ok(v.ohneLager >= 1);
      assert.ok(v.zuWenig >= 1);
      v.dorf.forEach(o => {
        const s = src[o.i], l = lager[s.x + "|" + s.y];
        assert.ok(l, "nur Dörfer mit Lagerstand");
        assert.ok(Number.isInteger(o.aL) && Number.isInteger(o.aH) && o.aL + o.aH > 0);
        assert.equal(o.eisen, (o.aL + o.aH) * 1000);
        assert.ok(o.eisen <= l.iron, "nie mehr Eisen, als da ist: " + s.name);
        assert.equal(o.lehm, o.aL * v.pro);
        assert.equal(o.holz, o.aH * v.pro);
        assert.ok(o.nach[1] <= s.cap + 1e-6 && o.nach[0] <= s.cap + 1e-6 && o.nach[2] >= -1e-6);
        assert.deepEqual(o.jetzt, [l.wood, l.stone, l.iron]);
        assert.ok(o.plus > 0);
      });
      near(v.coins1 - v.coins0, v.dorf.reduce((a, o) => a + o.plus, 0), 1e-6 * v.coins1 + (P.ignoreRatio ? 0.5 * v.dorf.length : 0));
      // Summen jetzt und nach dem Tausch
      const jetzt = [0, 0, 0];                                             // Kunstdörfer können dieselben Koordinaten haben
      src.forEach(s => { const l = lager[s.x + "|" + s.y]; if (l) { jetzt[0] += l.wood; jetzt[1] += l.stone; jetzt[2] += l.iron; } });
      [0, 1, 2].forEach(r => near(v.jetzt[r], jetzt[r], 1e-6));
      const e = v.dorf.reduce((a, o) => a + o.eisen, 0), L = v.dorf.reduce((a, o) => a + o.lehm, 0);
      near(v.nach[2], jetzt[2] - e, 1e-6);
      near(v.nach[1], jetzt[1] + L, 1e-6);
      // ohne Nebenwirkung
      assert.ok(src.every(s => s.vorab == null));
      near(K.lockstep(src, P, d.sites, d.cnt, false).coins, d.coins, 1e-6 * d.coins);
    }
  }
});

test("10.16: Startbestand je Rohstoff im Gleichschritt", () => {
  const v = konto63(), R = K.planPackages(v, V5({maxOverflow: 10}), []), P = R.P, src = R.src;
  const sites = R.configs[R.recommend - 1].sites, cnt = K.toCnt(R.pkg.pos, K.lastClick(P));
  const a = K.lockstep(src, P, sites, cnt, false);
  src.forEach(s => { s.vorab = [0, 0, 0]; });
  const b = K.lockstep(src, P, sites, cnt, false);
  near(a.coins, b.coins, 1e-9);                                          // Vorrat 0 ändert nichts
  // nur Eisen als Vorrat bringt im Prägeverhältnis nichts, Lehm und Holz dazu schon
  src.forEach(s => { s.vorab = [0, 0, 0.3 * s.cap]; });
  const c = K.lockstep(src, P, sites, cnt, false);
  src.forEach(s => { s.vorab = [0.3 * s.cap, 0.3 * s.cap, 0.3 * s.cap]; });
  const e = K.lockstep(src, P, sites, cnt, false);
  src.forEach(s => { s.vorab = null; });
  assert.ok(c.coins <= a.coins + 1e-6);
  assert.ok(e.coins > a.coins);
});

/* ---------- 10.18 Handelsrouten im Account-Manager (Wunsch Dennis 09.11.2026, 1c, 2a, 3a) ---------- */
test("10.18: Abstände ab 1 Minute, fester Abstand für alle Routen, 1 Minute nicht schlechter als 6 Minuten", () => {
  assert.ok(Math.abs(K.ROUTE_DT[0] - 1 / 60) < 1e-12 && K.ROUTE_DT.every((x, i) => !i || x > K.ROUTE_DT[i - 1]));
  const v = konto63(), R = K.planPackages(v, V5({maxOverflow: 10, optThreshold: 70}), []), d = R.pkg.detail;
  const fest = K.routenPlan(R.src, R.P, d.sites, d.cnt, 3, [7 / 60]);
  fest.plans.forEach(pl => pl.routes.forEach(r => near(r.dt, 7 / 60, 1e-12)));
  const eins = K.routenPlan(R.src, R.P, d.sites, d.cnt, 3, [1 / 60]), sechs = K.routenPlan(R.src, R.P, d.sites, d.cnt, 3, [0.1]);
  assert.ok(eins.plans[eins.plans.length - 1].coins >= sechs.plans[sechs.plans.length - 1].coins - 1e-6);
  // die automatische Wahl ist mindestens so gut wie jeder feste Abstand aus ihrer Liste
  assert.ok(d.routen.plans[Math.min(3, d.routen.plans.length) - 1].coins >= eins.plans[eins.plans.length - 1].coins - 1e-6);
});

test("10.18: Menge je Lieferung passt auf die Händler und ins Prägeverhältnis", () => {
  const P = V5({});
  for (const n of [5, 70, 235]) {
    const a = K.routeMenge(n, P);
    assert.ok(a[0] + a[1] + a[2] <= n * P.carry);
    assert.ok(a.every(x => x % 100 === 0));
    near(a[1] / a[0], 30000 / 28000, 0.02);
  }
});

test("10.18: eine Route schickt nur, wenn Rohstoffe und Händler reichen", () => {
  const P = V5({production: false}), s = {cap: 400000, merchants: 10, prod: {wood: 0, stone: 0, iron: 0}};
  const cnt = K.toCnt([0], K.lastClick(P));                              // ein Paket beim Start
  const add = P.pkgSize / 100 * s.cap;                                    // je Rohstoff im Paket
  const a = K.routeMenge(10, P), log = [];
  const r = K.routeRun(s, 0.5, P, cnt, a, 2, (ta, a0) => log.push([ta, a0]));
  // so oft, wie das Lehm des Pakets für die feste Menge reicht, danach fällt jede Lieferung aus
  const moeglich = Math.floor(add / a[1] + 1e-9);
  assert.equal(r.sent, moeglich);
  assert.ok(r.skipped > 0);
  log.forEach(([ta], q) => near(ta, q * 2 + 0.5, 1e-9));
  // zu wenige Händler: nichts
  const r2 = K.routeRun(Object.assign({}, s, {merchants: 5}), 0.5, P, cnt, a, 2, null);
  assert.equal(r2.sent, 0);
});

test("10.18: Routenplan wird mit mehr Routen nicht schlechter und ordnet jedes Dorf höchstens einmal zu", () => {
  const v = konto63(), R = K.planPackages(v, V5({maxOverflow: 10, optThreshold: 70}), []), d = R.pkg.detail, rt = d.routen;
  assert.ok(rt && rt.plans.length >= 1);
  near(rt.base, d.coins, 1e-6 * d.coins);
  let vor = 0;
  rt.plans.forEach(pl => {
    assert.ok(pl.coins >= vor - 1e-6, "monoton");
    vor = pl.coins;
    assert.ok(pl.routes.length <= pl.R);
    const alle = pl.routes.flatMap(r => r.dorf);
    assert.equal(new Set(alle).size, alle.length, "jedes Dorf höchstens einmal");
    near(pl.coins, rt.eigen + pl.routes.reduce((a, r) => a + r.coins, 0), 1e-6 * pl.coins);
    pl.routes.forEach(r => { assert.deepEqual(r.a, K.routeMenge(r.n, R.P)); r.dorf.forEach(i => assert.ok(R.src[i].merchants >= r.n)); });
  });
  assert.ok(rt.plans[rt.plans.length - 1].coins > 0.5 * rt.base, "Routen schaffen einen großen Teil des Anforderns");
});

test("4a: Lieferungen je Route für die Menge je Stunde", () => {
  const v = konto63(), R = K.planPackages(v, V5({maxOverflow: 10, optThreshold: 70}), []), d = R.pkg.detail;
  const eins = K.routenPlan(R.src, R.P, d.sites, d.cnt, 3, [1 / 60]), tau = R.src._ls.tau;   // Laufzeiten aus diesem Lauf
  for (const rt of [d.routen, eins]) {
    rt.plans.forEach(pl => pl.routes.forEach(r => {
      assert.ok(Number.isInteger(r.sent) && r.sent >= 0);
      // je Dorf höchstens so viele Lieferungen, wie Termine in die Prägephase passen
      assert.ok(r.sent + r.skipped <= r.dorf.length * r.sends, "Termine");
      // gleich der Summe der Einzelrechnungen je Dorf
      const summe = r.dorf.reduce((a, i) => a + K.routeRun(R.src[i], tau[i], R.P, d.cnt, r.a, r.dt, null).sent, 0);
      assert.equal(r.sent, summe);
    }));
  }
});

/* ---------- 10.17 Nächstes Prägedorf adeln (Wunsch Dennis 09.11.2026; eigener Stamm einbezogen, je Zahl Flaggendoppler) ---------- */
test("10.17: Suche unter fremden Dörfern mit Filtern und eigenem Stamm", () => {
  const v = konto63(), P = V5({maxOverflow: 10, optThreshold: 70});
  const xy = d => d.x * 1000 + d.y;
  const rows = v.map(d => [xy(d), 0, 9000, 0, d.name]);                       // eigene Dörfer: Spieler 0
  const mitte = {x: Math.round(v.reduce((a, d) => a + d.x, 0) / v.length), y: Math.round(v.reduce((a, d) => a + d.y, 0) / v.length)};
  const frei = (dx, dy) => { let x = mitte.x + dx, y = mitte.y + dy; while (rows.some(r => r[0] === x * 1000 + y)) y++; return x * 1000 + y; };
  rows.push([frei(0, 0), -1, 300, 0, "Barbarendorf"], [frei(1, 1), 1, 5000, 0, "Stammesdorf"], [frei(-1, 2), 2, 12000, 0, "Feinddorf"], [frei(30, 30), -1, 100, 0, "weit weg"]);
  const welt = {rows, players: [[10, "Ich", 7], [11, "Freund", 7], [12, "Fremder", 9]], tags: {7: "ICH", 9: "XY"}};
  const r = K.fremdeSuche(v, P, [], welt, {genau: 3, genauEigen: 2, top: 3});
  assert.equal(r.stamm, "ICH");
  assert.ok(r.proK.length >= 1);
  const x1 = r.proK[0];
  assert.equal(x1.k, 1);
  const typen = new Set(x1.top.map(c => c.typ));
  assert.ok(typen.has("barbar") && typen.has("stamm") && typen.has("spieler"), [...typen].join());
  assert.ok(!x1.top.some(c => c.name === "weit weg") || x1.top.length === 3);
  for (let q = 1; q < x1.top.length; q++) assert.ok(x1.top[q - 1].coins >= x1.top[q].coins - 1e-9, "absteigend");
  assert.ok(x1.eigeneTop.every(c => c.typ === "eigen"));
  // eigene Dörfer mit Adelshof sind keine Kandidaten
  const snobXY = new Set(v.filter(d => d.b.snob).map(xy));
  r.proK.forEach(x => x.eigeneTop.forEach(c => assert.ok(!snobXY.has(c.x * 1000 + c.y))));
  // Filter: ohne eigenen Stamm und mit Punktegrenze
  const r2 = K.fremdeSuche(v, P, [], welt, {stamm: false, maxPts: 1000, eigene: false, genau: 3, genauEigen: 0, top: 3});
  r2.proK.forEach(x => { assert.ok(x.top.every(c => c.typ === "barbar")); assert.equal(x.eigeneTop.length, 0); });
  // ab 2 Flaggendopplern ersetzt der Kandidat genau eines der eigenen Prägedörfer
  r.proK.filter(x => x.k > 1).forEach(x => x.top.forEach(c => { assert.equal(c.ersetzt.length, 1); assert.equal(c.bleibt.length, x.k - 1); }));
});

/* ---------- Münzen mit und ohne Überlauf (Wunsch Dennis 17.11.2026) ---------- */
test("17.11.: Münzen ohne Überlauf: derselbe Zeitplan ohne Speichergrenze", () => {
  const P = V5({mode: "max", maxOverflow: 100, startPct: 50});
  const R = K.plan(konto63(), P), sites = R.configs[0].sites, Kc = K.lastClick(P);
  const viel = K.toCnt([0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4], Kc);                  // läuft sicher über
  const a = K.lockstep(R.src, P, sites, viel), ohne = K.ohneUeberlauf(R.src, P, sites, viel);
  assert.ok(a.ov > 0.01, "Testplan soll überlaufen");
  assert.ok(ohne > a.coins + 1, "ohne Speichergrenze mehr Münzen");
  const b = K.lockstep(R.src, Object.assign({}, P, {ohneSpeicher: true}), sites, viel);
  assert.equal(b.ov, 0);
  // ohne Pakete und ohne Startbestand läuft nichts über: gleich
  const P0 = V5({mode: "max", startPct: 0, production: false});
  const R0 = K.plan(konto63(), P0), leer = K.toCnt([], K.lastClick(P0));
  near(K.ohneUeberlauf(R0.src, P0, R0.configs[0].sites, leer), K.lockstep(R0.src, P0, R0.configs[0].sites, leer).coins, 1e-6);
});

test("17.11.: Vergleich bekommt je Aufstellung nach und ohne Überlauf (beide Berechnungen)", () => {
  // Berechnung 1 (vorgeben): alle Aufstellungen mit dem Zeitplan der Empfehlung
  const P1 = V5({mode: "pct", pkgPct: 240, maxOverflow: 1});
  const R1 = K.planPct(konto63(), P1, []), z = R1.zeitplan;
  assert.equal(z.configCoins.length, R1.configs.length);
  near(z.configCoins[R1.recommend - 1], z.detail.coins, 1e-6);
  near(z.configOhne[R1.recommend - 1], z.detail.coinsOhne, 1e-6);
  z.configCoins.forEach((c, q) => { assert.ok(z.configOhne[q] >= c - 1e-6); assert.ok(z.configOv[q] >= 0); });
  // Berechnung 2 (maximieren, automatisch): je Aufstellung mit eigenem Zeitplan
  const R2 = K.planPackages(konto63(), V5({mode: "max", maxOverflow: 10, optThreshold: 70}), []);
  R2.pkg.perK.forEach(o => { assert.ok(o.ohne >= o.coins - 1e-6); assert.ok(o.ov >= 0); assert.equal(o.pos.length, o.n); });
  assert.equal(R2.pkg.configOhne.length, R2.configs.length);
});

test("17.11.: Suche nach dem nächsten Prägedorf nimmt bei „vorgeben“ die Paketzahl von oben", () => {
  const v = konto63(), xy = d => d.x * 1000 + d.y;
  const rows = v.map(d => [xy(d), 0, 9000, 0, d.name]);
  rows.push([601 * 1000 + 499, -1, 300, 0, "Barbarendorf"]);
  const welt = {rows, players: [[10, "Ich", 7]], tags: {7: "ICH"}};
  const P = V5({mode: "pct", pkgPct: 150, maxOverflow: 1});
  const r = K.fremdeSuche(v, P, [], welt, {genau: 2, genauEigen: 0, top: 2});
  assert.equal(r.festN, 5);
  const R = K.plan(v, P);                                                       // einfache Rechnung wie im Vergleich
  r.proK.forEach(x => {
    assert.equal(x.eigen.n, 5);
    assert.deepEqual(x.eigen.sites, R.configs[x.k - 1].sites.map(i => R.src[i].name), "dieselben Prägedörfer wie im Vergleich");
    assert.ok(x.eigen.ohne >= x.eigen.coins - 1e-6);
    x.top.forEach(c => { assert.equal(c.n, 5); assert.ok(c.ohne >= c.coins - 1e-6); });
  });
});

/* ---------- Handelsrouten im Vergleich (Wunsch Dennis 17.11.2026) ---------- */
test("17.11.: Routen und Anfordern zusammen: ohne Route wie bisher, ohne Klicks wie die Routen", () => {
  for (const ign of [false, true]) {
    const P = V5({mode: "max", maxOverflow: 10, startPct: 20, ignoreRatio: ign});
    const R = K.plan(konto63(), P), sites = R.configs[1].sites, Kc = K.lastClick(P), cnt = K.toCnt([0, 0, 6, 12, 18, 24], Kc);
    const keine = new Array(R.src.length).fill(null);
    // ohne Routen, Klick alle P.interval: gleich dem Gleichschritt
    const a = K.lockstep(R.src, P, sites, cnt, true), b = K.lockstepRouten(R.src, P, sites, cnt, keine, P.interval, true);
    near(b.coins, a.coins, 1e-6 * a.coins); near(b.ov, a.ov, 1e-9);
    [0, 1, 2].forEach(r => near(b.mengen.A[r], a.mengen.A[r], 1e-3));
    assert.equal(b.viaRoute, 0);
    // einfache Rechnung: simulateRoute ohne Route wie simulate
    R.src.forEach((s, i) => {
      const tau = sites.includes(i) ? 0 : 3.5, x = K.simulate(s, tau, P, P.window), y = K.simulateRoute(s, tau, P, P.window, null, null, P.interval);
      near(y.coins, x.coins, 1e-9); near(y.inTime, x.inTime, 1e-9);
    });
  }
  // nur Routen, keine Klicks: dieselben Münzen wie der Routenplan
  const P = V5({mode: "max", maxOverflow: 10, startPct: 20});
  const R = K.plan(konto63(), P), sites = R.configs[1].sites, cnt = K.toCnt([0, 0, 6, 12, 18, 24], K.lastClick(P));
  const rp = K.routenPlan(R.src, P, sites, cnt, 3), pl = rp.plans[rp.plans.length - 1];
  const routeOf = new Array(R.src.length).fill(null);
  pl.routes.forEach(r => r.dorf.forEach(i => { routeOf[i] = {a: r.a, dt: r.dt}; }));
  const nurRoute = K.lockstepRouten(R.src, P, sites, cnt, routeOf, Infinity, false);
  near(nurRoute.coins, pl.coins, 1e-6 * pl.coins);
  assert.equal(nurRoute.viaKlick, 0);
  // Routen und Klicks: mindestens so viel wie nur Routen, Klicks schicken den Rest
  const beides = K.lockstepRouten(R.src, P, sites, cnt, routeOf, P.interval, false);
  assert.ok(beides.coins >= nurRoute.coins - 1e-6);
  assert.ok(beides.viaRoute > 0 && beides.viaKlick > 0);
});

test("17.11.: Vergleich mit Routen je Aufstellung und nötiger Klickabstand zusätzlich", () => {
  const P = V5({mode: "pct", pkgPct: 150, maxOverflow: 1});
  const R = K.planPct(konto63(), P, []), sites = R.configs[R.recommend - 1].sites;
  const v = K.vergleichRouten(R.src, R.P, sites, R.zeitplan.pos, 3, null, K.LADDER);
  assert.ok(v.routen && v.routen.R >= 1 && v.routen.routes.length >= 1);
  assert.ok(v.ohne >= v.nach - 1e-6 && v.ov >= 0);
  assert.ok(v.viaRoute > 0);
  assert.equal(v.d.rows.length, R.src.length);
  assert.equal(v.stufen.length, K.LADDER.length + 1);
  assert.equal(v.stufen[v.stufen.length - 1].min, Infinity);
  // öfter klicken bringt nicht weniger (Leiter aufsteigend in Minuten)
  for (let q = 1; q < K.LADDER.length; q++) assert.ok(v.stufen[q - 1].share >= v.stufen[q].share - 0.02, "Stufe " + q);
  const q = K.noetigMitRouten(v.stufen);
  assert.ok(q && (q.kind === "voll" || q.kind === "plateau"));
  assert.deepEqual(K.noetigMitRouten([{min: 60, share: 1}, {min: Infinity, share: 1}]), {kind: "voll", min: Infinity});
  assert.equal(K.noetigMitRouten([{min: 60, share: 1}, {min: 120, share: 0.9}, {min: Infinity, share: 0.5}]).min, 60);
});

// Lieferung über Zwischendörfer (site/praegen-umwege.js, inaktiv bis Supportfreigabe): eigene Testdatei, hier
// eingebunden, damit der Seitenlauf sie mitprüft
require("./praegen-umwege.test.js");
// Sitzungsanzahlplanung (site/praegen-sitzungen.js), ebenso eingebunden
require("./praegen-sitzungen.test.js");

/* ---------- Lagerstand als Startbestand je Dorf (Dennis 2a, 12.11.2026) ---------- */
test("2a: Lagerstand gleich dem Startbestand rechnet wie der Startbestand, volles Lager läuft mehr über", () => {
  const P30 = V5({startPct: 30}), P0 = V5({startPct: 0});
  const R = K.plan(konto63(), P30), sites = R.configs[0].sites, cnt = K.toCnt([0, 0, 3, 3, 6, 6, 9, 9], K.lastClick(P30));
  const a = K.lockstep(R.src, P30, sites, cnt);
  // gleiches Lager als Lagerstand bei Startbestand 0
  const mitLager = konto63().map(v => Object.assign({}, v));
  const src2 = K.prepare(mitLager.map(v => { const cap = K.storageCap(v.b.storage); return Object.assign(v, {lager: [0.3 * cap, 0.3 * cap, 0.3 * cap]}); }), P0);
  const b = K.lockstep(src2, P0, sites, cnt);
  near(b.coins, a.coins, 1e-9 * a.coins);
  near(b.ov, a.ov, 1e-9);
  assert.deepEqual(K.startBestand(src2[0], P0).map(Math.round), K.startBestand(R.src[0], P30).map(Math.round));
  // volles Lager in allen Dörfern: mehr Überlauf als leer
  const voll = K.prepare(konto63().map(v => Object.assign({}, v, {lager: [1e9, 1e9, 1e9]})), P0);
  assert.equal(K.startBestand(voll[0], P0)[0], voll[0].cap);                    // auf den Speicher begrenzt
  const leer = K.prepare(konto63(), P0);
  assert.ok(K.lockstep(voll, P0, sites, cnt).ov > K.lockstep(leer, P0, sites, cnt).ov);
  // Dörfer ohne Lagerstand behalten den Startbestand; fremde Dörfer beginnen leer
  const gemischt = K.prepare(konto63().map((v, i) => i % 2 ? v : Object.assign({}, v, {lager: [1000, 2000, 3000]})), P30);
  assert.deepEqual(K.startBestand(gemischt[0], P30), [1000, 2000, 3000]);
  near(K.startBestand(gemischt[1], P30)[1], 0.3 * gemischt[1].cap, 1e-9);
  assert.deepEqual(K.startBestand(Object.assign({}, gemischt[1], {leer: true}), P30), [0, 0, 0]);
});

/* ---------- Festgelegtes Prägedorf als zusätzliche Spalte (Wunsch Dennis 17.11.2026 02:18 und 02:24) ---------- */
function festWelt(v) {
  const rows = v.map(d => [d.x * 1000 + d.y, 0, 9000, 0, d.name]);
  const frei = (x, y) => { while (rows.some(r => r[0] === x * 1000 + y)) y++; return x * 1000 + y; };
  rows.push([frei(640, 622), -1, 300, 0, "Barbarendorf"], [frei(636, 640), -1, 300, 0, "Barbar Nord"]);
  return {rows, players: [[10, "Ich", 7]], tags: {7: "ICH"}};
}
test("17.11.: festgelegtes Prägedorf kommt als letzte Spalte dazu, die übrigen bleiben gleich", () => {
  const v = konto63(), welt = festWelt(v);
  for (const mode of ["pct", "max"]) {
    const P = mode === "pct" ? V5({mode, pkgPct: 150, maxOverflow: 1}) : V5({mode, maxOverflow: 10, optThreshold: 70});
    const r = K.fremdeSuche(v, P, [], welt, {genau: 2, genauEigen: 0, top: 2});
    const x = r.proK.find(q => q.k === 2), c = x.top[0];
    assert.equal(c.bleibtXY.length, 1);
    const Pf = Object.assign({}, P, {fest: {x: c.x, y: c.y, name: c.name, bleibt: c.bleibtXY}});
    const R0 = mode === "pct" ? K.planPct(v, P, []) : K.planPackages(v, P, []);
    const R1 = mode === "pct" ? K.planPct(v, Pf, []) : K.planPackages(v, Pf, []);
    assert.equal(R1.configs.length, R0.configs.length + 1, mode);
    assert.deepEqual(R1.fest, {col: R1.configs.length, k: 2, x: c.x, y: c.y, name: c.name});
    assert.equal(R1.recommend, R0.recommend, "Empfehlung bleibt");
    R0.configs.forEach((c0, q) => { assert.equal(R1.configs[q].sites.join(), c0.sites.join()); near(R1.configs[q].coins, c0.coins, 1e-6); });
    const fs = R1.configs[R1.fest.col - 1].sites, neu = R1.src[fs[fs.length - 1]];
    assert.ok(neu.neu && neu.x === c.x && neu.y === c.y && neu.leer);
    assert.equal(R1.details.length, R1.configs.length);
    // nachgerechnet wie eine gewählte Spalte: dieselben Münzen wie in der Suche
    const nk = K.packagesForK(v, Pf, R1.fest.col, [], R1.pkg && R1.pkg.perK, true);
    if (mode === "pct") {
      assert.equal(R1.zeitplan.configCoins.length, R1.configs.length);
      R0.zeitplan.configCoins.forEach((m, q) => near(R1.zeitplan.configCoins[q], m, 1e-6));
      near(nk.zeitplan.detail.coins, c.coins, 1e-6);
    } else {
      R0.pkg.perK.forEach((o, q) => near(R1.pkg.perK[q].coins, o.coins, 1e-6));
      assert.ok(R1.pkg.festK && R1.pkg.festK.n === c.n);
      near(R1.pkg.festK.coins, c.coins, 1e-6);
      assert.equal(nk.pkg.chosen, R1.pkg.festK.n);
      near(nk.pkg.detail.coins, R1.pkg.festK.coins, 1e-6);
    }
    // Klickfrequenz-Leiter: festgelegte Aufstellung hinter den übrigen
    const st = K.ladderStep(v, R1.P, 60, R1.fest.col - 1);
    assert.ok(st.share[R1.fest.col - 1] > 0 && st.share[R1.fest.col - 1] <= 1);
    // die Suche rechnet ohne festgelegtes Dorf
    const r2 = K.fremdeSuche(v, Pf, [], welt, {genau: 2, genauEigen: 0, top: 2});
    assert.deepEqual(r2.proK.map(q => q.top.map(t => Math.round(t.coins))), r.proK.map(q => q.top.map(t => Math.round(t.coins))));
  }
  // bleibendes Prägedorf fehlt: keine zusätzliche Spalte, Hinweis
  const P = V5({mode: "pct", pkgPct: 150});
  const R = K.plan(v, Object.assign({}, P, {fest: {x: 1, y: 1, name: "x", bleibt: [[1, 2]]}}));
  assert.equal(R.festFehlt, true);
  assert.equal(R.configs.length, K.plan(v, P).configs.length);
});

/* ---------- Schnellere Suche (Dennis 17.11.2026 02:45) ---------- */
test("17.11.: Suche mit warmem Start: gleiche Münzen wie die ganze Paketkurve, Basis der Seite, Aufteilung je Zahl", () => {
  const v = konto63(), welt = festWelt(v);
  const P = V5({mode: "pct", pkgPct: 150, maxOverflow: 1}), Pn = Object.assign({}, P, {pkgCount: 5});
  // warmer Start gegen ganze Kurve für ein fremdes Dorf als einziges Prägedorf
  const R = K.planPct(v, P, []), src = K.prepare(v, Pn), s2 = src.concat([K.festDorf({fest: {x: 640, y: 622, name: "B"}, ignoreRatio: false}, src.length)]);
  const st = [src.length], w = K.anpassenWarm(s2, Pn, st, R.zeitplan.pos, false), cv = K.packageCurve(s2, Pn, st, false);
  assert.equal(w.n, 5);
  assert.ok(w.coins >= cv.curve[5].coins * 0.995, w.coins + " zu weit unter " + cv.curve[5].coins);
  assert.ok(w.ohne >= w.coins - 1e-6);
  // mit der Rechnung der Seite als Basis dieselben Ergebnisse wie ohne
  const xy = s => [s.x, s.y];
  const basis = {pos: R.zeitplan.pos, eigen: R.configs.map((c, q) => ({k: q + 1, n: R.zeitplan.n, pos: R.zeitplan.pos, sites: c.sites.map(i => xy(R.src[i])), vgl: R.zeitplan.configCoins[q]}))};
  const o = {genau: 2, genauEigen: 0, top: 2};
  const r1 = K.fremdeSuche(v, P, [], welt, o), r2 = K.fremdeSuche(v, P, [], welt, Object.assign({basis}, o));
  const kurz = r => r.proK.map(x => [x.k, Math.round(x.eigen.coins), x.top.map(c => c.x + "|" + c.y + ":" + Math.round(c.coins))]);
  assert.deepEqual(kurz(r2), kurz(r1));
  r2.proK.forEach(x => { near(x.eigen.vgl, R.zeitplan.configCoins[x.k - 1], 1e-6); assert.ok(x.eigen.coins >= x.eigen.vgl - 1e-6, "eigener Zeitplan nicht schlechter"); });
  // je Zahl Flaggendoppler getrennt (mehrere Worker): zusammen dasselbe
  const teile = [1, 2].map(k => K.fremdeSuche(v, P, [], welt, Object.assign({basis, nurK: [k]}, o)));
  assert.deepEqual(teile.flatMap(t => kurz(t)), kurz(r2).filter(([k]) => k <= 2));
});

/* ---------- Höchstens 250 Handelsrouten (Hinweis Dennis 17.11.2026 14:27) ---------- */
test("17.11.: Handelsrouten höchstens für die Grenze an Dörfern, die übrigen werden angefordert", () => {
  const v = konto63(), P = V5({mode: "pct", pkgPct: 150, maxOverflow: 1, fdCount: 1});
  const R = K.planPct(v, P, []), sites = R.configs[0].sites, cnt = K.toCnt(R.zeitplan.pos, K.lastClick(R.P));
  const ohne = K.routenPlan(R.src, R.P, sites, cnt, 3, [5 / 60]);
  assert.equal(ohne.grenze, 0, "62 Lieferdörfer liegen unter 250");
  assert.equal(K.ROUTEN_DOERFER, 250);
  const L = 20, Pg = Object.assign({}, R.P, {routenDoerfer: L});
  const mit = K.routenPlan(R.src, Pg, sites, cnt, 3, [5 / 60]);
  assert.equal(mit.grenze, L);
  assert.equal(mit.lieferdoerfer, R.src.length - 1);
  mit.plans.forEach((pl, q) => {
    const dorf = pl.routes.flatMap(r => r.dorf);
    assert.ok(dorf.length <= L && pl.mitRoute === dorf.length, "höchstens " + L + " Dörfer mit Route");
    assert.equal(new Set(dorf).size, dorf.length);
    assert.ok(pl.coins >= mit.base - 1e-6, "nie weniger als Anfordern");
    if (q) assert.ok(pl.coins >= mit.plans[q - 1].coins - 1e-6);
  });
  // die gewählten Dörfer: größter Gewinn gegenüber dem Anfordern; ein anderes Dorf statt eines gewählten bringt nicht mehr
  const pl = mit.plans[mit.plans.length - 1];
  assert.ok(pl.coins > mit.base, "Routen für die Dörfer, die beim Anfordern nicht hinterherkommen, bringen mehr");
});

test("17.11.: Vergleich rechnet immer mindestens bis 3 Flaggendoppler, Empfehlung bleibt bei der Regel (Dennis 8a)", () => {
  // langgezogenes Kunstkonto: Kern in der Mitte, Ausläufer nach Norden und Süden
  const v = [];
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) {
    const y = i < 50 ? 500 + Math.round(rnd() * 30) : (i % 2 ? 420 : 610) + Math.round(rnd() * 20), x = 500 + Math.round(rnd() * 20);
    v.push({name: "D" + i, x, y, b: {market: 20, storage: 28, wood: 28, stone: 28, iron: 28, snob: i % 3 === 0 ? 1 : 0}});
  }
  for (const gain of [6, 500]) {
    const P = K.params({mode: "pct", pkgPct: 200, flagLevel: 9, decreeN: 1, intervalMin: 120, merchantBonus: true, minGainPct: gain}, WELT);
    const R = K.plan(v, P);
    assert.ok(R.configs.length >= 3, "nur " + R.configs.length + " Spalten bei Schwelle " + gain);
    // Empfehlung: höchstens bis vor die erste Aufstellung unter der Schwelle
    let erwartet = 1;
    for (let k = 2; k <= R.configs.length; k++) {
      const a = R.configs[k - 2], b = R.configs[k - 1];
      if (a.share >= 1 - 1e-6 || b.gainPct < gain - 1e-9) break;
      erwartet = k;
    }
    assert.equal(R.recommend, erwartet);
  }
  // „maximieren“ automatisch: perK ebenfalls mindestens bis 3, Empfehlung nach Schwelle
  const P = K.params({mode: "max", pkgSize: 30, flagLevel: 9, decreeN: 1, intervalMin: 120, merchantBonus: true, minGainPct: 500}, WELT);
  const R = K.planPackages(v, P, []);
  assert.ok(R.pkg.perK.length >= 3);
  assert.equal(R.recommend, 1);
});

test("20.11.: Flaggen je Prägedorf: gleiche Flaggen wie bisher, verschiedene mit bester Zuordnung (Dennis 9a, 10a)", () => {
  const v = dreiHaufen();
  const basis = {pkgPct: 300, decreeN: 1, intervalMin: 60, merchantBonus: true, production: true, minGainPct: 0};
  const Pa = x => K.params(Object.assign({}, basis, x), WELT);
  const P8 = Pa({flagLevel: 8}), P7 = Pa({flagLevel: 7}), P88 = Pa({flagLevels: [8, 8]}), P87 = Pa({flagLevels: [7, 8]});
  // gleiche Flaggen: genau wie bisher
  assert.equal(P88.flagMulti, false);
  const a = K.plan(v, P8), b = K.plan(v, P88);
  a.configs.forEach((c, q) => near(b.configs[q].coins, c.coins, 1e-9));
  // 23 % und 22 %: stärkste zuerst, Zuordnung je Aufstellung
  assert.deepEqual(P87.flagLevels, [8, 7]);
  assert.ok(P87.flagMulti);
  const r = K.plan(v, P87);
  near(r.configs[0].coins, a.configs[0].coins, 1e-9);                 // ein Prägedorf: die stärkste Flagge
  const c2 = r.configs[1], src = K.prepare(v, P87);
  assert.equal(Object.keys(c2.siteFlag).length, 2);
  const e = lv => new K.Planner(src, lv).evaluate(c2.sites).coins;
  const e87 = new K.Planner(src, P87).evaluate(c2.sites);
  assert.ok(e(P7) < e87.coins - 1e-6 && e87.coins < e(P8) - 1e-6);
  // von Hand: Einheiten je Prägedorf bis Ende Erlass und danach, Münzen mit der Flagge des Dorfes; vertauscht weniger
  const pl = new K.Planner(src, P87), u1 = [0, 0], u2 = [0, 0];
  src.forEach((s, i) => { const j = pl.assign(i, c2.sites), q = c2.sites.indexOf(j), x = pl.get(i, j); u1[q] += x.u1; u2[q] += x.u2; });
  const lv = c2.sites.map(j => e87.siteFlag[j]);
  near(K.flaggenMuenzen(u1[0], u2[0], lv[0], P87) + K.flaggenMuenzen(u1[1], u2[1], lv[1], P87), e87.coins, 1e-6);
  assert.ok(K.flaggenMuenzen(u1[0], u2[0], lv[1], P87) + K.flaggenMuenzen(u1[1], u2[1], lv[0], P87) <= e87.coins + 1e-9);
  const gross = u1[0] + u2[0] >= u1[1] + u2[1] ? 0 : 1;
  assert.equal(lv[gross], 8);
  // einfache Rechnung je Dorf (details) und Gleichschritt nehmen dieselbe Zuordnung
  near(r.details[1].rows.reduce((t, x) => t + x.coins, 0), e87.coins, 1e-6);
  const cnt = K.toCnt([0, 0, 0, 1, 2], K.lastClick(P87));
  const g = P => { const s = K.prepare(v, P); return K.lockstep(s, P, c2.sites, cnt, false).coins; };
  const g87 = g(P87);
  assert.ok(g(P7) < g87 - 1e-6 && g87 < g(P8) - 1e-6);
  // 10a: mehr Prägedörfer als Flaggen, die übrigen mit der letzten
  assert.deepEqual(K.flaggenFuer(3, P87), [8, 7, 7]);
  if (r.configs[2]) assert.deepEqual(Object.values(r.configs[2].siteFlag).sort(), [7, 7, 8]);
});

test("20.11.: Produktionsbonus accountweit, zeitlich begrenzt, addiert sich auf die Grundproduktion (Dennis 12.1b)", () => {
  const v = dreiHaufen();
  const basis = {pkgPct: 300, decreeN: 1, intervalMin: 60, merchantBonus: true, production: true, flagLevel: 8, minGainPct: 0};
  const Pa = x => K.params(Object.assign({}, basis, x), WELT);
  const ohne = K.plan(v, Pa({prodFactor: 1.2})), lang = K.plan(v, Pa({prodFactor: 1.2, boni: [{pct: 30, res: "all", h: 168}]}));
  const faktor = K.plan(v, Pa({prodFactor: 1.5}));
  // 168 h laufen über die ganzen 48 h: wie Produktionsfaktor 1,2 + 0,3
  lang.configs.forEach((c, q) => near(c.coins, faktor.configs[q].coins, 1e-6));
  const kurz = K.plan(v, Pa({prodFactor: 1.2, boni: [{pct: 30, res: "all", h: 24}]}));
  assert.ok(kurz.configs[0].coins > ohne.configs[0].coins + 1e-6 && kurz.configs[0].coins < lang.configs[0].coins - 1e-6);
  // nur Lehm: mehr als ohne, weniger als alle Rohstoffe
  const lehm = K.plan(v, Pa({prodFactor: 1.2, boni: [{pct: 10, res: "stone", h: 24}]}));
  assert.ok(lehm.configs[0].coins > ohne.configs[0].coins + 1e-6 && lehm.configs[0].coins < kurz.configs[0].coins);
  // Gleichschritt: Produktion je Abstand mit Bonus, 168 h wie Faktor 1,5
  const cnt = K.toCnt([0, 0, 1, 2, 3], K.lastClick(Pa({})));
  const g = P => { const s = K.prepare(v, P); return K.lockstep(s, P, lang.configs[1].sites, cnt, false).coins; };
  near(g(Pa({prodFactor: 1.2, boni: [{pct: 30, res: "all", h: 168}]})), g(Pa({prodFactor: 1.5})), 1e-6);
  // Menge im Zeitraum: Bonus nur, solange er läuft
  const P = Pa({prodFactor: 1, boni: [{pct: 30, res: "all", h: 10}]}), s = K.prepare(v, P)[0];
  near(K.prodMenge(s, 0, 0, 20, P), s.prod.wood * 20 + s.prodRoh[0] * 0.3 * 10, 1e-9);
  // ungültige Boni fallen weg
  assert.equal(Pa({boni: [{pct: 0, h: 24}, {pct: 30, h: 0}]}).boni.length, 0);
});

test("20.11.: Handelsrouten schon in der Suche: Dauerroute je Lieferdorf, höchstens routenDoerfer Dörfer (Dennis 18:08, 18:34)", () => {
  const v = dreiHaufen();
  const basis = {mode: "pct", pkgPct: 300, decreeN: 1, intervalMin: 120, merchantBonus: true, production: true, flagLevel: 8, minGainPct: 0};
  const Pa = x => K.params(Object.assign({}, basis, x), WELT);
  const ohne = K.plan(v, Pa({})), mit = K.plan(v, Pa({routen: true}));
  assert.equal(Pa({}).routen, false);
  // Routen nur, wo sie mehr bringen: nie weniger Münzen
  ohne.configs.forEach((c, q) => { const pl = new K.Planner(K.prepare(v, Pa({routen: true})), Pa({routen: true})); assert.ok(pl.evaluate(c.sites).coins >= c.coins - 1e-6); });
  assert.ok(mit.configs[0].coins > ohne.configs[0].coins + 1e-6, "Routen bringen hier mehr");
  // Dorftabelle (details) und Suche zählen gleich
  mit.configs.forEach((c, q) => near(mit.details[q].rows.reduce((t, r) => t + r.coins, 0), c.coins, 1e-6));
  assert.ok(mit.details[0].rows.some(r => r.route));
  // Grenze je Dorf: höchstens 3 Lieferdörfer mit Route
  const P3 = Pa({routen: true}); P3.routenDoerfer = 3;
  const pl3 = new K.Planner(K.prepare(v, P3), P3), e3 = pl3.evaluate(mit.configs[0].sites);
  assert.ok(e3.mitRoute.size <= 3 && e3.coins <= mit.configs[0].coins + 1e-6 && e3.coins >= ohne.configs[0].coins - 1e-6);
  // mit verschiedenen Flaggen nimmt der Gleichschritt dieselbe Zuordnung wie die Suche
  const Pf = Pa({routen: true, flagLevels: [8, 7]}), rf = K.plan(v, Pf);
  if (rf.configs[1]) assert.deepEqual(K.mitFlaggen(K.prepare(v, Pf), Pf, rf.configs[1].sites).siteFlag, rf.configs[1].siteFlag);
});
