/* Rechenkern des Prägerechners: wo lohnt der Flaggendoppler, wie viele Münzen, welche Klickfrequenz.
   Ohne DOM, läuft im Browser (window.Praegen) und in Node (module.exports), damit er testbar bleibt.

   Spielwerte (Stand 28.10.2026):
   - Münzkosten und Weltgeschwindigkeit aus den Welteinstellungen (data/praegen.json), sonst Werte von Welt 259.
   - Münzkosten-Flagge Stufe 1 bis 9: 10, 12, 14, 16, 18, 20, 22, 23, 24 % (Hilfe-Wiki „Flags“).
   - Flaggendoppler verdoppelt die Flagge eines Dorfes für 48 h, Erlass des Adels senkt die Münzkosten
     24 h lang um weitere 10 Prozentpunkte in allen Dörfern (InnoGames-Hilfe „Village Items“). Flagge und
     Erlass addieren sich (laut Dennis, Stufe 9: 48 % + 10 % = 58 %). Zwei Erlasse hintereinander gelten 48 h.
   - Rohstoffpakete: x % der Speicherkapazität je Rohstoff in jedes Dorf (InnoGames-Hilfe „Resource packages“).
   - Händler tragen 1.000 Rohstoffe und brauchen 6 Minuten je Feld geteilt durch die Weltgeschwindigkeit,
     die Einheitengeschwindigkeit wirkt nicht. Händlerbonus: Tragkraft und Tempo je × 1,5. Bestätigt am
     28.10.2026 auf Welt 259 (34,48 Felder mit Händlerbonus: 1:26:12 je Weg).
   - Händler je Marktstufe und Speicherkapazität wie in den Tabellen der Hilfe.
*/
(function (root) {
"use strict";

const RES = ["wood", "stone", "iron"];
// Händler je Marktplatzstufe 0 bis 25
const MERCHANTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 19, 26, 35, 46, 59, 74, 91, 110, 131, 154, 179, 206, 235];
// Speicherkapazität je Stufe 0 bis 30
const STORAGE = [0, 1000, 1229, 1512, 1859, 2285, 2810, 3454, 4247, 5222, 6420, 7893, 9705, 11932, 14670, 18037,
  22177, 27266, 33523, 41217, 50675, 62305, 76604, 94184, 115798, 142373, 175047, 215219, 264611, 325337, 400000];
const FLAG_PCT = [0, 10, 12, 14, 16, 18, 20, 22, 23, 24];
const DOUBLER_HOURS = 48;
const DECREE_HOURS = 24;
const DECREE_PCT = 10;
const LADDER = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360];   // Klickabstände in Minuten
const LONG_HORIZON = 14 * 24;                                           // Stunden, für „alles angekommen“
const EPS = 1e-9;

const WORLD_DEFAULT = {speed: 1.6, coin: {wood: 28000, stone: 30000, iron: 25000}, base_min_per_field: 6,
                       merchant_carry: 1000, auto_minting: true};

/* ---------- Formeln ---------- */
const storageCap = L => STORAGE[Math.max(0, Math.min(30, L | 0))];
const merchantsAt = L => MERCHANTS[Math.max(0, Math.min(25, L | 0))];
// Grundproduktion je Stunde bei Weltgeschwindigkeit 1: Stufe 30 = 2.400, Stufe 0 = 5
const baseProd = L => L <= 0 ? 5 : 30 * Math.pow(1.163118, L - 1);

/* ---------- Gebäudeübersicht einlesen ----------
   Erwartet die Ansicht Übersichten > Gebäude, kopiert mit Strg+A. Eine Dorfzeile enthält Name, (x|y), K..,
   die Punkte und die Gebäudestufen. Die Spalten werden vom Zeilenende her zugeordnet, weil davor je nach Welt
   Kirche und Wachturm fehlen oder dazukommen. Reihenfolge laut Spiel (Welt 259):
   Hauptgebäude, Kaserne, Stall, Werkstatt, [Wachturm], Adelshof, Schmiede, Versammlungsplatz, Statue, Marktplatz,
   Holzfäller, Lehmgrube, Eisenmine, Bauernhof, Speicher, Versteck, Wall. */
const TAIL = ["snob", "smith", "place", "statue", "market", "wood", "stone", "iron", "farm", "storage", "hide", "wall"];
const HEAD = ["main", "barracks", "stable", "garage", "watchtower"];
const MAX = {main: 30, barracks: 25, stable: 20, garage: 15, watchtower: 20, snob: 3, smith: 20, place: 1,
             statue: 1, market: 25, wood: 30, stone: 30, iron: 30, farm: 30, storage: 30, hide: 10, wall: 20};
const NUM = /^(\d{1,3}(\.\d{3})+|\d+)$/;

function parseOverview(text) {
  const villages = [], problems = [], seen = new Set();
  const lineRe = /^(.*?)\s*\((\d{1,3})\|(\d{1,3})\)\s*K(\d{1,3})\s+(.*)$/;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const m = raw.match(lineRe);
    if (!m) continue;
    const toks = m[5].trim().split(/\s+/).filter(t => NUM.test(t));
    if (toks.length < 2 + TAIL.length) continue;          // z. B. Kopfzeile des aktiven Dorfes mit Rohstoffen
    const nums = toks.map(t => parseInt(t.replace(/\./g, ""), 10));
    const b = nums.slice(1), v = {};
    TAIL.forEach((k, i) => { v[k] = b[b.length - TAIL.length + i]; });
    b.slice(0, b.length - TAIL.length).forEach((n, i) => { if (HEAD[i]) v[HEAD[i]] = n; });
    const name = m[1].trim(), x = +m[2], y = +m[3];
    const bad = Object.keys(v).filter(k => !(v[k] >= 0 && v[k] <= MAX[k]));
    if (bad.length) { problems.push(name + " (" + x + "|" + y + "): unplausible Stufe bei " + bad.join(", ")); continue; }
    if (seen.has(x + "|" + y)) continue;
    seen.add(x + "|" + y);
    villages.push({name, x, y, k: +m[4], points: nums[0], b: v});
  }
  // Summenzeilen mancher Übersichts-Skripte („Holz Σ = 195.325 pro/Stunde“), dienen zur Eichung der Produktion
  const sum = {};
  [["wood", "Holz"], ["stone", "Lehm"], ["iron", "Eisen"]].forEach(([k, w]) => {
    const mm = String(text || "").match(new RegExp(w + "\\s*Σ\\s*=\\s*([\\d.]+)\\s*pro\\s*/\\s*Stunde"));
    if (mm) sum[k] = parseInt(mm[1].replace(/\./g, ""), 10);
  });
  return {villages, problems, prodSum: Object.keys(sum).length === 3 ? sum : null};
}

