/* Rechenkern des Prägerechners: wo lohnt der Flaggendoppler, wie viele Münzen, welche Klickfrequenz.
   Ohne DOM, läuft im Browser (window.Praegen) und in Node (module.exports), damit er testbar bleibt.

   Spielwerte (Stand 28.10.2026):
   - Münzkosten und Weltgeschwindigkeit aus den Welteinstellungen (data/praegen.json), sonst Werte von Welt 259.
   - Münzkosten-Flagge Stufe 1 bis 9: 10, 12, 14, 16, 18, 20, 22, 23, 24 % (Hilfe-Wiki „Flags“).
   - Flaggendoppler verdoppelt die Flagge eines Dorfes für 48 h, Erlass des Adels senkt die Münzkosten
     24 h lang um weitere 10 Prozentpunkte in allen Dörfern (InnoGames-Hilfe „Village Items“). Flagge und
     Erlass addieren sich (laut Dennis, Stufe 9: 48 % + 10 % = 58 %).
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
    decree: !!input.decree,
    merchantBonus: !!input.merchantBonus,
    flagLevel: Math.max(0, Math.min(9, input.flagLevel | 0)),
    intervalMin: Math.max(1, +input.intervalMin || 60),
    production: input.production !== false,
    prodFactor: +input.prodFactor > 0 ? +input.prodFactor : 1,
    minGainPct: Math.max(0, +(input.minGainPct != null ? input.minGainPct : 10)),
    speed: +w.speed || 1,
    coin: w.coin,
    carry: (+w.merchant_carry || 1000) * bonus,
    minPerField: (+w.base_min_per_field || 6) / (+w.speed || 1) / bonus,
    window: DOUBLER_HOURS,
  };
  if (input.minPerField > 0) P.minPerField = +input.minPerField / bonus;   // Feld „ohne Bonus“ überschreibt
  P.interval = P.intervalMin / 60;
  P.deadline = P.decree ? DECREE_HOURS : DOUBLER_HOURS;
  P.unitRes = P.coin.wood + P.coin.stone + P.coin.iron;
  return P;
}

const reduction = (t, P) => Math.min(0.95, 2 * FLAG_PCT[P.flagLevel] / 100
                                           + (P.decree && t <= DECREE_HOURS + EPS ? DECREE_PCT / 100 : 0));
const coinPrice = (t, P) => P.unitRes * (1 - reduction(t, P));

/* ---------- Dörfer vorbereiten ---------- */
function prepare(villages, P) {
  return villages.map((v, i) => {
    const cap = storageCap(v.b.storage);
    const per = cap * (P.pkgPct + P.startPct) / 100;
    const prod = {};
    RES.forEach(r => { prod[r] = P.production ? baseProd(v.b[r]) * P.speed * P.prodFactor : 0; });
    return {i, name: v.name, x: v.x, y: v.y, b: v.b, cap, merchants: merchantsAt(v.b.market),
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
  const pkgUnits = Math.min(pw / cw, ps / cs, pi / ci);
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
    const units = Math.min(pw / cw, ps / cs, pi / ci, freeCap / P.unitRes);
    if (units > EPS) {
      if (tau > 0) {
        const used = Math.ceil(units * P.unitRes / C - 1e-7);
        busy += used; qT.push(t + 2 * tau); qN.push(used);
      }
      pw -= units * cw; ps -= units * cs; pi -= units * ci;
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
/* Große Konten: höchstens 60 Kandidaten für die Paarsuche. Die Dörfer werden nach Paketmenge gewichtet in zwei
   Haufen geteilt (2-means), je Haufen kommen die 30 Kandidaten nahe dem Schwerpunkt in die engere Wahl. */
const PAIR_MAX = 60;
Planner.prototype.pairCandidates = function (cands) {
  if (cands.length <= PAIR_MAX) return cands;
  const src = this.src, w = src.map(s => 1 + s.pkg.stone);
  const far = (from, list) => list.reduce((b, s) => (dist(s, from) > dist(b, from) ? s : b), list[0]);
  const mean = src.reduce((m, s, i) => ({x: m.x + s.x * w[i], y: m.y + s.y * w[i], w: m.w + w[i]}), {x: 0, y: 0, w: 0});
  let c1 = far({x: mean.x / mean.w, y: mean.y / mean.w}, src), c2 = far(c1, src);
  c1 = {x: c1.x, y: c1.y}; c2 = {x: c2.x, y: c2.y};
  for (let it = 0; it < 12; it++) {
    const acc = [{x: 0, y: 0, w: 0}, {x: 0, y: 0, w: 0}];
    src.forEach((s, i) => { const a = acc[dist(s, c1) <= dist(s, c2) ? 0 : 1]; a.x += s.x * w[i]; a.y += s.y * w[i]; a.w += w[i]; });
    if (acc[0].w) c1 = {x: acc[0].x / acc[0].w, y: acc[0].y / acc[0].w};
    if (acc[1].w) c2 = {x: acc[1].x / acc[1].w, y: acc[1].y / acc[1].w};
  }
  const pick = new Set();
  [c1, c2].forEach(c => cands.slice().sort((a, b) => dist(src[a], c) - dist(src[b], c))
    .slice(0, PAIR_MAX / 2).forEach(i => pick.add(i)));
  return [...pick];
};
Planner.prototype.bestPair = function (cands) {
  cands = this.pairCandidates(cands);
  let best = null;
  for (let a = 0; a < cands.length; a++)
    for (let b = a + 1; b < cands.length; b++) {
      const r = this.evaluate([cands[a], cands[b]]);
      if (!best || better(r, best)) best = r;
    }
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
function plan(villages, P) {
  const src = prepare(villages, P);
  const pl = new Planner(src, P);
  const all = src.map(s => s.i), ah = src.filter(s => s.snob).map(s => s.i);
  const out = {P, src, ahCount: ah.length};
  if (!src.length) return out;
  const cands1 = ah.length ? ah : all;
  out.single = pl.bestSingle(cands1);
  out.single.needsSnob = !ah.length;
  // Bester Standort ohne Adelshof-Pflicht, nur als Hinweis, wenn er spürbar mehr bringt
  if (ah.length && ah.length < all.length) {
    const any = pl.bestSingle(all);
    if (!src[any.sites[0]].snob && any.coins > out.single.coins * 1.01) out.singleAny = any;
  }
  if (src.length >= 2) {
    const cands2 = ah.length >= 2 ? ah : all;
    out.pair = pl.bestPair(cands2);
    if (out.pair) out.pair.needsSnob = ah.length < 2;
  }
  // Regel 9.1a (Dennis 28.10.2026): zweiter Flaggendoppler nur, wenn einer nicht alles rechtzeitig schafft
  // und zwei mindestens minGainPct mehr Münzen bringen
  const gain = out.pair ? out.pair.coins / out.single.coins - 1 : 0;
  out.gainPct = gain * 100;
  out.singleComplete = out.single.share >= 1 - 1e-6;
  out.recommend = out.pair && !out.singleComplete && gain * 100 >= P.minGainPct - 1e-9 ? 2 : 1;
  out.d1 = details(src, P, out.single.sites, pl);
  if (out.pair) out.d2 = details(src, P, out.pair.sites, pl);
  return out;
}

/* Klickfrequenz: für jeden Abstand der Leiter beide Aufstellungen neu suchen */
function ladderStep(villages, P, minutes) {
  const Q = Object.assign({}, P, {intervalMin: minutes, interval: minutes / 60});
  const src = prepare(villages, Q), pl = new Planner(src, Q);
  const all = src.map(s => s.i), ah = src.filter(s => s.snob).map(s => s.i);
  const r1 = pl.bestSingle(ah.length ? ah : all);
  const r2 = src.length >= 2 ? pl.bestPair(ah.length >= 2 ? ah : all) : null;
  return {min: minutes, share1: r1.share, coins1: r1.coins, share2: r2 ? r2.share : null, coins2: r2 ? r2.coins : null};
}
/* Größter Klickabstand, bei dem alles rechtzeitig ankommt; sonst der größte, der 98 % des Bestwerts erreicht */
function requiredInterval(steps, key) {
  const ok = steps.filter(s => s[key] != null);
  if (!ok.length) return null;
  const full = ok.filter(s => s[key] >= 1 - 1e-6);
  if (full.length) return {kind: "voll", min: Math.max(...full.map(s => s.min))};
  const top = Math.max(...ok.map(s => s[key]));
  const near = ok.filter(s => s[key] >= 0.98 * top);
  return {kind: "plateau", min: Math.max(...near.map(s => s.min)), top};
}

const api = {RES, MERCHANTS, STORAGE, FLAG_PCT, DOUBLER_HOURS, DECREE_HOURS, DECREE_PCT, LADDER, LONG_HORIZON,
             WORLD_DEFAULT, storageCap, merchantsAt, baseProd, parseOverview, prodFactorFrom, params, reduction,
             coinPrice, prepare, dist, travelHours, simulate, Planner, details, plan, ladderStep, requiredInterval};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.Praegen = api;
})(typeof window !== "undefined" ? window : globalThis);
