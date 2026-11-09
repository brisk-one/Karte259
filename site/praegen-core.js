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

/* ---------- Produktionsübersicht einlesen (10.16, Dennis 3b am 08.11.2026) ----------
   Übersichten > Produktion, kopiert mit Strg+A. Je Dorf nach (x|y) K..: Punkte, Holz, Lehm, Eisen, Speicher,
   Händler (frei/gesamt), Bauernhof. Ein Dorf darf über mehrere Zeilen laufen; alles bis zum nächsten Dorf gehört
   dazu. Gesucht werden vier Zahlen hintereinander, deren letzte (Speicher) mindestens so groß ist wie die drei
   davor; die Gebäudeübersicht (viele kleine Stufen) wird so nicht als Lagerstand gelesen.
   Ergebnis: {lager: {"x|y": {wood, stone, iron, storage}}, count}. */
function parseLager(text) {
  const t = String(text || ""), re = /\((\d{1,3})\|(\d{1,3})\)\s*K\d{1,3}/g, hits = [];
  let m;
  while ((m = re.exec(t))) hits.push({key: +m[1] + "|" + +m[2], at: m.index, from: m.index + m[0].length});
  const lager = {};
  hits.forEach((h, j) => {
    // bis zum Anfang der Zeile des nächsten Dorfes, damit dessen Name nicht mitgelesen wird
    const end = j + 1 < hits.length ? Math.max(h.from, t.lastIndexOf("\n", hits[j + 1].at)) : t.length;
    const seg = t.slice(h.from, end);
    const nums = (seg.match(/(?:^|[\s(])(\d{1,3}(?:\.\d{3})+|\d+)(?=$|[\s)])/g) || [])
      .map(x => parseInt(x.replace(/[\s(.]/g, ""), 10)).filter(x => !isNaN(x));
    // zuerst nach den Punkten suchen, dann ohne Punkte
    for (const i of [1, 0, 2]) {
      if (i + 3 >= nums.length) continue;
      const [a, b, c, S] = nums.slice(i, i + 4);
      if (S >= 1000 && S <= 5e6 && a <= S && b <= S && c <= S) {
        if (!lager[h.key]) lager[h.key] = {wood: a, stone: b, iron: c, storage: S};
        break;
      }
    }
  });
  return {lager, count: Object.keys(lager).length};
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
    mode: input.mode === "pct" ? "pct" : "max",          // pct: Prozentpunkte vorgeben, max: Pakete maximieren
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
    // 10.15, Dennis 1a (07.11.2026): Lieferdörfer mit Adelshof prägen, was beim Einlösen überlaufen würde
    mintLocal: !!input.mintLocal,
    pkgSize: +input.pkgSize > 0 ? Math.min(100, +input.pkgSize) : 30,        // Größe eines Pakets in %
    pkgCount: +input.pkgCount > 0 ? Math.round(+input.pkgCount) : null,      // null: automatisch optimal
    // Zahl der Flaggendoppler vorgegeben (Dennis 1b, 29.10.2026), nur bei „Rohstoffpakete maximieren“; null: automatisch
    fdCount: input.mode !== "pct" && +input.fdCount >= 1 ? Math.min(3, Math.round(+input.fdCount)) : null,
    optThreshold: Math.max(0, +(input.optThreshold != null ? input.optThreshold : 90)),
    maxThreshold: 5,
    // Überlauf höchstens … % der Paket-Rohstoffe (10.11). Ohne Angabe 100 %, also keine Grenze wie bis v0.5;
    // die Seite schickt ihren Startwert 1 %.
    maxOverflow: input.maxOverflow != null && input.maxOverflow !== "" && isFinite(+input.maxOverflow)
      ? Math.max(0, Math.min(100, +input.maxOverflow)) : 100,

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
  let shipped = 0, coins = 0, minted = 0, inTime = 0, doneAt = pkgUnits <= EPS ? 0 : Infinity, lastArrival = 0;
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
      if (ta <= P.window + EPS) { coins += units / (1 - reduction(ta, P)); minted += units; }
      if (pkgPart > 0 && ta <= P.deadline + EPS) inTime += pkgPart;
      if (ta > lastArrival) lastArrival = ta;
      if (arrivals) arrivals.push([ta, pkgPart, units]);
    }
    if (t >= P.window && shipped >= pkgUnits - 1e-7) break;   // Pakete weg, Prägezeit vorbei
  }
  return {tau, pkgUnits, inTime, coins, minted, doneAt, shipped, arrivals};
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
  let coins = 0, minted = 0, pkg = 0, inTime = 0, doneAt = 0, spread = 0;
  for (let i = 0; i < this.n; i++) {
    const r = this.get(i, this.assign(i, sites));
    coins += r.coins; minted += r.minted; pkg += r.pkgUnits; inTime += r.inTime; spread += r.pkgUnits * r.tau;
    if (r.doneAt > doneAt) doneAt = r.doneAt;
  }
  return {sites, coins, minted, pkg, inTime, share: pkg > EPS ? inTime / pkg : 1, doneAt, spread};
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
  let recommend = 1, frei = true;
  for (let k = 2; k <= K_MAX && k <= candsK.length; k++) {
    const prev = configs[k - 2];
    const next = pl.bestK(candsK, k, prev.sites);
    if (!next) break;
    next.needsSnob = ah.length < k;
    next.gainPct = (next.coins / prev.coins - 1) * 100;
    configs.push(next);
    const stop = prev.share >= 1 - 1e-6 || next.gainPct < P.minGainPct - 1e-9;
    if (stop) frei = false;
    if (frei) recommend = k;
    if (stop && k >= (P.fdCount || 0)) break;          // bei Vorgabe mindestens bis zu dieser Zahl rechnen
  }
  if (P.fdCount) recommend = Math.min(P.fdCount, configs.length);
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
   ovClick (optional) sammelt den Überlauf je Klick.
   acc (optional, 10.14) sammelt je Rohstoff [Holz, Lehm, Eisen]: ov Überlauf beim Einlösen, arr bis zur Frist
   (P.deadline) im Prägedorf angekommen, lok im Dorf selbst geprägt.
   P.mintLocal (10.15, Dennis 1a): Hat das Lieferdorf einen Adelshof, prägt es beim Einlösen im Prägeverhältnis,
   was sonst überlaufen würde, zum Grundpreis (vorsichtig: ohne eigene Flagge und ohne Erlass). Das ist der
   kleinste Wert über die drei Rohstoffe, der Rest läuft weiter über. lokal: so geprägte Münzen. */
