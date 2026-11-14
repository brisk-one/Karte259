/* Reiter „Deffplaner“ (Dennis 14.11.2026 04:46): laufende Befehle und Truppenübersicht einfügen, Deff aus den Deff-Dörfern
   1 s hinter den letzten AG jedes Trains, Fake-Unterstützungen, Export für DS-Ultimate. Gerechnet wird in deff-core.js.
   Lesbar im Repo, deff.html lädt es erst nach dem Freischalten. */
const K = window.Angriff, So = window.Sortieren, D = window.Deff;
const SPEICHER = "k259-deff";
const NAME = {spear: "Speer", sword: "Schwert", archer: "Bogen", heavy: "SKav", spy: "Späher", knight: "Paladin"};
const LAUF = {spear: "Speer", sword: "Schwert", archer: "Bogen", heavy: "SKav", knight: "Paladin"};
const CFG = [["speer", "Speer je Dorf"], ["schwert", "Schwert je Dorf"], ["minAnteil", "Mindestanteil (%)"], ["fakes", "Fakes je Dorf"], ["vorlaufMin", "Vorlauf (Minuten)"]];
let S = {befehle: "", truppen: "", cfg: {}};
let P = null, pIdx = {}, V = null, IDS = null, W = null, SPALTEN, WELT = "de259";
const byXY = new Map();
let ERG = null;

