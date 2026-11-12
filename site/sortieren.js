/* Dörfer sortieren (Wunsch Dennis 12.11.2026): Truppenübersicht einfügen, jedes Dorf nach den Truppen, die zum Dorf
   gehören, als Off, Deff oder noch nicht zugeordnet einordnen, Listen als Koordinaten zum Kopieren.

   Gelesen wird je Dorf die Zeile „insgesamt“ der Ansicht „Alle“: im Dorf, auswärts und unterwegs zusammen (Dennis 18:38).
   Der Leser des Angriffsplaners liest dagegen die Zeile „eigene“ (was jetzt im Dorf steht), deshalb hier ein eigener
   kleiner Leser. Ansichten mit einer Zeile je Dorf („Eigene“, „Im Dorf“ …) zeigen nicht alle Truppen des Dorfs und
   werden abgelehnt. Einordnung (Standard, auf der Seite änderbar):
   - Speer bis raubzug gelten als Raubzug-Speer und zählen nicht.
   - Off-Seite in BH: Axt, LKav, berittene Bogen, Rammen, Katapulte. Deff-Seite: übrige Speer, Schwert, Bogen.
     Schwere Kavallerie zählt zur Seite mit mehr Infanterie (nach Abzug des Raubzug-Speers).
     Späher, Paladin, Adelsgeschlechter und Miliz zählen nicht.
   - Unter min_bh zusammen: noch nicht zugeordnet. Hat die stärkere Seite weniger als anteil Prozent: gemischt, ebenfalls
     noch nicht zugeordnet.
   Ohne DOM, im Browser window.Sortieren (braucht window.Angriff aus angriff-core.js), in Node module.exports. */