const ST = new Float64Array(3), QT = [], QN = [];
function villageRun(s, tau, P, cnt, M, sink, send, ovClick, acc) {
  const T = P.interval, C = P.carry, cw = P.coin.wood, cs = P.coin.stone, ci = P.coin.iron, cap = s.cap;
  const add1 = P.pkgSize / 100 * cap, start = Math.min(cap, cap * P.startPct / 100);
  const p0 = s.prod.wood * T, p1 = s.prod.stone * T, p2 = s.prod.iron * T;
  // 10.16: Vorrat aus dem Tausch vor dem Start (s.vorab = [Holz, Lehm, Eisen] zusätzlich zum Startbestand)
  const vb = s.vorab;
  let w = vb ? Math.min(cap, start + vb[0]) : start, st = vb ? Math.min(cap, start + vb[1]) : start, ir = vb ? Math.min(cap, start + vb[2]) : start;
  let qh = 0, qn = 0, busy = 0, overflow = 0, pkgRes = 0, lokal = 0;
  const lok = P.mintLocal && s.snob && send !== false;
  for (let k = 0; k < cnt.length; k++) {
    const t = k * T;
    if (k > 0) { w = Math.min(cap, w + p0); st = Math.min(cap, st + p1); ir = Math.min(cap, ir + p2); }
    const n = cnt[k];
    if (n) {
      const add = n * add1;
      pkgRes += 3 * add;
      let ov = 0;
      if (lok) {
        const u = Math.min(Math.max(0, w + add - cap) / cw, Math.max(0, st + add - cap) / cs, Math.max(0, ir + add - cap) / ci);
        if (u > EPS) {
          w -= u * cw; st -= u * cs; ir -= u * ci; lokal += u;
          if (acc) { acc.lok[0] += u * cw; acc.lok[1] += u * cs; acc.lok[2] += u * ci; }
        }
      }
      w += add; if (w > cap) { ov += w - cap; if (acc) acc.ov[0] += w - cap; w = cap; }
      st += add; if (st > cap) { ov += st - cap; if (acc) acc.ov[1] += st - cap; st = cap; }
      ir += add; if (ir > cap) { ov += ir - cap; if (acc) acc.ov[2] += ir - cap; ir = cap; }
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
    if (acc && t + tau <= P.deadline + EPS) { acc.arr[0] += a0; acc.arr[1] += a1; acc.arr[2] += a2; }
  }
  return {overflow, pkgRes, lokal};
}

/* Prägedorf: eigene Klicks (Produktion, Pakete) und Ankünfte in zeitlicher Folge (Fächer je Klickabstand),
   sofort prägen, was im Prägeverhältnis da ist. bins[k] = Ankünfte im Abstand [kT, (k+1)T).
   acc (optional, 10.14): arr eigene Pakete und Produktion bis zur Frist, sov Überschuss je Rohstoff, der nach dem
   Prägen über den Speicher geht (meist Holz und Eisen, weil Lehm das Prägen begrenzt). */
function siteRun(s, P, cnt, bins, acc) {
  const T = P.interval, cw = P.coin.wood, cs = P.coin.stone, ci = P.coin.iron, cap = s.cap;
  // s.leer (10.17): fremdes Dorf nur als Empfänger, ohne eigene Pakete und ohne Startbestand
  const add1 = s.leer ? 0 : P.pkgSize / 100 * cap, start = s.leer ? 0 : Math.min(cap, cap * P.startPct / 100);
  const vb = s.vorab;                                                      // 10.16, wie in villageRun
  let w = vb ? Math.min(cap, start + vb[0]) : start, st = vb ? Math.min(cap, start + vb[1]) : start, ir = vb ? Math.min(cap, start + vb[2]) : start;
  let coins = 0, minted = 0, pkgRes = 0;
  const mint = t => {
    const u = Math.min(w / cw, st / cs, ir / ci);
    if (u > EPS && t <= P.window + EPS) { coins += u / (1 - reduction(t, P)); minted += u; w -= u * cw; st -= u * cs; ir -= u * ci; }
    if (w > cap) { if (acc) acc.sov[0] += w - cap; w = cap; }
    if (st > cap) { if (acc) acc.sov[1] += st - cap; st = cap; }
    if (ir > cap) { if (acc) acc.sov[2] += ir - cap; ir = cap; }
  };
  const K = cnt.length;
  for (let k = 0; k <= K; k++) {
    if (k < K) {
      const add = cnt[k] * add1;
      pkgRes += 3 * add;
      const q0 = (k > 0 ? s.prod.wood * T : 0) + add, q1 = (k > 0 ? s.prod.stone * T : 0) + add, q2 = (k > 0 ? s.prod.iron * T : 0) + add;
      w += q0; st += q1; ir += q2;
      if (acc && k * T <= P.deadline + EPS) { acc.arr[0] += q0; acc.arr[1] += q1; acc.arr[2] += q2; }
      mint(k * T);
    }
    const b = bins && bins[k];
    if (b) for (let j = 0; j < b.length; j += 4) { w += b[j + 1]; st += b[j + 2]; ir += b[j + 3]; mint(b[j]); }
  }
  return {coins, pkgRes, minted};
}

/* Rohstoffmengen eines Zeitplans (10.14, Wunsch Dennis 07.11.2026), je Rohstoff [Holz, Lehm, Eisen]:
   G Paket-Rohstoffe, O Überlauf beim Einlösen (Lieferdörfer), A rechtzeitig angekommen, N nicht rechtzeitig,
   S Rest (nicht prägbarer Überschuss, der im Dorf bleibt), sov Überschuss im Prägedorf nach dem Prägen,
   L im Lieferdorf mit Adelshof geprägt statt übergelaufen (10.15, P.mintLocal).
   Pakete gelten wie in der einfachen Rechnung als zuerst verschickt. Im Prägeverhältnis zählt nur die prägbare
   Paketmenge (Münzeinheiten, meist von Lehm begrenzt) als rechtzeitig oder nicht rechtzeitig, umgerechnet mit den
   Münzkosten; mit P.ignoreRatio je Rohstoff direkt. share = A ÷ (A + N). */
function mengenNeu() { return {G: [0, 0, 0], O: [0, 0, 0], L: [0, 0, 0], A: [0, 0, 0], N: [0, 0, 0], S: [0, 0, 0], sov: [0, 0, 0]}; }
function mengenDorf(m, P, pkgEach, ov, arr, lok) {
  const c = COIN(P), l = lok || [0, 0, 0];
  for (let r = 0; r < 3; r++) { m.G[r] += pkgEach; m.O[r] += ov[r]; m.L[r] += l[r]; }
  if (P.ignoreRatio) {
    for (let r = 0; r < 3; r++) {
      const eff = Math.max(0, pkgEach - ov[r] - l[r]), a = Math.min(eff, arr[r]);
      m.A[r] += a; m.N[r] += eff - a;
    }
  } else {
    let eff = Infinity, an = Infinity;
    for (let r = 0; r < 3; r++) { eff = Math.min(eff, Math.max(0, pkgEach - ov[r] - l[r]) / c[r]); an = Math.min(an, arr[r] / c[r]); }
    const a = Math.min(eff, an);
    for (let r = 0; r < 3; r++) { m.A[r] += a * c[r]; m.N[r] += (eff - a) * c[r]; }
  }
}
function mengenFertig(m) {
  for (let r = 0; r < 3; r++) m.S[r] = Math.max(0, m.G[r] - m.O[r] - m.L[r] - m.A[r] - m.N[r]);
  const sum = v => v[0] + v[1] + v[2], a = sum(m.A), n = sum(m.N);
  m.share = a + n > EPS ? a / (a + n) : 1;
  return m;
}
/* Dieselben Mengen aus der einfachen Rechnung (Berechnung 1, Dennis 1a am 07.11.2026): alle Pakete bei 0 h, ohne
   Speichergrenze, deshalb ohne Überlauf. r: Ergebnis von Planner.evaluate (pkg und inTime in Münzeinheiten). */
function mengenEinfach(src, r, P) {
  const m = mengenNeu(), c = P.ignoreRatio ? [P.unitRes / 3, P.unitRes / 3, P.unitRes / 3] : COIN(P);
  src.forEach(s => { m.G[0] += s.pkg.wood; m.G[1] += s.pkg.stone; m.G[2] += s.pkg.iron; });
  const a = Math.max(0, r.inTime), n = Math.max(0, r.pkg - r.inTime);
  for (let k = 0; k < 3; k++) { m.A[k] = a * c[k]; m.N[k] = n * c[k]; }
  return mengenFertig(m);
}
/* Rohstoffe zu Münzeinheiten, je Rohstoff [Holz, Lehm, Eisen]; für den Mehrertrag in der Begründung (10.14). */
const rohstoffeAus = (units, P) => COIN(P).map(c => units * c);
/* ---------- Tausch vor dem Start (10.16, Wunsch Dennis 08.11.2026, Entscheidung 1a, 2a, 3b) ----------
   Münzen kosten mehr Lehm als Holz und Eisen, deshalb bleibt Eisen (und etwas Holz) liegen. Wer vor dem Start
   Eisen gegen Lehm und Holz tauscht und mit diesem Vorrat beginnt, verschickt das übrige Eisen mit.
   Je Dorf wird der Vorrat an Lehm und Holz (0 bis 100 % des Speichers, erst in 10-%-, dann in 2,5-%-Schritten)
   mit den meisten Münzen gesucht, bei dem das Dorf nicht mehr überläuft als ohne Vorrat; bei gleichen Münzen der
   kleinere Vorrat. Zeitplan der Pakete bleibt. Im Prägeverhältnis rechnet jedes Dorf für sich (Lieferdörfer
   beeinflussen sich nicht); mit „Verhältnis ignorieren“ gleicht erst das Prägedorf aus, deshalb wird dort mit der
   ganzen Rechnung gesucht: ein gemeinsamer Anteil für alle Lieferdörfer ohne Überlauf, dann je Prägedorf.
   Ergebnis: dorf [{i, vorab: [Holz, Lehm, 0], plus}], coins0/1, units0/1, rest0/1 (liegen gebliebene Rohstoffe
   je Rohstoff vor und nach dem Tausch), ov0/1. */
function vorabTausch(src, P, sites, cnt) {
  const base = lockstep(src, P, sites, cnt, true), {site, tau} = src._ls, isSite = new Set(sites);
  const sink = acc => (ta, a0) => { acc.c += a0 / P.coin.wood / (1 - reduction(ta, P)); acc.u += a0 / P.coin.wood; };
  const one = i => {
    if (isSite.has(i)) { const r = siteRun(src[i], P, cnt, null); return {c: r.coins, ov: 0, u: r.minted}; }
    const acc = {c: 0, u: 0}, r = villageRun(src[i], tau[i], P, cnt, src[i].merchants, sink(acc), true, null, null);
    return {c: acc.c + r.lokal, ov: r.overflow, u: acc.u + r.lokal};
  };
  const all = () => { const r = lockstep(src, P, sites, cnt, false); return {c: r.coins, ov: r.ov, u: r.units}; };
  // nur so viel tauschen, wie danach auch geprägt wird: mindestens 90 % des Vorrats an Lehm und an Holz
  const genutzt = (e, b, holz, lehm) => (e.u - b.u) * P.coin.stone >= 0.9 * lehm - 1 && (e.u - b.u) * P.coin.wood >= 0.9 * holz - 1;
  const suche = (i, evalf, ovMax) => {
    const s = src[i], b = evalf();
    let best = {f: 0, g: 0, c: b.c};
    const probe = (f, g) => {
      if (f < -EPS || g < -EPS || f > 1 + EPS || g > 1 + EPS) return;
      s.vorab = [g * s.cap, f * s.cap, 0];
      const e = evalf();
      if (e.ov > ovMax(b) + 1e-6 || !genutzt(e, b, g * s.cap, f * s.cap)) return;
      if (e.c > best.c + 0.25 || (Math.abs(e.c - best.c) <= 0.25 && f + g < best.f + best.g)) best = {f, g, c: e.c};
    };
    for (let f = 0; f <= 1 + EPS; f += 0.1) for (let g = 0; g <= 1 + EPS; g += 0.1) probe(f, g);
    const f0 = best.f, g0 = best.g;
    for (let df = -0.075; df <= 0.075 + EPS; df += 0.025) for (let dg = -0.075; dg <= 0.075 + EPS; dg += 0.025) probe(f0 + df, g0 + dg);
    s.vorab = null;
    return best.c > b.c + 0.5 ? {i, vorab: [best.g * s.cap, best.f * s.cap, 0], plus: best.c - b.c, site: isSite.has(i)} : null;
  };
  const dorf = [];
  if (!P.ignoreRatio) src.forEach((s, i) => { const d = suche(i, () => one(i), b => b.ov + 1); if (d) dorf.push(d); });
  else {
    // Lieferdörfer ohne Überlauf mit gleichem Anteil (die ganze Rechnung je Dorf wäre zu langsam), danach die
    // Prägedörfer einzeln; die Mehrmünzen der Lieferdörfer werden nach ihrem Vorrat aufgeteilt
    const kand = src.map((_, i) => i).filter(i => !isSite.has(i) && base.overflow[i] <= 1);
    const capSum = kand.reduce((a, i) => a + src[i].cap, 0);
    const setze = (f, g) => kand.forEach(i => { src[i].vorab = f + g > 0 ? [g * src[i].cap, f * src[i].cap, 0] : null; });
    let bu = {f: 0, g: 0, c: base.coins};
    const b0 = {u: base.units};
    for (let f = 0; f <= 1 + EPS; f += 0.1) for (let g = 0; g <= 1 + EPS; g += 0.1) {
      setze(f, g);
      const e = all();
      if (e.ov <= base.ov + 1e-6 && genutzt(e, b0, g * capSum, f * capSum) && (e.c > bu.c + 0.25 || (Math.abs(e.c - bu.c) <= 0.25 && f + g < bu.f + bu.g))) bu = {f, g, c: e.c};
    }
    if (bu.c <= base.coins + 0.5) bu = {f: 0, g: 0, c: base.coins};
    setze(bu.f, bu.g);
    if (bu.f + bu.g > 0) kand.forEach(i => dorf.push({i, vorab: src[i].vorab, plus: (bu.c - base.coins) * src[i].cap / capSum, site: false}));
    for (const j of sites) {
      const d = suche(j, all, b => b.ov);
      if (d) { dorf.push(d); src[j].vorab = d.vorab; }
    }
  }
  dorf.forEach(d => { src[d.i].vorab = d.vorab; });
  const after = lockstep(src, P, sites, cnt, true);
  src.forEach(s => { s.vorab = null; });
  const z = [0, 1, 2].map(r => dorf.reduce((a, d) => a + d.vorab[r], 0)), du = after.units - base.units;
  const rest0 = [0, 1, 2].map(r => base.mengen.S[r] + (P.ignoreRatio ? base.mengen.sov[r] : 0));
  const rest1 = rest0.map((v, r) => Math.max(0, v + z[r] - du * COIN(P)[r]));
  return {dorf, coins0: base.coins, coins1: after.coins, units0: base.units, units1: after.units, ov0: base.ov, ov1: after.ov,
          vorab: z, rest0, rest1};
}

/* ---------- Handelsrouten im Account-Manager (10.18, Wunsch Dennis 09.11.2026; 1c, 2a, 3a) ----------
   Statt „Rohstoffe anfordern“ verschickt jedes Lieferdorf einer Gruppe in festem Abstand eine feste Menge an das
   Prägedorf, die ganzen 48 h (1c). Annahmen zur Spielmechanik (laut Dennis, Mechanik noch nicht belegt): eine
   Route mit einer Gruppe als Start lässt jedes Dorf der Gruppe schicken; Wiederholung in festem Abstand ab dem
   Start. Belegt (Hilfe-Wiki Markt-Manager): geschickt wird nur, wenn genug Rohstoffe und Händler da sind, sonst
   fällt die Lieferung aus. Pakete werden weiter von Hand nach dem Zeitplan eingelöst.
   routeRun: ein Lieferdorf mit Menge a = [Holz, Lehm, Eisen] alle dt Stunden, erste Lieferung beim Start. */
function routeRun(s, tau, P, cnt, a, dt, sink) {
  const T = P.interval, C = P.carry, cap = s.cap, M = s.merchants, K = cnt.length;
  const add1 = P.pkgSize / 100 * cap, start = Math.min(cap, cap * P.startPct / 100);
  const pr = [s.prod.wood, s.prod.stone, s.prod.iron], vb = s.vorab;
  const x = [0, 1, 2].map(r => vb ? Math.min(cap, start + vb[r]) : start);
  const need = Math.ceil((a[0] + a[1] + a[2]) / C - 1e-7);
  const qT = [], qN = [];
  let qh = 0, busy = 0, overflow = 0, pkgRes = 0, sent = 0, skipped = 0, tLast = 0, k = 0, j = 0;
  for (;;) {
    const tk = k < K ? k * T : Infinity, tj = j * dt, tr = tj + tau <= P.window + EPS ? tj : Infinity;
    const t = Math.min(tk, tr);
    if (t === Infinity) break;
    const d = t - tLast;
    if (d > 0) { for (let r = 0; r < 3; r++) x[r] = Math.min(cap, x[r] + pr[r] * d); tLast = t; }
    if (tk <= tr) {                                                         // Pakete vor der Lieferung
      const n = cnt[k];
      if (n) {
        const add = n * add1;
        pkgRes += 3 * add;
        for (let r = 0; r < 3; r++) { x[r] += add; if (x[r] > cap) { overflow += x[r] - cap; x[r] = cap; } }
      }
      k++;
    } else {
      while (qh < qT.length && qT[qh] <= t + EPS) { busy -= qN[qh]; qh++; }
      if (M - busy >= need && x[0] >= a[0] - 1e-6 && x[1] >= a[1] - 1e-6 && x[2] >= a[2] - 1e-6) {
        for (let r = 0; r < 3; r++) x[r] -= a[r];
        busy += need; qT.push(t + 2 * tau); qN.push(need); sent++;
        if (sink) sink(t + tau, a[0], a[1], a[2]);
      } else skipped++;
      j++;
    }
  }
  return {overflow, pkgRes, sent, skipped};
}
// Menge je Lieferung für n Händler: volle Händlerlast im Prägeverhältnis, auf 100 abgerundet
function routeMenge(n, P) {
  const tot = n * P.carry, c = COIN(P), u = P.unitRes;
  return c.map(x => Math.floor(tot * x / u / 100) * 100);
}
// Abstände in Stunden: ab 10 Minuten (Hinweis Dennis 09.11.2026 16:42: auch kurze Abstände wie 10 Minuten sind möglich)
const ROUTE_DT = [1 / 6, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 6];
const ROUTE_N = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 235];
/* Beste Routen für 1 bis rMax Routen. Je Lieferdorf, Abstand und Händlerzahl die Münzen aus den Lieferungen
   (Dörfer rechnen im Prägeverhältnis unabhängig voneinander); eine Route ist (Prägedorf, Abstand, Händlerzahl),
   jedes Dorf kommt in die Route seines Prägedorfs, die ihm am meisten bringt. Auswahl je Routenzahl gierig, dann
   Tausch einzelner Routen, solange es besser wird. */
