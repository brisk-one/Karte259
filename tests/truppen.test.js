// Truppen-Äquivalent zu Off- und Deff-Bash (Spezifikation Kämpfe 14)
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../site/truppen.js");

test("Konstanten aus den Entscheidungen 1a und 2a", () => {
  assert.equal(T.BASH_JE_OFF, 67400);
  assert.equal(Math.round(T.BASH_JE_DEFF), 93333);
  assert.equal(Object.values(T.VOLLE_OFF).reduce((s, x) => s + x, 0) + 0, 9800);
});

test("Umrechnung laut Definition of Done", () => {
  const d = T.bashTruppen(100000, "def");
  assert.equal(Math.round(d.anzahl * 100) / 100, 1.48);
  assert.deepEqual([Math.round(d.einheiten.axe), Math.round(d.einheiten.light), Math.round(d.einheiten.ram)], [9644, 4451, 445]);
  const o = T.bashTruppen(100000, "att");
  assert.equal(Math.round(o.anzahl * 100) / 100, 1.07);
  ["spear", "sword", "archer"].forEach(u => assert.equal(Math.round(o.einheiten[u]), 7143));
  assert.equal(T.bashTruppen(100000, "sup").anzahl, d.anzahl, "Unterstützung wie Deff");
});

test("Anzeige: Format und Rundung", () => {
  assert.equal(T.truppenText(100000, "def"), "≈ 1,5 Offs (9.600 Axt, 4.500 LKav, 450 Rammen)");
  assert.equal(T.truppenText(100000, "att"), "≈ 1,1 Deffs (je 7.100 Speer, Schwert, Bogen)");
  assert.equal(T.truppenText(100000, "def", true), "≈ 1,5 Offs");
  assert.equal(T.truppenText(67400, "def", true), "≈ 1 Off");
  assert.equal(T.truppenText(3000, "def"), "≈ 290 Axt, 130 LKav, 13 Rammen");     // unter 0,1 Offs nur Einheiten
  assert.equal(T.truppenText(0, "att"), "");
  assert.equal(T.truppenText(5, "att"), "");                                       // weniger als eine halbe Einheit
  assert.equal(T.sig2(9644), 9600);
  assert.equal(T.sig2(445.1), 450);
  assert.equal(T.sig2(7.4), 7);
  assert.ok(/Näherung/.test(T.INFO) && /67\.400/.test(T.INFO));
});
