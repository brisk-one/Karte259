/* Prägerechner, Sitzungsanzahlplanung (Wunsch Dennis 11.11.2026 14:08, Entscheidungen 14:23: Paketvorrat mit
   optionalem Zugang je Woche, Flaggendoppler unbegrenzt, Ausbau auf Zielstufen mit den Bauwerten der Welt,
   Ziel „meiste Punkte nach einer Zeitspanne“, eigener Reiter).

   Frage: Wie viele Flaggendoppler-Sitzungen hintereinander, bevor mit den neuen Adelsgeschlechtern Barbarendörfer
   geadelt und ausgebaut werden? Eine Runde besteht aus m Sitzungen zu je 48 h. Jede Sitzung rechnet wie
   „2 · Rohstoffpakete maximieren“ (automatische Zahl der Flaggendoppler, optimale Paketzahl, Anfordern im
   Prägeverhältnis, Speichergrenze und Überlauf), begrenzt durch den Paketvorrat. Nach jeder Sitzung werden die
   Münzen zu Adelsgeschlechtern (das nächste kostet x, jedes weitere eine Münze mehr), je Adelsgeschlecht kommt das
   nächste Barbarendorf im gewählten Punktebereich dazu und wird auf die Zielstufen ausgebaut. Fertige Dörfer
   liefern ab der nächsten Sitzung mit (größere Pakete, mehr Händler). Nach m Sitzungen ruht das Prägen, bis die
   Dörfer der letzten Sitzung fertig sind; dann beginnt die nächste Runde. Verglichen wird, wie viele Punkte die
   neuen Dörfer am Ende der Zeitspanne haben.
   Rechenzeit: Eine Sitzung wird genau gerechnet, wenn die Dorfzahl seit dem letzten genau gerechneten Stand um mehr
   als 35 % gewachsen ist; dazwischen wächst der Paketanteil der Münzen mit der Speichersumme (Näherung).

   Annahmen (auf der Seite genannt): Rohstoffe für Ausbau und AG gehen vom Paketvorrat ab, gerechnet in
   Prozentpunkten der Speichersumme zur Zeit der Sitzung; Produktion zwischen den Sitzungen bleibt außen vor. Ein
   erobertes Dorf braucht ein Adelsgeschlecht und verbraucht ein AG. Erobern dauert kaum etwas gegen den Ausbau.
   Barbarendörfer beginnen den Ausbau bei Stufe 0 (ihre kleinen Stufen fallen kaum ins Gewicht), Bauernhof wird so
   weit mitgebaut, wie die Bevölkerung es braucht; neue Dörfer produzieren nichts Nennenswertes.
   Bauzeit je Stufe: Grundbauzeit × 1,18 × Faktor^max(−13, Stufe − 1 − 14 ÷ (Stufe − 1)) × 1,05^(−Hauptgebäude)
   ÷ Weltgeschwindigkeit (Formel aus dem Forum-Leitfaden „Building Formulas“, nicht im Spiel geprüft).
   Ohne DOM, läuft im Browser (window.PraegenSitzungen, auch im Worker) und in Node (module.exports). */