function routenPlan(src, P, sites, cnt, rMax, nurDt) {
  const base = lockstep(src, P, sites, cnt, false), {site, tau} = src._ls;
  const cands = [];
  for (const j of sites) for (const dt of (nurDt || ROUTE_DT)) for (const n of ROUTE_N) cands.push({site: j, dt, n, a: routeMenge(n, P)});
  const lief = src.map((_, i) => i).filter(i => site[i] !== i);
  const val = new Map(), ovv = new Map(), info = new Map();
  let ov0 = 0, pkSum = 0, eigen = 0;
  for (const j of sites) { const r = siteRun(src[j], P, cnt, null); eigen += r.coins; pkSum += r.pkgRes; }
  const leer = new Map();
  for (const i of lief) {
    const r0 = villageRun(src[i], tau[i], P, cnt, 0, null, false);              // ohne Route: nur Pakete, kein Versand
    leer.set(i, r0.overflow); ov0 += r0.overflow; pkSum += r0.pkgRes;
    const v = new Float64Array(cands.length), o = new Float64Array(cands.length), sk = new Int16Array(cands.length);
    cands.forEach((c, ci) => {
      if (c.site !== site[i] || c.n > src[i].merchants) { v[ci] = -1; return; }
      let coins = 0;
      const r = routeRun(src[i], tau[i], P, cnt, c.a, c.dt, (ta, a0, a1, a2) => {
        if (ta <= P.window + EPS) coins += Math.min(a0 / P.coin.wood, a1 / P.coin.stone, a2 / P.coin.iron) / (1 - reduction(ta, P));
      });
      v[ci] = coins; o[ci] = r.overflow; sk[ci] = r.skipped;
    });
    val.set(i, v); ovv.set(i, o); info.set(i, sk);
  }
  const wert = sel => { let s = 0; for (const i of lief) { const v = val.get(i); let b = 0; for (const ci of sel) if (v[ci] > b) b = v[ci]; s += b; } return s; };
  const out = [];
  let sel = [];
  for (let R = 1; R <= rMax; R++) {
    // gierig eine Route dazu
    let best = -1, bw = wert(sel);
    cands.forEach((_, ci) => { if (sel.includes(ci)) return; const w = wert(sel.concat([ci])); if (w > bw + 1e-9) { bw = w; best = ci; } });
    if (best < 0) break;
    sel = sel.concat([best]);
    // Tausch: jede Route gegen jede andere probieren
    for (let pass = 0; pass < 3; pass++) {
      let besser = false;
      for (let q = 0; q < sel.length; q++) cands.forEach((_, ci) => {
        if (sel.includes(ci)) return;
        const t = sel.slice(); t[q] = ci;
        const w = wert(t);
        if (w > bw + 1e-6) { bw = w; sel = t; besser = true; }
      });
      if (!besser) break;
    }
    // Ergebnis für R Routen: Dörfer den Routen zuordnen
    const routes = sel.map(ci => ({...cands[ci], dorf: [], coins: 0, skipped: 0, sends: 0}));
    let ov = 0;
    for (const i of lief) {
      const v = val.get(i); let b = 0, bq = -1;
      sel.forEach((ci, q) => { if (v[ci] > b) { b = v[ci]; bq = q; } });
      if (bq < 0) { ov += leer.get(i); continue; }
      const ci = sel[bq];
      routes[bq].dorf.push(i); routes[bq].coins += b; routes[bq].skipped += info.get(i)[ci]; ov += ovv.get(i)[ci];
    }
    routes.forEach(r => { r.sends = Math.max(0, Math.floor((P.window - 1e-9) / r.dt) + 1); });
    routes.sort((x, y) => y.coins - x.coins);
    const ohne = lief.filter(i => !routes.some(r => r.dorf.includes(i)));
    out.push({R, coins: eigen + bw, ov: pkSum > 0 ? ov / pkSum : 0, routes: routes.filter(r => r.dorf.length), ohne});
  }
  return {base: base.coins, baseOv: base.ov, eigen, plans: out};
}

