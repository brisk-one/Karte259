/* Reiter „Fakes aufstocken“ (Dennis 13.11.2026 12:26, 1a und 2b): einen Angriffsplan aus DS-Ultimate einlesen, getrennt in
   den Off- und AG-Plan und den Fake-Plan, beide getrennt exportieren und die Fakes je Spieler aufstocken. Gerechnet wird in
   angriff-core.js (parsePlan, fakesNachImport). Lesbar im Repo, aufstocken.html lädt es erst nach dem Freischalten. */
const K = window.Angriff;
const SPEICHER = "k259-aufstocken";

/* ---------- Zustand ---------- */
const neuerSpieler = () => ({uebersicht: "", fenster: "", soll: "", rammenMax: ""});
let S = {text: "", spieler: {}, dazu: [], ank: "", ankPlan: "", arten: {ag: true, off: true, fake: true},
         cfg: {fakes_max_je_dorf: 4, fake_extra_pop: 5, min_send_gap_s: 3}, expFmt: "dsu", seed: 1, aktiv: false};
function laden() {
  try {
    const d = JSON.parse(localStorage.getItem(SPEICHER) || "null");
    if (d && typeof d === "object") S = Object.assign(S, d, {cfg: Object.assign({}, S.cfg, d.cfg), arten: Object.assign({}, S.arten, d.arten)});
    else {
      // erster Aufruf: Fake-Einstellungen aus dem Angriffsplaner dieses Browsers übernehmen
      const a = JSON.parse(localStorage.getItem("k259-angriff") || "null");
      if (a && a.cfg) ["fakes_max_je_dorf", "fake_extra_pop", "min_send_gap_s"].forEach(k => { if (a.cfg[k] != null && !isNaN(+a.cfg[k])) S.cfg[k] = +a.cfg[k]; });
    }
  } catch (e) { /* Speicher gesperrt oder kaputt: Standard */ }
}
function speichern() {
  try { localStorage.setItem(SPEICHER, JSON.stringify(S)); } catch (e) { /* voll oder gesperrt: nur für diese Sitzung */ }
}
const sp = name => S.spieler[name] || (S.spieler[name] = neuerSpieler());

/* ---------- Weltdaten ---------- */
let P = null, pIdx = {}, V = null, IDS = null, W = null, WELT = "de259";
const byXY = new Map(), byId = new Map();
const spielerName = p => p >= 0 && P && P.rows[p] ? P.rows[p][pIdx.name] : "Barbaren";
const dorf = i => { const r = V.rows[i]; return {id: IDS[i], x: Math.floor(r[0] / 1000), y: r[0] % 1000, owner: r[1], pts: r[2], name: r[4]}; };
const koord = d => d.x + "|" + d.y;

/* ---------- Plan einlesen ---------- */
let PLAN = null;           // {items, fehler, meta}
let NEU = null;            // Ergebnis von fakesNachImport
const UEB = new Map();     // Spieler → gelesene Truppenübersicht
function uebersichtLesen(name) {
  const text = sp(name).uebersicht;
  if (!text.trim()) return null;
  const o = K.parseOverview(text);
  o.villages.forEach(v => {
    const i = byXY.get(v.x * 1000 + v.y);
    const d = i != null && IDS ? dorf(i) : null;
    v.id = d ? d.id : null; v.pts = d ? d.pts : 0; v.owner = d ? d.owner : null;
  });
  return o;
}
function einlesen() {
  NEU = null;
  PLAN = S.text.trim() ? K.parsePlan(S.text) : null;
  if (!PLAN || !IDS) return;
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
  });
  // Ankunft der neuen Fakes: Standard der Zeitraum des Plans; neuer Plan, neuer Standard
  const arr = PLAN.items.map(it => it.arrivalMs);
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
  NEU = ank.fehler ? {fehler: ank.fehler} : K.fakesNachImport({world: W, cfg: S.cfg, now: Date.now(), seed: S.seed, ankunft: ank,
    zielArten: S.arten, items: PLAN.items, spieler});
}

/* ---------- Anzeige ---------- */
const KURZ = {spear: "Speer", sword: "Schwert", axe: "Axt", archer: "Bogen", spy: "Späher", light: "LKav", marcher: "BB", heavy: "SKav",
              ram: "Ramme", catapult: "Kata", knight: "Pala", snob: "AG"};
