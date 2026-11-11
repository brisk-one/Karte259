/* Prägerechner: Lieferung über Zwischendörfer, wie sie das eigene Schnellleistenskript plant (Wunsch Dennis
   11.11.2026, Entscheidung 13:57). Die Funktion bleibt auf der Seite ausgeblendet und gilt als „inaktiv bis
   Supportfreigabe“: Das Skript darf erst nach der Freigabe durch den Support genutzt werden, bis dahin fließt nichts
   davon in die Rechnung des Prägerechners ein. Lädt nur, wenn die Seite den Abschnitt zeigt.

   Gerechnet wird derselbe Zeitplan wie beim Anfordern (Prägedörfer, Pakete je Klick, Produktion, Händler,
   Erlass), aber alle Lieferdörfer eines Prägedorfs gemeinsam, Klick für Klick:
   - Politik „direkt“: jedes Dorf schickt mit allen freien Händlern im Prägeverhältnis ins Prägedorf. Das ist genau
     das Anfordern des Rechenkerns (lockstep im Prägeverhältnis) und dient als Gegenprobe.
   - Politik „umwege“: bei jedem Klick ein lineares Programm über ein Planungsfenster (Standard 8 h) wie im
     Skript (Fassung 2.1): Umwege über Dörfer näher am Prägedorf, auch mehrere hintereinander; Hin- und Rückweg
     auf Klicks gerundet, Zwischendörfer schicken alles weiter. Das Programm kennt wie das Skript keine künftigen
     Pakete und keine Rückkehrzeiten der Händler. Zwischendörfer bekommen die Ware beim nächsten Klick nach der
     Ankunft; was dann über den Speicher geht, ist verloren.
   Ohne DOM, läuft im Browser (window.PraegenUmwege, auch im Worker) und in Node (module.exports). */