/* ---------- Nächstes Prägedorf adeln (10.17, Wunsch Dennis 09.11.2026; 1: auch eigener Stamm, 2a, Top 10) ----------
   Kandidaten aus den Weltdaten der Seite (villages.json) im Rechteck um die eigenen Dörfer plus opt.rand Felder:
   Barbarendörfer, Dörfer anderer Spieler, Dörfer des eigenen Stammes (die man sich schenken lassen kann) und eigene
   Dörfer ohne Adelshof, je nach opt. Ein fremdes Dorf zählt nur als Empfänger: Adelshof gebaut, keine eigenen Pakete,
   keine Produktion (vorsichtig). Je Zahl Flaggendoppler k: bei k = 1 ist der Kandidat das Prägedorf, sonst ersetzt
   er eines der k eigenen Prägedörfer der besten eigenen Aufstellung. Vorfilter mit dem Zeitplan der Empfehlung,
   danach für die besten opt.genau Kandidaten Zeitplan und Paketzahl neu optimiert wie im Rechner.
   welt: {rows: [[x*1000+y, Spielerzeile, Punkte, Bonus, Name]], players: [[id, Name, Stamm-ID]], tags: {Stamm-ID: Kürzel}} */
function fremdeSuche(villages, P0, passive, welt, opt) {
  opt = Object.assign({rand: 8, barbaren: true, spieler: true, stamm: true, eigene: true, maxPts: 0, genau: 12, genauEigen: 3, top: 10}, opt || {});
  const melde = typeof opt.fortschritt === "function" ? opt.fortschritt : () => {};
  const R = planPackages(villages, P0, passive), P = R.P, src = R.src, pk = R.pkg;
  const Kc = lastClick(P), cnt = toCnt(pk.pos, Kc), xy = s => s.x * 1000 + s.y;
  const idx = new Map(src.map((s, i) => [xy(s), i]));
  // eigener Spieler: häufigster Besitzer der eigenen Dörfer; eigener Stamm über players
  const zahl = new Map();
  welt.rows.forEach(r => { if (idx.has(r[0]) && r[1] >= 0) zahl.set(r[1], (zahl.get(r[1]) || 0) + 1); });
  let ich = -1, best = 0;
  zahl.forEach((n, p) => { if (n > best) { best = n; ich = p; } });
  if (best < src.length / 2) ich = -1;                                       // nur, wenn die Mehrheit der Dörfer passt (z. B. nicht beim Beispiel)
  const stamm = ich >= 0 ? welt.players[ich][2] || 0 : 0;
  const xs = src.map(s => s.x), ys = src.map(s => s.y), d = opt.rand;
  const x0 = Math.min(...xs) - d, x1 = Math.max(...xs) + d, y0 = Math.min(...ys) - d, y1 = Math.max(...ys) + d;
  const kand = [];
  welt.rows.forEach(r => {
    const x = Math.floor(r[0] / 1000), y = r[0] % 1000;
    if (x < x0 || x > x1 || y < y0 || y > y1) return;
    let typ;
    if (idx.has(r[0])) { if (!opt.eigene || src[idx.get(r[0])].snob) return; typ = "eigen"; }
    else if (r[1] < 0) { if (!opt.barbaren) return; typ = "barbar"; }
    else if (stamm && welt.players[r[1]][2] === stamm) { if (!opt.stamm || r[1] === ich) return; typ = "stamm"; }
    else { if (!opt.spieler) return; typ = "spieler"; }
    if (opt.maxPts > 0 && typ !== "eigen" && r[2] > opt.maxPts) return;
    const pl = r[1] >= 0 ? welt.players[r[1]] : null;
    kand.push({x, y, name: r[4], pts: r[2], typ, wer: typ === "eigen" ? "" : pl ? pl[1] : "", tag: pl ? (welt.tags[pl[2]] || "") : ""});
  });
  const pseudo = c => ({i: src.length, name: c.name, x: c.x, y: c.y, b: {}, cap: P.ignoreRatio ? storageCap(30) : 0, merchants: 0, snob: true,
                        leer: true, pkg: {wood: 0, stone: 0, iron: 0}, prod: {wood: 0, stone: 0, iron: 0}});
  // eigene Aufstellungen je Zahl Flaggendoppler (wie im Vergleich)
  const eigen = (pk.perK || R.configs.map((c, q) => ({k: q + 1, n: pk.chosen, coins: pk.configCoins[q], sites: c.sites.map(i => src[i])})))
    .slice(0, R.configs.length).map(o => ({k: o.k, n: o.n, coins: o.coins, sites: o.sites.map(s => idx.get(xy(s)))}));
  const schritte = eigen.length * (1 + opt.genau + opt.genauEigen);
  let fertig = 0;
  const proK = eigen.map(e => {
    const alle = kand.map(c => {
      const s2 = src.concat([pseudo(c)]), j = src.length;
      let bc = -1, bst = null;
      (e.k === 1 ? [[j]] : e.sites.map((_, a) => { const st = e.sites.slice(); st[a] = j; return st; })).forEach(st => {
        const v = lockstep(s2, P, st, cnt, false).coins;
        if (v > bc) { bc = v; bst = st; }
      });
      return {c, st: bst, v: bc};
    }).sort((a, b) => b.v - a.v);
    melde(++fertig, schritte);
    // genau nachrechnen: die besten fremden und die besten eigenen Dörfer ohne Adelshof getrennt
    const genau = liste => liste.map(({c, st}) => {
      const s2 = src.concat([pseudo(c)]), cv = packageCurve(s2, P, st, false), n = P.pkgCount || cv.optimal || 0, z = cv.curve[n];
      melde(++fertig, schritte);
      const bleibt = st.filter(i => i < src.length).map(i => src[i].name);
      const ersetzt = e.k === 1 ? [] : e.sites.filter(i => !st.includes(i)).map(i => src[i].name);
      return Object.assign({}, c, {coins: z.coins, n, ov: z.ov, ok: z.ok, bleibt, ersetzt});
    }).sort((a, b) => b.coins - a.coins || a.pts - b.pts);
    const top = genau(alle.filter(x => x.c.typ !== "eigen").slice(0, opt.genau)).slice(0, opt.top);
    const eigeneTop = genau(alle.filter(x => x.c.typ === "eigen").slice(0, opt.genauEigen));
    return {k: e.k, eigen: {coins: e.coins, n: e.n, sites: e.sites.map(i => src[i].name)}, top, eigeneTop};
  });
  return {kandidaten: kand.length, stamm: stamm ? (welt.tags[stamm] || "") : "", proK};
}

