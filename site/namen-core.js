/* Dorfnamen vergeben (Wunsch Dennis 21.11.2026): Dennis nummeriert seine Dörfer mit [001], [002] … vorweg. Frisch
   geadelte Dörfer heißen noch „Barbarendorf“ oder tragen den Namen des Vorbesitzers und folgen der Nummerierung nicht.
   Diese Datei liest aus einer eingefügten Dorfliste, wo die Nummerierung aufgehört hat, und liefert die nächste freie
   Nummer für einen neuen Namen.

   Erkannt wird die Nummer nur am Anfang des Dorfnamens: „[156] Fluch der Kriegskasse“. Eine Nummer mitten im Namen
   zählt nicht. Dörfer ohne führende Nummer gelten als noch nicht benannt (die, die einen Namen brauchen).

   Doppelte Nummern (Dennis 21.11.2026): Erobert er das Dorf eines Spielers, der ebenfalls mit [033] nummeriert,
   trägt dieses Dorf eine Nummer, die er schon vergeben hat. Solche Dörfer werden gemeldet; umzunummerieren ist das
   fremde. Erkannt wird es am Namen: Dennis' eigene Dörfer tragen Namen aus seinem Vorrat, das geadelte nicht. Ist
   der Vorrat nicht bekannt oder stehen beide Namen darin, gilt ersatzweise das später in der Liste gelesene als das
   neue.

   Ohne DOM, im Browser window.NamenCore, in Node module.exports. */
