/* Reiter „Fakes aufstocken“ (Dennis 13.11.2026 12:26, 1a und 2b): einen Angriffsplan aus DS-Ultimate einlesen, getrennt in
   den Off- und AG-Plan und den Fake-Plan, beide getrennt exportieren und die Fakes je Spieler aufstocken. Gerechnet wird in
   angriff-core.js (parsePlan, fakesNachImport). Lesbar im Repo, aufstocken.html lädt es erst nach dem Freischalten. */
const K = window.Angriff;
const SPEICHER = "k259-aufstocken";

/* ---------- Zustand ---------- */
const neuerSpieler = () => ({uebersicht: "", fenster: "", soll: "", rammenMax: ""});
// texte: eingefügte Pläne (Dennis 13.11.2026 15:40: mehrere); befehle: Befehlsübersichten; zeiten: angeglichene oder
// gestaffelte Ankünfte je Befehl (Schlüssel aus Herkunft, Ziel, eingelesener Ankunft und Symbol)
// begleit: aufgestockter AG-Begleitschutz je Befehl (Schlüssel wie zeiten, Wert {Einheit: Zahl}); begleitMin: Mindestwerte
let S = {texte: [""], namen: [""], befehle: "", zeiten: {}, begleit: {}, begleitMin: {sword: 60, axe: 50}, staffel: {min: 5, max: 15}, spieler: {}, dazu: [], ank: "", ankPlan: "",
         arten: {ag: true, off: true, fake: true}, cfg: {fakes_max_je_dorf: 4, fake_extra_pop: 5, min_send_gap_s: 3}, expFmt: "dsu", seed: 1, aktiv: false};
/** Gespeicherter Stand des Angriffsplaners in diesem Browser ({v: 1, S}), sonst null. */
function planerStand() {
  try {
    const a = JSON.parse(localStorage.getItem("k259-angriff") || "null");
    return a && a.v === 1 && a.S && typeof a.S === "object" ? a.S : null;
  } catch (e) { return null; }
}
function laden() {
  try {
    const d = JSON.parse(localStorage.getItem(SPEICHER) || "null");
    if (d && typeof d === "object") S = Object.assign(S, d, {cfg: Object.assign({}, S.cfg, d.cfg), arten: Object.assign({}, S.arten, d.arten)});
  } catch (e) { /* Speicher gesperrt oder kaputt: Standard */ }
  if (typeof S.text === "string") { if (S.text.trim()) S.texte = [S.text]; delete S.text; }   // Stand vor mehreren Plänen
  if (!Array.isArray(S.texte) || !S.texte.length) S.texte = [""];
  if (!Array.isArray(S.namen)) S.namen = [];
  while (S.namen.length < S.texte.length) S.namen.push("");
  S.namen.length = S.texte.length;
  if (!S.zeiten || typeof S.zeiten !== "object") S.zeiten = {};
  if (!S.begleit || typeof S.begleit !== "object") S.begleit = {};
  S.begleitMin = Object.assign({sword: 60, axe: 50}, S.begleitMin);
  S.staffel = Object.assign({min: 5, max: 15}, S.staffel);
  if (typeof S.befehle !== "string") S.befehle = "";
  // einmal: Fake-Einstellungen aus dem Angriffsplaner dieses Browsers übernehmen (Dennis 13.11.2026 14:36: stand auf 4 statt 3)
  if (!S.cfgAusPlaner) {
    const a = planerStand();
    if (a && a.cfg) ["fakes_max_je_dorf", "fake_extra_pop", "min_send_gap_s"].forEach(k => { if (a.cfg[k] != null && a.cfg[k] !== "" && !isNaN(+a.cfg[k])) S.cfg[k] = +a.cfg[k]; });
    S.cfgAusPlaner = true;
  }
  // einmal: Spanne „Offs vor dem AG staffeln“ aus dem Angriffsplaner
  if (!S.staffelAusPlaner) {
    const a = planerStand();
    if (a && a.cfg && a.cfg.off_staffel_max != null && !isNaN(+a.cfg.off_staffel_max)) S.staffel = {min: +a.cfg.off_staffel_min || 0, max: +a.cfg.off_staffel_max};
    S.staffelAusPlaner = true;
  }
}
/** Truppenübersichten und Abschickzeiträume aus dem Angriffsplaner dieses Browsers, je Spieler (Besitzer der meisten Dörfer
    der Übersicht laut Weltdaten). Zeiträume: die eigenen des Angreifers, wenn „je Angreifer“ an ist, sonst die gemeinsamen. */
function planerDaten() {
  const out = new Map(), a = planerStand();
  if (!a || !Array.isArray(a.atts)) return out;
  const gemeinsam = Array.isArray(a.fen) ? K.fensterAusZeilen(a.fen).fenster : [];
  a.atts.forEach(at => {
    if (!at || typeof at.text !== "string" || !at.text.trim()) return;
    const o = K.parseOverview(at.text, SPALTEN, punkteVon), n = new Map();
    o.villages.forEach(v => { const i = byXY.get(v.x * 1000 + v.y); if (i != null && V.rows[i][1] >= 0) n.set(V.rows[i][1], (n.get(V.rows[i][1]) || 0) + 1); });
    let p = -1, best = 0;
    n.forEach((c, q) => { if (c > best) { best = c; p = q; } });
    if (p < 0) return;
    const eigen = a.fenJe && Array.isArray(at.fen) ? K.fensterAusZeilen(at.fen).fenster : [];
    const f = eigen.length ? eigen : gemeinsam;
    out.set(spielerName(p), {text: at.text, fenster: f.map(([x, y]) => K.fmtZeit(x).slice(0, 16) + " bis " + K.fmtZeit(y).slice(0, 16)).join("\n")});
  });
  return out;
}
function speichern() {
  try { localStorage.setItem(SPEICHER, JSON.stringify(S)); } catch (e) { /* voll oder gesperrt: nur für diese Sitzung */ }
}
const sp = name => S.spieler[name] || (S.spieler[name] = neuerSpieler());

/* ---------- Weltdaten ---------- */
let P = null, pIdx = {}, V = null, IDS = null, W = null, WELT = "de259", SPALTEN = undefined;
const byXY = new Map(), byId = new Map();
// Dorfpunkte laut Weltdaten: erkennt Zeilen der Stammes-Truppenübersicht ohne Kopfzeile (Dennis 14.11.2026)
const punkteVon = (x, y) => { const i = byXY.get(x * 1000 + y); return i != null && V ? V.rows[i][2] : null; };
const spielerName = p => p >= 0 && P && P.rows[p] ? P.rows[p][pIdx.name] : "Barbaren";
const dorf = i => { const r = V.rows[i]; return {id: IDS[i], x: Math.floor(r[0] / 1000), y: r[0] % 1000, owner: r[1], pts: r[2], name: r[4]}; };
const koord = d => d.x + "|" + d.y;