const ART = {off: "Off", ag: "AG", fake: "Fake"};
const einheitenText = u => K.UNITS.filter(x => u[x] > 0).map(x => nf.format(u[x]) + " " + KURZ[x]).join(", ") || "–";
const zeitKurz = (ms, mitMs) => { const t = K.fmtZeit(ms, mitMs); return t.slice(0, 6) + t.slice(10); };
const dauer = ms => { const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return h + ":" + String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
function befehlsTabelle(items) {
  const cols = [["#", "num"], ["Spieler", null, "text"], ["Herkunft", null, "text"], ["Ziel", null, "text"], ["Zielspieler", null, "text"],
                ["Art", null, "text"], ["Truppen"], ["Abschick", "num", true], ["Ankunft", "num", true], ["Laufzeit", "num", true]];
  const rows = items.map(it => {
    const art = el("span", "ap-kind k-" + it.art, ART[it.art]);
    if (it.neu) art.append(el("span", "au-neu", "neu"));
    return [["", "num"], [it.spieler], [it.v ? it.v.name + " (" + koord(it.v) + ")" : "Dorf-ID " + it.source + " (unbekannt)", null, it.v ? koord(it.v) : ""],
            [it.t ? koord(it.t) : "Dorf-ID " + it.destination + " (unbekannt)"], [it.t ? spielerName(it.t.owner) : "–"],
            [art, null, ART[it.art] + (it.neu ? " neu" : "")], [el("span", "ap-units", einheitenText(it.units))],
            [it.sendMs != null ? zeitKurz(it.sendMs) : "–", "num", it.sendMs], [zeitKurz(it.arrivalMs, true), "num", it.arrivalMs],
            [it.sendMs != null ? dauer(it.arrivalMs - it.sendMs) : "–", "num", it.sendMs != null ? it.arrivalMs - it.sendMs : null]];
  });
  const t = table(cols, rows, {counter: 0, sort: 7, dir: "asc"});
  [...t.tBodies[0].rows].forEach((tr, i) => { if (items[i] && items[i].neu) tr.classList.add("neu"); });
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
function exportBox(auswahl, dateiName) {
  const box = el("div", "au-teil");
  const text = its => S.expFmt === "wb" ? K.importWB(its) : JSON.stringify(K.importDSU(its, Object.assign({world: WELT, twWorld: WELT}, PLAN.meta, {title: null})));
  const wahl = el("div", "ap-row"), hinweis = el("p", "ap-note", HINW[S.expFmt === "wb" ? "wb" : "dsu"]);
  wahl.append(el("span", "ap-note", "Format:"));
  [["dsu", "DS-Ultimate"], ["wb", "DS Workbench"]].forEach(([w, t]) => {
    const l = el("label"), r0 = document.createElement("input");
    r0.type = "radio"; r0.name = "fmt-" + dateiName; r0.value = w; r0.checked = (S.expFmt === "wb" ? "wb" : "dsu") === w;
    r0.addEventListener("change", () => { S.expFmt = w; speichern(); zeigen(); });
    l.append(r0, document.createTextNode(" " + t));
    wahl.append(l);
  });
  box.append(wahl, hinweis);
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

function zeigenPlan() {
  const note = $("plan-note");
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
function zeigenKern() {
  const box = $("kern");
  if (!PLAN || !PLAN.items.length) { box.replaceChildren(el("p", "empty", "Noch kein Plan eingelesen.")); $("kern-hint").textContent = ""; return; }
  const its = PLAN.items.filter(x => x.art !== "fake");
  $("kern-hint").textContent = its.length + " Befehle, unverändert aus dem eingelesenen Plan.";
  if (!its.length) { box.replaceChildren(el("p", "empty", "Keine Offs oder AGs im Plan.")); return; }
  const namen = spielerListe().filter(n => its.some(x => x.spieler === n));
  const sum = el("div", "ap-sum");
  namen.forEach(n => {
    const e = its.filter(x => x.spieler === n), d = el("div");
    d.append(el("b", null, n), document.createTextNode(" " + e.filter(x => x.art === "off").length + " Offs, " + e.filter(x => x.art === "ag").length + " AGs"));
    sum.append(d);
  });
  const ausw = [["Alle", [["Offs und AGs", its, "offs_ags"]]]];
  if (namen.length > 1) namen.forEach(n => ausw.push([n, [["Offs und AGs", its.filter(x => x.spieler === n), "offs_ags_" + dateiTeil(n)]]]));
  box.replaceChildren(...[sum, pruefListe(its, false), exportBox(ausw, "kern"), befehlsTabelle(its)].filter(Boolean));
}
function feld(lab, ctl, extra) {
  const f = el("label", "au-f");
  f.append(el("span", "lab", lab), ctl);
  if (extra) f.append(extra);
  return f;
}
/** Neu zeichnen erst nach dem Fokuswechsel und den Fokus auf das gleiche Feld zurück: sonst ersetzt das Neuzeichnen beim
    Verlassen eines Felds das Feld, in das gerade geklickt wurde, und der Klick geht verloren. Felder tragen data-k. */
let zeichnenTimer = 0;
function spaeter(fn) {
  clearTimeout(zeichnenTimer);
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
  const alt = PLAN.items.filter(x => x.art === "fake"), neu = NEU && NEU.neu ? NEU.neu.map(f => Object.assign(f, {art: "fake"})) : [];
  const alle = alt.concat(neu);
  $("fake-hint").textContent = alt.length + " Fakes aus dem Plan" + (neu.length ? ", " + neu.length + " neu" : "") + ".";
  const namen = spielerListe();

  /* Aufstocken */
  const au = el("div", "au-box");
  au.append(el("h3", null, "Fakes aufstocken"),
    el("p", "ap-note", "Je Spieler die gewünschte Gesamtzahl eintragen und seine Truppenübersicht einfügen (wie im Angriffsplaner). Die neuen Fakes gehen aus seinen Dörfern, deren Truppen nach Abzug seiner Befehle im Plan reichen (Katapulte oder eine Ramme, mindestens ein Späher, Fakelimit), auf die Ziele des Plans, die mit den wenigsten Fakes zuerst, nie zweimal dasselbe Ziel aus einem Dorf. Abgeschickt werden sie in seinen Abschicksitzungen aus dem Plan (10 Minuten Rand); reichen die nicht, bis zu zwei zusätzliche reine Fake-Sitzungen von je einer Stunde in seinen Abschickzeiträumen, jede nur mit mindestens 10 Fakes. Die Befehle des Plans bleiben unverändert."));
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
    ta.addEventListener("change", () => { if (s.uebersicht === ta.value) return; s.uebersicht = ta.value; speichern(); spaeter(() => { einlesen(); zeigen(); }); });
    let ovNote = "";
    if (o) {
      const fremd = o.villages.filter(v => v.id != null && spielerName(v.owner) !== name).length, ohne = o.villages.filter(v => v.id == null).length;
      ovNote = plural(o.villages.length, "Dorf", "Dörfer") + " gelesen" + (ohne ? ", " + ohne + " nicht in den Weltdaten" : "") +
        (fremd ? ", " + fremd + " gehören laut Weltdaten jemand anderem" : "") + (o.errors.length ? "; " + o.errors[0] : "");
    }
    const fen = K.parseFenster(s.fenster);
    const fta = el("textarea", "ap-ta klein"); fta.spellcheck = false; fta.value = s.fenster;
    fta.placeholder = "14.11.2026 06:00 bis 09:00\n13.11.2026 18:00 bis 23:00";
    if (fen.fehler.length) fta.classList.add("falsch");
    fta.dataset.k = "fen:" + name;
    fta.addEventListener("change", () => { if (s.fenster === fta.value) return; s.fenster = fta.value; speichern(); spaeter(zeigenFake); });
    const soll = eingabe("n", s.soll, v => { s.soll = v; speichern(); }, {type: "number", min: 0, max: 100000, placeholder: String(eig.filter(x => x.art === "fake").length), "data-k": "soll:" + name});
    soll.setAttribute("aria-label", "Fakes insgesamt für " + name);
    const rm = eingabe("n", s.rammenMax, v => { s.rammenMax = v; speichern(); }, {type: "number", min: 0, max: 50, placeholder: "1", "data-k": "rm:" + name});
    f.append(feld("Truppenübersicht", ta, el("span", o && (o.errors.length || ovNote.includes("jemand")) ? "ap-warn" : "ap-note", ovNote || "Ohne Übersicht keine neuen Fakes für diesen Spieler.")),
      feld("Abschickzeiträume (für zusätzliche Fake-Sitzungen)", fta, el("span", fen.fehler.length ? "ap-warn" : "ap-note", fen.fehler[0] || "Je Zeile ein Zeitraum. Leer: nur in seinen Sitzungen aus dem Plan.")),
      feld("Fakes insgesamt (alte und neue)", soll, el("span", "ap-note", "Leer: nicht aufstocken.")),
      feld("Rammen je Fake höchstens", rm, el("span", "ap-note", "Katapulte gehen vor; leer: 1.")));
    k.append(f);
    if (r) {
      const ul = el("ul", "ap-list");
      if (r.soll) {
        const li = el("li", r.ist < r.soll ? "warn" : null, r.vorher + " Fakes im Plan, jetzt " + r.ist + " von " + r.soll + " gewünscht" + (r.ist > r.vorher ? " (" + (r.ist - r.vorher) + " neu)" : ""));
        ul.append(li);
        const g = r.grund;
        if (g) ul.append(el("li", "warn", "Grenze: " + [g.truppen && plural(g.truppen, "Dorf", "Dörfer") + " ohne Katapulte oder Rammen mit Spähern für einen weiteren Fake",
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
    if (!namen.some(n => parseInt(sp(n).soll, 10) > 0)) { meld.textContent = "Bei mindestens einem Spieler „Fakes insgesamt“ eintragen."; return; }
    S.aktiv = true; speichern(); rechnen();
  });
  const zurueck = el("button", "tw", "↺ ohne neue Fakes"); zurueck.type = "button"; zurueck.disabled = !NEU;
  zurueck.addEventListener("click", () => { S.aktiv = false; NEU = null; speichern(); zeigenFake(); });
  const wuerfel = el("button", "tw", "Neu würfeln"); wuerfel.type = "button"; wuerfel.disabled = !NEU || !!NEU.fehler;
  wuerfel.title = "Gleichwertige Verteilung neu auslosen";
  wuerfel.addEventListener("click", () => { S.seed = (S.seed % 100000) + 1; speichern(); rechnen(); });
  const meld = el("span", "ap-note");
  if (NEU && NEU.fehler) { meld.textContent = NEU.fehler; meld.className = "ap-warn"; }
  else if (NEU) meld.textContent = "Berechnet " + hmf.format(new Date()) + " Uhr; die Abschickzeiten beginnen frühestens eine Minute nach dem Berechnen.";
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

  /* Export und Tabelle */
  const ausw = [["Alle", [["Alle Fakes", alle, "fakes"], ["nur neue", neu, "fakes_neu"]]]];
  if (namen.length > 1) namen.forEach(n => { const a = alle.filter(x => x.spieler === n); if (a.length) ausw.push([n, [["Fakes", a, "fakes_" + dateiTeil(n)], ["nur neue", neu.filter(x => x.spieler === n), "fakes_neu_" + dateiTeil(n)]]]); });
  box.replaceChildren(...[pruefListe(alle, true), au, sitz, exportBox(ausw, "fake"), alle.length ? befehlsTabelle(alle) : el("p", "empty", "Keine Fakes im Plan.")].filter(Boolean));
}
function zeigen() { zeigenPlan(); zeigenKern(); zeigenFake(); }
function rechnen() {
  const b = $("fake");
  b.prepend(el("p", "ap-note", "Rechne …"));
  setTimeout(() => { aufstocken(); zeigen(); }, 20);
}

/* ---------- Bedienung ---------- */
const ta = $("plan-text");
const planNeu = () => { if (ta.value === S.text) return; S.text = ta.value; S.aktiv = false; speichern(); spaeter(() => { einlesen(); zeigen(); }); };
ta.addEventListener("change", planNeu);
ta.addEventListener("paste", () => setTimeout(planNeu, 0));
$("plan-leeren").addEventListener("click", () => { ta.value = ""; S.text = ""; S.aktiv = false; speichern(); einlesen(); zeigen(); });
$("plan-datei-knopf").addEventListener("click", () => $("plan-datei").click());
$("plan-datei").addEventListener("change", e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { ta.value = String(r.result || ""); S.text = ta.value; S.aktiv = false; speichern(); einlesen(); zeigen(); };
  r.readAsText(f);
  e.target.value = "";
});
$("zusatz-sperren").addEventListener("click", () => { zusatzSperren(); location.href = "./"; });

/* ---------- Start ---------- */
(async function () {
  laden();
  ta.value = S.text;
  $("kern").replaceChildren(el("p", "empty", "Lade Weltdaten …"));
  const lade = n => loadData(n).catch(() => null);
  const [players, villages, ids, units, angriff] = await Promise.all(["players", "villages", "dorf_ids", "units", "angriff"].map(lade));
  if (!players || !villages) { $("kern").replaceChildren(el("p", "ap-warn", "Weltdaten nicht verfügbar.")); return; }
  P = players; V = villages;
  pIdx = Object.fromEntries(P.fields.map((f, i) => [f, i]));
  IDS = ids && ids.ids && ids.ids.length === V.rows.length ? ids.ids : null;
  V.rows.forEach((r, i) => { byXY.set(r[0], i); if (IDS) byId.set(IDS[i], i); });
  W = K.makeWorld(units, angriff);
  if (angriff && angriff.world) WELT = angriff.world;
  einlesen();
  if (S.aktiv && PLAN) aufstocken();
  zeigen();
})();