function laden() {
  try {
    const d = JSON.parse(localStorage.getItem(SPEICHER) || "null");
    if (d && typeof d === "object") S = Object.assign(S, d, {cfg: Object.assign({}, d.cfg)});
  } catch (e) { /* Speicher gesperrt oder kaputt: leer */ }
}
function speichern() { try { localStorage.setItem(SPEICHER, JSON.stringify(S)); } catch (e) { /* ohne Speicher */ } }
const plural = (n, a, b) => n + " " + (n === 1 ? a : b);
// nf (Zahlformat) kommt aus app.js
const koord = d => d.x + "|" + d.y;
const zeit = ms => { const t = K.fmtZeit(ms, true); return t.slice(0, 6) + " " + t.slice(11); };     // 14.11. 08:20:31:971
const spielerName = p => p >= 0 && P && P.rows[p] ? P.rows[p][pIdx.name] : "Barbaren";
const zielText = t => { const i = byXY.get(t.x * 1000 + t.y); return koord(t) + (i != null ? " (" + spielerName(V.rows[i][1]) + ")" : ""); };
const idVon = (x, y) => { const i = byXY.get(x * 1000 + y); return i != null && IDS ? IDS[i] : null; };
const prozent = (w, soll) => Math.round(100 * w / soll) + " %";
const truppen = u => D.DEFF_UNITS.concat(["knight"]).filter(x => u[x] > 0).map(x => (x === "knight" ? "" : nf.format(u[x]) + " ") + NAME[x]).join(", ");

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
function herunterladen(text, name) {
  const url = URL.createObjectURL(new Blob([text], {type: "application/json"}));
  const a = el("a"); a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function tabelle(kopf, zeilen) {
  const t = el("table", "df-tab"), th = el("tr"), tb = el("tbody");
  kopf.forEach(k => th.append(el("th", null, k)));
  zeilen.forEach(({zellen, cls}) => {
    const tr = el("tr", cls || null);
    zellen.forEach(c => { const td = el("td"); if (c instanceof Node) td.append(c); else td.textContent = c; tr.append(td); });
    tb.append(tr);
  });
  const kp = el("thead"); kp.append(th); t.append(kp, tb);
  const d = el("div", "ap-scroll"); d.append(t);
  return d;
}

/* ---------- Rechnen ---------- */
function rechnen() {
  const now = Date.now();
  const bef = S.befehle.trim() ? K.parseBefehle(S.befehle, now, SPALTEN) : {befehle: [], fehler: []};
  const tr = S.truppen.trim() ? So.leseDorfTruppen(S.truppen, SPALTEN) : {villages: [], errors: [], warnings: []};
  const ziele = D.agZiele(bef.befehle);
  const laufend = D.laufendeUnterstuetzung(S.befehle, now, SPALTEN);
  const plan = ziele.length && tr.villages.length ? D.planen({ziele, villages: tr.villages, world: W, now, cfg: S.cfg, laufend}) : null;
  ERG = {now, bef, tr, ziele, plan, laufend, quellen: D.deffDoerfer(tr.villages, S.cfg, W)};
}

/* ---------- Anzeige ---------- */
function zeigen() {
  const e = ERG;
  const bn = $("bef-note");
  bn.className = e.bef.fehler.length ? "ap-warn" : "ap-note";
  bn.textContent = S.befehle.trim() ? plural(e.bef.befehle.length, "Angriff", "Angriffe") + " gelesen, " +
    (e.ziele.length ? plural(e.ziele.length, "AG-Ziel", "AG-Ziele") + ": " + e.ziele.map(z => koord(z.t) + " letztes AG " + zeit(z.letzteAG)).join("; ") : "kein AG-Train darin") +
    (e.laufend.length ? "; " + plural(e.laufend.length, "laufende Unterstützung", "laufende Unterstützungen") + " (zählen bei ihrem Ziel mit, wenn sie nach dem letzten AG ankommen)" : "") +
    (e.bef.fehler.length ? ". " + plural(e.bef.fehler.length, "Zeile", "Zeilen") + " nicht gelesen (" + e.bef.fehler[0] + ")" : "") + "." : "";
  const tn = $("tr-note");
  tn.className = e.tr.errors.length ? "ap-warn" : "ap-note";
  const pala = e.quellen.filter(q => q.pala).length;
  tn.textContent = S.truppen.trim() ? (e.tr.errors.length ? e.tr.errors.join(" ") + " " : "") + plural(e.tr.villages.length, "Dorf", "Dörfer") + " gelesen, " +
    plural(e.quellen.length, "Deff-Dorf", "Deff-Dörfer") + " mit Deff im Dorf" + (pala ? " (" + pala + " mit Paladin)" : "") + ", zusammen " +
    nf.format(e.quellen.reduce((s, q) => s + q.bh, 0)) + " BH Deff." + (e.tr.warnings.length ? " " + e.tr.warnings.join(" ") : "") : "";
  const c = D.einstellungen(S.cfg), soll = D.sollWert(c), paket = D.wert(D.PAKET);
  $("cfg-note").textContent = "Soll je geadeltem Dorf: Deff im Wert von " + nf.format(c.speer) + " Speer und " + nf.format(c.schwert) + " Schwert, gemessen als Verteidigung gegen Infanterie plus gegen Kavallerie " +
    "(Bogen-Verteidigung zählt nicht). Das sind etwa " + nf.format(Math.round(10 * soll / paket) / 10) + " typische Deffpakete (126 Speer, 200 Schwert, 170 Bogen, 2 Späher, je 500 BH), rund " +
    nf.format(Math.round(soll / paket * 500 / 100) * 100) + " BH. Erreicht ab " + c.toleranz + " %. Bekäme ein Dorf weniger als den Mindestanteil, bekommt es keine Deff allein; die Deff verstärkt dann ein anderes Ziel. Ein Deff-Dorf schickt seine ganze Deff mit allen Spähern (mit Paladin, wenn er im Dorf steht: dann Paladin-Laufzeit). Fakes: 1 Schwert oder 1 Speer aus verschiedenen Dörfern. Abschick frühestens jetzt plus Vorlauf.";
  zeigenPlan();
}
function zeigenPlan() {
  const box = $("plan"), e = ERG, p = e.plan;
  if (!p) {
    box.replaceChildren(el("p", "empty", !e.ziele.length ? "Erst laufende Befehle mit AG-Trains einfügen (Abschnitt 1)." : "Erst die Truppenübersicht einfügen (Abschnitt 2)."));
    $("plan-hint").textContent = "";
    return;
  }
  const echt = p.befehle.filter(b => b.art === "deff"), fakes = p.befehle.filter(b => b.art === "fake");
  $("plan-hint").textContent = "gerechnet " + hmf.format(new Date(e.now)) + " Uhr";
  const teile = [];
  const sum = el("div", "df-sum");
  [[p.ziele.length, "geadelte Dörfer"], [echt.length, "Deff-Unterstützungen"], [fakes.length, "Fake-Unterstützungen"],
   [p.ziele.filter(z => z.erreicht).length + " von " + p.ziele.length, "mit Soll"]].forEach(([n, t]) => { const d = el("div"); d.append(el("b", null, String(n)), " " + t); sum.append(d); });
  teile.push(sum);
  // gut sichtbar: Dörfer ohne genug Deff
  const knapp = p.ziele.filter(z => !z.erreicht);
  if (knapp.length) {
    const f = el("div", "df-fehlt");
    f.append(el("h3", null, plural(knapp.length, "geadeltes Dorf bekommt", "geadelte Dörfer bekommen") + " nicht genug Deff"));
    knapp.forEach(z => f.append(el("p", null, zielText(z.t) + ": " + prozent(z.wert, p.soll) + " des Solls (" + nf.format(z.bh) + " BH" +
      (z.laufendBH ? ", davon " + nf.format(z.laufendBH) + " schon unterwegs" : "") + ")" +
      (z.geloestWert ? ", erreichbar wären nur " + prozent(z.geloestWert, p.soll) + " (" + nf.format(z.geloestBH) + " BH), unter dem Mindestanteil: stattdessen anderswo eingesetzt" :
       z.kandidaten.length ? "" : ", kein Deff-Dorf erreicht es rechtzeitig") + " (Deff an " + zeit(z.ankunft) + ")")));
    teile.push(f);
  }
  // Export: oben und direkt an der Liste (Dennis 14.11.2026 05:45), nur noch nicht fällige Abschickzeiten, gerechnet beim Klick
  teile.push(exportZeile(p), el("p", "ap-note", "In DS-Ultimate einen Angriffsplan für Welt 259 öffnen, „Import DS-Ultimate“ (JSON) oder „Import Workbench“ (Zeilen) wählen, einfügen. " +
    "Symbole: Unterstützung (echt) und Fake-Unterstützung. Abschickzeiten, die schon vorbei sind (durchgestrichen), kommen nicht mit."));
  // Übersicht je Ziel
  teile.push(el("h3", null, "Je geadeltem Dorf"));
  teile.push(tabelle(["Ziel", "Letztes AG", "Deff an", "Deff", "Unterstützungen"], p.ziele.map(z => ({cls: z.erreicht ? null : "warn", zellen: [
    zielText(z.t), zeit(z.letzteAG), zeit(z.ankunft), prozent(z.wert, p.soll) + " des Solls, " + nf.format(z.bh) + " BH" + (z.laufendBH ? " (" + nf.format(z.laufendBH) + " unterwegs)" : "") + (z.erreicht ? "" : ", zu wenig"),
    z.echt.length + " echt, " + z.fakes.length + " Fake" + (z.laufend ? ", " + z.laufend + " schon unterwegs" : "")]}))));
  // alle Befehle nach Abschickzeit
  teile.push(el("h3", null, "Alle Unterstützungen nach Abschickzeit"), exportZeile(p));
  teile.push(tabelle(["Abschick", "Art", "Herkunft", "Ziel", "Truppen", "Laufzeit", "Ankunft"], p.befehle.map(b => {
    const art = el("span", "df-k " + (b.art === "fake" ? "df-fake" : b.pala ? "df-pala" : "df-deff"), b.art === "fake" ? "Fake" : (b.pala ? "Deff mit Pala" : "Deff") + (b.verstaerkung ? " (Verstärkung)" : ""));
    return {cls: b.sendMs < Date.now() ? "vorbei" : null, zellen: [zeit(b.sendMs), art, koord(b.von) + " " + (b.von.name || ""), zielText(b.nach),
      b.art === "fake" ? "1 " + NAME[b.slow] : truppen(b.units) + " (" + nf.format(b.bh) + " BH, " + prozent(b.wert, p.soll) + " des Solls)", LAUF[b.slow] || b.slow, zeit(b.arrivalMs)]};
  })));
  if (p.ungenutzt.length) teile.push(el("p", "ap-note", "Nicht eingesetzt (zu weit für die Ankunft oder schon genug Deff): " +
    p.ungenutzt.map(q => koord(q) + " " + q.name + " (" + nf.format(q.bh) + " BH, " + prozent(q.wert, p.soll) + (q.pala ? ", Pala" : "") + ")").join(", ") + "."));
  box.replaceChildren(...teile);
}

/** Knöpfe zum Kopieren und Speichern der Liste für DS-Ultimate (JSON und Workbench-Zeilen). */
function exportZeile(p) {
  const offen = () => p.befehle.filter(b => b.sendMs > Date.now());
  const meta = () => ({title: "Deff " + K.fmtZeit(ERG.now).slice(0, 6), world: WELT});
  const row = el("div", "ap-row"), n = offen().length;
  const knopf = (t, f) => { const b = el("button", "tw", t); b.type = "button"; b.addEventListener("click", () => f(b)); row.append(b); };
  knopf("Für DS-Ultimate kopieren (" + n + ")", b => { const ex = D.exportDSU(offen(), idVon, meta()); kopieren(ex.text, b, ex.n); });
  knopf("als Workbench-Zeilen kopieren", b => { const ex = D.exportWB(offen(), idVon); kopieren(ex.text, b, ex.n); });
  knopf("als Datei", () => herunterladen(D.exportDSU(offen(), idVon, meta()).text, "deff_" + K.fmtZeit(ERG.now).slice(0, 5).replace(".", "-") + ".json"));
  knopf("Neu rechnen (jetzt)", () => { rechnen(); zeigen(); });
  const weg = p.befehle.length - n, fehlt = D.exportDSU(offen(), idVon, {}).fehlt.length;
  if (weg || fehlt) row.append(el("span", "ap-note", (weg ? plural(weg, "Abschickzeit", "Abschickzeiten") + " schon vorbei, nicht im Export" : "") +
    (weg && fehlt ? "; " : "") + (fehlt ? plural(fehlt, "Befehl", "Befehle") + " ohne Dorf-ID in den Weltdaten" : "") + "."));
  return row;
}

/* ---------- Bedienung ---------- */
let timer = null;
function spaeter(f) { clearTimeout(timer); timer = setTimeout(f, 250); }
function felder() {
  $("bef").value = S.befehle; $("tr").value = S.truppen;
  const c = D.einstellungen(S.cfg), box = $("cfg");
  box.replaceChildren(...CFG.map(([k, lab]) => {
    const l = el("label", null, lab + " ");
    const i = el("input", "df-in"); i.type = "number"; i.min = D.GRENZEN[k][0]; i.max = D.GRENZEN[k][1]; i.value = c[k]; i.dataset.k = k;
    i.addEventListener("change", () => { S.cfg[k] = i.value; speichern(); rechnen(); zeigen(); });
    l.append(i);
    return l;
  }));
}
["bef", "tr"].forEach(id => $(id).addEventListener("input", () => {
  S[id === "bef" ? "befehle" : "truppen"] = $(id).value; speichern(); spaeter(() => { rechnen(); zeigen(); });
}));
$("zusatz-sperren").addEventListener("click", () => { zusatzSperren(); location.href = "./"; });

/* ---------- Start ---------- */
(async function () {
  laden();
  felder();
  $("plan").replaceChildren(el("p", "empty", "Lade Weltdaten …"));
  const lade = n => loadData(n).catch(() => null);
  const [players, villages, ids, units, angriff] = await Promise.all(["players", "villages", "dorf_ids", "units", "angriff"].map(lade));
  if (!players || !villages) { $("plan").replaceChildren(el("p", "ap-warn", "Weltdaten nicht verfügbar.")); return; }
  P = players; V = villages;
  pIdx = Object.fromEntries(P.fields.map((f, i) => [f, i]));
  IDS = ids && ids.ids && ids.ids.length === V.rows.length ? ids.ids : null;
  V.rows.forEach((r, i) => byXY.set(r[0], i));
  W = K.makeWorld(units, angriff);
  SPALTEN = units && units.units ? units.units.map(u => u.id).concat(["militia"]) : undefined;
  if (angriff && angriff.world) WELT = angriff.world;
  rechnen();
  zeigen();
})();