/* ---------- Plan einlesen ---------- */
let PLAN = null;           // {items, fehler, meta, je: [{n, fehler}] je eingefügtem Plan}
let BEF = null;            // gelesene Befehlsübersichten und Abgleich
let AENDERUNG = null;      // letzte Zeitänderung (Knöpfe in Abschnitt 3)
let NEU = null;            // Ergebnis von fakesNachImport
let BEGLEIT = null;        // letztes Aufstocken des Begleitschutzes (Knöpfe in Abschnitt 3)
const UEB = new Map();     // Spieler → gelesene Truppenübersicht
function uebersichtLesen(name) {
  const text = sp(name).uebersicht;
  if (!text.trim()) return null;
  const o = K.parseOverview(text, SPALTEN, punkteVon);
  o.villages.forEach(v => {
    const i = byXY.get(v.x * 1000 + v.y);
    const d = i != null && IDS ? dorf(i) : null;
    v.id = d ? d.id : null; v.pts = d ? d.pts : 0; v.owner = d ? d.owner : null;
  });
  return o;
}
function einlesen() {
  NEU = null; BEF = null;
  // alle eingefügten Pläne zusammen; Fehler mit der Nummer des Plans
  const teile = S.texte.map(t => t.trim() ? K.parsePlan(t) : null);
  // Pläne bleiben getrennt (Dennis 13.11.2026 17:20): jeder Befehl merkt sich seinen Plan; nur Angleichen, Staffeln und
  // die Fakezahl je Ziel schauen über alle Pläne
  PLAN = teile.some(Boolean) ? {items: [], fehler: [], meta: {}, je: teile.map(p => p ? {n: p.items.length, fehler: p.fehler, meta: p.meta || {}} : null)} : null;
  teile.forEach((p, i) => {
    if (!p) return;
    p.items.forEach(it => { it.plan = i; PLAN.items.push(it); });
    p.fehler.forEach(f => PLAN.fehler.push((teile.filter(Boolean).length > 1 ? "Plan " + (i + 1) + ": " : "") + f));
    if (!PLAN.meta.world && p.meta && p.meta.world) PLAN.meta = p.meta;
  });
  if (!PLAN || !IDS) return;
  // Spieler des Plans ohne eigene Übersicht: Übersicht und Abschickzeiträume aus dem Angriffsplaner dieses Browsers
  // (Dennis 13.11.2026 14:36: Aufstocken ohne Übersicht brachte nichts, ohne Hinweis)
  const namen = new Set(S.dazu);
  PLAN.items.forEach(it => { const a = byId.get(it.source); if (a != null && V.rows[a][1] >= 0) namen.add(spielerName(V.rows[a][1])); });
  const pl = planerDaten();
  let neuGeholt = false;
  namen.forEach(n => {
    const d = pl.get(n);
    if (!d) return;
    const s = sp(n);
    if (!s.uebersicht.trim()) { s.uebersicht = d.text; s.ausPlaner = true; neuGeholt = true; }
    if (!s.fenster.trim() && d.fenster) { s.fenster = d.fenster; s.fensterAusPlaner = true; neuGeholt = true; }
  });
  if (neuGeholt) speichern();
  // Truppenübersichten: Befehle aus Dörfern einer Übersicht gehören diesem Spieler, auch wenn das Dorf laut Weltdaten
  // inzwischen jemand anderem gehört; sonst zählt der Besitzer laut Weltdaten
  UEB.clear();
  const ovVon = new Map();
  Object.keys(S.spieler).forEach(n => {
    const o = uebersichtLesen(n);
    if (!o) return;
    UEB.set(n, o);
    o.villages.forEach(v => { if (v.id != null && !ovVon.has(v.id)) ovVon.set(v.id, n); });
  });
  PLAN.items.forEach(it => {
    const a = byId.get(it.source), b = byId.get(it.destination);
    it.v = a != null ? dorf(a) : null; it.t = b != null ? dorf(b) : null;
    it.spieler = ovVon.get(it.source) || (it.v ? spielerName(it.v.owner) : "Dorf " + it.source);
    it.art = K.importArt(it);
    it.sendMs = it.v && it.t ? it.arrivalMs - K.travelS(W, it.slow || "ram", K.dist(it.v, it.t)) * 1000 : null;
    // angeglichene oder gestaffelte Ankunft (Abschnitt 3) wieder anwenden
    it.arrivalOrig = it.arrivalMs;
    it.key = it.source + ">" + it.destination + "@" + it.arrivalMs + "#" + it.type;
    const z = S.zeiten[it.key];
    if (z != null && it.sendMs != null) { it.sendMs += z - it.arrivalMs; it.arrivalMs = z; }
  });
  // Befehlsübersichten: was schon unterwegs ist (fest, mit echter Ankunft)
  if (S.befehle.trim()) {
    const b = K.parseBefehle(S.befehle, Date.now(), SPALTEN);
    BEF = Object.assign(b, K.befehleAbgleichen(PLAN.items, b.befehle));
  }
  // aufgestockter AG-Begleitschutz (Abschnitt 3) wieder anwenden, nicht auf schon abgeschickte Befehle
  PLAN.items.forEach(it => {
    const z = S.begleit[it.key];
    if (!z || it.gesendet != null) return;
    it.begleitAlt = {}; it.begleit = {};
    Object.keys(z).forEach(u => { if (u in it.units) { it.begleitAlt[u] = it.units[u]; it.units[u] = z[u]; it.begleit[u] = z[u]; } });
  });
  // Ankunft der neuen Fakes: Standard der Zeitraum des Plans; neuer Plan, neuer Standard
  const arr = PLAN.items.map(it => it.arrivalOrig);
  if (arr.length) {
    const sig = Math.min(...arr) + ":" + Math.max(...arr);
    if (S.ankPlan !== sig || !S.ank.trim()) { S.ankPlan = sig; S.ank = K.fmtZeit(Math.min(...arr)) + " bis " + K.fmtZeit(Math.max(...arr)); }
  }
}
/** Spieler des Plans, die mit den meisten Befehlen zuerst, dahinter von Hand dazugenommene. */
function spielerListe() {
  const n = new Map();
  (PLAN ? PLAN.items : []).forEach(it => n.set(it.spieler, (n.get(it.spieler) || 0) + 1));
  const liste = [...n.keys()].sort((a, b) => n.get(b) - n.get(a));
  S.dazu.forEach(x => { if (!liste.includes(x)) liste.push(x); });
  return liste;
}

/* ---------- Aufstocken ---------- */
function aufstocken() {
  if (!PLAN) return;
  const ank = K.parseAnkunft(S.ank);
  const spieler = spielerListe().map(name => {
    const s = sp(name), o = UEB.get(name);
    return {key: name, name, soll: parseInt(s.soll, 10) || 0, rammenMax: s.rammenMax === "" ? null : Math.max(0, parseInt(s.rammenMax, 10) || 0),
            fenster: K.parseFenster(s.fenster).fenster, villages: o ? o.villages : []};
  });
  // laufende Angriffe aus den Befehlsübersichten, die in keinem Plan stehen: zählen auf ihrem Ziel mit (Dennis 13.11.2026
  // 17:20: ein Dorf, auf das schon 5 Fakes laufen, nicht weiter auffüllen) und sperren das Paar Herkunft und Ziel
  const id = k => { const i = byXY.get(k.x * 1000 + k.y); return i != null && IDS ? IDS[i] : null; };
  const laufend = BEF ? BEF.ohnePlan.map(b => ({source: id(b.von), destination: id(b.nach)})).filter(b => b.source != null && b.destination != null) : [];
  NEU = ank.fehler ? {fehler: ank.fehler} : K.fakesNachImport({world: W, cfg: S.cfg, now: Date.now(), seed: S.seed, ankunft: ank,
    zielArten: S.arten, items: PLAN.items, spieler, laufend});
  // neue Fakes gehören in den Plan, in dem der Spieler die meisten Befehle hat; ohne Befehle: eigene Gruppe (-1)
  if (NEU.neu) NEU.neu.forEach(f => { f.plan = hauptPlan(f.spieler); f.art = "fake"; });
}
function hauptPlan(name) {
  const n = new Map();
  PLAN.items.forEach(it => { if (it.spieler === name) n.set(it.plan, (n.get(it.plan) || 0) + 1); });
  let best = -1, c = 0;
  n.forEach((v, k) => { if (v > c) { c = v; best = k; } });
  return best;
}
/** Überschrift eines Plans: Nummer, Name (Feld oder Titel aus DS-Ultimate) und seine Spieler. */
function planLabel(i) {
  if (i < 0) return "Neue Fakes von Spielern ohne Befehle in den Plänen";
  const meta = PLAN.je[i] && PLAN.je[i].meta || {}, name = S.namen[i] || meta.title || "";
  const sp = [...new Set(PLAN.items.filter(x => x.plan === i).map(x => x.spieler))];
  return "Plan " + (i + 1) + (name ? ": " + name : "") + (sp.length ? " (" + (sp.length > 3 ? sp.slice(0, 3).join(", ") + " …" : sp.join(", ")) + ")" : "");
}
const planMeta = i => i >= 0 && PLAN.je[i] ? PLAN.je[i].meta : {};
const dateiPlan = i => (i < 0 ? "neue_spieler" : "plan" + (i + 1) + (S.namen[i] ? "_" + dateiTeil(S.namen[i]) : ""));

/* ---------- Anzeige ---------- */
const KURZ = {spear: "Speer", sword: "Schwert", axe: "Axt", archer: "Bogen", spy: "Späher", light: "LKav", marcher: "BB", heavy: "SKav",
              ram: "Ramme", catapult: "Kata", knight: "Pala", snob: "AG"};
const ART = {off: "Off", ag: "AG", fake: "Fake"};
// Einheiten als Text (Standard-Off „all“, Dennis 14.11.2026) als „alle Axt“
const einheitenText = (u, text) => K.UNITS.filter(x => u[x] > 0 || (text && text[x]))
  .map(x => (text && text[x] ? (text[x] === K.VORLAGE_ALLE ? "alle" : text[x]) : nf.format(u[x])) + " " + KURZ[x]).join(", ") || "–";