/* Produktionsfaktor aus der Summenzeile: gemeldete Produktion / Produktion laut Minenstufen.
   Fängt Produktionsbonus, Gegenstände und Flaggen ab, ohne sie einzeln zu kennen. */
function prodFactorFrom(villages, prodSum, speed) {
  if (!prodSum || !villages.length) return null;
  let calc = 0;
  villages.forEach(v => RES.forEach(r => { calc += baseProd(v.b[r]) * speed; }));
  const f = (prodSum.wood + prodSum.stone + prodSum.iron) / calc;
  return f > 0.5 && f < 3 ? f : null;
}

/* ---------- Parameter ----------
   Eingaben der Seite plus Welt, daraus die abgeleiteten Größen für die Simulation. */
function params(input, world) {
  const w = Object.assign({}, WORLD_DEFAULT, world || {});
  const bonus = input.merchantBonus ? 1.5 : 1;
  const P = {
    pkgPct: Math.max(0, +input.pkgPct || 0),
    startPct: Math.max(0, +input.startPct || 0),
    // Erlass des Adels: 0 kein, 1 einmal (24 h), 2 zweimal hintereinander (48 h); decree: true heißt einmal
    decreeN: input.decreeN != null ? Math.max(0, Math.min(2, input.decreeN | 0)) : (input.decree ? 1 : 0),
    merchantBonus: !!input.merchantBonus,
    flagLevel: Math.max(0, Math.min(9, input.flagLevel | 0)),
    intervalMin: Math.max(1, +input.intervalMin || 60),
    production: input.production !== false,
    prodFactor: +input.prodFactor > 0 ? +input.prodFactor : 1,
    minGainPct: Math.max(0, +(input.minGainPct != null ? input.minGainPct : 10)),
    minMarket: Math.max(0, Math.min(25, input.minMarket | 0)),   // 0: Marktstufen wie im Dorf
    minStorage: Math.max(0, Math.min(30, input.minStorage | 0)), // 0: Speicherstufen wie im Dorf
    ignoreRatio: !!input.ignoreRatio,                             // Händler schicken, was im Dorf liegt
    pkgSize: +input.pkgSize > 0 ? Math.min(100, +input.pkgSize) : 30,        // Größe eines Pakets in %
    pkgCount: +input.pkgCount > 0 ? Math.round(+input.pkgCount) : null,      // null: automatisch optimal
    optThreshold: Math.max(0, +(input.optThreshold != null ? input.optThreshold : 90)),
    maxThreshold: 5,

    speed: +w.speed || 1,
    coin: w.coin,
    carry: (+w.merchant_carry || 1000) * bonus,
    minPerField: (+w.base_min_per_field || 6) / (+w.speed || 1) / bonus,
    window: DOUBLER_HOURS,
  };
  if (input.minPerField > 0) P.minPerField = +input.minPerField / bonus;   // Feld „ohne Bonus“ überschreibt
  P.interval = P.intervalMin / 60;
  P.decree = P.decreeN > 0;
  P.decreeHours = DECREE_HOURS * P.decreeN;
  P.deadline = P.decreeN === 1 ? DECREE_HOURS : DOUBLER_HOURS;
  P.unitRes = P.coin.wood + P.coin.stone + P.coin.iron;
  return P;
}

const reduction = (t, P) => Math.min(0.95, 2 * FLAG_PCT[P.flagLevel] / 100
                                           + (P.decree && t <= P.decreeHours + EPS ? DECREE_PCT / 100 : 0));
const coinPrice = (t, P) => P.unitRes * (1 - reduction(t, P));

/* ---------- Dörfer vorbereiten ----------
   Mit P.minMarket rechnet jedes Dorf mindestens mit dieser Marktstufe (Ausbau vor dem Start, Wunsch Dennis
   28.10.2026). b.market ist dann die gerechnete Stufe, marketFrom die Stufe aus der Übersicht. Ebenso
   P.minStorage für den Speicher (v0.5, 29.10.2026): größerer Speicher heißt größere Pakete und mehr Platz. */