/* Markttausch als Obergrenze (10.15, Dennis 2a): Der nicht prägbare Überschuss (mit „Verhältnis ignorieren“
   der Rest im Prägedorf) wird 1:1 gegen den fehlenden Rohstoff getauscht und im Prägedorf zum Flaggenpreis
   am Ende der 48 h geprägt. Nicht eingerechnet, weil unsicher: Händler müssen den Überschuss bringen und jemand
   muss die Angebote annehmen. */
function tauschObergrenze(m, P) {
  const res = [0, 1, 2].map(r => m.S[r] + (P.ignoreRatio ? m.sov[r] : 0));
  const units = (res[0] + res[1] + res[2]) / P.unitRes;
  return {res, units, coins: units / (1 - reduction(P.window, P))};
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
  const out = detail ? {overflow: new Float64Array(n), pkgRes: new Float64Array(n), lokalDorf: new Float64Array(n), ovClick: new Float64Array(K), site} : null;
  const m = detail ? mengenNeu() : null;
  let coins = 0, units = 0, ovSum = 0, pkSum = 0, lokal = 0;
  const bins = P.ignoreRatio ? new Map(sites.map(j => [j, new Array(K + 1)])) : null;
  let cur = null;
  const sinkRatio = (ta, a0) => { coins += a0 / P.coin.wood / (1 - reduction(ta, P)); units += a0 / P.coin.wood; };
  const sinkBin = (ta, a0, a1, a2) => {
    const k = Math.min(K, Math.floor(ta / P.interval + EPS));
    (cur[k] || (cur[k] = [])).push(ta, a0, a1, a2);
  };
  for (let i = 0; i < n; i++) {
    if (site[i] === i) continue;
    if (bins) cur = bins.get(site[i]);
    const acc = m ? {ov: [0, 0, 0], arr: [0, 0, 0], lok: [0, 0, 0]} : null;
    const r = villageRun(src[i], tau[i], P, cnt, src[i].merchants, bins ? sinkBin : sinkRatio, true, out && out.ovClick, acc);
    ovSum += r.overflow; pkSum += r.pkgRes;
    // im Lieferdorf geprägt (10.15): Grundpreis, eine Münze je Einheit
    if (r.lokal > 0) { coins += r.lokal; units += r.lokal; lokal += r.lokal; }
    if (out) { out.overflow[i] = r.overflow; out.pkgRes[i] = r.pkgRes; out.lokalDorf[i] = r.lokal; }
    if (m) mengenDorf(m, P, r.pkgRes / 3, acc.ov, acc.arr, acc.lok);
  }
  for (const j of sites) {
    const acc = m ? {arr: [0, 0, 0], sov: m.sov} : null;
    const r = siteRun(src[j], P, cnt, bins ? bins.get(j) : null, acc);
    coins += r.coins; units += r.minted; pkSum += r.pkgRes;
    if (out) out.pkgRes[j] = r.pkgRes;
    if (m) mengenDorf(m, P, r.pkgRes / 3, [0, 0, 0], acc.arr);
  }
  const ov = pkSum > 0 ? ovSum / pkSum : 0;
  if (out) { out.coins = coins; out.units = units; out.lokal = lokal; out.ov = ov; out.mengen = mengenFertig(m); return out; }
  return {coins, ov, units, lokal};
}