const zeitKurz = (ms, mitMs) => { const t = K.fmtZeit(ms, mitMs); return t.slice(0, 6) + t.slice(10); };
const dauer = ms => { const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return h + ":" + String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
/** Truppen eines Befehls; aufgestockter Begleitschutz mit der eingelesenen Zahl darunter. */
function truppenZelle(it) {
  const z = el("span", "ap-units", einheitenText(it.units, it.text));
  if (it.begleit) z.append(el("span", "au-alt", "Begleitschutz aufgestockt, eingelesen " +
    Object.keys(it.begleit).map(u => nf.format(it.begleitAlt[u] || 0) + " " + KURZ[u]).join(", ")));
  return z;
}
function befehlsTabelle(items) {
  const cols = [["#", "num"], ["Spieler", null, "text"], ["Herkunft", null, "text"], ["Ziel", null, "text"], ["Zielspieler", null, "text"],
                ["Art", null, "text"], ["Truppen"], ["Abschick", "num", true], ["Ankunft", "num", true], ["Laufzeit", "num", true]];
  const rows = items.map(it => {
    const art = el("span", "ap-kind k-" + it.art, ART[it.art]);
    if (it.neu) art.append(el("span", "au-neu", "neu"));
    if (it.gesendet != null) art.append(el("span", "au-weg", "unterwegs"));
    else if ((it.arrivalOrig != null && it.arrivalMs !== it.arrivalOrig) || it.begleit) art.append(el("span", "au-geaendert", "geändert"));
    const ank = el("span", null, zeitKurz(it.gesendet != null ? it.gesendet : it.arrivalMs, true));
    if (it.gesendet != null && Math.abs(it.gesendet - it.arrivalMs) >= 1000) ank.append(el("span", "au-alt", "geplant " + zeitKurz(it.arrivalMs, true)));
    else if (it.gesendet == null && it.arrivalOrig != null && it.arrivalMs !== it.arrivalOrig) ank.append(el("span", "au-alt", "eingelesen " + zeitKurz(it.arrivalOrig, true)));
    return [["", "num"], [it.spieler], [it.v ? it.v.name + " (" + koord(it.v) + ")" : "Dorf-ID " + it.source + " (unbekannt)", null, it.v ? koord(it.v) : ""],
            [it.t ? koord(it.t) : "Dorf-ID " + it.destination + " (unbekannt)"], [it.t ? spielerName(it.t.owner) : "–"],
            [art, null, ART[it.art] + (it.neu ? " neu" : "") + (it.gesendet != null ? " unterwegs" : "")], [truppenZelle(it)],
            [it.sendMs != null ? zeitKurz(it.sendMs) : "–", "num", it.sendMs], [ank, "num", it.gesendet != null ? it.gesendet : it.arrivalMs],
            [it.sendMs != null ? dauer(it.arrivalMs - it.sendMs) : "–", "num", it.sendMs != null ? it.arrivalMs - it.sendMs : null]];
  });
  const t = table(cols, rows, {counter: 0, sort: 7, dir: "asc"});
  [...t.tBodies[0].rows].forEach((tr, i) => {
    const it = items[i];
    if (it && it.neu) tr.classList.add("neu");
    else if (it && it.gesendet == null && ((it.arrivalOrig != null && it.arrivalMs !== it.arrivalOrig) || it.begleit)) tr.classList.add("geaendert");
  });
  const box = el("div", "ap-scroll"); box.append(t);
  return box;
}
async function kopieren(text, btn, n) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.append(ta); ta.select();
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    ta.remove();
  }
  const m = el("span", "ap-done", ok ? " kopiert (" + n + " Befehle)" : " Kopieren nicht möglich");
  btn.after(m);
  setTimeout(() => m.remove(), 2500);
}
function herunterladen(text, name, typ) {
  const url = URL.createObjectURL(new Blob([text], {type: typ}));
  const a = el("a"); a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const HINW = {dsu: "In DS-Ultimate einen Angriffsplan für Welt 259 öffnen (für den getrennten Fake-Plan am besten einen neuen), „Import DS-Ultimate“, einfügen. Große Pläne teilt DS-Ultimate selbst in Blöcke zu 200 Befehlen.",
              wb: "In DS Workbench im Angriffsplaner die Tabelle des Plans öffnen, Rechtsklick „Aus Zwischenablage einfügen“ (Strg+V). DS-Ultimate liest dasselbe als WB-Import."};
/** Exportzeilen: je Auswahl ein Knopf zum Kopieren und einer für die Datei; bei mehreren Spielern auch je Spieler. */
/** Exportformat (DS-Ultimate oder DS Workbench), einmal je Abschnitt; gilt für alle Exportknöpfe. */
function formatZeile(name) {
  const box = el("div", "au-teil"), wahl = el("div", "ap-row");
  wahl.append(el("span", "ap-note", "Exportformat:"));
  [["dsu", "DS-Ultimate"], ["wb", "DS Workbench"]].forEach(([w, t]) => {
    const l = el("label"), r0 = document.createElement("input");
    r0.type = "radio"; r0.name = "fmt-" + name; r0.value = w; r0.checked = (S.expFmt === "wb" ? "wb" : "dsu") === w;
    r0.addEventListener("change", () => { S.expFmt = w; speichern(); zeigen(); });
    l.append(r0, document.createTextNode(" " + t));
    wahl.append(l);
  });
  box.append(wahl, el("p", "ap-note", HINW[S.expFmt === "wb" ? "wb" : "dsu"]));
  return box;
}
/** Exportknöpfe: je Zeile ein Knopf zum Kopieren und einer für die Datei. meta: Kopf des eingelesenen Plans. */
function exportBox(auswahl, meta) {
  const box = el("div", "au-teil");
  const text = its => S.expFmt === "wb" ? K.importWB(its) : JSON.stringify(K.importDSU(its, Object.assign({world: WELT, twWorld: WELT}, meta || {})));
  auswahl.forEach(([wer, knoepfe]) => {
    const z = el("div", "ap-exp");
    z.append(el("span", "wer", wer));
    knoepfe.forEach(([t, its, name]) => {
      const b = el("button", "tw", t + " (" + its.length + ")");
      b.type = "button"; b.disabled = !its.length;
      b.addEventListener("click", () => kopieren(text(its), b, its.length));
      const d = el("button", "tw", "⤓"); d.type = "button"; d.disabled = !its.length; d.title = "als Datei herunterladen";
      d.addEventListener("click", () => herunterladen(text(its), name + (S.expFmt === "wb" ? ".txt" : ".json"), S.expFmt === "wb" ? "text/plain" : "application/json"));
      z.append(b, d);
    });
    box.append(z);
  });
  return box;
}
const dateiTeil = s => s.replace(/[^A-Za-z0-9äöüÄÖÜß_-]+/g, "_");
/** Abschicksitzungen eines Spielers aus allen seinen Befehlen (alte und neue), mit Zahlen je Art. */
function sitzungen(its) {
  const s = its.filter(it => it.sendMs != null).slice().sort((a, b) => a.sendMs - b.sendMs);
  const out = [];
  s.forEach(it => {
    const l = out[out.length - 1];
    if (!l || it.sendMs - l.bis > K.SITZUNG_PAUSE_MS) out.push({von: it.sendMs, bis: it.sendMs, off: 0, ag: 0, fake: 0, neu: 0});
    const z = out[out.length - 1];
    z.bis = it.sendMs; z[it.art]++; if (it.neu) z.neu++;
  });
  return out;
}
const plural = (n, a, b) => n + " " + (n === 1 ? a : b);
/** Auffälligkeiten im eingelesenen Plan, als Liste (leer: nichts auffällig). */
function pruefListe(its, mitFakes) {
  const p = K.planPruefen(its, S.cfg.fakes_max_je_dorf), ul = el("ul", "ap-list");
  const ort = id => { const i = byId.get(id); return i != null ? koord(dorf(i)) : "Dorf-ID " + id; };
  if (p.doppelt) ul.append(el("li", "warn", plural(p.doppelt, "Befehl steht", "Befehle stehen") + " doppelt im Plan (gleiche Herkunft, gleiches Ziel, gleiche Ankunft): wohl zweimal importiert."));
  if (mitFakes && p.zielDoppelt) ul.append(el("li", "warn", plural(p.zielDoppelt, "Dorf schickt", "Dörfer schicken") + " mehr als einen Fake auf dasselbe Ziel."));
  if (mitFakes && p.ueber.length) ul.append(el("li", "warn", plural(p.ueber.length, "Dorf schickt", "Dörfer schicken") + " mehr als " + S.cfg.fakes_max_je_dorf + " Fakes („Fakes aus einem Dorf höchstens“): " +
    p.ueber.slice(0, 12).map(x => ort(x.source) + " (" + x.n + ")").join(", ") + (p.ueber.length > 12 ? " …" : "")));
  return ul.childElementCount ? ul : null;
}

/** Eingabefelder für die Pläne; neu gebaut nur beim Hinzufügen und Entfernen, sonst bleibt der Fokus. */
function planFelder() {
  const box = $("plaene");
  box.replaceChildren(...S.texte.map((t, i) => {
    const d = el("div", "au-plan"), kopf = el("div", "kopf");
    const name = eingabe("", S.namen[i] || "", v => { S.namen[i] = v.trim(); speichern(); spaeter(zeigen); }, {placeholder: "Name, z. B. Spieler oder Op", "data-k": "pname:" + i});
    name.style.width = "18em";
    kopf.append(el("strong", null, "Plan " + (i + 1)), name, el("span", "ap-note", ""));
    if (S.texte.length > 1) {
      const x = el("button", "tw", "entfernen"); x.type = "button";
      x.addEventListener("click", () => { S.texte.splice(i, 1); S.namen.splice(i, 1); S.zeiten = {}; S.begleit = {}; planGeaendert(); planFelder(); });
      kopf.append(x);
    }
    const ta = el("textarea", "ap-ta" + (S.texte.length > 1 ? " klein" : "")); ta.spellcheck = false; ta.value = t;
    ta.placeholder = '{"title":null,"uvMode":0,"world":"de259","items":[…]}';
    const neu = () => { if (S.texte[i] === ta.value) return; S.texte[i] = ta.value; planGeaendert(); };
    ta.addEventListener("change", neu);
    ta.addEventListener("paste", () => setTimeout(neu, 0));
    d.append(kopf, ta);
    return d;
  }));
}
function planGeaendert() { S.aktiv = false; AENDERUNG = null; BEGLEIT = null; speichern(); spaeter(() => { einlesen(); zeigen(); }); }
function zeigenPlan() {
  const note = $("plan-note");
  [...$("plaene").querySelectorAll(".au-plan")].forEach((d, i) => {
    const j = PLAN && PLAN.je ? PLAN.je[i] : null, n = d.querySelector(".kopf .ap-note");
    if (n) { n.textContent = j ? plural(j.n, "Befehl", "Befehle") + (j.fehler.length ? ", " + j.fehler.length + " nicht gelesen" : "") : ""; n.className = j && j.fehler.length ? "ap-warn" : "ap-note"; }
  });
  const bn = $("befehle-note");
  if (BEF) {
    bn.className = BEF.fehler.length ? "ap-warn" : "ap-note";
    bn.textContent = plural(BEF.befehle.length, "Angriff", "Angriffe") + " gelesen, " + BEF.zugeordnet + " davon im Plan gefunden (unterwegs, bleiben fest)" +
      (BEF.ohnePlan.length ? ", " + BEF.ohnePlan.length + " ohne passenden Befehl im Plan" : "") + (BEF.fehler.length ? "; " + BEF.fehler.slice(0, 2).join("; ") : "") +
      (BEF.befehle.length && !S.befehle.includes("Serverzeit") ? ". Ohne Zeile „Serverzeit“ gelten „heute“ und „morgen“ ab dem heutigen Tag." : "");
  } else bn.textContent = S.befehle.trim() ? "Noch kein Plan eingelesen." : "";
  if (!IDS) { note.textContent = "Dorf-IDs fehlen in den Weltdaten, Einlesen nicht möglich."; note.className = "ap-warn"; return; }
  if (!PLAN) { note.textContent = ""; return; }
  const it = PLAN.items, n = a => it.filter(x => x.art === a).length, unb = it.filter(x => !x.v || !x.t).length;
  const arr = it.map(x => x.arrivalMs);
  note.className = PLAN.fehler.length || unb ? "ap-warn" : "ap-note";
  note.textContent = !it.length ? (PLAN.fehler[0] || "Kein Befehl erkannt.")
    : plural(it.length, "Befehl", "Befehle") + ": " + n("off") + " Offs, " + n("ag") + " AGs, " + n("fake") + " Fakes, " + plural(spielerListe().length, "Spieler", "Spieler") +
      ", Ankunft " + zeitKurz(Math.min(...arr)) + " bis " + zeitKurz(Math.max(...arr)) +
      (unb ? "; " + unb + " mit Dorf, das nicht in den Weltdaten steht (Laufzeit unbekannt, für das Aufstocken ohne Wirkung)" : "") +
      (PLAN.fehler.length ? "; " + PLAN.fehler.length + " nicht gelesen: " + PLAN.fehler.slice(0, 3).join("; ") : "");
}
/** Zeiten der Offs und AGs anpassen (Dennis 13.11.2026 15:40): AGs an abgeschickte Offs angleichen, Offs vor dem AG
    staffeln oder wieder in eine Sekunde legen, alles zurück. Änderungen bleiben im Browser (S.zeiten). */
function zeitenAendern(was, auto) {
  if (!PLAN) return;
  const vorher = new Map(PLAN.items.map(it => [it, it.arrivalMs]));
  let info;
  if (was === "zurueck") {
    S.zeiten = {};
    PLAN.items.forEach(it => { if (it.arrivalOrig != null && it.sendMs != null) { it.sendMs += it.arrivalOrig - it.arrivalMs; it.arrivalMs = it.arrivalOrig; } });
    info = {art: "zurueck"};
  } else if (was === "angleichen") {
    info = {art: "angleichen", liste: K.agsAngleichen(PLAN.items, {now: Date.now()})};
  } else {
    const rng = K.mulberry32((Date.now() & 0x7fffffff) || 1);
    info = Object.assign({art: was}, K.offsZeitenNeu(PLAN.items, {art: was, minMin: S.staffel.min, maxMin: S.staffel.max, now: Date.now(), world: W,
      minGapMs: (S.cfg.min_send_gap_s || 0) * 1000, rng}));
  }
  const geaendert = PLAN.items.filter(it => it.arrivalMs !== vorher.get(it));
  PLAN.items.forEach(it => { if (it.key == null) return; if (it.arrivalMs === it.arrivalOrig) delete S.zeiten[it.key]; else S.zeiten[it.key] = it.arrivalMs; });
  AENDERUNG = Object.assign(info, {geaendert: geaendert.map(it => ({it, alt: vorher.get(it)})), zeit: Date.now(), auto: !!auto});
  speichern();
  if (S.aktiv) aufstocken();
  zeigen();
}
function zeitenBox(its) {
  const box = el("div", "au-box");
  const agZiele = new Set(its.filter(x => x.art === "ag" && x.t).map(x => x.t.id));
  box.append(el("h3", null, "Zeiten anpassen"),
    el("p", "ap-note", "„AGs angleichen“: Jeder AG-Train landet in derselben Sekunde direkt hinter der Off, die auf sein Ziel als letzte abgeschickt wird, aus allen Plänen; für schon abgeschickte Offs zählt die Ankunft laut Befehlsübersicht (Abschnitt 2). Das passiert beim Einfügen einer Befehlsübersicht automatisch; Offs anderer Spieler, die erst nach dem Train landen, stehen unten. „Offs staffeln“: Auf jedes AG-Ziel landet nur die Off, die als letzte abgeschickt wird, in der Sekunde des AG-Trains, die anderen zufällig " +
      S.staffel.min + " bis " + S.staffel.max + " Minuten vorher (untereinander mehr Rammen zuerst), nie im Nachtbonus. „Offs auf die Sekunde“: alle Offs wieder direkt vor dem Train, je 200 ms. Unverändert bleiben Befehle, die schon unterwegs sind oder dafür vor jetzt plus einer Minute losmüssten, und der Mindestabstand zwischen den Abschickzeiten eines Spielers."));
  const zahl = (k, lab) => eingabe("n", S.staffel[k], v => { const n = parseFloat(String(v).replace(",", ".")); if (!isNaN(n)) S.staffel[k] = Math.min(60, Math.max(0, n)); if (S.staffel.max < S.staffel.min) S.staffel.max = S.staffel.min; speichern(); spaeter(zeigenKern); }, {type: "number", min: 0, max: 60, "data-k": "staffel:" + k, title: lab});
  const r1 = el("div", "ap-row");
  r1.append(el("span", "ap-note", "Offs staffeln von"), zahl("min", "Minuten vorher, mindestens"), el("span", "ap-note", "bis"), zahl("max", "Minuten vorher, höchstens"), el("span", "ap-note", "Minuten vor dem AG"));
  const r2 = el("div", "ap-row");
  [["angleichen", "AGs an abgeschickte Offs angleichen"], ["staffeln", "Offs staffeln"], ["sekunde", "Offs auf die Sekunde"], ["zurueck", "↺ Zeiten wie eingelesen"]].forEach(([w, t]) => {
    const b = el("button", "tw", t); b.type = "button";
    if (w === "zurueck") b.disabled = !Object.keys(S.zeiten).length;
    if (w !== "zurueck") b.disabled = !agZiele.size;
    b.addEventListener("click", () => zeitenAendern(w));
    r2.append(b);
  });
  box.append(r1, r2);
  if (!agZiele.size) box.append(el("p", "ap-note", "Keine AGs im Plan: nichts anzugleichen oder zu staffeln."));
  if (AENDERUNG) {
    const a = AENDERUNG, ul = el("ul", "ap-list"), um = hmf.format(new Date(a.zeit)) + " Uhr" + (a.auto ? " (nach dem Einlesen der Befehlsübersicht)" : "") + ": ";
    const min = ms => ms >= 60000 ? (Math.round(ms / 6000) / 10).toLocaleString("de-DE") + " min" : (Math.round(ms / 100) / 10).toLocaleString("de-DE") + " s";
    if (a.art === "zurueck") ul.append(el("li", null, um + "alle Zeiten wie eingelesen."));
    else if (a.art === "angleichen") {
      if (!a.liste.some(x => x.art !== "nachTrain")) ul.append(el("li", null, um + "alle AG-Trains liegen schon in der Sekunde der zuletzt abgeschickten Off."));
      const danach = x => x.nachTrain || x.n ? " " + plural(x.nachTrain || x.n, "Off landet", "Offs landen") + " erst nach dem Train." : "";
      a.liste.forEach(x => {
        const z = koord(x.t) + " (" + spielerName(x.t.owner) + "): ";
        if (x.art === "spaeter") ul.append(el("li", null, um + z + plural(x.ags, "AG", "AGs") + " " + min(x.ms) + " später, jetzt mit der zuletzt abgeschickten Off." + danach(x)));
        else if (x.art === "frueher") ul.append(el("li", null, um + z + plural(x.ags, "AG", "AGs") + " " + min(x.ms) + " früher, jetzt mit der zuletzt abgeschickten Off." + danach(x)));
        else if (x.art === "frueherNichtMoeglich") ul.append(el("li", "warn", um + z + "AG-Train landet " + min(x.ms) + " nach der zuletzt abgeschickten Off; früher abschicken geht nicht mehr, er bleibt." + danach(x)));
        else if (x.art === "zuSpaet") ul.append(el("li", "warn", um + z + "AG schon unterwegs und landet vor der zuletzt abgeschickten Off."));
        else if (x.art === "nachTrain") ul.append(el("li", "warn", um + z + "Train passt zur zuletzt abgeschickten Off;" + danach(x)));
      });
    } else ul.append(el("li", null, um + (a.offs ? plural(a.offs, "Off", "Offs") + " auf " + plural(a.ziele, "Ziel", "Zielen") + (a.art === "staffeln" ? " gestaffelt." : " wieder direkt vor den Train gelegt.") : "nichts zu ändern (Offs schon so, unterwegs oder zu knapp vor jetzt).")));
    box.append(ul);
    if (a.geaendert.length) {
      const d = el("details", "au-det");
      d.append(el("summary", null, plural(a.geaendert.length, "Befehl", "Befehle") + " geändert"));
      const ul2 = el("ul", "au-sitz");
      a.geaendert.slice().sort((p, q) => p.it.sendMs - q.it.sendMs).forEach(({it, alt}) => ul2.append(el("li", null, it.spieler + ": " + ART[it.art] + " " + (it.v ? koord(it.v) : it.source) + " → " + (it.t ? koord(it.t) : it.destination) +
        ", Abschick " + zeitKurz(it.sendMs - (it.arrivalMs - alt)) + " → " + zeitKurz(it.sendMs) + ", Ankunft " + zeitKurz(alt, true) + " → " + zeitKurz(it.arrivalMs, true))));
      d.append(ul2);
      box.append(d);
    }
  }
  return box;
}
/** AG-Begleitschutz aufstocken (Dennis 14.11.2026 00:52): AGs mit nur Schwert oder nur Axt unter dem Mindestwert auf den
    Mindestwert (Rechnung K.begleitAufstocken), oder alles wie eingelesen. Bleibt im Browser (S.begleit), Export mit den neuen
    Zahlen. Jedes Drücken rechnet vom eingelesenen Stand aus neu, damit geänderte Mindestwerte ganz gelten. */
function begleitAendern(was) {
  if (!PLAN) return;
  PLAN.items.forEach(it => { if (it.begleitAlt) Object.assign(it.units, it.begleitAlt); delete it.begleitAlt; delete it.begleit; });
  S.begleit = {};
  let info = {art: "zurueck"};
  if (was === "auf") {
    const doerfer = new Map();
    UEB.forEach(o => o.villages.forEach(v => { if (v.id != null && !doerfer.has(v.id)) doerfer.set(v.id, v.units); }));
    const r = K.begleitAufstocken(PLAN.items, S.begleitMin, doerfer);
    r.aenderungen.forEach(a => {
      const it = a.it;
      it.begleitAlt = Object.assign(it.begleitAlt || {}, {[a.u]: a.alt});
      it.begleit = Object.assign(it.begleit || {}, {[a.u]: a.neu});
      it.units[a.u] = a.neu;
      S.begleit[it.key] = it.begleit;
    });
    const ungeprueft = new Set(r.aenderungen.filter(a => !doerfer.has(a.it.source)).map(a => a.it.source));
    info = Object.assign({art: "auf", ungeprueft: ungeprueft.size}, r);
  }
  BEGLEIT = Object.assign(info, {zeit: Date.now()});
  speichern();
  if (S.aktiv) aufstocken();
  zeigen();
}
function begleitBox(its) {
  const box = el("div", "au-box");
  const ags = its.filter(x => x.art === "ag"), ort = it => it.v ? koord(it.v) : "Dorf-ID " + it.source;
  box.append(el("h3", null, "Begleitschutz der AGs"),
    el("p", "ap-note", "„Begleitschutz aufstocken“: AGs, die nur Schwert oder nur Axt als Begleitschutz tragen und darunter liegen, bekommen den Mindestwert (AGs aus Deff-Dörfern laufen mit Schwert, aus Off-Dörfern mit Axt). Unverändert bleiben Befehle, die schon unterwegs sind, AGs mit genug Schwert oder Axt (etwa das AG mit der ganzen Off) und „alle“; AGs ohne Schwert und Axt oder mit beidem darunter stehen unten. Mindestwert 0 schaltet die Einheit ab. Danach die betroffenen Spieler neu nach DS-Ultimate importieren (unten „nur geänderte“ oder „noch nicht abgeschickt“)."));
  const zahl = (u, lab) => eingabe("n", S.begleitMin[u], v => { const n = parseInt(v, 10); if (!isNaN(n)) S.begleitMin[u] = Math.min(100000, Math.max(0, n)); speichern(); spaeter(zeigenKern); },
    {type: "number", min: 0, max: 100000, "data-k": "begleit:" + u, title: lab});
  const r1 = el("div", "ap-row");
  r1.append(el("span", "ap-note", "Schwert mindestens"), zahl("sword", "Schwertkämpfer je AG mindestens"), el("span", "ap-note", "Axt mindestens"), zahl("axe", "Axtkämpfer je AG mindestens"));
  [["auf", "Begleitschutz aufstocken"], ["zurueck", "↺ Begleitschutz wie eingelesen"]].forEach(([w, t]) => {
    const b = el("button", "tw", t); b.type = "button";
    b.disabled = w === "zurueck" ? !Object.keys(S.begleit).length : !ags.length;
    b.addEventListener("click", () => begleitAendern(w));
    r1.append(b);
  });
  box.append(r1);
  if (!ags.length) { box.append(el("p", "ap-note", "Keine AGs im Plan.")); return box; }
  const n = its.filter(x => x.begleit).length;
  const a = BEGLEIT, ul = el("ul", "ap-list");
  if (!a) {
    if (n) ul.append(el("li", null, plural(n, "AG trägt", "AGs tragen") + " aufgestockten Begleitschutz (gespeichert in diesem Browser)."));
  } else if (a.art === "zurueck") ul.append(el("li", null, hmf.format(new Date(a.zeit)) + " Uhr: Begleitschutz wie eingelesen."));
  else {
    const um = hmf.format(new Date(a.zeit)) + " Uhr: ", je = u => a.aenderungen.filter(x => x.u === u).length;
    ul.append(el("li", null, um + (a.aenderungen.length ? plural(a.aenderungen.length, "AG", "AGs") + " aufgestockt" +
      [["sword", "Schwert"], ["axe", "Axt"]].filter(([u]) => je(u)).map(([u, t]) => ", " + je(u) + " auf " + nf.format(S.begleitMin[u]) + " " + t).join("") + "."
      : "nichts aufzustocken, alle AGs haben genug Schwert oder Axt.")));
    const ortId = id => { const i = byId.get(id); return i != null ? koord(dorf(i)) : "Dorf-ID " + id; };
    a.knapp.forEach(k => ul.append(el("li", "warn", "Laut Truppenübersicht zu wenig im Dorf " + ortId(k.source) + ": " +
      "das Aufstocken braucht " + nf.format(k.braucht) + " " + KURZ[k.u] + " mehr, frei sind " + nf.format(k.frei) + (k.alle ? " (ein Befehl aus dem Dorf nimmt alle " + KURZ[k.u] + ")" : "") + ".")));
    if (a.ungeprueft) ul.append(el("li", null, plural(a.ungeprueft, "Dorf", "Dörfer") + " ohne Truppenübersicht (Abschnitt 4), dort nicht geprüft, ob genug da ist."));
    const liste = xs => xs.slice(0, 12).map(it => it.spieler + " " + ort(it)).join(", ") + (xs.length > 12 ? " …" : "");
    if (a.ohne.length) ul.append(el("li", "warn", plural(a.ohne.length, "AG ohne", "AGs ohne") + " Schwert und Axt, unverändert: " + liste(a.ohne)));
    if (a.beide.length) ul.append(el("li", "warn", plural(a.beide.length, "AG mit", "AGs mit") + " Schwert und Axt unter dem Mindestwert, unverändert: " + liste(a.beide)));
  }
  if (ul.childElementCount) box.append(ul);
  if (a && a.art === "auf" && a.aenderungen.length) {
    const d = el("details", "au-det");
    d.append(el("summary", null, plural(a.aenderungen.length, "Befehl", "Befehle") + " geändert"));
    const ul2 = el("ul", "au-sitz");
    a.aenderungen.slice().sort((p, q) => (p.it.sendMs || 0) - (q.it.sendMs || 0)).forEach(x => ul2.append(el("li", null, x.it.spieler + ": AG " + ort(x.it) + " → " +
      (x.it.t ? koord(x.it.t) : x.it.destination) + ", " + nf.format(x.alt) + " → " + nf.format(x.neu) + " " + KURZ[x.u])));
    d.append(ul2);
    box.append(d);
  }
  return box;
}
function zeigenKern() {
  const box = $("kern");
  if (!PLAN || !PLAN.items.length) { box.replaceChildren(el("p", "empty", "Noch kein Plan eingelesen.")); $("kern-hint").textContent = ""; return; }
  const its = PLAN.items.filter(x => x.art !== "fake");
  const nG = its.filter(x => x.gesendet == null && x.arrivalOrig != null && x.arrivalMs !== x.arrivalOrig).length, nW = its.filter(x => x.gesendet != null).length;
  const nB = its.filter(x => x.begleit).length;
  $("kern-hint").textContent = its.length + " Befehle" + (nW ? ", " + nW + " davon unterwegs" : "") + (nG ? ", " + nG + " mit geänderter Zeit" : ", Zeiten wie eingelesen") +
    (nB ? ", " + nB + " mit aufgestocktem Begleitschutz" : "") + ".";
  if (!its.length) { box.replaceChildren(el("p", "empty", "Keine Offs oder AGs in den Plänen.")); return; }
  const offen = x => x.gesendet == null, geaendert = x => offen(x) && ((x.arrivalOrig != null && x.arrivalMs !== x.arrivalOrig) || !!x.begleit);
  const knoepfe = (a, name) => [["Offs und AGs", a, name], ["noch nicht abgeschickt", a.filter(offen), name + "_offen"], ["nur geänderte", a.filter(geaendert), name + "_geaendert"]];
  const teile = [zeitenBox(its), begleitBox(its), formatZeile("kern")];
  if (its.some(geaendert)) teile.push(el("p", "ap-warn", "Geänderte Befehle (Zeit oder Begleitschutz): Die betroffenen Spieler brauchen ihren Plan neu. In DS-Ultimate einen neuen Plan anlegen (oder die alten Befehle löschen) und „noch nicht abgeschickt“ importieren; nur die geänderten Befehle tauschen geht mit „nur geänderte“."));
  // je eingelesenem Plan getrennt (Dennis 13.11.2026 17:20)
  PLAN.je.forEach((j, i) => {
    const a = its.filter(x => x.plan === i);
    if (!j || !a.length) return;
    const namen = spielerListe().filter(n => a.some(x => x.spieler === n));
    const d = el("details", "au-det au-planblock"); d.open = true;
    const nW = a.filter(x => x.gesendet != null).length, nG = a.filter(geaendert).length;
    d.append(el("summary", null, planLabel(i) + ": " + a.filter(x => x.art === "off").length + " Offs, " + a.filter(x => x.art === "ag").length + " AGs" +
      (nW ? ", " + nW + " unterwegs" : "") + (nG ? ", " + nG + " geändert" : "")));
    const ausw = [[namen.length > 1 ? "Ganzer Plan" : (namen[0] || "Plan"), knoepfe(a, dateiPlan(i) + "_offs_ags")]];
    if (namen.length > 1) namen.forEach(n => ausw.push([n, knoepfe(a.filter(x => x.spieler === n), dateiPlan(i) + "_offs_ags_" + dateiTeil(n))]));
    d.append(...[pruefListe(a, false), exportBox(ausw, planMeta(i)), befehlsTabelle(a)].filter(Boolean));
    teile.push(d);
  });
  box.replaceChildren(...teile.filter(Boolean));
}
function feld(lab, ctl, extra) {
  const f = el("label", "au-f");
  f.append(el("span", "lab", lab), ctl);
  if (extra) f.append(extra);
  return f;
}
/** Neu zeichnen erst nach dem Fokuswechsel und den Fokus auf das gleiche Feld zurück: sonst ersetzt das Neuzeichnen beim
    Verlassen eines Felds das Feld, in das gerade geklickt wurde, und der Klick geht verloren. Felder tragen data-k. */
let zeichnenTimer = 0, gedrueckt = false, nachLoslassen = null;
document.addEventListener("pointerdown", () => { gedrueckt = true; }, true);
const losgelassen = () => { gedrueckt = false; if (nachLoslassen) { const f = nachLoslassen; nachLoslassen = null; setTimeout(f, 0); } };
document.addEventListener("pointerup", losgelassen, true);
document.addEventListener("pointercancel", losgelassen, true);
function spaeter(fn) {
  clearTimeout(zeichnenTimer);
  // Maustaste noch unten (Klick auf einen Knopf hat das Feld verlassen): erst nach dem Klick neu zeichnen, sonst ersetzt das
  // Neuzeichnen den Knopf zwischen Drücken und Loslassen und der Klick geht verloren
  if (gedrueckt) { nachLoslassen = () => spaeter(fn); return; }
  zeichnenTimer = setTimeout(() => {
    const a = document.activeElement, k = a && a.dataset ? a.dataset.k : null;
    let sel = null;
    try { sel = k && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null; } catch (e) { sel = null; }
    fn();
    const n = k ? [...document.querySelectorAll("[data-k]")].find(x => x.dataset.k === k) : null;
    if (n && n !== a) { n.focus({preventScroll: true}); if (sel) try { n.setSelectionRange(sel[0], sel[1]); } catch (e) { /* Feld ohne Auswahl */ } }
  }, 0);
}
function eingabe(cls, wert, beiAenderung, attrs) {
  const i = el("input", "au-in " + cls);
  Object.entries(attrs || {}).forEach(([k, v]) => { if (k === "data-k") i.dataset.k = v; else i[k] = v; });
  i.value = wert == null ? "" : wert;
  i.addEventListener("change", () => beiAenderung(i.value, i));
  return i;
}
function zeigenFake() {
  const box = $("fake");
  if (!PLAN || !PLAN.items.length) { box.replaceChildren(el("p", "empty", "Noch kein Plan eingelesen.")); $("fake-hint").textContent = ""; return; }
  const alt = PLAN.items.filter(x => x.art === "fake"), neu = NEU && NEU.neu ? NEU.neu : [];
  const alle = alt.concat(neu);
  $("fake-hint").textContent = alt.length + " Fakes aus " + plural(PLAN.je.filter(Boolean).length, "Plan", "Plänen") + (neu.length ? ", " + neu.length + " neu" : "") + "; die Zahl der Fakes je Ziel zählt über alle Pläne und laufende Angriffe aus den Befehlsübersichten.";
  const namen = spielerListe();

  /* Aufstocken */
  const au = el("div", "au-box");
  au.append(el("h3", null, "Fakes aufstocken"),
    el("p", "ap-note", "Je Spieler die gewünschte Gesamtzahl eintragen und seine Truppenübersicht einfügen (wie im Angriffsplaner). Die neuen Fakes gehen aus seinen Dörfern, deren Truppen nach Abzug seiner Befehle im Plan reichen (Katapulte oder eine Ramme, mindestens ein Späher, Fakelimit), auf die Ziele der Pläne, die mit den wenigsten Fakes zuerst (gezählt über alle Pläne und laufende Angriffe aus den Befehlsübersichten), nie zweimal dasselbe Ziel aus einem Dorf. Die neuen Fakes kommen in den Plan, in dem der Spieler die meisten Befehle hat. Abgeschickt werden sie in seinen Abschicksitzungen aus dem Plan (10 Minuten Rand); reichen die nicht, bis zu zwei zusätzliche reine Fake-Sitzungen von je einer Stunde in seinen Abschickzeiträumen, jede nur mit mindestens 10 Fakes. Die Befehle des Plans bleiben unverändert."));
  // gemeinsame Einstellungen
  const ank = K.parseAnkunft(S.ank);
  const ankIn = eingabe("zr", S.ank, v => { S.ank = v; speichern(); spaeter(zeigenFake); }, {spellcheck: false});
  ankIn.dataset.k = "ank";
  if (ank.fehler) ankIn.classList.add("falsch");
  const zz = new Map();
  if (PLAN) {
    const m = new Map();
    PLAN.items.forEach(it => { if (!it.t) return; const z = m.get(it.t.id) || {ag: 0, off: 0}; if (it.art === "ag") z.ag++; else if (it.art === "off") z.off++; m.set(it.t.id, z); });
    m.forEach(z => { const a = z.ag ? "ag" : z.off ? "off" : "fake"; zz.set(a, (zz.get(a) || 0) + 1); });
  }
  const arten = el("div", "ap-row");
  [["ag", "AG-Ziele"], ["off", "Off-Ziele"], ["fake", "Fakeziele"]].forEach(([a, t]) => {
    const l = el("label"), c = document.createElement("input");
    c.type = "checkbox"; c.checked = !!S.arten[a]; c.dataset.k = "art:" + a;
    c.addEventListener("change", () => { S.arten[a] = c.checked; speichern(); });
    l.append(c, document.createTextNode(" " + t + " (" + (zz.get(a) || 0) + ")"));
    arten.append(l);
  });
  const zahl = (k, min, max) => eingabe("n", S.cfg[k], v => { const n = parseFloat(String(v).replace(",", ".")); S.cfg[k] = isNaN(n) ? S.cfg[k] : Math.min(max, Math.max(min, n)); speichern(); if (k === "fakes_max_je_dorf") spaeter(zeigenFake); }, {type: "number", min, max, "data-k": k});
  const gemeinsam = el("div", "au-felder");
  gemeinsam.append(
    feld("Ankunft der neuen Fakes", ankIn, el("span", ank.fehler ? "ap-warn" : "ap-note", ank.fehler || "Standard: Zeitraum des Plans. Nie im Nachtbonus.")),
    feld("Ziele aus dem Plan", arten, el("span", "ap-note", "Art nach dem stärksten Befehl auf das Dorf.")),
    feld("Fakes aus einem Dorf höchstens", zahl("fakes_max_je_dorf", 1, 20), el("span", "ap-note", "Wird je Spieler so weit angehoben, wie seine Zahl es braucht.")),
    feld("Zuschlag Fakelimit (BH)", zahl("fake_extra_pop", 0, 500)),
    feld("Mindestabstand Abschickvorgänge (s)", zahl("min_send_gap_s", 0, 600)));
  au.append(gemeinsam);
  // je Spieler
  const ergebnis = new Map((NEU && NEU.spieler || []).map(r => [r.key, r]));
  namen.forEach(name => {
    const s = sp(name), o = UEB.get(name), eig = PLAN.items.filter(x => x.spieler === name), r = ergebnis.get(name);
    const k = el("div", "au-sp"), kopf = el("div", "kopf");
    kopf.append(el("strong", null, name), el("span", "ap-note", eig.filter(x => x.art === "off").length + " Offs, " + eig.filter(x => x.art === "ag").length + " AGs, " +
      eig.filter(x => x.art === "fake").length + " Fakes im Plan, " + plural(sitzungen(eig).length, "Abschicksitzung", "Abschicksitzungen")));
    if (S.dazu.includes(name)) {
      const x = el("button", "tw", "entfernen"); x.type = "button";
      x.addEventListener("click", () => { S.dazu = S.dazu.filter(n => n !== name); speichern(); einlesen(); zeigen(); });
      kopf.append(x);
    }
    k.append(kopf);
    const f = el("div", "au-felder");
    const ta = el("textarea", "ap-ta klein"); ta.spellcheck = false; ta.value = s.uebersicht;
    ta.placeholder = "Truppenübersicht von " + name + " (Übersichten › Truppen, „Alle“ oder „Eigene“; oder Stamm › Mitglieder › Truppen)";
    ta.dataset.k = "ov:" + name;
    ta.addEventListener("change", () => { if (s.uebersicht === ta.value) return; s.uebersicht = ta.value; s.ausPlaner = false; speichern(); spaeter(() => { einlesen(); zeigen(); }); });
    let ovNote = "";
    if (o) {
      const fremd = o.villages.filter(v => v.id != null && spielerName(v.owner) !== name).length, ohne = o.villages.filter(v => v.id == null).length;
      ovNote = plural(o.villages.length, "Dorf", "Dörfer") + " gelesen" + (ohne ? ", " + ohne + " nicht in den Weltdaten" : "") +
        (fremd ? ", " + fremd + " gehören laut Weltdaten jemand anderem" : "") + (o.errors.length ? "; " + o.errors[0] : "") +
        (s.ausPlaner ? ". Aus dem Angriffsplaner übernommen: haben sich seine Truppen seitdem geändert, die aktuelle Übersicht einfügen." : "");
    }
    const fen = K.parseFenster(s.fenster);
    const fta = el("textarea", "ap-ta klein"); fta.spellcheck = false; fta.value = s.fenster;
    fta.placeholder = "14.11.2026 06:00 bis 09:00\n13.11.2026 18:00 bis 23:00";
    if (fen.fehler.length) fta.classList.add("falsch");
    fta.dataset.k = "fen:" + name;
    fta.addEventListener("change", () => { if (s.fenster === fta.value) return; s.fenster = fta.value; s.fensterAusPlaner = false; speichern(); spaeter(zeigenFake); });
    const soll = eingabe("n", s.soll, v => { s.soll = v; speichern(); }, {type: "number", min: 0, max: 100000, placeholder: String(eig.filter(x => x.art === "fake").length), "data-k": "soll:" + name});
    soll.setAttribute("aria-label", "Fakes insgesamt für " + name);
    const rm = eingabe("n", s.rammenMax, v => { s.rammenMax = v; speichern(); }, {type: "number", min: 0, max: 50, placeholder: "1", "data-k": "rm:" + name});
    const ovWarn = o ? o.errors.length || ovNote.includes("jemand") : parseInt(s.soll, 10) > 0;
    f.append(feld("Truppenübersicht", ta, el("span", ovWarn ? "ap-warn" : "ap-note", ovNote || "Ohne Übersicht keine neuen Fakes für diesen Spieler: hier einfügen (Übersichten › Truppen) oder vorher im Angriffsplaner.")),
      feld("Abschickzeiträume (für zusätzliche Fake-Sitzungen)", fta, el("span", fen.fehler.length ? "ap-warn" : "ap-note", fen.fehler[0] || (s.fensterAusPlaner ? "Aus dem Angriffsplaner übernommen. " : "") + "Je Zeile ein Zeitraum. Leer: nur in seinen Sitzungen aus dem Plan.")),
      feld("Fakes insgesamt (alte und neue)", soll, el("span", "ap-note", "Leer: nicht aufstocken.")),
      feld("Rammen je Fake höchstens", rm, el("span", "ap-note", "Katapulte gehen vor; leer: 1.")));
    k.append(f);
    if (r) {
      const ul = el("ul", "ap-list");
      if (r.soll) {
        const li = el("li", r.ist < r.soll ? "warn" : null, r.vorher + " Fakes im Plan, jetzt " + r.ist + " von " + r.soll + " gewünscht" + (r.ist > r.vorher ? " (" + (r.ist - r.vorher) + " neu)" : ""));
        ul.append(li);
        const g = r.grund;
        if (g && g.keineDoerfer) ul.append(el("li", "warn", r.doerfer.gesamt ? "Kein Dorf seiner Übersicht steht mit Punkten in den Weltdaten, deshalb keine neuen Fakes." : "Keine Truppenübersicht, deshalb keine neuen Fakes. Übersicht oben einfügen und noch einmal aufstocken."));
        else if (g) ul.append(el("li", "warn", "Grenze: " + [g.truppen && plural(g.truppen, "Dorf", "Dörfer") + " ohne Katapulte oder Rammen mit Spähern für einen weiteren Fake",
          g.sitzungen && plural(g.sitzungen, "Dorf", "Dörfer") + " ohne Ziel, das zeitlich in seine Sitzungen passt" + (s.fenster.trim() ? "" : " (Abschickzeiträume eintragen für zusätzliche Fake-Sitzungen)"),
          g.ziele && plural(g.ziele, "Dorf hat", "Dörfer haben") + " schon alle Ziele"].filter(Boolean).join(", ")));
        if (r.extra.length) ul.append(el("li", null, "Zusätzliche Fake-Sitzungen: " + r.extra.map(e => zeitKurz(e.von).slice(0, 12) + " bis " + zeitKurz(e.bis).slice(7, 12) + " (" + e.n + " Fakes)").join(", ")));
      }
      const d = r.doerfer;
      if (d.gesamt) ul.append(el("li", null, "Dörfer laut Übersicht: " + d.gesamt + ", davon " + d.faehig + " können noch faken" +
        [d.belagerung && d.belagerung + " ohne Katapult oder Ramme", d.spaeher && d.spaeher + " ohne Späher", d.limit && d.limit + " unter dem Fakelimit",
         d.punkte && d.punkte + " ohne Dorfpunkte", d.unbekannt && d.unbekannt + " nicht in den Weltdaten"].filter(Boolean).map(x => ", " + x).join("")));
      k.append(ul);
    }
    au.append(k);
  });
  // weiteren Spieler dazunehmen (ohne Befehle im Plan: nur zusätzliche Fake-Sitzungen in seinen Zeiträumen)
  const dz = el("div", "ap-row"), dIn = eingabe("", "", () => {}, {type: "search", placeholder: "Name", autocomplete: "off"});
  dIn.setAttribute("list", "au-spieler"); dIn.style.width = "16em";
  const dl = el("datalist"); dl.id = "au-spieler";
  if (P) P.rows.slice().sort((a, b) => b[pIdx.points] - a[pIdx.points]).slice(0, 3000).forEach(r => { const o = el("option"); o.value = r[pIdx.name]; dl.append(o); });
  const dB = el("button", "tw", "Spieler dazunehmen"); dB.type = "button";
  dB.addEventListener("click", () => {
    const n = dIn.value.trim();
    if (!n || !P || !P.rows.some(r => r[pIdx.name] === n) || namen.includes(n)) return;
    S.dazu.push(n); sp(n); speichern(); zeigenFake();
  });
  dz.append(el("span", "ap-note", "Weiterer Spieler ohne Befehle im Plan (bekommt nur zusätzliche Fake-Sitzungen in seinen Zeiträumen):"), dIn, dl, dB);
  au.append(dz);
  const los = el("div", "ap-row");
  const b = el("button", "tw", "Fakes aufstocken"); b.type = "button";
  b.addEventListener("click", () => {
    if (!namen.some(n => parseInt(sp(n).soll, 10) > 0)) { meld.textContent = "Bei mindestens einem Spieler „Fakes insgesamt“ eintragen."; meld.className = "ap-warn"; return; }
    S.aktiv = true; speichern(); rechnen();
  });
  const zurueck = el("button", "tw", "↺ ohne neue Fakes"); zurueck.type = "button"; zurueck.disabled = !NEU;
  zurueck.addEventListener("click", () => { S.aktiv = false; NEU = null; speichern(); zeigenFake(); });
  const wuerfel = el("button", "tw", "Neu würfeln"); wuerfel.type = "button"; wuerfel.disabled = !NEU || !!NEU.fehler;
  wuerfel.title = "Gleichwertige Verteilung neu auslosen";
  wuerfel.addEventListener("click", () => { S.seed = (S.seed % 100000) + 1; speichern(); rechnen(); });
  const meld = el("span", "ap-note");
  if (NEU && NEU.fehler) { meld.textContent = NEU.fehler; meld.className = "ap-warn"; }
  else if (NEU) {
    const ohne = namen.filter(n => parseInt(sp(n).soll, 10) > 0 && !UEB.get(n));
    meld.textContent = "Berechnet " + hmf.format(new Date()) + " Uhr; die Abschickzeiten beginnen frühestens eine Minute nach dem Berechnen." +
      (ohne.length ? " Ohne Truppenübersicht: " + ohne.join(", ") + "." : "");
    if (ohne.length) meld.className = "ap-warn";
  }
  los.append(b, zurueck, wuerfel, meld);
  au.append(los);
  if (NEU && NEU.warnings && NEU.warnings.length) { const ul = el("ul", "ap-list"); NEU.warnings.forEach(w => ul.append(el("li", "warn", w.text))); au.append(ul); }

  /* Sitzungen je Spieler (alte und neue Befehle) */
  const sitz = el("details", "au-det");
  sitz.append(el("summary", null, "Abschicksitzungen je Spieler (Offs, AGs und Fakes, alte und neue)"));
  namen.forEach(n => {
    const ss = sitzungen(PLAN.items.filter(x => x.spieler === n).concat(neu.filter(x => x.spieler === n)));
    if (!ss.length) return;
    const ul = el("ul", "au-sitz");
    ss.forEach(z => ul.append(el("li", null, zeitKurz(z.von).slice(0, 12) + " bis " + zeitKurz(z.bis).slice(7, 12) + ": " +
      [z.off && plural(z.off, "Off", "Offs"), z.ag && plural(z.ag, "AG", "AGs"), z.fake && plural(z.fake, "Fake", "Fakes") + (z.neu ? " (davon " + z.neu + " neu)" : "")].filter(Boolean).join(", "))));
    sitz.append(el("strong", null, n), ul);
  });

  /* je Plan getrennt: Export und Tabelle (Dennis 13.11.2026 17:20); neue Fakes im Plan ihres Spielers */
  const bloecke = [];
  PLAN.je.map((j, i) => i).concat(neu.some(f => f.plan < 0) ? [-1] : []).forEach(i => {
    if (i >= 0 && !PLAN.je[i]) return;
    const a = alle.filter(x => x.plan === i), n = neu.filter(x => x.plan === i);
    if (!a.length) return;
    const pn = [...new Set(a.map(x => x.spieler))];
    const d = el("details", "au-det au-planblock"); d.open = true;
    d.append(el("summary", null, planLabel(i) + ": " + (a.length - n.length) + " Fakes" + (n.length ? ", " + n.length + " neu" : "")));
    const ausw = [[pn.length > 1 ? "Ganzer Plan" : (pn[0] || "Plan"), [["Alle Fakes", a, dateiPlan(i) + "_fakes"], ["nur neue", n, dateiPlan(i) + "_fakes_neu"]]]];
    if (pn.length > 1) pn.forEach(s0 => ausw.push([s0, [["Fakes", a.filter(x => x.spieler === s0), dateiPlan(i) + "_fakes_" + dateiTeil(s0)], ["nur neue", n.filter(x => x.spieler === s0), dateiPlan(i) + "_fakes_neu_" + dateiTeil(s0)]]]));
    d.append(exportBox(ausw, planMeta(i)), befehlsTabelle(a));
    bloecke.push(d);
  });
  if (!bloecke.length) bloecke.push(el("p", "empty", "Keine Fakes in den Plänen."));
  box.replaceChildren(...[pruefListe(alle, true), au, sitz, formatZeile("fake")].concat(bloecke).filter(Boolean));
}
function zeigen() { zeigenPlan(); zeigenKern(); zeigenFake(); }
function rechnen() {
  const b = $("fake");
  b.prepend(el("p", "ap-note", "Rechne …"));
  setTimeout(() => { aufstocken(); zeigen(); }, 20);
}

/* ---------- Bedienung ---------- */
$("plan-dazu").addEventListener("click", () => { S.texte.push(""); S.namen.push(""); speichern(); planFelder(); zeigenPlan(); const t = $("plaene").querySelectorAll("textarea"); t[t.length - 1].focus(); });
$("plan-leeren").addEventListener("click", () => { S.texte = [""]; S.namen = [""]; S.zeiten = {}; S.begleit = {}; planGeaendert(); planFelder(); });
$("plan-datei-knopf").addEventListener("click", () => $("plan-datei").click());
$("plan-datei").addEventListener("change", e => {
  const files = [...(e.target.files || [])];
  e.target.value = "";
  if (!files.length) return;
  Promise.all(files.map(f => f.text())).then(texte => {
    // leere Felder zuerst füllen, dann anhängen; Dateiname als Name des Plans
    texte.forEach((t, j) => {
      let i = S.texte.findIndex(x => !x.trim());
      if (i < 0) { S.texte.push(""); S.namen.push(""); i = S.texte.length - 1; }
      S.texte[i] = String(t || ""); if (!S.namen[i]) S.namen[i] = files[j].name.replace(/\.(json|txt)$/i, "");
    });
    planGeaendert(); planFelder();
  });
});
const bta = $("befehle-text");
// neue Befehlsübersicht: AGs gleich an die zuletzt abgeschickten Offs angleichen (Dennis 13.11.2026 19:56)
const befehleNeu = () => {
  if (bta.value === S.befehle) return;
  S.befehle = bta.value; speichern();
  spaeter(() => { einlesen(); if (BEF && BEF.zugeordnet) zeitenAendern("angleichen", true); else { if (S.aktiv) aufstocken(); zeigen(); } });
};
bta.addEventListener("change", befehleNeu);
bta.addEventListener("paste", () => setTimeout(befehleNeu, 0));
$("zusatz-sperren").addEventListener("click", () => { zusatzSperren(); location.href = "./"; });

/* ---------- Start ---------- */
(async function () {
  laden();
  planFelder();
  bta.value = S.befehle;
  $("kern").replaceChildren(el("p", "empty", "Lade Weltdaten …"));
  const lade = n => loadData(n).catch(() => null);
  const [players, villages, ids, units, angriff] = await Promise.all(["players", "villages", "dorf_ids", "units", "angriff"].map(lade));
  if (!players || !villages) { $("kern").replaceChildren(el("p", "ap-warn", "Weltdaten nicht verfügbar.")); return; }
  P = players; V = villages;
  pIdx = Object.fromEntries(P.fields.map((f, i) => [f, i]));
  IDS = ids && ids.ids && ids.ids.length === V.rows.length ? ids.ids : null;
  V.rows.forEach((r, i) => { byXY.set(r[0], i); if (IDS) byId.set(IDS[i], i); });
  W = K.makeWorld(units, angriff);
  SPALTEN = units && units.units ? units.units.map(u => u.id).concat(["militia"]) : undefined;
  if (angriff && angriff.world) WELT = angriff.world;
  einlesen();
  if (S.aktiv && PLAN) aufstocken();
  zeigen();
})();
