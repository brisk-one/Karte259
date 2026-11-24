/* Dorfnamen vergeben, Oberfläche (Wunsch Dennis 21.11.2026).
   Ablauf: Dorfliste einfügen -> die Seite liest, wo die Nummerierung aufgehört hat -> Klick auf das Kopiersymbol
   legt „[156] Fluch der Kriegskasse“ in die Zwischenablage, merkt den Namen als vergeben und zählt hoch.
   Der zweite Knopf kopiert denselben Namen ohne Nummer.
   Vergeben ist ein Name aus zwei Gründen (Dennis 24.11.2026): er steht als Dorfname in der eingefügten Liste, oder
   er wurde hier kopiert. Die Liste ist die verlässlichere Quelle, weil sie den echten Stand im Spiel zeigt; sie wird
   bei jedem Einlesen neu ausgewertet, während die kopierten im localStorage bleiben.
   Gespeichert wird nur im localStorage dieses Browsers: eingefügte Liste, nächste Nummer, kopierte Namen. */
(function () {
"use strict";
const C = window.NamenCore, DATEN = window.NAMEN_DATEN;
const SPEICHER = "k259-namen";
const KOPIE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="9" rx="1.2"/><path d="M10.5 3.5h-6a1 1 0 0 0-1 1v7"/></svg>';

let S = {text: "", nr: 1, stellen: 3, vergeben: {}};     // vergeben: hier kopierter Name -> Nummer
let stand = null;
let ausListe = {};                                       // Name aus dem Vorrat -> Nummer des Dorfs im Spiel

/** Ist der Name vergeben, und mit welcher Nummer? null, wenn frei. */
function vergebenMit(name) {
  if (ausListe[name] != null) return ausListe[name];
  if (S.vergeben[name] != null) return S.vergeben[name];
  return null;
}
const istVergeben = name => vergebenMit(name) !== null;

/* ---------- Speicher ---------- */
function laden() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SPEICHER) || "null"); } catch (e) { s = null; }
  if (s && typeof s === "object") {
    S.text = typeof s.text === "string" ? s.text : "";
    S.nr = Math.max(1, Math.round(+s.nr) || 1);
    S.stellen = Math.max(3, Math.round(+s.stellen) || 3);
    S.vergeben = s.vergeben && typeof s.vergeben === "object" ? s.vergeben : {};
  }
}
function sichern() {
  try { localStorage.setItem(SPEICHER, JSON.stringify({v: 1, text: S.text, nr: S.nr, stellen: S.stellen, vergeben: S.vergeben})); }
  catch (e) { /* Speicher voll oder gesperrt: die Seite arbeitet trotzdem weiter */ }
}

/* ---------- Nummernkasten ---------- */
function belegteNummern() {
  const b = new Set(Object.values(S.vergeben).map(n => +n).filter(Number.isFinite));
  if (stand) stand.nummeriert.forEach(d => b.add(d.nummer));
  return b;
}

/** Namen aus dem Vorrat, die laut eingefügter Dorfliste schon im Spiel stehen. */
const trefferAusListe = () => stand ? C.vergebenAusListe(stand.doerfer, DATEN) : {};

function nummerAnzeigen() {
  $("nr-gross").textContent = C.formatNummer(S.nr, S.stellen);
  const feld = $("nr");
  if (document.activeElement !== feld) feld.value = S.nr;
}

function einlesen(text, still) {
  S.text = text;
  stand = C.stand(text, DATEN);
  const st = $("status");
  st.className = "na-status";
  if (!stand.anzahl) {
    st.textContent = text.trim() ? "Keine Dorfzeilen erkannt. Erwartet wird eine Liste mit Koordinaten wie (631|601)." : "";
    if (text.trim()) st.className = "na-status err";
  }
  ausListe = trefferAusListe();
  if (stand.anzahl) {
    const n = stand.nummeriert.length, tr = Object.keys(ausListe).length;
    st.textContent = stand.anzahl + (stand.anzahl === 1 ? " Dorf" : " Dörfer") + " gelesen, " + n + " nummeriert" +
      (stand.hoechste ? ", höchste " + C.formatNummer(stand.hoechste, stand.stellen) : "") + ". " +
      (tr ? tr + (tr === 1 ? " Name" : " Namen") + " aus der Liste gelten als vergeben." : "Kein Name aus dem Vorrat in der Liste gefunden.");
  }
  if (stand.anzahl && !still) {                           // Vorschlag übernehmen, Handeingabe nicht überschreiben
    S.stellen = stand.stellen;
    S.nr = C.naechsteFreie(stand.naechste, belegteNummern());
  }
  warnungen();
  nummerAnzeigen();
  zeichnen();
  sichern();
}