(function (root) {
"use strict";

/* Dorfzeile: „[156] Fluch der Kriegskasse (631|601) K66“. Die Koordinaten sind der verlässliche Anker für eine
   Dorfzeile, egal aus welcher Übersicht die Liste kopiert wurde (Truppenübersicht, Dorfübersicht, Gruppenliste). */
const KOORD = /\((\d{1,3})\|(\d{1,3})\)(?:\s*K(\d{1,2}))?/;
const NUMMER = /^\s*\[\s*(\d{1,4})\s*\]\s*/;
const STELLEN_MIN = 3;

/** Nummer eines Dorfnamens, oder null. Nur am Anfang, wie Dennis sie vergibt. */
function nummerVon(name) {
  const m = NUMMER.exec(String(name || ""));
  return m ? parseInt(m[1], 10) : null;
}

/** Name ohne die führende Nummer. */
function ohneNummer(name) {
  return String(name || "").replace(NUMMER, "").trim();
}

/** Nummer als [156], mindestens dreistellig, bei größeren Zahlen entsprechend länger. */
function formatNummer(n, stellen) {
  const z = Math.max(0, Math.round(+n) || 0);
  const s = Math.max(STELLEN_MIN, Math.round(+stellen) || 0);
  return "[" + String(z).padStart(s, "0") + "]";
}

/** Fertiger Dorfname: „[156] Fluch der Kriegskasse“. */
function mitNummer(name, n, stellen) {
  return formatNummer(n, stellen) + " " + ohneNummer(name);
}

/**
 * Liest Dorfzeilen aus eingefügtem Text. Jede Zeile mit Koordinaten gilt als Dorf; alles vor den Koordinaten ist
 * der Name. Zeilen ohne Koordinaten (Kopfzeilen, Truppenzahlen) werden übergangen.
 * @returns {Array} je Dorf {roh, name, nummer, x, y, k, zeile}
 */
function leseDoerfer(text) {
  const out = [], gesehen = new Set();
  String(text || "").split(/\r?\n/).forEach((line, i) => {
    const m = KOORD.exec(line);
    if (!m) return;
    const roh = line.slice(0, m.index).trim();
    if (!roh) return;                                   // Koordinaten ohne Namen davor: keine Dorfzeile
    const x = +m[1], y = +m[2];
    const key = x * 1000 + y;
    if (gesehen.has(key)) return;                       // dasselbe Dorf mehrfach in der Liste: erstes zählt
    gesehen.add(key);
    out.push({roh, name: ohneNummer(roh), nummer: nummerVon(roh), x, y, k: m[3] != null ? +m[3] : null, zeile: i + 1});
  });
  return out;
}

/** Menge der Namen aus dem Vorrat, klein geschrieben, zum Wiedererkennen eigener Dörfer. */
function vorratSet(daten) {
  const s = new Set();
  (daten || []).forEach(k => (k.gruppen || []).forEach(g => (g.n || []).forEach(n => s.add(String(n).toLowerCase()))));
  return s;
}

/**
 * Stand der Nummerierung aus einer Dorfliste.
 * @param {string} text eingefügte Dorfliste
 * @param {Array} [daten] Namensvorrat wie in namen-daten.js, um eigene von geadelten Dörfern zu unterscheiden
 * @returns {{doerfer, nummeriert, ohneNummer, hoechste, naechste, stellen, doppelt, luecken, anzahl}}
 *   doppelt: je mehrfach vergebener Nummer {nummer, doerfer:[…]}, das umzunummerierende zuerst.
 *   luecken: freie Nummern unterhalb der höchsten, aufsteigend.
 */
function stand(text, daten) {
  const doerfer = leseDoerfer(text);
  const vorrat = daten ? vorratSet(daten) : null;
  if (vorrat) doerfer.forEach(d => { d.ausVorrat = vorrat.has(d.name.toLowerCase()); });
  const nummeriert = doerfer.filter(d => d.nummer != null);
  const offen = doerfer.filter(d => d.nummer == null);
  let hoechste = 0;
  const proNummer = new Map();
  nummeriert.forEach(d => {
    hoechste = Math.max(hoechste, d.nummer);
    if (!proNummer.has(d.nummer)) proNummer.set(d.nummer, []);
    proNummer.get(d.nummer).push(d);
  });
  const doppelt = [];
  proNummer.forEach((liste, nummer) => {
    if (liste.length <= 1) return;
    // zuletzt gelesen zuerst; ein Name außerhalb des Vorrats ist das sicherere Zeichen fürs geadelte Dorf
    const sortiert = liste.slice().reverse();
    if (vorrat) sortiert.sort((a, b) => (a.ausVorrat ? 1 : 0) - (b.ausVorrat ? 1 : 0));
    doppelt.push({nummer, doerfer: sortiert});
  });
  doppelt.sort((a, b) => a.nummer - b.nummer);
  const luecken = [];
  for (let i = 1; i < hoechste; i++) if (!proNummer.has(i)) luecken.push(i);
  // Stellen aus der längsten vorhandenen Nummer, damit [007] nicht neben [7] steht
  let stellen = STELLEN_MIN;
  nummeriert.forEach(d => {
    const m = NUMMER.exec(d.roh);
    if (m) stellen = Math.max(stellen, m[1].length);
  });
  stellen = Math.max(stellen, String(hoechste + 1).length);
  return {doerfer, nummeriert, ohneNummer: offen, hoechste, naechste: hoechste + 1, stellen, doppelt, luecken,
          anzahl: doerfer.length};
}

/* Namensvergleich (Dennis 24.11.2026): Sein Dorf „[123] Rumpelshoppchen“ wurde nicht als vergeben erkannt, weil der
   Vorrat „Rumpelshopzchen“ enthält. Beim Umbenennen im Spiel verrutscht ein Buchstabe, oder er wandelt den Namen
   leicht ab. Darum wird zweistufig verglichen:
   1. genau, auf der normalisierten Form (klein, ohne Satz- und Sonderzeichen, einfache Leerzeichen),
   2. sonst ähnlich, über die Editierdistanz, mit einer Schwelle nach Namenslänge.
   Ein ähnlicher Treffer zählt nur, wenn genau ein Vorratsname so nah liegt. Liegen zwei gleich nah (im Vorrat gibt
   es Paare wie Kaufpino/Kaufmino), bleibt der Name frei, statt den falschen zu streichen. */

/** Vergleichsform: klein, ohne Satzzeichen, einfache Leerzeichen. */
function normName(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9äöüß ]+/g, "").replace(/\s+/g, " ").trim();
}

