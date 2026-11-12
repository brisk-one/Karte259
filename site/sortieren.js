/* Dörfer sortieren (Wunsch Dennis 12.11.2026): Truppenübersicht einfügen, jedes Dorf nach den Truppen, die gerade
   im Dorf stehen, als Off, Deff oder noch nicht zuordbar einordnen, Listen als Koordinaten zum Kopieren.

   Gelesen wird mit dem Leser des Angriffsplaners (Angriff.parseOverview, Zeile „eigene“ der Ansicht „Alle“ oder die
   Ansicht „Eigene“), damit es für die Truppenübersicht genau einen Leser gibt. Einordnung (Standard, auf der Seite
   änderbar):
   - Speer bis raubzug gelten als Raubzug-Speer und zählen nicht.
   - Off-Seite in BH: Axt, LKav, berittene Bogen, Rammen, Katapulte. Deff-Seite: übrige Speer, Schwert, Bogen.
     Schwere Kavallerie zählt zur Seite mit mehr Infanterie (nach Abzug des Raubzug-Speers).
     Späher, Paladin, Adelsgeschlechter und Miliz zählen nicht.
   - Unter min_bh zusammen: noch nicht zuordbar. Hat die stärkere Seite weniger als anteil Prozent: gemischt, ebenfalls
     noch nicht zuordbar.
   Ohne DOM, im Browser window.Sortieren (braucht window.Angriff aus angriff-core.js), in Node module.exports. */
(function (root) {
"use strict";
const K = typeof module !== "undefined" && module.exports ? require("./angriff-core.js") : root.Angriff;

const STANDARD = {raubzug: 1000, min_bh: 500, anteil: 67};
const GRENZEN = {raubzug: [0, 100000], min_bh: [0, 100000], anteil: [50, 100]};
const OFF_INF = ["axe", "light", "marcher"], OFF_REST = ["ram", "catapult"], DEFF_INF = ["sword", "archer"];
const ART_NAME = {off: "Off", deff: "Deff", offen: "Noch nicht zuordbar"};

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

/**
 * Truppenübersicht lesen und einordnen.
 * @returns {{off, deff, offen, gelesen, errors, warnings}} Listen nach Dorfname sortiert, je Dorf {name, x, y, k, units, e}
 */
function sortieren(text, cfg, columns, pop) {
  const r = K.parseOverview(text, columns);
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

const api = {STANDARD, GRENZEN, ART_NAME, einstellungen, einordnen, offAnteil, sortieren, koordText};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.Sortieren = api;
})(typeof window !== "undefined" ? window : globalThis);