(function (root) {
"use strict";
const Core = root.Praegen || (typeof require === "function" ? require("./praegen-core.js") : null);
const EPS = 1e-9;

/* ---------- Lineares Programm ----------
   Revidiertes Simplexverfahren für  max c·x  mit  A x <= b,  x >= 0,  b >= 0  (Spalten dünn besetzt), wie im
   Skript. B^-1 dicht, alle 60 Schritte neu aufgebaut; gegen Kreisen eine winzige Störung der rechten Seite und
   Blands Regel, wenn es lange nicht vorangeht. Gegen HiGHS geprüft (Abweichung unter 0,000001 %). */
function maximiere(m, cols, b, c, opt) {
  opt = opt || {};
  const n = cols.length, N = n + m;
  const tol = opt.tol || 1e-9, maxIter = opt.maxIter || 50 * (m + n);
  const bb = new Float64Array(m);
  let skala = 1;
  for (let i = 0; i < m; i++) skala = Math.max(skala, Math.abs(b[i]));
  for (let i = 0; i < m; i++) bb[i] = b[i] + skala * 1e-11 * (1 + ((i * 7919) % 97) / 97);
  const basis = new Int32Array(m), inB = new Int32Array(N).fill(-1);
  for (let i = 0; i < m; i++) { basis[i] = n + i; inB[n + i] = i; }
  let Binv = new Float64Array(m * m);
  for (let i = 0; i < m; i++) Binv[i * m + i] = 1;
  const xB = Float64Array.from(bb);
  const cost = j => j < n ? c[j] : 0;
  const y = new Float64Array(m), u = new Float64Array(m);
  let iter = 0, ohneFortschritt = 0, bland = false, letzterWert = -Infinity;

  function neuAufbauen() {
    const M = new Float64Array(m * m), I = new Float64Array(m * m);
    for (let r = 0; r < m; r++) {
      const j = basis[r];
      if (j < n) for (const [i, v] of cols[j]) M[i * m + r] = v;
      else M[(j - n) * m + r] = 1;
      I[r * m + r] = 1;
    }
    for (let col = 0; col < m; col++) {
      let p = col, best = Math.abs(M[col * m + col]);
      for (let r = col + 1; r < m; r++) { const v = Math.abs(M[r * m + col]); if (v > best) { best = v; p = r; } }
      if (best < 1e-14) return false;
      if (p !== col) for (let k = 0; k < m; k++) {
        let t = M[col * m + k]; M[col * m + k] = M[p * m + k]; M[p * m + k] = t;
        t = I[col * m + k]; I[col * m + k] = I[p * m + k]; I[p * m + k] = t;
      }
      const piv = M[col * m + col];
      for (let k = 0; k < m; k++) { M[col * m + k] /= piv; I[col * m + k] /= piv; }
      for (let r = 0; r < m; r++) {
        if (r === col) continue;
        const f = M[r * m + col];
        if (f === 0) continue;
        for (let k = 0; k < m; k++) { M[r * m + k] -= f * M[col * m + k]; I[r * m + k] -= f * I[col * m + k]; }
      }
    }
    Binv = I;
    for (let r = 0; r < m; r++) { let s = 0; for (let k = 0; k < m; k++) s += Binv[r * m + k] * bb[k]; xB[r] = Math.max(0, s); }
    return true;
  }

  function schritt() {
    y.fill(0);
    for (let r = 0; r < m; r++) {
      const cb = cost(basis[r]);
      if (cb === 0) continue;
      const row = r * m;
      for (let k = 0; k < m; k++) y[k] += cb * Binv[row + k];
    }
    let q = -1, bestD = tol;
    for (let j = 0; j < N; j++) {
      if (inB[j] >= 0) continue;
      let d;
      if (j < n) { d = c[j]; for (const [i, v] of cols[j]) d -= y[i] * v; }
      else d = -y[j - n];
      if (d > bestD) { q = j; bestD = d; if (bland) break; }
    }
    if (q < 0) return false;
    u.fill(0);
    if (q < n) { for (const [i, v] of cols[q]) for (let r = 0; r < m; r++) u[r] += Binv[r * m + i] * v; }
    else { const i = q - n; for (let r = 0; r < m; r++) u[r] = Binv[r * m + i]; }
    let p = -1, theta = Infinity;
    for (let r = 0; r < m; r++) {
      if (u[r] > 1e-11) {
        const t = xB[r] / u[r];
        if (t < theta - 1e-12 || (Math.abs(t - theta) <= 1e-12 && p >= 0 && basis[r] < basis[p])) { theta = t; p = r; }
      }
    }
    if (p < 0) return null;
    for (let r = 0; r < m; r++) xB[r] -= theta * u[r];
    xB[p] = theta;
    const piv = u[p], prow = p * m;
    for (let k = 0; k < m; k++) Binv[prow + k] /= piv;
    for (let r = 0; r < m; r++) {
      if (r === p) continue;
      const f = u[r];
      if (f === 0) continue;
      const row = r * m;
      for (let k = 0; k < m; k++) Binv[row + k] -= f * Binv[prow + k];
    }
    inB[basis[p]] = -1; basis[p] = q; inB[q] = p;
    for (let r = 0; r < m; r++) if (xB[r] < 0 && xB[r] > -1e-9 * skala) xB[r] = 0;
    return true;
  }

  const wert = () => { let s = 0; for (let r = 0; r < m; r++) s += cost(basis[r]) * xB[r]; return s; };
  const fertig = status => {
    const x = new Float64Array(n);
    for (let r = 0; r < m; r++) if (basis[r] < n) x[basis[r]] = Math.max(0, xB[r]);
    let obj = 0;
    for (let j = 0; j < n; j++) obj += c[j] * x[j];
    return {status, x, obj, iter};
  };
  for (;;) {
    if (iter >= maxIter) return fertig("grenze");
    const r = schritt();
    iter++;
    if (r === false) return fertig("optimal");
    if (r === null) return fertig("unbeschraenkt");
    if (iter % 60 === 0) neuAufbauen();
    const v = wert();
    if (v > letzterWert + 1e-9 * Math.max(1, Math.abs(v))) { letzterWert = v; ohneFortschritt = 0; bland = false; }
    else if (++ohneFortschritt > 50) bland = true;
  }
}

/* ---------- Plan für einen Klick (wie im Skript) ----------
   E = {d: [{x, y, holz, lehm, eisen, cap, frei, gesamt, prod: [h, l, e] je Minute, zufluss: Rohstoffe unterwegs
   zu diesem Dorf}], mint (Index des Prägedorfs), carry, mpf (Minuten je Feld), T (Minuten zwischen Klicks),
   H (Minuten bis Ende), reserve (0..1), fenster (Stunden, 0 = bis Ende), kNb, maxZiele (0 = alle),
   ratio [Holz, Lehm, Eisen] (Münzverhältnis, Standard 28:30:25)}.
   Ergebnis: {sends: [[i, j, einheiten]], ziel}; eine Einheit = Summe von ratio Rohstoffen im Münzverhältnis. */
function aufbauen(E) {
  const d = E.d, n = d.length, m = E.mint, T = E.T, H = E.H, RATIO = E.ratio || [28, 30, 25];
  const RSUM = RATIO[0] + RATIO[1] + RATIO[2];
  const dist = (a, b) => Math.hypot(d[a].x - d[b].x, d[a].y - d[b].y);
  const tau = (a, b) => dist(a, b) * E.mpf;
  const He = E.fenster > 0 ? Math.min(H, E.fenster * 60) : H;
  const K = Math.ceil(H / T - 1e-9), lastClick = (K - 1) * T;
  const lc = E.fenster > 0 ? Math.min(lastClick, Math.floor((He - 1e-9) / T) * T) : lastClick;
  const Ldir = d.map((_, j) => Math.min(Math.floor((He - tau(j, m)) / T + 1e-9) * T, lc));
  const cyc = (a, b) => Math.max(1, Math.ceil(2 * tau(a, b) / T - 1e-9));
  const kNb = E.kNb || 30;
  const kanten = [];                                          // [i, j, U, cyc]
  for (let i = 0; i < n; i++) {
    if (i === m) continue;
    const dim = dist(i, m), nb = [];
    for (let j = 0; j < n; j++) if (j !== i && dist(j, m) < dim) nb.push(j);
    nb.sort((a, b) => dist(i, a) - dist(i, b));
    const ziele = [m].concat(nb.slice(0, kNb).filter(j => j !== m));
    for (const j of ziele) {
      let L = j === m ? He - tau(i, m) : Ldir[j] - tau(i, j);
      L = Math.min(Math.floor(L / T + 1e-9) * T, lc);
      if (L < -1e-9) continue;
      kanten.push([i, j, Math.round(L / T) + 1, cyc(i, j)]);
    }
  }
  const Rc = Math.round(lc / T) + 1;
  const rows = [], ridx = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (i !== m) { ridx[i] = rows.length; rows.push(i); }
  const nr = rows.length, mRows = 3 * nr, b = new Float64Array(mRows);
  for (const i of rows) {
    const v = d[i];
    const B = v.frei * Rc + Math.max(0, v.gesamt - v.frei) * Math.max(0, Rc - 1);
    const hrs = Math.max(0, Ldir[i]);
    const res = [v.holz, v.lehm, v.eisen].map((s, r) => Math.max(0, s - v.cap * E.reserve) + v.prod[r] * hrs);
    b[ridx[i]] = B;
    b[nr + ridx[i]] = RSUM * Math.min(res[0] / RATIO[0], res[1] / RATIO[1], res[2] / RATIO[2]) + (v.zufluss || 0);
    b[2 * nr + ridx[i]] = 0;
  }
  const cols = [], c = new Float64Array(kanten.length);
  kanten.forEach(([i, j, U, cy], e) => {
    const ri = ridx[i], col = [[ri, cy / E.carry], [nr + ri, 1], [2 * nr + ri, -1]];
    if (j === m) c[e] = 1;
    else { const rj = ridx[j]; col.push([nr + rj, -1], [2 * nr + rj, 1]); c[e] = -1e-4; }
    cols.push(col);
  });
  return {n, m, kanten, cols, b, c, mRows, RATIO, RSUM};
}

function versand(E, A, x) {
  const d = E.d, m = A.m, n = A.n, RATIO = A.RATIO, RSUM = A.RSUM;
  const tau = (a, b) => Math.hypot(d[a].x - d[b].x, d[a].y - d[b].y) * E.mpf;
  let plan = new Map();
  A.kanten.forEach(([i, j, U], e) => {
    if (x[e] > 1e-6) { if (!plan.has(i)) plan.set(i, []); plan.get(i).push([j, x[e] / Math.max(1, U)]); }
  });
  if (E.maxZiele > 0) {
    const zu = new Map();
    for (const lst of plan.values()) for (const [j, a] of lst) if (j !== m) zu.set(j, (zu.get(j) || 0) + a);
    const keep = new Set([...zu.keys()].sort((p, q) => zu.get(q) - zu.get(p)).slice(0, E.maxZiele));
    const neu = new Map();
    for (const [i, lst] of plan) neu.set(i, lst.filter(([j]) => j === m || keep.has(j)));
    plan = neu;
  }
  const sends = [];
  for (let i = 0; i < n; i++) {
    if (i === m) continue;
    const v = d[i], free = v.frei;
    if (free <= 0) continue;
    const av = [v.holz, v.lehm, v.eisen].map(s => Math.max(0, s - v.cap * E.reserve));
    const stockU = Math.min(av[0] / RATIO[0], av[1] / RATIO[1], av[2] / RATIO[2]);
    if (stockU < 1) continue;
    const capU = free * E.carry / RSUM, directOk = tau(i, m) <= E.H + 1e-9;
    const relays = (plan.get(i) || []).filter(([j]) => j !== m);
    if (directOk && (!relays.length || stockU <= capU)) {
      const u = Math.floor(Math.min(stockU, capU));
      if (u >= 1) sends.push([i, m, u]);
      continue;
    }
    let sent = 0, mer = free;
    relays.sort((p, q) => q[1] - p[1]);
    for (const [j, a] of relays) {
      const u = Math.floor(Math.min(a / RSUM, stockU - sent, mer * E.carry / RSUM));
      if (u >= 1) { sends.push([i, j, u]); mer -= Math.ceil(u * RSUM / E.carry - 1e-9); sent += u; }
    }
    if (directOk && mer > 0 && stockU - sent >= 1) {
      const u = Math.floor(Math.min(stockU - sent, mer * E.carry / RSUM));
      if (u >= 1) sends.push([i, m, u]);
    }
  }
  return sends;
}

function plane(E) {
  const A = aufbauen(E);
  if (!A.kanten.length) return {sends: [], ziel: 0, A};
  const r = maximiere(A.mRows, A.cols, A.b, A.c);
  return {sends: versand(E, A, r.x), ziel: r.obj, status: r.status, A};
}

/* ---------- Gemeinsame Simulation aller Lieferdörfer ----------
   src und P wie im Rechenkern (prepare, params), sites die Prägedörfer, cnt die Pakete je Klick (toCnt).
   opt: {politik: "direkt" | "umwege", fenster: 8, kNb: 30, maxZiele: 0}.
   Rückgabe von ergebnis(): coins, units (Münzeinheiten zum Grundpreis), lokal (in Lieferdörfern mit Adelshof
   geprägt), anZwischen (Rohstoffe an Zwischendörfer geschickt), verloren (bei Ankunft in Zwischendörfern über
   den Speicher), liegenZwischen (am Ende noch unterwegs zu oder liegen geblieben in Zwischendörfern, nur Ware
   von anderen Dörfern geschätzt als Zufluss), anfragen (Zieldörfer je Klick: Mittel, höchstens, Klicks mit
   Versand). */
function start(src, P, sites, cnt, opt) {
  opt = opt || {};
  const politik = opt.politik === "umwege" ? "umwege" : "direkt";
  const fenster = opt.fenster != null ? +opt.fenster : 8, kNb = opt.kNb || 30, maxZiele = opt.maxZiele || 0;
  const T = P.interval, C = P.carry, cw = P.coin.wood, cs = P.coin.stone, ci = P.coin.iron, K = cnt.length;
  const n = src.length, isSite = new Set(sites);
  // Prägedorf je Dorf wie im Rechenkern (nearestSite): das nächste, bei Gleichstand das erste
  const site = src.map((s, i) => {
    let best = sites[0], bd = Infinity;
    for (const c of sites) { const d = Core.dist(s, src[c]); if (d < bd - EPS) { bd = d; best = c; } }
    return isSite.has(i) ? i : best;
  });
  const gruppen = sites.map(j => ({j, glieder: src.map((_, i) => i).filter(i => i !== j && site[i] === j)}));
  const ratio = [cw / 1000, cs / 1000, ci / 1000];
  // Zustand je Dorf
  const Z = src.map((s, i) => {
    if (isSite.has(i)) return null;
    const cap = s.cap, st0 = Math.min(cap, cap * P.startPct / 100), vb = s.vorab;
    return {w: vb ? Math.min(cap, st0 + vb[0]) : st0, st: vb ? Math.min(cap, st0 + vb[1]) : st0, ir: vb ? Math.min(cap, st0 + vb[2]) : st0,
            busy: 0, rueck: [], an: [], add1: P.pkgSize / 100 * cap, lok: P.mintLocal && s.snob,
            p: [s.prod.wood * T, s.prod.stone * T, s.prod.iron * T]};
  });
  const tauH = (i, j) => Core.travelHours(src[i], src[j], P);
  let coins = 0, units = 0, lokal = 0, anZwischen = 0, verloren = 0, k = 0;
  const anfragen = [];

  function schicke(i, j, a0, a1, a2, t) {
    const z = Z[i], amt = a0 + a1 + a2;
    if (amt <= EPS) return;
    const used = Math.ceil(amt / C - 1e-7), tau = tauH(i, j), ta = t + tau;
    z.busy += used; z.rueck.push([t + 2 * tau, used]);
    z.w -= a0; z.st -= a1; z.ir -= a2;
    if (j === site[i]) {
      if (ta <= P.window + EPS) { const u = a0 / cw; coins += u / (1 - Core.reduction(ta, P)); units += u; }
    } else { Z[j].an.push([ta, a0, a1, a2]); anZwischen += amt; }
  }

  function schritt() {
    if (k >= K) return true;
    const t = k * T;
    for (let i = 0; i < n; i++) {
      const z = Z[i];
      if (!z) continue;
      const cap = src[i].cap;
      if (k > 0) { z.w = Math.min(cap, z.w + z.p[0]); z.st = Math.min(cap, z.st + z.p[1]); z.ir = Math.min(cap, z.ir + z.p[2]); }
      if (z.an.length) {
        const rest = [];
        for (const a of z.an) {
          if (a[0] <= t + EPS) { z.w += a[1]; z.st += a[2]; z.ir += a[3]; } else rest.push(a);
        }
        z.an = rest;
        if (z.w > cap) { verloren += z.w - cap; z.w = cap; }
        if (z.st > cap) { verloren += z.st - cap; z.st = cap; }
        if (z.ir > cap) { verloren += z.ir - cap; z.ir = cap; }
      }
      const nP = cnt[k];
      if (nP) {
        const add = nP * z.add1;
        if (z.lok) {
          const u = Math.min(Math.max(0, z.w + add - cap) / cw, Math.max(0, z.st + add - cap) / cs, Math.max(0, z.ir + add - cap) / ci);
          if (u > EPS) { z.w -= u * cw; z.st -= u * cs; z.ir -= u * ci; lokal += u; }
        }
        z.w = Math.min(cap, z.w + add); z.st = Math.min(cap, z.st + add); z.ir = Math.min(cap, z.ir + add);
      }
      if (z.rueck.length) {
        const rest = [];
        for (const r of z.rueck) { if (r[0] <= t + EPS) z.busy -= r[1]; else rest.push(r); }
        z.rueck = rest;
      }
    }
    if (politik === "direkt") {
      for (let i = 0; i < n; i++) {
        const z = Z[i];
        if (!z) continue;
        const free = (src[i].merchants - z.busy) * C;
        if (free <= EPS) continue;
        const u = Math.min(z.w / cw, z.st / cs, z.ir / ci, free / P.unitRes);
        if (u <= EPS) continue;
        schicke(i, site[i], u * cw, u * cs, u * ci, t);
      }
    } else {
      const H = (P.window - t) * 60;
      for (const g of gruppen) {
        if (!g.glieder.length || H <= EPS) continue;
        const idx = g.glieder.concat([g.j]), mint = idx.length - 1;
        const d = idx.map((i, q) => {
          const s = src[i];
          if (q === mint) return {x: s.x, y: s.y, holz: 0, lehm: 0, eisen: 0, cap: s.cap, frei: 0, gesamt: 0, prod: [0, 0, 0], zufluss: 0};
          const z = Z[i];
          let zu = 0;
          for (const a of z.an) zu += a[1] + a[2] + a[3];
          return {x: s.x, y: s.y, holz: z.w, lehm: z.st, eisen: z.ir, cap: s.cap, frei: Math.max(0, s.merchants - z.busy), gesamt: s.merchants,
                  prod: [s.prod.wood / 60, s.prod.stone / 60, s.prod.iron / 60], zufluss: zu};
        });
        const E = {d, mint, carry: C, mpf: P.minPerField, T: P.intervalMin, H, reserve: 0, fenster, kNb, maxZiele, ratio};
        const pl = plane(E), ziele = new Set();
        for (const [li, lj, u] of pl.sends) {
          const i = idx[li], j = idx[lj];
          schicke(i, j, u * ratio[0], u * ratio[1], u * ratio[2], t);
          ziele.add(j);
        }
        if (ziele.size) anfragen.push(ziele.size);
      }
    }
    k++;
    return k >= K;
  }

  function ergebnis() {
    let c = coins, u = units, liegen = 0;
    for (const j of sites) { const r = Core.siteRun(src[j], P, cnt, null); c += r.coins; u += r.minted; }
    for (const z of Z) if (z) for (const a of z.an) liegen += a[1] + a[2] + a[3];
    const summe = anfragen.reduce((a, v) => a + v, 0);
    return {politik, coins: c + lokal, units: u + lokal, lokal, anZwischen, verloren, liegenZwischen: liegen,
            anfragen: {mittel: anfragen.length ? summe / anfragen.length : 0, max: anfragen.length ? Math.max(...anfragen) : 0, klicks: anfragen.length},
            fenster, klicks: K};
  }
  return {K, schritt, ergebnis, fertig: () => k >= K, k: () => k};
}

function lauf(src, P, sites, cnt, opt, fortschritt) {
  const s = start(src, P, sites, cnt, opt);
  while (!s.schritt()) if (fortschritt) fortschritt(s.k(), s.K);
  if (fortschritt) fortschritt(s.K, s.K);
  return s.ergebnis();
}

/* Anfordern und Umwege für denselben Zeitplan. Mit „Verhältnis ignorieren“ nicht gerechnet: das Skript schickt
   immer im Münzverhältnis. fortschritt(i, n) zählt die Klicks der Umwege-Rechnung. */
function vergleich(src, P, sites, cnt, opt, fortschritt) {
  if (P.ignoreRatio) return {fehler: "verhaeltnis"};
  const direkt = lauf(src, P, sites, cnt, Object.assign({}, opt, {politik: "direkt"}));
  const umwege = lauf(src, P, sites, cnt, Object.assign({}, opt, {politik: "umwege"}), fortschritt);
  return {direkt, umwege};
}

const api = {maximiere, aufbauen, versand, plane, start, lauf, vergleich};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.PraegenUmwege = api;
})(typeof window !== "undefined" ? window : globalThis);