function prepare(villages, P) {
  return villages.map((v, i) => {
    const storFrom = v.b.storage | 0, storage = Math.max(storFrom, P.minStorage || 0);
    const cap = storageCap(storage);
    const per = cap * (P.pkgPct + P.startPct) / 100;
    const prod = {};
    RES.forEach(r => { prod[r] = P.production ? baseProd(v.b[r]) * P.speed * P.prodFactor : 0; });
    const from = v.b.market | 0, market = Math.max(from, P.minMarket || 0);
    const b = market > from || storage > storFrom ? Object.assign({}, v.b, {market, storage}) : v.b;
    return {i, name: v.name, x: v.x, y: v.y, b, marketFrom: from, storageFrom: storFrom, cap, merchants: merchantsAt(market),
            snob: (v.b.snob || 0) >= 1, pkg: {wood: per, stone: per, iron: per}, prod};
  });
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const travelHours = (a, b, P) => dist(a, b) * P.minPerField / 60;

/* ---------- Simulation eines Herkunftsdorfs ----------
   Klicks auf „Rohstoffe anfordern“ bei 0, T, 2T, … Jeder Klick schickt mit allen freien Händlern so viel, wie im
   Prägeverhältnis vorhanden ist (Holz:Lehm:Eisen = Münzkosten). Händler sind 2 × Laufzeit unterwegs. Paketmengen
   gelten als zuerst verschickt, die Produktion danach. Gerechnet wird in Münzeinheiten zum Grundpreis.
   tau = 0 heißt: das Dorf ist selbst Prägedorf, es prägt ohne Händler sofort. */
function simulate(s, tau, P, horizon, merchants, keepArrivals) {
  const cw = P.coin.wood, cs = P.coin.stone, ci = P.coin.iron, C = P.carry, T = P.interval;
  const M = merchants != null ? merchants : s.merchants;
  let pw = s.pkg.wood, ps = s.pkg.stone, pi = s.pkg.iron, lastProd = 0;
  // Mit P.ignoreRatio schicken die Händler alles, was im Dorf liegt; gerechnet in Rohstoffen / Münzpreis
  const avail = () => P.ignoreRatio ? (pw + ps + pi) / P.unitRes : Math.min(pw / cw, ps / cs, pi / ci);
  const pkgUnits = avail();
  let shipped = 0, coins = 0, inTime = 0, doneAt = pkgUnits <= EPS ? 0 : Infinity, lastArrival = 0;
  const qT = [], qN = [];
  let qh = 0, busy = 0;
  const arrivals = keepArrivals ? [] : null;
  const prodOn = s.prod.wood + s.prod.stone + s.prod.iron > 0;
  for (let k = 0; ; k++) {
    const t = k * T;
    if (t > horizon + EPS) break;
    if (prodOn) {
      const a = Math.min(t, P.window) - Math.min(lastProd, P.window);
      if (a > 0) { pw += s.prod.wood * a; ps += s.prod.stone * a; pi += s.prod.iron * a; }
      lastProd = t;
    }
    while (qh < qT.length && qT[qh] <= t + EPS) { busy -= qN[qh]; qh++; }
    const freeCap = tau === 0 ? Infinity : (M - busy) * C;
    const units = Math.min(avail(), freeCap / P.unitRes);
    if (units > EPS) {
      if (tau > 0) {
        const used = Math.ceil(units * P.unitRes / C - 1e-7);
        busy += used; qT.push(t + 2 * tau); qN.push(used);
      }
      if (P.ignoreRatio) { const f = units * P.unitRes / (pw + ps + pi); pw -= pw * f; ps -= ps * f; pi -= pi * f; }
      else { pw -= units * cw; ps -= units * cs; pi -= units * ci; }
      const ta = t + tau, pkgPart = Math.max(0, Math.min(units, pkgUnits - shipped));
      shipped += units;
      if (pkgPart > 0 && doneAt === Infinity && shipped >= pkgUnits - 1e-7) doneAt = ta;
      if (ta <= P.window + EPS) coins += units / (1 - reduction(ta, P));
      if (pkgPart > 0 && ta <= P.deadline + EPS) inTime += pkgPart;
      if (ta > lastArrival) lastArrival = ta;
      if (arrivals) arrivals.push([ta, pkgPart, units]);
    }
    if (t >= P.window && shipped >= pkgUnits - 1e-7) break;   // Pakete weg, Prägezeit vorbei
  }
  return {tau, pkgUnits, inTime, coins, doneAt, shipped, arrivals};
}

/* ---------- Standortsuche ---------- */
function Planner(src, P) {
  this.src = src; this.P = P; this.n = src.length; this.cache = new Map();
}
Planner.prototype.get = function (i, c) {
  const key = i * this.n + c;
  let r = this.cache.get(key);
  if (!r) {
    const tau = i === c ? 0 : travelHours(this.src[i], this.src[c], this.P);
    r = simulate(this.src[i], tau, this.P, this.P.window);
    this.cache.set(key, r);
  }
  return r;
};
// Jedes Herkunftsdorf beliefert das nächstgelegene Prägedorf: kürzere Laufzeit ist bei gleichen Händlern immer besser.
Planner.prototype.assign = function (i, sites) {
  let best = sites[0], bd = Infinity;
  for (const c of sites) { const d = dist(this.src[i], this.src[c]); if (d < bd - EPS) { bd = d; best = c; } }
  return best;
};
Planner.prototype.evaluate = function (sites) {
  let coins = 0, pkg = 0, inTime = 0, doneAt = 0, spread = 0;
  for (let i = 0; i < this.n; i++) {
    const r = this.get(i, this.assign(i, sites));
    coins += r.coins; pkg += r.pkgUnits; inTime += r.inTime; spread += r.pkgUnits * r.tau;
    if (r.doneAt > doneAt) doneAt = r.doneAt;
  }
  return {sites, coins, pkg, inTime, share: pkg > EPS ? inTime / pkg : 1, doneAt, spread};
};
// Reihenfolge: mehr Münzen, dann mehr Paketmenge rechtzeitig, dann früher fertig, dann kürzere Wege
function better(a, b) {
  const tol = 1e-7 * Math.max(1, Math.abs(b.coins));
  if (Math.abs(a.coins - b.coins) > tol) return a.coins > b.coins;
  if (Math.abs(a.inTime - b.inTime) > 1e-7) return a.inTime > b.inTime;
  if (a.doneAt !== b.doneAt) return a.doneAt < b.doneAt;
  return a.spread < b.spread;
}
Planner.prototype.bestSingle = function (cands) {
  let best = null;
  for (const c of cands) { const r = this.evaluate([c]); if (!best || better(r, best)) best = r; }
  return best;
};
/* ---------- Mehrere Prägedörfer ----------
   k = 1 und k = 2 werden vollständig durchsucht, ab k = 3 heuristisch: Start aus der besten Aufstellung mit k − 1
   Prägedörfern plus dem besten Zusatzdorf und zweiter Start aus k Haufen (gewichtetes k-means, je Haufen das
   Kandidatendorf am Schwerpunkt), danach so lange Prägedörfer gegen andere Kandidaten tauschen, wie es besser wird.
   Große Konten: höchstens 60 Kandidaten, je Haufen die nächsten am Schwerpunkt. */
const CAND_MAX = 60;
Planner.prototype.clusters = function (k) {
  const src = this.src, w = src.map(s => 1 + s.pkg.stone);
  const mean = src.reduce((m, s, i) => ({x: m.x + s.x * w[i], y: m.y + s.y * w[i], w: m.w + w[i]}), {x: 0, y: 0, w: 0});
  // Startpunkte: jeweils das Dorf, das am weitesten von allen bisherigen entfernt liegt
  const cent = [];
  let first = src[0], fd = -1;
  src.forEach(s => { const d = dist(s, {x: mean.x / mean.w, y: mean.y / mean.w}); if (d > fd) { fd = d; first = s; } });
  cent.push({x: first.x, y: first.y});
  while (cent.length < k) {
    let pick = null, pd = -1;
    src.forEach(s => { const d = Math.min(...cent.map(c => dist(s, c))); if (d > pd) { pd = d; pick = s; } });
    if (pd <= 0) break;
    cent.push({x: pick.x, y: pick.y});
  }
  const near = s => { let b = 0, bd = Infinity; cent.forEach((c, j) => { const d = dist(s, c); if (d < bd) { bd = d; b = j; } }); return b; };
  for (let it = 0; it < 15; it++) {
    const acc = cent.map(() => ({x: 0, y: 0, w: 0}));
    src.forEach((s, i) => { const a = acc[near(s)]; a.x += s.x * w[i]; a.y += s.y * w[i]; a.w += w[i]; });
    acc.forEach((a, j) => { if (a.w) cent[j] = {x: a.x / a.w, y: a.y / a.w}; });
  }
  return cent;
};
Planner.prototype.kCandidates = function (cands, k) {
  if (cands.length <= CAND_MAX) return cands;
  const per = Math.max(1, Math.floor(CAND_MAX / k)), pick = new Set();
  this.clusters(k).forEach(c => cands.slice().sort((a, b) => dist(this.src[a], c) - dist(this.src[b], c))
    .slice(0, per).forEach(i => pick.add(i)));
  return [...pick];
};
Planner.prototype.bestPair = function (cands) {
  cands = this.kCandidates(cands, 2);
  let best = null;
  for (let a = 0; a < cands.length; a++)
    for (let b = a + 1; b < cands.length; b++) {
      const r = this.evaluate([cands[a], cands[b]]);
      if (!best || better(r, best)) best = r;
    }
  return best;
};
Planner.prototype.improve = function (sites, cands) {
  let cur = this.evaluate(sites);
  for (let round = 0; round < 20; round++) {
    let changed = false;
    for (let pos = 0; pos < cur.sites.length; pos++) {
      for (const c of cands) {
        if (cur.sites.includes(c)) continue;
        const trial = cur.sites.slice(); trial[pos] = c;
        const r = this.evaluate(trial);
        if (better(r, cur)) { cur = r; changed = true; }
      }
    }
    if (!changed) break;
  }
  return cur;
};
Planner.prototype.bestK = function (cands, k, prevSites) {
  if (k === 1) return this.bestSingle(cands);
  if (k > cands.length) return null;
  if (k === 2) return this.bestPair(cands);
  cands = this.kCandidates(cands, k);
  if (k > cands.length) return null;
  const starts = [];
  if (prevSites && prevSites.length === k - 1) {
    let best = null;
    for (const c of cands) {
      if (prevSites.includes(c)) continue;
      const r = this.evaluate(prevSites.concat([c]));
      if (!best || better(r, best)) best = r;
    }
    if (best) starts.push(best.sites);
  }
  const seed = [];
  this.clusters(k).forEach(c => {
    const free = cands.filter(i => !seed.includes(i));
    if (free.length) seed.push(free.reduce((b, i) => (dist(this.src[i], c) < dist(this.src[b], c) ? i : b), free[0]));
  });
  if (seed.length === k) starts.push(seed);
  let best = null;
  for (const st of starts) { const r = this.improve(st, cands); if (!best || better(r, best)) best = r; }
  return best;
};

/* ---------- Einzelheiten zu einer Aufstellung ----------
   Lange Simulation je Dorf (bis 14 Tage) für „alles angekommen“, Ankunftsverlauf und Engpass-Einstufung:
   ok      Paketmenge kommt rechtzeitig an
   markt   kommt mit höherer Marktstufe rechtzeitig an (need = nötige Stufe)
   weit    kommt auch mit Markt 25 bei dieser Klickfrequenz nicht rechtzeitig an */
function details(src, P, sites, planner) {
  const rows = [], curve = [];
  let doneAt = 0;
  for (const s of src) {
    const site = planner.assign(s.i, sites), tau = s.i === site ? 0 : travelHours(s, src[site], P);
    const r = simulate(s, tau, P, LONG_HORIZON, null, true);
    let status = "ok", need = null;
    if (r.inTime < r.pkgUnits - 1e-7) {
      status = "weit";
      for (let L = s.b.market + 1; L <= 25; L++) {
        const q = simulate(s, tau, P, P.window, merchantsAt(L));
        if (q.inTime >= q.pkgUnits - 1e-7) { status = "markt"; need = L; break; }
      }
    }
    r.arrivals.forEach(([t, part]) => { if (part > 0) curve.push([t, part]); });
    if (r.doneAt > doneAt) doneAt = r.doneAt;
    rows.push({i: s.i, site, tau, dist: s.i === site ? 0 : dist(s, src[site]), merchants: s.merchants,
               pkgUnits: r.pkgUnits, inTime: r.inTime, coins: r.coins, doneAt: r.doneAt, status, need,
               trips: r.arrivals.length});
  }
  curve.sort((a, b) => a[0] - b[0]);
  return {rows, curve, doneAt};
}

/* ---------- Gesamtrechnung ---------- */
/* ---------- Gesamtrechnung ----------
   Regel 9.1a (Dennis 28.10.2026), verallgemeinert auf beliebig viele Flaggendoppler (Dennis 23:24): ein weiterer
   Flaggendoppler wird nur empfohlen, wenn die Aufstellung mit einem weniger nicht alle Paket-Rohstoffe rechtzeitig
   schafft und der weitere mindestens minGainPct mehr Münzen bringt. Gerechnet wird bis zur ersten Aufstellung, die
   diese Hürde nicht nimmt, damit die Seite zeigen kann, warum dort Schluss ist. */
const K_MAX = 8;
function search(src, P, pl) {
  const all = src.map(s => s.i), ah = src.filter(s => s.snob).map(s => s.i);
  const cands1 = ah.length ? ah : all, candsK = ah.length >= 2 ? ah : all;
  const configs = [];
  const r1 = pl.bestSingle(cands1);
  r1.needsSnob = !ah.length; r1.gainPct = null;
  configs.push(r1);
  let recommend = 1;
  for (let k = 2; k <= K_MAX && k <= candsK.length; k++) {
    const prev = configs[k - 2];
    const next = pl.bestK(candsK, k, prev.sites);
    if (!next) break;
    next.needsSnob = ah.length < k;
    next.gainPct = (next.coins / prev.coins - 1) * 100;
    configs.push(next);
    if (prev.share >= 1 - 1e-6 || next.gainPct < P.minGainPct - 1e-9) break;
    recommend = k;
  }
  return {configs, recommend, ah, all};
}
function plan(villages, P) {
  const src = prepare(villages, P);
  const pl = new Planner(src, P);
  const out = {P, src, ahCount: src.filter(s => s.snob).length};
  // Dörfer, die für die Mindeststufe den Marktplatz vorher ausbauen, und die Summe der Ausbaustufen
  const up = src.filter(s => s.b.market > s.marketFrom);
  out.marketUp = {count: up.length, levels: up.reduce((n, s) => n + s.b.market - s.marketFrom, 0)};
  if (!src.length) return out;
  const sr = search(src, P, pl);
  out.configs = sr.configs;
  out.recommend = sr.recommend;
  out.details = sr.configs.map(c => details(src, P, c.sites, pl));
  // Bester Einzelstandort ohne Adelshof-Pflicht, nur als Hinweis, wenn er spürbar mehr bringt
  if (sr.ah.length && sr.ah.length < sr.all.length) {
    const any = pl.bestSingle(sr.all);
    if (!src[any.sites[0]].snob && any.coins > sr.configs[0].coins * 1.01) out.singleAny = any;
  }
  // Kurzformen für eine und zwei Aufstellungen
  out.single = sr.configs[0]; out.pair = sr.configs[1] || null;
  out.d1 = out.details[0]; out.d2 = out.details[1] || null;
  out.singleComplete = out.single.share >= 1 - 1e-6;
  out.gainPct = out.pair ? out.pair.gainPct : 0;
  return out;
}

/* Klickfrequenz: für jeden Abstand der Leiter die Aufstellungen mit 1 bis kMax Prägedörfern neu suchen */
function ladderStep(villages, P, minutes, kMax) {
  const Q = Object.assign({}, P, {intervalMin: minutes, interval: minutes / 60});
  const src = prepare(villages, Q), pl = new Planner(src, Q);
  const all = src.map(s => s.i), ah = src.filter(s => s.snob).map(s => s.i);
  const share = [], coins = [];
  let prev = pl.bestSingle(ah.length ? ah : all);
  share.push(prev.share); coins.push(prev.coins);
  const candsK = ah.length >= 2 ? ah : all;
  for (let k = 2; k <= (kMax || 2); k++) {
    const r = pl.bestK(candsK, k, prev.sites);
    if (!r) break;
    share.push(r.share); coins.push(r.coins); prev = r;
  }
  return {min: minutes, share, coins};
}
/* Größter Klickabstand, bei dem alles rechtzeitig ankommt; sonst der größte, der 98 % des Bestwerts erreicht.
   k = Zahl der Prägedörfer. */
function requiredInterval(steps, k) {
  const ok = steps.filter(s => s.share[k - 1] != null);
  if (!ok.length) return null;
  const v = s => s.share[k - 1];
  const full = ok.filter(s => v(s) >= 1 - 1e-6);
  if (full.length) return {kind: "voll", min: Math.max(...full.map(s => s.min))};
  const top = Math.max(...ok.map(v));
  const near = ok.filter(s => v(s) >= 0.98 * top);
  return {kind: "plateau", min: Math.max(...near.map(s => s.min)), top};
}

/* ---------- Konto im Gleichschritt (v0.5, Wunsch Dennis 29.10.2026) ----------
   Statt „alle Pakete bei 0 h ohne Speichergrenze“ läuft das ganze Konto auf dem Klickraster 0, T, 2T, … < 48 h:
   - Ein Paket geht an alle Dörfer gleichzeitig: je Rohstoff Paketgröße × Speicherkapazität. Was über den
     Speicher geht, ist verloren (Überlauf). Laufende Produktion ebenfalls nur bis zur Speichergrenze.
   - Je Klick erst Pakete einlösen, dann Händler zurücknehmen und verschicken. Höchstens 3 Pakete je Klick.
   - Das Prägedorf prägt sofort, was ankommt oder dort liegt, und läuft nie über. Was nach dem Prägen über
     den Speicher geht (Rest außerhalb des Prägeverhältnisses), zählt nicht als Überlauf.
   - Mit P.ignoreRatio schicken die Händler Holz, Lehm und Eisen im Verhältnis des Dorfbestands; geprägt wird
     im Prägedorf weiter nach dem knappsten Rohstoff.
   cnt[k] = Zahl der Pakete am Klick k. */
const MAX_PER_CLICK = 3;
const maxPerClick = P => Math.max(1, Math.min(MAX_PER_CLICK, Math.floor(100 / P.pkgSize + 1e-9)));
const lastClick = P => Math.max(0, Math.floor((P.window - EPS) / P.interval));
const COIN = P => [P.coin.wood, P.coin.stone, P.coin.iron];

/* Ein Herkunftsdorf: Bestand, Pakete, Händler. Jede Lieferung geht an sink(Ankunftszeit, Holz, Lehm, Eisen).
   M = Händler; send = false: das Dorf verschickt nichts (nicht dabei), nur Bestand und Überlauf.
   ovClick (optional) sammelt den Überlauf je Klick. */
const ST = new Float64Array(3), QT = [], QN = [];
function villageRun(s, tau, P, cnt, M, sink, send, ovClick) {
  const T = P.interval, C = P.carry, cw = P.coin.wood, cs = P.coin.stone, ci = P.coin.iron, cap = s.cap;
  const add1 = P.pkgSize / 100 * cap, start = Math.min(cap, cap * P.startPct / 100);
  const p0 = s.prod.wood * T, p1 = s.prod.stone * T, p2 = s.prod.iron * T;
  let w = start, st = start, ir = start, qh = 0, qn = 0, busy = 0, overflow = 0, pkgRes = 0;
  for (let k = 0; k < cnt.length; k++) {
    const t = k * T;
    if (k > 0) { w = Math.min(cap, w + p0); st = Math.min(cap, st + p1); ir = Math.min(cap, ir + p2); }
    const n = cnt[k];
    if (n) {
      const add = n * add1;
      pkgRes += 3 * add;
      let ov = 0;
      w += add; if (w > cap) { ov += w - cap; w = cap; }
      st += add; if (st > cap) { ov += st - cap; st = cap; }
      ir += add; if (ir > cap) { ov += ir - cap; ir = cap; }
      overflow += ov;
      if (ovClick) ovClick[k] += ov;
    }
    if (send === false) continue;
    while (qh < qn && QT[qh] <= t + EPS) { busy -= QN[qh]; qh++; }
    const free = (M - busy) * C;
    if (free <= EPS) continue;
    let a0, a1, a2;
    if (P.ignoreRatio) {
      const tot = w + st + ir;
      if (tot <= EPS) continue;
      const q = Math.min(1, free / tot);
      a0 = w * q; a1 = st * q; a2 = ir * q;
    } else {
      const u = Math.min(w / cw, st / cs, ir / ci, free / P.unitRes);
      if (u <= EPS) continue;
      a0 = u * cw; a1 = u * cs; a2 = u * ci;
    }
    const amt = a0 + a1 + a2;
    if (amt <= EPS) continue;
    const used = Math.ceil(amt / C - 1e-7);
    busy += used; QT[qn] = t + 2 * tau; QN[qn] = used; qn++;
    w -= a0; st -= a1; ir -= a2;
    if (sink && t + tau <= P.window + EPS) sink(t + tau, a0, a1, a2);
  }
  return {overflow, pkgRes};
}

/* Prägedorf: eigene Klicks (Produktion, Pakete) und Ankünfte in zeitlicher Folge (Fächer je Klickabstand),
   sofort prägen, was im Prägeverhältnis da ist. bins[k] = Ankünfte im Abstand [kT, (k+1)T). */
function siteRun(s, P, cnt, bins) {
  const T = P.interval, cw = P.coin.wood, cs = P.coin.stone, ci = P.coin.iron, cap = s.cap;
  const add1 = P.pkgSize / 100 * cap, start = Math.min(cap, cap * P.startPct / 100);
  let w = start, st = start, ir = start, coins = 0, pkgRes = 0;
  const mint = t => {
    const u = Math.min(w / cw, st / cs, ir / ci);
    if (u > EPS && t <= P.window + EPS) { coins += u / (1 - reduction(t, P)); w -= u * cw; st -= u * cs; ir -= u * ci; }
    if (w > cap) w = cap; if (st > cap) st = cap; if (ir > cap) ir = cap;
  };
  const K = cnt.length;
  for (let k = 0; k <= K; k++) {
    if (k < K) {
      const add = cnt[k] * add1;
      pkgRes += 3 * add;
      w += (k > 0 ? s.prod.wood * T : 0) + add; st += (k > 0 ? s.prod.stone * T : 0) + add; ir += (k > 0 ? s.prod.iron * T : 0) + add;
      mint(k * T);
    }
    const b = bins && bins[k];
    if (b) for (let j = 0; j < b.length; j += 4) { w += b[j + 1]; st += b[j + 2]; ir += b[j + 3]; mint(b[j]); }
  }
  return {coins, pkgRes};
}

function nearestSite(src, i, sites) {
  let best = sites[0], bd = Infinity;
  for (const c of sites) { const d = dist(src[i], src[c]); if (d < bd - EPS) { bd = d; best = c; } }
  return best;
}

/* Ganzes Konto für einen Zeitplan. Im Prägeverhältnis kommt jede Lieferung im Verhältnis an und wird sofort
   ganz geprägt, die Münzen werden deshalb direkt beim Versand gezählt. Mit ignoreRatio sammelt das Prägedorf
   die Lieferungen und prägt nach dem knappsten Rohstoff. detail: Überlauf je Dorf und je Klick. */
function lockstep(src, P, sites, cnt, detail) {
  const n = src.length, K = cnt.length;
  const key = sites.join(",");
  if (!src._ls || src._ls.key !== key || src._ls.P !== P) {
    const site = src.map((_, i) => nearestSite(src, i, sites));
    src._ls = {key, P, site, tau: src.map((s, i) => site[i] === i ? 0 : travelHours(s, src[site[i]], P))};
  }
  const {site, tau} = src._ls;
  const out = detail ? {overflow: new Float64Array(n), pkgRes: new Float64Array(n), ovClick: new Float64Array(K), site} : null;
  let coins = 0;
  const bins = P.ignoreRatio ? new Map(sites.map(j => [j, new Array(K + 1)])) : null;
  let cur = null;
  const sinkRatio = (ta, a0) => { coins += a0 / P.coin.wood / (1 - reduction(ta, P)); };
  const sinkBin = (ta, a0, a1, a2) => {
    const k = Math.min(K, Math.floor(ta / P.interval + EPS));
    (cur[k] || (cur[k] = [])).push(ta, a0, a1, a2);
  };
  for (let i = 0; i < n; i++) {
    if (site[i] === i) continue;
    if (bins) cur = bins.get(site[i]);
    const r = villageRun(src[i], tau[i], P, cnt, src[i].merchants, bins ? sinkBin : sinkRatio, true, out && out.ovClick);
    if (out) { out.overflow[i] = r.overflow; out.pkgRes[i] = r.pkgRes; }
  }
  for (const j of sites) {
    const r = siteRun(src[j], P, cnt, bins ? bins.get(j) : null);
    coins += r.coins;
    if (out) out.pkgRes[j] = r.pkgRes;
  }
  if (out) { out.coins = coins; return out; }
  return {coins};
}

/* Höchstwert eines Pakets: Paketgröße × Summe der Speicher, in Münzen zum Flaggenpreis (Flagge verdoppelt). */
function packageValue(src, P) {
  const capSum = src.reduce((a, s) => a + s.cap, 0);
  return P.pkgSize / 100 * capSum / Math.max(...COIN(P)) / (1 - Math.min(0.95, 2 * FLAG_PCT[P.flagLevel] / 100));
}

/* Letzter sinnvoller Einlöseklick: 48 h minus der Zeit, die ein Dorf für ein Paket braucht (Median nach
   Speichergröße über die Herkunftsdörfer: erste Laufzeit plus weitere Fahrten). */
function lastUsefulClick(src, P, sites) {
  const T = P.interval, need = [];
  src.forEach((s, i) => {
    const j = nearestSite(src, i, sites);
    if (j === i) return;
    const tau = travelHours(s, src[j], P), cap = s.merchants * P.carry;
    const vol = P.pkgSize / 100 * s.cap * 3;
    const trips = cap > 0 ? Math.ceil(vol / cap - 1e-9) : 99;
    need.push([tau + (trips - 1) * Math.max(T, 2 * tau), s.cap]);
  });
  if (!need.length) return lastClick(P);
  need.sort((a, b) => a[0] - b[0]);
  const half = need.reduce((a, x) => a + x[1], 0) / 2;
  let acc = 0, h = need[need.length - 1][0];
  for (const [t, w] of need) { acc += w; if (acc >= half) { h = t; break; } }
  return Math.max(0, Math.min(lastClick(P), Math.floor((P.window - h) / T + EPS)));
}

const toCnt = (pos, K) => { const c = new Int8Array(K + 1); pos.forEach(k => c[k]++); return c; };

/* N Pakete gleichmäßig auf die Klicks 0 … L, je Klick höchstens maxPer */
function evenSchedule(N, L, K, maxPer) {
  const c = new Int8Array(K + 1), pos = [];
  for (let j = 0; j < N; j++) {
    let k = N === 1 ? 0 : Math.round(j * L / (N - 1));
    while (k <= K && c[k] >= maxPer) k++;
    if (k > K) { k = 0; while (k <= K && c[k] >= maxPer) k++; }
    if (k > K) break;
    c[k]++; pos.push(k);
  }
  return pos.sort((a, b) => a - b);
}

/* Einzelne Pakete um 1 bis 3 Klicks verschieben, solange die Münzen steigen */
function improveSchedule(pos, evalFn, K, maxPer, rounds) {
  pos = pos.slice();
  const c = toCnt(pos, K);
  let best = evalFn(c);
  for (let round = 0; round < (rounds || 8); round++) {
    let changed = false;
    for (let j = 0; j < pos.length; j++) {
      for (const d of [-1, 1, -2, 2, -3, 3]) {
        const k = pos[j] + d;
        if (k < 0 || k > K || c[k] >= maxPer) continue;
        c[pos[j]]--; c[k]++;
        const v = evalFn(c);
        if (v > best + 1e-6) { best = v; pos[j] = k; changed = true; break; }
        c[k]--; c[pos[j]]++;
      }
    }
    if (!changed) break;
  }
  return {pos: pos.sort((a, b) => a - b), coins: best};
}

/* Kurve Pakete gegen Münzen.
   Bis „optimal“ und für eine feste Paketzahl je N voll: gleichmäßiger Start und Start aus dem Plan für N − 1 plus
   ein Paket am besten Klick, beide verschoben, der bessere gilt (so bringen mehr Pakete nie weniger Münzen).
   Danach bis „maximal“ nur noch das weitere Paket am besten Klick eingefügt (Näherung für die Kurve).
   optimal: N erhöhen, solange das N-te Paket mindestens optThreshold % des Höchstwerts bringt.
   maximal: dasselbe mit maxThreshold (5 %). */
const N_MAX = 150;
function packageCurve(src, P, sites, untilMax, state) {
  const K = lastClick(P), maxPer = maxPerClick(P);
  const evalFn = c => lockstep(src, P, sites, c).coins;
  const cv = state || {curve: [{n: 0, pos: [], coins: evalFn(toCnt([], K)), gain: null}], optimal: null, maximal: null,
                       value: packageValue(src, P), K, L: lastUsefulClick(src, P, sites), maxPer};
  const limit = Math.min(N_MAX, maxPer * (K + 1));
  for (let N = cv.curve.length; N <= limit; N++) {
    if (cv.maximal != null && (!P.pkgCount || N > P.pkgCount)) break;
    if (!untilMax && cv.optimal != null && (!P.pkgCount || N > P.pkgCount)) break;
    const prev = cv.curve[N - 1], full = cv.optimal == null || N === P.pkgCount;
    const c = toCnt(prev.pos, K);
    let warm = null;
    const step = full ? 1 : Math.max(1, Math.round(2 / P.interval));
    for (let k = 0; k <= K; k += step) {
      if (c[k] >= maxPer) continue;
      c[k]++;
      const v = evalFn(c);
      c[k]--;
      if (!warm || v > warm.coins) warm = {pos: prev.pos.concat([k]).sort((a, b) => a - b), coins: v};
    }
    let best = warm || {pos: prev.pos, coins: prev.coins};
    if (full) {
      const a = improveSchedule(evenSchedule(N, cv.L, K, maxPer), evalFn, K, maxPer, 4);
      const b = warm ? improveSchedule(warm.pos, evalFn, K, maxPer, 2) : a;
      best = b.coins > a.coins ? b : a;
    }
    const gain = (best.coins - prev.coins) / cv.value;
    cv.curve.push({n: N, pos: best.pos, coins: best.coins, gain, full});
    if (cv.optimal == null && gain < P.optThreshold / 100 - 1e-9) cv.optimal = N - 1;
    if (cv.maximal == null && gain < P.maxThreshold / 100 - 1e-9) cv.maximal = N - 1;
  }
  if (untilMax && cv.maximal == null) cv.maximal = cv.curve.length - 1;
  if (cv.optimal == null) cv.optimal = cv.curve.length - 1;
  return cv;
}

/* Einzelheiten zum gewählten Zeitplan: Tabelle je Einlöseklick, Überlauf je Dorf, Dörfer, die den Takt begrenzen
   (Überlauf über 1 % ihrer Paketmenge) mit der Marktstufe, ab der sie nicht mehr überlaufen. */
function scheduleDetails(src, P, sites, pos, passive) {
  const K = lastClick(P), cnt = toCnt(pos, K), r = lockstep(src, P, sites, cnt, true);
  const rows = [];
  let sum = 0;
  for (let k = 0; k <= K; k++) {
    if (!cnt[k]) continue;
    sum += cnt[k];
    let pk = 0;
    src.forEach(s => { pk += cnt[k] * P.pkgSize / 100 * s.cap * 3; });
    rows.push({h: k * P.interval, n: cnt[k], sumPct: sum * P.pkgSize, overflow: r.ovClick[k], share: pk > 0 ? r.ovClick[k] / pk : 0});
  }
  const limiting = [];
  src.forEach((s, i) => {
    if (r.site[i] === i || r.pkgRes[i] <= 0 || r.overflow[i] / r.pkgRes[i] <= 0.01) return;
    const tau = travelHours(s, src[r.site[i]], P);
    let need = null;
    for (let L = s.b.market + 1; L <= 25; L++) {
      const q = villageRun(s, tau, P, cnt, merchantsAt(L), null);
      if (q.overflow / q.pkgRes <= 0.01) { need = L; break; }
    }
    limiting.push({i, share: r.overflow[i] / r.pkgRes[i], need});
  });
  limiting.sort((a, b) => b.share - a.share);
  const pas = (passive || []).map(s => { const q = villageRun(s, 0, P, cnt, 0, null, false); return {name: s.name, x: s.x, y: s.y, overflow: q.overflow, pkgRes: q.pkgRes}; });
  const pkgTotal = r.pkgRes.reduce((a, v) => a + v, 0), ovTotal = r.overflow.reduce((a, v) => a + v, 0);
  return {coins: r.coins, cnt, rows, overflow: r.overflow, pkgRes: r.pkgRes, limiting, passive: pas,
          overflowShare: pkgTotal > 0 ? ovTotal / pkgTotal : 0};
}

/* Gesamtrechnung v0.5: Prägedörfer aus der statischen Rechnung mit Paketvolumen = Anzahl × Größe, Paketzahl und
   Zeitplan aus dem Gleichschritt. Bei „automatisch“ wird die Aufstellung einmal mit der gefundenen Zahl nachgerechnet.
   passive: Dörfer ohne Haken „dabei“; sie bekommen die Pakete trotzdem, ihr Überlauf wird nur angezeigt. */
/* Unter 60 Minuten Klickabstand wird der Zeitplan auf einem gröberen Raster gesucht (Vielfaches des Klickabstands
   ab 60 Minuten, also weiter echte Klickzeitpunkte), sonst dauert die Suche viele Sekunden. Jeder Punkt der Kurve
   wird danach mit dem echten Klickabstand nachgerechnet, optimal und maximal folgen aus diesen Werten. */
function coarse(P) {
  if (P.intervalMin >= 60) return {Pc: P, m: 1};
  const m = Math.ceil(60 / P.intervalMin - 1e-9);
  return {Pc: Object.assign({}, P, {intervalMin: P.intervalMin * m, interval: P.interval * m}), m};
}
function refine(src, P, sites, cv, m) {
  if (m === 1) return cv;
  const K = lastClick(P), evalFn = pos => lockstep(src, P, sites, toCnt(pos, K)).coins;
  const curve = cv.curve.map(x => ({n: x.n, pos: x.pos.map(k => k * m), coins: evalFn(x.pos.map(k => k * m)), gain: null, full: x.full}));
  let optimal = null, maximal = null;
  for (let n = 1; n < curve.length; n++) {
    curve[n].gain = (curve[n].coins - curve[n - 1].coins) / cv.value;
    if (optimal == null && curve[n].gain < P.optThreshold / 100 - 1e-9) optimal = n - 1;
    if (maximal == null && curve[n].gain < P.maxThreshold / 100 - 1e-9) maximal = n - 1;
  }
  return Object.assign({}, cv, {curve, K, L: cv.L * m, maxPer: cv.maxPer,
                                optimal: optimal == null ? curve.length - 1 : optimal, maximal: maximal == null ? curve.length - 1 : maximal});
}

/* Optimale Paketzahl für die Aufstellung mit k Prägedörfern. Die Prägedörfer kommen aus der einfachen Rechnung
   mit Paketvolumen = Anzahl × Größe; ändert sich dadurch die Aufstellung, wird mit der neuen Paketzahl nachgerechnet
   (höchstens dreimal). Mit fester Paketzahl (P0.pkgCount) gilt die empfohlene Aufstellung der einfachen Rechnung. */
function bestForK(villages, P0, k, N0) {
  let N = N0, R = null, cur = null, key = null, Pc = null, m = 1, cv = null;
  for (let it = 0; it < 3; it++) {
    const P = Object.assign({}, P0, {pkgPct: Math.max(1, N) * P0.pkgSize});
    const Rn = plan(villages, P);
    if (!Rn.src.length) return {R: Rn};
    const kk = k || Rn.recommend;
    if (Rn.configs.length < kk) break;
    const sites = Rn.configs[kk - 1].sites;
    if (cur && key === sites.join(",")) break;          // gleiche Prägedörfer: Kurve bleibt gültig
    R = Rn; R.k = kk;
    ({Pc, m} = coarse(P));
    cur = packageCurve(R.src, Pc, sites, false);
    cur.P = P; cur.src = R.src; key = sites.join(",");
    cv = refine(R.src, P, sites, cur, m);
    const next = P0.pkgCount || cv.optimal;
    if (next === N) break;
    N = next;
  }
  if (!R) return null;
  R.P = cur.P; R.src = cur.src;
  const n = Math.min(P0.pkgCount || cv.optimal, cv.curve.length - 1);
  return {R, k: R.k, cur, cv, Pc, m, sites: R.configs[R.k - 1].sites, n, coins: cv.curve[n].coins};
}

/* Gesamtrechnung v0.5. „automatisch“ (Dennis 3a, 29.10.2026): je Zahl der Flaggendoppler die eigene optimale
   Paketzahl; ein weiterer Flaggendoppler wird empfohlen, solange er damit mindestens minGainPct mehr Münzen bringt
   (Regel 9.1a auf den Gleichschritt übertragen). Gerechnet wird bis zur ersten Aufstellung unter dieser Schwelle. */
function planPackages(villages, P0, passive) {
  let best, perK = null;
  if (P0.pkgCount) best = bestForK(villages, P0, 0, P0.pkgCount);
  else {
    perK = [];
    for (let k = 1; k <= K_MAX; k++) {
      const o = bestForK(villages, P0, k, best ? best.n || 1 : 3);
      if (!o || !o.cur) { if (!best) best = o; break; }
      perK.push(o);
      if (best && o.coins < best.coins * (1 + P0.minGainPct / 100) - 1e-9) break;
      best = o;
    }
  }
  if (!best || !best.cur) return best ? best.R : plan(villages, P0);
  const R = best.R, P = R.P, src = R.src, sites = best.sites;
  R.recommend = best.k;
  packageCurve(src, best.Pc, sites, true, best.cur);
  const cv = refine(src, P, sites, best.cur, best.m);
  const chosen = Math.min(P0.pkgCount || cv.optimal, cv.curve.length - 1);
  const pos = cv.curve[chosen].pos;
  R.pkg = Object.assign({}, cv, {chosen, pos, grid: best.m,
    detail: scheduleDetails(src, P, sites, pos, prepare(passive || [], P)),
    configCoins: R.configs.map(c => lockstep(src, P, c.sites, toCnt(pos, cv.K)).coins),
    perK: perK && perK.map(o => ({k: o.k, n: o.n, coins: o.coins, sites: o.sites.map(i => o.R.src[i])}))});
  return R;
}

const api = {RES, MERCHANTS, STORAGE, FLAG_PCT, DOUBLER_HOURS, DECREE_HOURS, DECREE_PCT, LADDER, LONG_HORIZON,
             WORLD_DEFAULT, K_MAX, storageCap, merchantsAt, baseProd, parseOverview, prodFactorFrom, params, reduction,
             coinPrice, prepare, dist, travelHours, simulate, Planner, details, plan, ladderStep, requiredInterval,
             MAX_PER_CLICK, N_MAX, maxPerClick, lastClick, villageRun, siteRun, lockstep, packageValue, lastUsefulClick,
             toCnt, evenSchedule, improveSchedule, packageCurve, scheduleDetails, coarse, refine, bestForK, planPackages};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.Praegen = api;
})(typeof window !== "undefined" ? window : globalThis);
