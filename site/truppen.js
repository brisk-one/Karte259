/* Truppen-Äquivalent zu Off- und Deff-Bash (Spezifikation Kämpfe 14, Entscheidungen Dennis 03.11.2026 14:52).
   Punkte je getöteter Einheit laut InnoGames-Support KB 4436 („Wie wird Gegner besiegt berechnet?“, 03.11.2026).
   Deff- und Unterstützungs-Bash: der Verteidiger hat Angreifer getötet, umgerechnet in volle Offs (1a: 6.500 Axt,
   3.000 LKav, 300 Rammen). Off-Bash: der Angreifer hat Verteidiger getötet, umgerechnet in volle Deffs (2a: Speer,
   Schwert, Bogen zu gleichen Teilen, 20.000 Plätze). Ohne DOM, im Browser window.Truppen, in Node module.exports. */
(function (root) {
"use strict";
// [Off-Bash, wenn der Angreifer die Einheit tötet; Deff-Bash, wenn der Verteidiger sie tötet]
const PUNKTE = {spear: [4, 1], sword: [5, 2], axe: [1, 4], archer: [5, 2], spy: [1, 2], light: [5, 13], marcher: [6, 12],
                heavy: [23, 15], ram: [4, 8], catapult: [12, 10], knight: [40, 20], snob: [200, 200]};
const VOLLE_OFF = {axe: 6500, light: 3000, ram: 300};
const VOLLE_DEFF = {spear: 20000 / 3, sword: 20000 / 3, archer: 20000 / 3};
const NAME = {axe: "Axt", light: "LKav", ram: "Rammen", spear: "Speer", sword: "Schwert", archer: "Bogen"};
const summe = (z, i) => Object.keys(z).reduce((s, u) => s + z[u] * PUNKTE[u][i], 0);
const BASH_JE_OFF = summe(VOLLE_OFF, 1);       // 67.400: Deff-Bash, wenn eine volle Off fällt
const BASH_JE_DEFF = summe(VOLLE_DEFF, 0);     // 93.333: Off-Bash, wenn eine volle Deff fällt

/** art „def“ oder „sup“ (Angreifer getötet, in Offs) oder „att“ (Verteidiger getötet, in Deffs).
    {anzahl, einheiten: {axe: …}} ungerundet. */
function bashTruppen(punkte, art) {
  const off = art !== "att", z = off ? VOLLE_OFF : VOLLE_DEFF;
  const anzahl = Math.max(0, punkte || 0) / (off ? BASH_JE_OFF : BASH_JE_DEFF);
  const einheiten = {};
  Object.keys(z).forEach(u => { einheiten[u] = anzahl * z[u]; });
  return {anzahl, einheiten, off};
}
/** Zwei signifikante Stellen: Näherung, keine Scheingenauigkeit. */
function sig2(x) {
  if (x < 10) return Math.round(x);
  const f = Math.pow(10, Math.floor(Math.log10(x)) - 1);
  return Math.round(x / f) * f;
}
const nf = new Intl.NumberFormat("de-DE"), nf1 = new Intl.NumberFormat("de-DE", {maximumFractionDigits: 1});
/** „≈ 1,5 Offs (9.600 Axt, 4.500 LKav, 450 Rammen)“, „≈ 1,1 Deffs (7.100 Speer, 7.100 Schwert, 7.100 Bogen)“.
    Immer mit der Zahl der Einheiten (Dennis 09.11.2026, die Kurzform „≈ 0,5 Deffs“ entfällt; der frühere dritte
    Parameter kurz wird ignoriert). Unter 0,1 nur die Einheiten. Leer bei 0. */
function truppenText(punkte, art) {
  const t = bashTruppen(punkte, art);
  if (!(t.anzahl > 0)) return "";
  const n = Math.round(t.anzahl * 10) / 10;
  const wort = t.off ? (n === 1 ? "Off" : "Offs") : (n === 1 ? "Deff" : "Deffs");
  let teile;
  if (t.off) teile = Object.keys(VOLLE_OFF).map(u => [sig2(t.einheiten[u]), NAME[u]]).filter(x => x[0] > 0).map(x => nf.format(x[0]) + " " + x[1]).join(", ");
  else { const e = sig2(t.einheiten.spear); teile = e > 0 ? ["Speer", "Schwert", "Bogen"].map(x => nf.format(e) + " " + x).join(", ") : ""; }
  if (n < 0.1) return teile ? "≈ " + teile : "";
  return "≈ " + nf1.format(n) + " " + wort + (teile ? " (" + teile + ")" : "");
}
const INFO = "Näherung: eine volle Off sind 6.500 Axt, 3.000 LKav und 300 Rammen (20.000 Plätze, " + nf.format(BASH_JE_OFF) +
  " Punkte, wenn der Verteidiger sie vernichtet), eine volle Deff sind je 6.667 Speer, Schwert und Bogen (" + nf.format(Math.round(BASH_JE_DEFF)) +
  " Punkte, wenn der Angreifer sie vernichtet). Unterstützung zählt wie Deff. Punkte je Einheit laut InnoGames-Hilfe. Reine LKav- oder " +
  "Speer-Mischungen weichen stark ab; Späher, Katapulte, Paladin und Adelsgeschlechter sind nicht berücksichtigt; Bashpunkte kommen im Spiel teils verzögert.";

const api = {PUNKTE, VOLLE_OFF, VOLLE_DEFF, BASH_JE_OFF, BASH_JE_DEFF, bashTruppen, sig2, truppenText, INFO};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.Truppen = api;
})(typeof window !== "undefined" ? window : globalThis);