/* Höchstwert eines Pakets: Paketgröße × Summe der Speicher, in Münzen zum Flaggenpreis (Flagge verdoppelt). */
function packageValue(src, P) {
  const capSum = src.reduce((a, s) => a + (s.leer ? 0 : s.cap), 0);
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

/* Bewertung eines Zeitplans nach der Überlaufgrenze (10.11), lexikographisch: zulässig (Überlauf höchstens
   P.maxOverflow %) vor unzulässig; unter zulässigen mehr Münzen, unter unzulässigen weniger Überlauf. Mit Grenze
   100 % ist jeder Plan zulässig und es zählen nur die Münzen wie bis v0.5. */
const zulaessig = (r, P) => r.ov * 100 <= P.maxOverflow + 1e-9;
function besser(a, b, P, eps = 1e-6) {
  const za = zulaessig(a, P), zb = zulaessig(b, P);
  if (za !== zb) return za;
  if (za) return a.coins > b.coins + eps;
  return a.ov < b.ov - 1e-9 || (Math.abs(a.ov - b.ov) <= 1e-9 && a.coins > b.coins + eps);
}

/* Einzelne Pakete um 1 bis 3 Klicks verschieben, solange der Plan besser wird. Ist er danach noch unzulässig,
   darf ein Paket an jeden Klick wandern (10.11), danach wieder die kurzen Schritte. */
function improveSchedule(pos, evalFn0, K, maxPer, rounds, P, nurKurz) {
  // auch in der alten Form aufrufbar: evalFn liefert nur Münzen, ohne P keine Grenze
  const evalFn = c => { const v = evalFn0(c); return typeof v === "number" ? {coins: v, ov: 0} : v; };
  P = P || {maxOverflow: 100};
  pos = pos.slice();
  const c = toCnt(pos, K);
  let best = evalFn(c);
  const lauf = (weit, maxRounds) => {
    for (let round = 0; round < maxRounds; round++) {
      let changed = false;
      for (let j = 0; j < pos.length; j++) {
        const ziele = weit ? Array.from({length: K + 1}, (_, k) => k - pos[j]).filter(d => d) : [-1, 1, -2, 2, -3, 3];
        let wahl = null;
        for (const d of ziele) {
          const k = pos[j] + d;
          if (k < 0 || k > K || c[k] >= maxPer) continue;
          c[pos[j]]--; c[k]++;
          const v = evalFn(c);
          c[k]--; c[pos[j]]++;
          if (besser(v, wahl ? wahl.v : best, P)) { wahl = {v, k}; if (!weit) break; }
        }
        if (wahl) { c[pos[j]]--; c[wahl.k]++; pos[j] = wahl.k; best = wahl.v; changed = true; }
      }
      if (!changed) break;
    }
  };
  lauf(false, rounds || 8);
  if (!nurKurz && !zulaessig(best, P)) { lauf(true, 3); lauf(false, rounds || 8); }
  return {pos: pos.sort((a, b) => a - b), coins: best.coins, ov: best.ov};
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
  const evalFn = c => lockstep(src, P, sites, c);
  const r0 = evalFn(toCnt([], K));
  const cv = state || {curve: [{n: 0, pos: [], coins: r0.coins, ov: r0.ov, ok: zulaessig(r0, P), gain: null}], optimal: null, maximal: null,
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
      if (!warm || besser(v, warm, P, 0)) warm = {pos: prev.pos.concat([k]).sort((a, b) => a - b), coins: v.coins, ov: v.ov};
    }
    let best = warm || {pos: prev.pos, coins: prev.coins, ov: prev.ov};
    if (full) {
      const a = improveSchedule(evenSchedule(N, cv.L, K, maxPer), evalFn, K, maxPer, 4, P, true);
      const b = warm ? improveSchedule(warm.pos, evalFn, K, maxPer, 2, P, true) : a;
      best = besser(b, a, P, 0) ? b : a;           // ohne Toleranz wie bis v0.5
      // weite Verschiebungen nur, wenn beide Starts über der Grenze bleiben, und nur am besseren
      if (!zulaessig(best, P)) best = improveSchedule(best.pos, evalFn, K, maxPer, 2, P);
    }
    const gain = (best.coins - prev.coins) / cv.value, ok = zulaessig(best, P);
    cv.curve.push({n: N, pos: best.pos, coins: best.coins, ov: best.ov, ok, gain, full});
    // optimal und maximal nur mit zulässigem Plan (10.11): ein unzulässiges N beendet beide
    if (cv.optimal == null && (!ok || gain < P.optThreshold / 100 - 1e-9)) cv.optimal = N - 1;
    if (cv.maximal == null && (!ok || gain < P.maxThreshold / 100 - 1e-9)) cv.maximal = N - 1;
  }
  if (untilMax && cv.maximal == null) cv.maximal = cv.curve.length - 1;
  if (cv.optimal == null) cv.optimal = cv.curve.length - 1;
  return cv;
}