(function (root) {
"use strict";
const Core = root.Praegen || (typeof require === "function" ? require("./praegen-core.js") : null);

// Standard-Bauwerte, bis der Sammler die Werte der Welt (get_building_info) geliefert hat
const GEB_STANDARD = {
  main:    {wood: 90,  stone: 80,  iron: 70,  pop: 5,  wood_factor: 1.26,  stone_factor: 1.275, iron_factor: 1.26,  pop_factor: 1.17, build_time: 900,  build_time_factor: 1.2, max_level: 30},
  market:  {wood: 100, stone: 100, iron: 100, pop: 20, wood_factor: 1.26,  stone_factor: 1.27,  iron_factor: 1.26,  pop_factor: 1.17, build_time: 2700, build_time_factor: 1.2, max_level: 25},
  storage: {wood: 60,  stone: 50,  iron: 40,  pop: 0,  wood_factor: 1.265, stone_factor: 1.27,  iron_factor: 1.245, pop_factor: 1.15, build_time: 1020, build_time_factor: 1.2, max_level: 30},
  farm:    {wood: 45,  stone: 40,  iron: 30,  pop: 0,  wood_factor: 1.3,   stone_factor: 1.32,  iron_factor: 1.29,  pop_factor: 1,    build_time: 1200, build_time_factor: 1.2, max_level: 30},
};
// Punkte: Stufe 1 bringt so viel, jede weitere Stufe × 1,2, gesamt gerundet (Punktetabelle der Gebäude)
const PUNKTE_BASIS = {main: 10, market: 10, storage: 6, farm: 5};
const AG_KOSTEN = [40000, 50000, 50000];                         // ein AG: Holz, Lehm, Eisen

const bauwerte = welt => Object.assign({}, GEB_STANDARD, (welt && welt.gebaeude) || {});
const kosten = (g, L) => [Math.round(g.wood * Math.pow(g.wood_factor, L - 1)), Math.round(g.stone * Math.pow(g.stone_factor, L - 1)),
                          Math.round(g.iron * Math.pow(g.iron_factor, L - 1))];
const bevoelkerung = (g, L) => L > 0 ? Math.round(g.pop * Math.pow(g.pop_factor, L - 1)) : 0;
const bauernhof = L => Math.round(240 * Math.pow(1.172103, L - 1));
const punkte = (art, L) => L > 0 ? Math.round(PUNKTE_BASIS[art] * Math.pow(1.2, L - 1)) : 0;
// Bauzeit in Stunden für Stufe L bei Hauptgebäude hg
function bauzeit(g, L, hg, speed) {
  const e = L <= 1 ? -13 : Math.max(-13, L - 1 - 14 / (L - 1));
  return g.build_time * 1.18 * Math.pow(g.build_time_factor, e) * Math.pow(1.05, -hg) / (speed || 1) / 3600;
}

/* Ausbau eines eroberten Barbarendorfs auf die Zielstufen: erst Hauptgebäude (verkürzt alles Weitere), dann
   Speicher, dann Marktplatz; der Bauernhof kommt dazwischen, sobald die Bevölkerung nicht mehr reicht. Eine
   Bauschleife, also nacheinander. Ergebnis: dauer (h), kosten [Holz, Lehm, Eisen], punkte (zusätzlich zum
   Barbarendorf, am Ende), bauernhof (Stufe), verlauf [[Stunde, Punkte bis dahin]]. */
function ausbau(ziel, geb, speed) {
  const L = {main: 0, market: 0, storage: 0, farm: 1};
  let t = 0;
  const summe = [0, 0, 0], verlauf = [];
  const pkt = () => punkte("main", L.main) + punkte("market", L.market) + punkte("storage", L.storage) + punkte("farm", L.farm);
  const baue = art => {
    const s = L[art] + 1;
    t += bauzeit(geb[art], s, L.main, speed);
    kosten(geb[art], s).forEach((v, r) => { summe[r] += v; });
    L[art] = s;
    verlauf.push([t, pkt()]);
  };
  const bev = () => bevoelkerung(geb.main, L.main) + bevoelkerung(geb.market, L.market) + bevoelkerung(geb.storage, L.storage);
  const platz = (art) => {                                         // Bauernhof vor dem Schritt, falls nötig
    const vorher = L[art];
    L[art]++;
    const braucht = bev();
    L[art] = vorher;
    while (bauernhof(L.farm) < braucht && L.farm < geb.farm.max_level) baue("farm");
  };
  const bis = (art, z) => { while (L[art] < Math.min(z, geb[art].max_level)) { platz(art); baue(art); } };
  bis("main", ziel.main);
  bis("storage", ziel.storage);
  bis("market", ziel.market);
  return {dauer: t, kosten: summe, punkte: pkt() - punkte("farm", 1), bauernhof: L.farm, verlauf, stufen: Object.assign({}, L)};
}
// Punkte, die der Ausbau h Stunden nach dem Erobern gebracht hat (ohne die Punkte des Barbarendorfs)
function punkteNach(a, h) {
  if (h <= 0 || !a.verlauf.length) return 0;
  let p = 0;
  for (const [t, v] of a.verlauf) { if (t <= h + 1e-9) p = v; else break; }
  return Math.max(0, p - punkte("farm", 1));
}

/* Eine Sitzung wie „2 · Rohstoffpakete maximieren“ mit automatischer Zahl der Flaggendoppler: je Zahl die optimale
   Paketzahl, ein weiterer Flaggendoppler, solange er mindestens minGainPct mehr Münzen bringt. kurve[n] = Münzen
   mit n Paketen (n bis zur optimalen Zahl). hinweis {k, n}: Stand mit weniger Dörfern; mit mehr Dörfern sinkt die
   Zahl der Flaggendoppler nicht, die Suche beginnt dort (spart Rechenzeit). */
function sitzung(villages, P0, hinweis) {
  const P1 = Object.assign({}, P0, {mode: "max", pkgCount: null, fdCount: null});
  let best = null;
  for (let k = hinweis ? hinweis.k : 1; k <= Core.K_MAX; k++) {
    const o = Core.bestForK(villages, P1, k, best ? best.n || 1 : hinweis ? hinweis.n || 3 : 3);
    if (!o || !o.cur) break;
    if (best && o.coins < best.coins * (1 + P1.minGainPct / 100) - 1e-9) break;
    best = o;
  }
  if (!best) return null;
  const src = best.R.src, kurve = best.cv.curve.slice(0, best.n + 1).map(c => c.coins);
  return {k: best.k, n: best.n, kurve, capSum: src.reduce((a, s) => a + s.cap, 0), dorf: src.length,
          ort: best.sites.map(i => ({x: src[i].x, y: src[i].y, name: src[i].name}))};
}

/* Sitzungen je Zahl fertiger neuer Dörfer (gleiche Zahl heißt gleiche Dörfer, weil immer die nächsten
   Barbarendörfer dazukommen). Genau gerechnet wird, wenn die Dorfzahl seit dem letzten genauen Stand um mehr als
   STAND_SCHRITT gewachsen ist; sonst der letzte genaue Stand mit dem Paketanteil der Münzen im Verhältnis der
   Speichersummen (neue Dörfer liegen nah am Prägedorf und haben große Märkte; ihre Produktion ist klein). */
const STAND_SCHRITT = 0.35;
function staende(V0, P, barbaren, ziel, aus, melde) {
  const genau = new Map(), alle = new Map(), capNeu = Core.storageCap(Math.max(ziel.storage, P.minStorage || 0));
  const exakt = (n, hinweis) => {
    let s = genau.get(n);
    if (s === undefined) {
      s = sitzung(V0.concat(barbaren.slice(0, n).map(b => neuesDorf(b, ziel, aus))), P, hinweis);
      genau.set(n, s);
      if (melde) melde(genau.size);
    }
    return s;
  };
  return {
    genau,
    holen(n) {
      if (alle.has(n)) return alle.get(n);
      let basis = -1;
      for (const k of genau.keys()) if (k <= n && k > basis) basis = k;
      let s;
      if (basis >= 0 && genau.get(basis) && V0.length + n <= (V0.length + basis) * (1 + STAND_SCHRITT)) {
        const b = genau.get(basis), capSum = b.capSum + (n - basis) * capNeu, f = capSum / b.capSum;
        s = Object.assign({}, b, {capSum, dorf: V0.length + n, kurve: b.kurve.map(c => b.kurve[0] + (c - b.kurve[0]) * f), genaeh: basis});
      } else s = exakt(n, basis >= 0 ? genau.get(basis) : null);
      alle.set(n, s);
      return s;
    },
  };
}

// erobertes und ausgebautes Barbarendorf als Zeile der Gebäudeübersicht (für den Rechenkern)
const neuesDorf = (b, ziel, a) => ({name: "Barbarendorf (" + b.x + "|" + b.y + ")", x: b.x, y: b.y, k: 0, points: b.pts,
  b: {main: ziel.main, barracks: 0, stable: 0, garage: 0, watchtower: 0, snob: 0, smith: 0, place: 0, statue: 0, market: ziel.market,
      wood: 0, stone: 0, iron: 0, farm: a.bauernhof, storage: ziel.storage, hide: 0, wall: 0}, neu: true});

/* Eine Strategie: m Sitzungen je Runde. opt: {vorrat, zugang (% je Woche), tage, ziel {main, market, storage},
   barbaren [{x, y, pts}] nach Entfernung zum ersten Prägedorf sortiert, muenzen, naechstes, ausbau (aus ausbau()),
   dauerFaktor (Empfindlichkeit, Standard 1)}. st: Sitzungsstände aus staende(). */
function strategie(V0, P, opt, m, st) {
  const H = opt.tage * 24, aus = opt.ausbau, dauer = aus.dauer * (opt.dauerFaktor || 1);
  const ausbauProDorf = [0, 1, 2].map(r => aus.kosten[r] + AG_KOSTEN[r]);
  let t = 0, genutzt = 0, ausbauGenutzt = 0, ausProduktion = 0, muenzen = opt.muenzen || 0, naechstes = opt.naechstes, bi = 0, fehlt = 0, runde = 0;
  const kohorten = [], sitzungen = [];
  const verfuegbar = th => opt.vorrat + (opt.zugang || 0) * th / (7 * 24) - genutzt;
  // Zahl der neuen Dörfer, die zur Zeit th fertig ausgebaut sind
  const fertigBis = th => { let n = 0; for (const k of kohorten) if (k.t + dauer <= th + 1e-9) n += k.neu.length; return n; };
  while (t + 48 <= H + 1e-9) {
    runde++;
    let neuRunde = 0;
    for (let j = 0; j < m && t + 48 <= H + 1e-9; j++) {
      const s = st.holen(fertigBis(t));
      if (!s) break;
      const n = Math.max(0, Math.min(s.n, Math.floor(Math.max(0, verfuegbar(t)) / P.pkgSize + 1e-9)));
      const coins = s.kurve[n];
      genutzt += n * P.pkgSize;
      const ag = Core.adelsgeschlechter(muenzen, coins, naechstes);
      muenzen = ag.rest;
      naechstes = ag.naechstesKostet;
      const zahl = Math.min(ag.n, opt.barbaren.length - bi);
      fehlt += ag.n - zahl;
      const neu = opt.barbaren.slice(bi, bi + zahl);
      bi += zahl;
      // Rohstoffe für Ausbau und AG in Paketprozentpunkten der Speichersumme dieser Sitzung (Rohstoff mit dem
      // größten Bedarf); reicht der Vorrat nicht, kommt der Rest aus der Produktion
      const proz = zahl ? Math.max(...ausbauProDorf.map(v => zahl * v)) / s.capSum * 100 : 0;
      t += 48;
      const ausVorrat = Math.min(proz, Math.max(0, verfuegbar(t)));
      genutzt += ausVorrat;
      ausbauGenutzt += ausVorrat;
      ausProduktion += proz - ausVorrat;
      kohorten.push({t, neu});
      sitzungen.push({runde, start: t - 48, dorf: s.dorf, k: s.k, ort: s.ort, n, prozent: n * P.pkgSize, coins,
                      ag: ag.n, erobert: zahl, ausbauProzent: proz, ausbauVorrat: ausVorrat, vorrat: verfuegbar(t), capSum: s.capSum, genaehert: s.genaeh != null});
      neuRunde += zahl;
    }
    if (neuRunde) t += dauer;                                     // ohne neues Dorf bringt Warten nichts
  }
  let punkteNeu = 0, fertig = 0, doerfer = 0;
  for (const k of kohorten) for (const b of k.neu) {
    doerfer++;
    punkteNeu += b.pts + punkteNach(aus, (H - k.t) / (opt.dauerFaktor || 1));
    if (H - k.t >= dauer - 1e-9) fertig++;
  }
  return {m, punkte: punkteNeu, doerfer, fertig, sitzungen, genutzt, ausbauGenutzt, ausProduktion, pakete: genutzt - ausbauGenutzt,
          vorratEnde: verfuegbar(H), fehltBarbaren: fehlt, runden: runde};
}

/* Alle Strategien vergleichen. eingabe: {villages (Gebäudeübersicht), P (params), welt (praegen.json),
   vorrat, zugang, tage, ziel, barbaren [{x, y, pts}] (beliebige Reihenfolge), muenzen, naechstes, mMax}.
   Ergebnis: {ausbau, quelle ("welt" oder "standard"), ergebnisse [je m], beste (m), empfindlich {kurz, lang},
   punkteJetzt, dorfJetzt}. fortschritt(i, n) zählt die gerechneten Strategien (drei Ausbaudauern je Zahl der Sitzungen). */
function plane(e, fortschritt) {
  const geb = bauwerte(e.welt), quelle = e.welt && e.welt.gebaeude && Object.keys(e.welt.gebaeude).length === 4 ? "welt" : "standard";
  const aus = ausbau(e.ziel, geb, e.P.speed);
  // Barbarendörfer nach Entfernung zum Prägedorf der ersten Sitzung
  const s0 = sitzung(e.villages, e.P);
  if (!s0) return {fehler: "keine-sitzung"};
  const o = s0.ort[0], nimm = new Set(e.villages.map(v => v.x * 1000 + v.y));
  const barbaren = e.barbaren.filter(b => !nimm.has(b.x * 1000 + b.y))
    .map(b => ({x: b.x, y: b.y, pts: b.pts, d: Math.hypot(b.x - o.x, b.y - o.y)}))
    .sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y);
  const naechstes = e.naechstes > 0 ? e.naechstes : e.villages.length + 1;
  const basis = {vorrat: e.vorrat, zugang: e.zugang || 0, tage: e.tage, ziel: e.ziel, barbaren, muenzen: e.muenzen || 0, naechstes, ausbau: aus};
  const st = staende(e.villages, e.P, barbaren, e.ziel, aus);
  st.genau.set(0, s0);
  const mMax = Math.max(1, Math.min(e.mMax || 8, Math.floor(e.tage * 24 / 48 + 1e-9)));
  let schritt = 0;
  const lauf = faktor => {
    const out = [];
    for (let m = 1; m <= mMax; m++) {
      out.push(strategie(e.villages, e.P, Object.assign({}, basis, {dauerFaktor: faktor}), m, st));
      if (fortschritt) fortschritt(++schritt, 3 * mMax);
    }
    return out;
  };
  const besser = (a, b) => a.punkte > b.punkte + 0.5 || (Math.abs(a.punkte - b.punkte) <= 0.5 && a.genutzt < b.genutzt);
  const bestes = liste => liste.reduce((b, x) => (!b || besser(x, b) ? x : b), null);
  const ergebnisse = lauf(1), beste = bestes(ergebnisse);
  const kurz = bestes(lauf(0.5)), lang = bestes(lauf(1.5));
  return {ausbau: aus, quelle, ergebnisse, beste: beste.m, empfindlich: {kurz: kurz.m, lang: lang.m, kurzPunkte: kurz.punkte, langPunkte: lang.punkte},
          naechstes, naechstesGeschaetzt: !(e.naechstes > 0), barbarenGesamt: barbaren.length,
          punkteJetzt: e.villages.reduce((a, v) => a + (+v.points || 0), 0), dorfJetzt: e.villages.length, sitzungenGerechnet: st.genau.size};
}

const api = {GEB_STANDARD, PUNKTE_BASIS, AG_KOSTEN, bauwerte, kosten, bevoelkerung, bauernhof, punkte, bauzeit, ausbau, punkteNach,
             sitzung, staende, neuesDorf, strategie, plane, STAND_SCHRITT};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.PraegenSitzungen = api;
})(typeof window !== "undefined" ? window : globalThis);