function warnungen() {
  const w = $("warn");
  w.textContent = "";
  if (!stand || !stand.anzahl) return;
  const teile = [];
  if (stand.ohneNummer.length) {
    const namen = stand.ohneNummer.slice(0, 8).map(d => d.name + " (" + d.x + "|" + d.y + ")");
    teile.push("<b>" + stand.ohneNummer.length + (stand.ohneNummer.length === 1 ? " Dorf" : " Dörfer") +
      " ohne Nummer</b>, " + (stand.ohneNummer.length === 1 ? "braucht" : "brauchen") + " also einen Namen:<ul><li>" + namen.map(esc).join("</li><li>") + "</li>" +
      (stand.ohneNummer.length > 8 ? "<li>und " + (stand.ohneNummer.length - 8) + " weitere</li>" : "") + "</ul>");
  }
  if (stand.doppelt.length) {
    const z = stand.doppelt.map(d => {
      const neu = d.doerfer[0];
      return C.formatNummer(d.nummer, stand.stellen) + " liegt " + d.doerfer.length + "-mal vor, umnummerieren: " +
             esc(neu.name) + " (" + neu.x + "|" + neu.y + ")";
    });
    teile.push("<b>Doppelte Nummern</b> (vermutlich von einem Spieler geadelt, der auch nummeriert):<ul><li>" +
      z.join("</li><li>") + "</li></ul>");
  }
  if (stand.luecken.length) {
    const l = stand.luecken.slice(0, 12).map(n => C.formatNummer(n, stand.stellen)).join(", ");
    teile.push("Freie Nummern darunter: " + l + (stand.luecken.length > 12 ? " und " + (stand.luecken.length - 12) + " weitere" : "") + ".");
  }
  w.innerHTML = teile.join("");
}