/* Einzelheiten zum gewählten Zeitplan: Tabelle je Einlöseklick, Überlauf je Dorf, Dörfer, die den Takt begrenzen
   (Überlauf über 1 % ihrer Paketmenge) mit der Marktstufe, ab der sie nicht mehr überlaufen. */
function scheduleDetails(src, P, sites, pos, passive) {
  const K = lastClick(P), cnt = toCnt(pos, K);
  const vorab = vorabTausch(src, P, sites, cnt);                           // 10.16
  const routen = routenPlan(src, P, sites, cnt, 8);                          // 10.18
  const r = lockstep(src, P, sites, cnt, true);
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
  const lokalDorf = [];
  src.forEach((s, i) => { if (r.lokalDorf[i] > EPS) lokalDorf.push({i, coins: r.lokalDorf[i]}); });
  lokalDorf.sort((a, b) => b.coins - a.coins);
  return {coins: r.coins, units: r.units, lokal: r.lokal, lokalDorf, mengen: r.mengen, vorab, routen, cnt, rows, overflow: r.overflow, pkgRes: r.pkgRes, limiting, passive: pas,
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
  const K = lastClick(P), evalFn = pos => lockstep(src, P, sites, toCnt(pos, K));
  const curve = cv.curve.map(x => { const pos = x.pos.map(k => k * m), r = evalFn(pos);
    return {n: x.n, pos, coins: r.coins, ov: r.ov, ok: zulaessig(r, P), gain: null, full: x.full}; });
  let optimal = null, maximal = null;
  for (let n = 1; n < curve.length; n++) {
    curve[n].gain = (curve[n].coins - curve[n - 1].coins) / cv.value;
    if (optimal == null && (!curve[n].ok || curve[n].gain < P.optThreshold / 100 - 1e-9)) optimal = n - 1;
    if (maximal == null && (!curve[n].ok || curve[n].gain < P.maxThreshold / 100 - 1e-9)) maximal = n - 1;
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
  if (P0.pkgCount) best = bestForK(villages, P0, P0.fdCount || 0, P0.pkgCount);
  else {
    // automatisch: weiterer Flaggendoppler ab Mehrertrag; vorgegebene Zahl (fdCount): genau bis dorthin
    perK = [];
    for (let k = 1; k <= (P0.fdCount || K_MAX); k++) {
      const o = bestForK(villages, P0, k, best ? best.n || 1 : 3);
      if (!o || !o.cur) { if (!best) best = o; break; }
      perK.push(o);
      if (!P0.fdCount && best && o.coins < best.coins * (1 + P0.minGainPct / 100) - 1e-9) break;
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
  R.pkg = Object.assign({}, cv, {chosen, pos, grid: best.m, grenze: grenzeInfo(cv, chosen, P),
    detail: scheduleDetails(src, P, sites, pos, prepare(passive || [], P)),
    perK: perK && perK.map(o => {
      // je Aufstellung mit ihrer eigenen Paketzahl und ihrem Zeitplan: Mengen für Vergleich und Begründung (10.14)
      const pos = o.cv.curve[o.n].pos, d = lockstep(o.R.src, o.R.P, o.sites, toCnt(pos, o.cv.K), true);
      return {k: o.k, n: o.n, coins: o.coins, units: d.units, lokal: d.lokal, mengen: d.mengen, sites: o.sites.map(i => o.R.src[i])};
    })});
  // feste Paketzahl: alle Aufstellungen mit demselben Zeitplan
  const cfg = R.configs.map(c => lockstep(src, P, c.sites, toCnt(pos, cv.K), true));
  R.pkg.configCoins = cfg.map(d => d.coins);
  R.pkg.configUnits = cfg.map(d => d.units);
  R.pkg.configMengen = cfg.map(d => d.mengen);
  R.pkg.configLokal = cfg.map(d => d.lokal);
  if (R.src) delete R.src._ls;
  return R;
}

/* Neue Adelsgeschlechter aus Münzen (Dennis 29.10.2026, Regel 1a): das nächste kostet `naechstes` Münzen (im
   Adelshof abgelesen), jedes weitere eine Münze mehr als das vorige. Verfügbar sind Vorrat plus geprägte Münzen,
   nur ganze Münzen. Ergebnis: Zahl neuer Adelsgeschlechter, verbrauchte Münzen, Rest und was zum nächsten fehlt. */
function adelsgeschlechter(vorrat, gepraegt, naechstes) {
  const mz = Math.floor(Math.max(0, vorrat || 0) + Math.max(0, gepraegt || 0) + 1e-9);
  let n = 0, kosten = Math.max(1, Math.round(naechstes || 1)), summe = 0;
  while (summe + kosten <= mz) { summe += kosten; n++; kosten++; }
  return {n, muenzen: mz, verbraucht: summe, rest: mz - summe, naechstesKostet: kosten, fehlen: summe + kosten - mz};
}

/* Hinweis zur Überlaufgrenze für die gewählte Paketzahl: erreicht oder nicht, kleinster erreichter Überlauf und
   wie viele Pakete höchstens unter der Grenze gehen (größtes zulässiges n der Kurve bis zur gewählten Zahl). */
function grenzeInfo(cv, chosen, P) {
  const c = cv.curve[chosen];
  let maxOk = 0;
  for (let n = 0; n <= chosen && n < cv.curve.length; n++) if (cv.curve[n].ok) maxOk = n;
  return {grenze: P.maxOverflow, ok: c.ok, ov: c.ov, n: chosen, maxOk};
}

/* Berechnung 1 (10.11): Prägedörfer, Münzen und Klickfrequenz aus der einfachen Rechnung mit den vorgegebenen
   Prozentpunkten; dazu ein Zeitplan für die empfohlene Aufstellung mit N = Prozentpunkte ÷ Paketgröße (gerundet),
   gerechnet im Gleichschritt mit Speichergrenze und Überlaufgrenze. */
function planPct(villages, P0, passive, sitesWahl, R0) {
  const R = R0 || plan(villages, P0);
  const N = Math.max(0, Math.round(P0.pkgPct / P0.pkgSize + 1e-9));
  if (!R.src.length || !R.configs) return R;
  const sites = sitesWahl || R.configs[R.recommend - 1].sites;
  const P = Object.assign({}, P0, {pkgCount: N || null});
  const {Pc, m} = coarse(P);
  let cv;
  if (N) cv = refine(R.src, P, sites, packageCurve(R.src, Pc, sites, false), m);
  else { const K = lastClick(P), r = lockstep(R.src, P, sites, toCnt([], K));
         cv = {curve: [{n: 0, pos: [], coins: r.coins, ov: r.ov, ok: zulaessig(r, P)}], K}; }
  const chosen = Math.min(N, cv.curve.length - 1), pos = cv.curve[chosen].pos;
  R.zeitplan = {n: chosen, size: P0.pkgSize, sumPct: chosen * P0.pkgSize, pct: P0.pkgPct, pos, grid: m,
                grenze: grenzeInfo(cv, chosen, P), detail: scheduleDetails(R.src, P, sites, pos, prepare(passive || [], P))};
  return R;
}

/* Aufstellung mit k Prägedörfern nachrechnen (10.12), wenn sie gewählt, aber nicht empfohlen ist.
   Berechnung 2: wie planPackages für dieses k, also bei „automatisch“ die eigene optimale Paketzahl (10.9) mit
   demselben Startwert wie in planPackages, damit die Werte mit der Spalte im Vergleich übereinstimmen; bei fester
   Paketzahl dieselbe Zahl. Berechnung 1: Zeitplan für die Prägedörfer der einfachen Rechnung.
   perK: R.pkg.perK der Gesamtrechnung (nur für den Startwert). Ergebnis {k, pkg} bzw. {k, zeitplan} oder null. */
function packagesForK(villages, P0, k, passive, perK) {
  if (P0.mode === "pct") {
    const R = plan(villages, P0);
    if (!R.configs || !R.configs[k - 1]) return null;
    const z = planPct(villages, P0, passive, R.configs[k - 1].sites, R);
    return {k, zeitplan: z.zeitplan};
  }
  const prev = perK && perK[Math.min(k, perK.length + 1) - 2];
  const o = bestForK(villages, P0, k, P0.pkgCount || (k === 1 ? 3 : (prev && prev.n) || 1));
  if (!o || !o.cur) return null;
  const P = o.R.P, src = o.R.src, sites = o.sites;
  packageCurve(src, o.Pc, sites, true, o.cur);
  const cv = refine(src, P, sites, o.cur, o.m);
  const chosen = Math.min(P0.pkgCount || cv.optimal, cv.curve.length - 1), pos = cv.curve[chosen].pos;
  return {k, sites, pkg: Object.assign({}, cv, {chosen, pos, grid: o.m, grenze: grenzeInfo(cv, chosen, P),
    detail: scheduleDetails(src, P, sites, pos, prepare(passive || [], P))})};
}

/* Gewählte Aufstellung nach einer Neuberechnung (10.12): bleibt, solange diese Zahl gerechnet wurde, sonst die
   Empfehlung. */
function wahlNach(vorher, R, aktiv) {
  const n = R && R.configs ? R.configs.length : 0;
  // 10.14: nur eine aktiv angeklickte Wahl bleibt; ohne aktive Wahl folgt die Ansicht der Empfehlung
  if (aktiv === false) return (R && R.recommend) || 1;
  return vorher && vorher >= 1 && vorher <= n ? vorher : (R && R.recommend) || 1;
}

/* Zwischenspeicher je Zahl der Flaggendoppler. sig kennzeichnet die Eingabe; eine andere sig verwirft alles. */
function aufstellungsCache() {
  let sig = null;
  const m = new Map();
  const pruef = s => { if (s !== sig) { sig = s; m.clear(); } };
  return {get: (s, k) => { pruef(s); return m.get(k); }, set: (s, k, v) => { pruef(s); m.set(k, v); },
          has: (s, k) => { pruef(s); return m.has(k); }, size: () => m.size};
}

const api = {adelsgeschlechter, zulaessig, besser, grenzeInfo, planPct, packagesForK, wahlNach, aufstellungsCache, RES, MERCHANTS, STORAGE, FLAG_PCT, DOUBLER_HOURS, DECREE_HOURS, DECREE_PCT, LADDER, LONG_HORIZON,
             WORLD_DEFAULT, K_MAX, storageCap, merchantsAt, baseProd, parseOverview, prodFactorFrom, params, reduction,
             coinPrice, prepare, dist, travelHours, simulate, Planner, details, plan, ladderStep, requiredInterval,
             MAX_PER_CLICK, N_MAX, maxPerClick, lastClick, villageRun, siteRun, lockstep, packageValue, lastUsefulClick,
             toCnt, evenSchedule, improveSchedule, packageCurve, scheduleDetails, coarse, refine, bestForK, planPackages,
             mengenNeu, mengenDorf, mengenFertig, mengenEinfach, rohstoffeAus, tauschObergrenze, vorabTausch, parseLager, routeRun, routeMenge, routenPlan, fremdeSuche};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.Praegen = api;
})(typeof window !== "undefined" ? window : globalThis);