/** Erlaubte Editierdistanz für einen Namen dieser Länge: 1 bis 3 Zeichen. */
const aehnlichSchwelle = laenge => Math.min(3, Math.max(1, Math.floor(laenge / 7)));

/** Editierdistanz (Levenshtein), bricht ab, sobald die Grenze überschritten ist. */
function distanz(a, b, grenze) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  if (grenze != null && Math.abs(m - n) > grenze) return grenze + 1;
  let prev = Array.from({length: n + 1}, (_, j) => j);
  const cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let zeilenMin = cur[0];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
      if (cur[j] < zeilenMin) zeilenMin = cur[j];
    }
    if (grenze != null && zeilenMin > grenze) return grenze + 1;
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

/**
 * Namen aus dem Vorrat, die laut Dorfliste schon im Spiel stehen (Dennis 24.11.2026: die sollen nicht noch einmal
 * vorgeschlagen werden). Erkennt auch leicht abgewandelte Schreibweisen, siehe oben.
 * @param {Array} doerfer aus leseDoerfer/stand
 * @param {Array} daten Namensvorrat
 * @returns {Object} Name aus dem Vorrat -> {nummer, dorf, genau}; nummer ist null, wenn das Dorf keine trägt
 */
function vergebenAusListe(doerfer, daten) {
  const vorrat = [];
  (daten || []).forEach(k => (k.gruppen || []).forEach(g => (g.n || []).forEach(n => vorrat.push({name: n, norm: normName(n)}))));
  const nachNorm = new Map();
  vorrat.forEach(v => { if (!nachNorm.has(v.norm)) nachNorm.set(v.norm, v.name); });
  const t = {};
  const setzen = (name, d, genau) => { if (!(name in t)) t[name] = {nummer: d.nummer != null ? d.nummer : null, dorf: d.roh, genau}; };
  const offen = [];
  (doerfer || []).forEach(d => {
    const n = normName(d.name);
    if (!n) return;
    const genau = nachNorm.get(n);
    if (genau) setzen(genau, d, true);
    else offen.push({d, n});
  });
  // zweite Stufe: ähnliche Schreibweise, nur wenn genau ein Vorratsname so nah liegt
  offen.forEach(({d, n}) => {
    const grenze = aehnlichSchwelle(n.length);
    let beste = null, besteD = grenze + 1, mehrdeutig = false;
    vorrat.forEach(v => {
      if (Math.abs(v.norm.length - n.length) > grenze) return;
      const dist = distanz(n, v.norm, grenze);
      if (dist > grenze) return;
      if (dist < besteD) { besteD = dist; beste = v.name; mehrdeutig = false; }
      else if (dist === besteD && v.name !== beste) mehrdeutig = true;
    });
    if (beste && !mehrdeutig) setzen(beste, d, false);
  });
  return t;
}

/**
 * Nächste freie Nummer ab einem Startwert, die weder vergeben noch in dieser Sitzung schon ausgegeben ist.
 * @param {number} start erster Kandidat
 * @param {Set|Array} belegt bereits vergebene Nummern
 */
function naechsteFreie(start, belegt) {
  const b = belegt instanceof Set ? belegt : new Set(belegt || []);
  let n = Math.max(1, Math.round(+start) || 1);
  while (b.has(n)) n++;
  return n;
}

const api = {KOORD, NUMMER, nummerVon, ohneNummer, formatNummer, mitNummer, leseDoerfer, vorratSet, stand,
             normName, aehnlichSchwelle, distanz, vergebenAusListe, naechsteFreie};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.NamenCore = api;
})(typeof window !== "undefined" ? window : globalThis);