/* ---------- Namensliste ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9äöüß]+/g, "");

function treffer(name, suche) {
  if (!suche) return true;
  return norm(name).includes(norm(suche));
}

function zeichnen() {
  const wrap = $("liste"), suche = $("suche").value.trim(), katWahl = $("kat").value,
        verstecken = $("verstecken").checked;
  wrap.textContent = "";
  let gezeigt = 0, frei = 0, gesamt = 0;
  DATEN.forEach(kat => {
    gesamt += kat.gruppen.reduce((s, g) => s + g.n.length, 0);
    if (katWahl && kat.kat !== katWahl) return;
    const block = document.createDocumentFragment();
    let inKat = 0;
    kat.gruppen.forEach(g => {
      const namen = g.n.filter(n => treffer(n, suche) && !(verstecken && istVergeben(n)));
      if (!namen.length) return;
      if (g.g) {
        const h = el("p", "na-grp", g.g);
        block.appendChild(h);
      }
      const liste = el("div", "na-liste");
      namen.forEach(n => liste.appendChild(zeile(n)));
      block.appendChild(liste);
      inKat += namen.length;
    });
    if (!inKat) return;
    const h = el("p", "na-kat", kat.kat + " (" + inKat + ")");
    wrap.appendChild(h);
    wrap.appendChild(block);
    gezeigt += inKat;
  });
  const alleVergeben = new Set(Object.keys(ausListe).concat(Object.keys(S.vergeben)));
  frei = alleVergeben.size;
  const ausL = Object.keys(ausListe).length;
  $("zahl").textContent = gezeigt + " von " + gesamt + " angezeigt, " + frei + " vergeben" +
    (ausL ? " (" + ausL + " aus deiner Dorfliste)" : "");
  if (!gezeigt) wrap.appendChild(el("p", "na-leer", "Kein Name passt zur Suche."));
}

function zeile(name) {
  const z = el("div", "na-zeile");
  const nr = vergebenMit(name), vergeben = nr !== null;
  if (vergeben) z.classList.add("weg");
  const nm = el("span", "nm", name);
  nm.title = name;
  z.appendChild(nm);
  if (vergeben) {
    // aus der Liste erkannte Dörfer ohne Nummer: Name steht im Spiel, trägt aber noch keine Nummer
    const vg = el("span", "vg", nr == null ? "im Spiel" : C.formatNummer(nr, S.stellen));
    vg.title = ausListe[name] !== undefined ? "Steht so in deiner eingefügten Dorfliste" : "Hier kopiert";
    z.appendChild(vg);
  } else {
    z.appendChild(el("span", "len", name.length));
  }
  // Mit Nummer: genau das, was in das Dorfnamenfeld im Spiel gehört
  const bNr = el("button", "na-kop nr", "[Nr]");
  bNr.type = "button";
  bNr.title = "Mit Nummer kopieren: " + C.mitNummer(name, S.nr, S.stellen);
  bNr.addEventListener("click", () => kopieren(bNr, C.mitNummer(name, S.nr, S.stellen), name, true));
  z.appendChild(bNr);
  // Nur der Name, ohne Nummer
  const bPur = el("button", "na-kop");
  bPur.type = "button";
  bPur.innerHTML = KOPIE;
  bPur.title = "Nur den Namen kopieren";
  bPur.setAttribute("aria-label", "Nur den Namen kopieren: " + name);
  bPur.addEventListener("click", () => kopieren(bPur, name, name, false));
  z.appendChild(bPur);
  return z;
}

async function kopieren(knopf, text, name, mitNr) {
  let ok = true;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
    else ok = fallbackKopie(text);
  } catch (e) { ok = fallbackKopie(text); }
  if (!ok) { knopf.title = "Kopieren hat nicht geklappt: " + text; return; }
  knopf.classList.add("ok");
  setTimeout(() => knopf.classList.remove("ok"), 900);
  if (!mitNr) return;
  S.vergeben[name] = S.nr;                                // der Name ist jetzt im Spiel, nicht mehr anbieten
  if ($("auto").checked) S.nr = C.naechsteFreie(S.nr + 1, belegteNummern());
  nummerAnzeigen();
  zeichnen();
  sichern();
}

/** Ältere Browser ohne Clipboard-API (und Seiten ohne https). */
function fallbackKopie(text) {
  const t = document.createElement("textarea");
  t.value = text;
  t.setAttribute("readonly", "");
  t.style.position = "fixed";
  t.style.top = "-1000px";
  document.body.appendChild(t);
  t.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
  document.body.removeChild(t);
  return ok;
}

/* ---------- Start ---------- */
laden();

DATEN.forEach(k => {
  const o = document.createElement("option");
  o.value = k.kat;
  o.textContent = k.kat;
  $("kat").appendChild(o);
});

$("paste").value = S.text;
if (S.text) einlesen(S.text, true);                       // gespeicherte Handeingabe der Nummer behalten
else { nummerAnzeigen(); zeichnen(); }

$("paste").addEventListener("input", () => einlesen($("paste").value, false));
$("nr").addEventListener("input", () => {
  const v = Math.max(1, Math.round(+$("nr").value) || 1);
  S.nr = v;
  S.stellen = Math.max(3, String(v).length, stand ? stand.stellen : 3);
  nummerAnzeigen();
  zeichnen();
  sichern();
});
$("suche").addEventListener("input", zeichnen);
$("kat").addEventListener("change", zeichnen);
$("verstecken").addEventListener("change", zeichnen);
$("vergessen").addEventListener("click", () => {
  const n = Object.keys(S.vergeben).length;
  if (!n) {
    alert(Object.keys(ausListe).length
      ? "Hier wurde noch kein Name kopiert. Die als vergeben markierten stammen aus deiner Dorfliste und verschwinden erst, wenn du die Liste oben änderst."
      : "Hier wurde noch kein Name kopiert.");
    return;
  }
  if (!confirm("Die " + n + " hier kopierten Namen wieder freigeben? Namen aus deiner Dorfliste bleiben vergeben.")) return;
  S.vergeben = {};
  zeichnen();
  sichern();
});
$("zusatz-sperren").addEventListener("click", () => { zusatzSperren(); location.href = "./"; });
})();