(function (root) {
"use strict";
const K = typeof module !== "undefined" && module.exports ? require("./angriff-core.js") : root.Angriff;

const STANDARD = {raubzug: 1000, min_bh: 500, anteil: 67};
const GRENZEN = {raubzug: [0, 100000], min_bh: [0, 100000], anteil: [50, 100]};
const OFF_INF = ["axe", "light", "marcher"], OFF_REST = ["ram", "catapult"], DEFF_INF = ["sword", "archer"];
const ART_NAME = {off: "Off", deff: "Deff", offen: "Noch nicht zugeordnet"};   // Bezeichnung Dennis 12.11.2026 15:25

/** Einstellungen auf erlaubte Ganzzahlen bringen, fehlende Werte aus dem Standard. */
function einstellungen(cfg) {
  const c = Object.assign({}, STANDARD);
  Object.keys(STANDARD).forEach(k => {
    const v = cfg && cfg[k] != null && cfg[k] !== "" ? Math.round(+cfg[k]) : NaN;
    if (Number.isFinite(v)) c[k] = Math.min(GRENZEN[k][1], Math.max(GRENZEN[k][0], v));
  });
  return c;
}

/**
 * Einordnung eines Dorfes nach seinen Einheiten.
 * @returns {{art: "off"|"deff"|"offen", offBH, deffBH, raubzug, heavyOff, grund}}
 */
function einordnen(units, cfg, pop) {
  const c = einstellungen(cfg), P = pop || K.POP, u = k => Math.max(0, +(units && units[k]) || 0);
  const raubzug = Math.min(u("spear"), c.raubzug);
  const offInf = OFF_INF.reduce((s, k) => s + u(k) * P[k], 0);
  const deffInf = (u("spear") - raubzug) * P.spear + DEFF_INF.reduce((s, k) => s + u(k) * P[k], 0);
  const heavyOff = offInf > deffInf, heavy = u("heavy") * P.heavy;
  const offBH = Math.round(offInf + OFF_REST.reduce((s, k) => s + u(k) * P[k], 0) + (heavyOff ? heavy : 0));
  const deffBH = Math.round(deffInf + (heavyOff ? 0 : heavy));
  const summe = offBH + deffBH;
  const r = {offBH, deffBH, raubzug, heavyOff, grund: ""};
  if (summe < c.min_bh || summe === 0) {
    r.art = "offen";
    if (summe === 0) r.grund = raubzug > 0 ? "nur Raubzug-Speer" : "keine Truppen";
    else r.grund = "zu wenig Truppen";
    return r;
  }
  const off = offBH >= deffBH, staerker = off ? offBH : deffBH;
  if (staerker * 100 < c.anteil * summe) {
    r.art = "offen";
    r.grund = "gemischt";
    return r;
  }
  r.art = off ? "off" : "deff";
  return r;
}

/** Anteil der Off-Seite in Prozent, gerundet; null ohne Truppen. */
const offAnteil = e => e.offBH + e.deffBH > 0 ? Math.round(100 * e.offBH / (e.offBH + e.deffBH)) : null;

const nachName = (a, b) => a.name.localeCompare(b.name, "de", {numeric: true, sensitivity: "base"}) || a.x - b.x || a.y - b.y;

/* ---------- Truppenübersicht, Ansicht „Alle“, Zeile „insgesamt“ ---------- */
const KOORD = /\((\d{1,3})\|(\d{1,3})\)\s*K(\d{1,2})/;
const NUM = /^(\d{1,3}(?:\.\d{3})+|\d+)$/;
const ANSICHT = {"": "Eigene", im: "Im Dorf", "auswärts": "Auswärts", unterwegs: "Unterwegs", verteidigung: "Verteidigung",
                 "unterstützungen": "Unterstützungen"};

/** Bezeichnung (erstes Wort vor den Zahlen, klein) und Zahlen einer Zeile. */
function zeile(rest) {
  let label = "";
  const nums = [];
  String(rest).split(/\s+/).filter(Boolean).forEach(t => {
    if (NUM.test(t)) nums.push(+t.replace(/\./g, ""));
    else if (!nums.length && !label) label = t.toLowerCase();
  });
  return {label, nums};
}

/**
 * Liest je Dorf die Zeile „insgesamt“. Ein Dorf beginnt mit der Zeile mit Koordinaten (Bezeichnung „eigene“), die Zahlen
 * kommen aus der folgenden Zeile „insgesamt“. Die Spalte Miliz darf fehlen.
 * @returns {{villages, errors, warnings}}
 */
function leseInsgesamt(text, columns) {
  columns = columns || K.OVERVIEW_COLUMNS;
  const noetig = columns.filter(c => c !== "militia").length;
  const villages = [], errors = [], warnings = [], seen = new Set(), ohne = [];
  let wartet = null, erwartet = null, einzeilig = 0, ansicht = "";
  const abschluss = () => { if (wartet && wartet.alle) ohne.push(wartet.v.name || wartet.v.x + "|" + wartet.v.y); wartet = null; };
  const fertig = (v, nums, nr) => {
    if (nums.length < noetig) {
      errors.push("Zeile " + nr + ": " + nums.length + " Zahlen, erwartet " + noetig + " (" + v.name + ")");
      return;
    }
    const units = Object.fromEntries(K.UNITS.map(u => [u, 0]));
    columns.forEach((c, j) => { if (c in units && j < nums.length) units[c] = nums[j]; });
    const key = v.x * 1000 + v.y;
    if (seen.has(key)) { warnings.push("Zeile " + nr + ": Dorf " + v.x + "|" + v.y + " doppelt, nur das erste zählt"); return; }
    seen.add(key);
    villages.push(Object.assign(v, {units}));
  };
  String(text || "").split(/\r?\n/).forEach((line, i) => {
    const nr = i + 1;
    const d = line.match(/^\s*Dorf \((\d+)\)/);
    if (d) erwartet = +d[1];
    const m = line.match(KOORD);
    if (m) {
      abschluss();
      const v = {name: line.slice(0, m.index).trim(), x: +m[1], y: +m[2], k: +m[3], line: nr};
      const z = zeile(line.slice(m.index + m[0].length));
      if (z.nums.length && z.label === "insgesamt") { fertig(v, z.nums, nr); return; }   // Zeile „insgesamt“ direkt am Dorf
      if (z.nums.length && z.label !== "eigene") {       // eine Zeile je Dorf: Ansicht „Eigene“, „Im Dorf“ …
        einzeilig++;
        if (!ansicht) ansicht = ANSICHT[z.label] || z.label;
        return;
      }
      wartet = {v, alle: z.label === "eigene"};          // ohne Zahlen: Kopfzeile des aktiven Dorfs oder Zahlen folgen
      return;
    }
    if (!wartet) return;
    const z = zeile(line);
    if (z.label === "eigene") wartet.alle = true;
    else if (z.label === "insgesamt") { const v = wartet.v; wartet = null; fertig(v, z.nums, nr); }
  });
  abschluss();
  if (einzeilig) {
    errors.push("Ansicht „" + ansicht + "“ erkannt (" + einzeilig + (einzeilig === 1 ? " Dorf" : " Dörfer") +
                "): sie zeigt nicht alle Truppen, die zum Dorf gehören. Bitte Ansicht „Alle“ einfügen, gelesen wird die Zeile „insgesamt“.");
  }
  if (ohne.length) {
    warnings.push("Ohne Zeile „insgesamt“, nicht gelesen: " + ohne.slice(0, 5).join(", ") + (ohne.length > 5 ? " und " + (ohne.length - 5) + " weitere" : ""));
  }
  if (erwartet != null && erwartet !== villages.length && villages.length) {
    warnings.push("Übersicht nennt " + erwartet + " Dörfer, gelesen " + villages.length +
                  (erwartet > villages.length ? " (weitere Seiten? „Dörfer pro Seite“ hochstellen)" : ""));
  }
  if (!villages.length && !errors.length) errors.push("Keine Dörfer erkannt. Erwartet wird die Truppenübersicht, Ansicht „Alle“.");
  return {villages, errors, warnings};
}

/**
 * Truppenübersicht lesen und einordnen.
 * @returns {{off, deff, offen, gelesen, errors, warnings}} Listen nach Dorfname sortiert, je Dorf {name, x, y, k, units, e}
 */
function sortieren(text, cfg, columns, pop) {
  const r = leseInsgesamt(text, columns);
  const aus = {off: [], deff: [], offen: [], gelesen: r.villages.length, errors: r.errors, warnings: r.warnings};
  r.villages.forEach(v => {
    const e = einordnen(v.units, cfg, pop);
    aus[e.art].push(Object.assign({}, v, {e}));
  });
  ["off", "deff", "offen"].forEach(a => aus[a].sort(nachName));
  return aus;
}

/** Koordinaten mit Leerzeichen getrennt, wie im Feld „Koordinaten hinzufügen“ der Gruppenverwaltung im Spiel. */
const koordText = liste => liste.map(v => v.x + "|" + v.y).join(" ");

const api = {STANDARD, GRENZEN, ART_NAME, einstellungen, einordnen, offAnteil, leseInsgesamt, sortieren, koordText};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.Sortieren = api;
})(typeof window !== "undefined" ? window : globalThis);
