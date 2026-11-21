// Dorfnamen vergeben: Nummerierung aus einer Dorfliste lesen (Wunsch Dennis 21.11.2026)
const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../site/namen-core.js");
const DATEN = require("../site/namen-daten.js");

// Zeilen wie in der Truppen- oder Dorfübersicht: Name, Koordinaten, Kontinent, danach beliebige Spalten
const zeile = (name, x, y, rest) => name + " (" + x + "|" + y + ") K66" + (rest || "");

test("Nummer wird nur am Anfang des Namens gelesen", () => {
  assert.equal(N.nummerVon("[156] Fluch der Kriegskasse"), 156);
  assert.equal(N.nummerVon("[007] Shoponn"), 7);
  assert.equal(N.nummerVon("Barbarendorf"), null);
  assert.equal(N.nummerVon("Dorf [042] hinten"), null);       // Nummer mitten im Namen zählt nicht
  assert.equal(N.ohneNummer("[156] Fluch der Kriegskasse"), "Fluch der Kriegskasse");
  assert.equal(N.ohneNummer("Barbarendorf"), "Barbarendorf");
});

test("Nummer wird dreistellig geschrieben und wächst mit", () => {
  assert.equal(N.formatNummer(7, 3), "[007]");
  assert.equal(N.formatNummer(156, 3), "[156]");
  assert.equal(N.formatNummer(1204, 3), "[1204]");            // vierstellig passt nicht in drei Stellen
  assert.equal(N.formatNummer(42, 4), "[0042]");
  assert.equal(N.mitNummer("Fluch der Kriegskasse", 156, 3), "[156] Fluch der Kriegskasse");
  // Dennis' Fall: aus der Liste kopierter Name trägt schon eine Nummer, die ersetzt wird
  assert.equal(N.mitNummer("[012] Shoponn", 156, 3), "[156] Shoponn");
});

test("Stand der Nummerierung: höchste, nächste, unbenannte Dörfer", () => {
  const text = [
    "Dorf (4)",
    zeile("[001] Shoppington D.C.", 631, 601, "\t1234\t5678"),
    zeile("[002] Michael Pay", 632, 602),
    zeile("[155] Herr der Flaggendoppler", 633, 603),
    zeile("Barbarendorf", 634, 604)
  ].join("\n");
  const s = N.stand(text);
  assert.equal(s.anzahl, 4);
  assert.equal(s.hoechste, 155);
  assert.equal(s.naechste, 156);                              // genau Dennis' Beispiel
  assert.equal(s.ohneNummer.length, 1);
  assert.equal(s.ohneNummer[0].name, "Barbarendorf");
  assert.equal(s.stellen, 3);
  assert.deepEqual(s.doppelt, []);
});

test("Doppelte Nummer meldet das zuletzt gelesene Dorf zuerst", () => {
  // Dennis adelt ein Dorf eines Spielers, der ebenfalls nummeriert: [033] liegt jetzt zweimal vor
  const text = [
    zeile("[033] Payris", 631, 601),
    zeile("[034] Buycelona", 632, 602),
    zeile("[033] Fremdes Dorf", 700, 700)
  ].join("\n");
  const s = N.stand(text);
  assert.equal(s.doppelt.length, 1);
  assert.equal(s.doppelt[0].nummer, 33);
  assert.equal(s.doppelt[0].doerfer[0].name, "Fremdes Dorf");  // das neue, es wird umnummeriert
  assert.equal(s.doppelt[0].doerfer[1].name, "Payris");
  assert.equal(s.naechste, 35);
});

test("Lücken in der Nummerierung werden gefunden", () => {
  const text = [zeile("[001] A", 1, 1), zeile("[003] B", 2, 2), zeile("[006] C", 3, 3)].join("\n");
  const s = N.stand(text);
  assert.deepEqual(s.luecken, [2, 4, 5]);
  assert.equal(s.naechste, 7);
});

test("Vierstellige Nummerierung bleibt vierstellig", () => {
  const s = N.stand(zeile("[0999] Grenzdorf", 1, 1));
  assert.equal(s.stellen, 4);
  assert.equal(N.formatNummer(s.naechste, s.stellen), "[1000]");
});

test("Zeilen ohne Dorf und doppelte Koordinaten stören nicht", () => {
  const text = [
    "Truppen\teigene\tauswärts",                               // Kopfzeile ohne Koordinaten
    "insgesamt\t1000\t2000",                                   // Truppenzeile
    zeile("[001] Shoponn", 631, 601),
    "eigene\t500\t600",
    zeile("[001] Shoponn", 631, 601)                           // dasselbe Dorf ein zweites Mal
  ].join("\n");
  const s = N.stand(text);
  assert.equal(s.anzahl, 1);
  assert.equal(s.naechste, 2);
});

test("Leere Eingabe liefert Nummer 1", () => {
  const s = N.stand("");
  assert.equal(s.anzahl, 0);
  assert.equal(s.hoechste, 0);
  assert.equal(s.naechste, 1);
  assert.equal(N.formatNummer(s.naechste, s.stellen), "[001]");
});

test("Nächste freie Nummer überspringt vergebene", () => {
  assert.equal(N.naechsteFreie(156, [156, 157]), 158);
  assert.equal(N.naechsteFreie(156, []), 156);
  assert.equal(N.naechsteFreie(0, []), 1);
});

test("Namensvorrat: Längenlimit und keine Dubletten", () => {
  const alle = [];
  DATEN.forEach(k => {
    assert.ok(k.kat && k.gruppen.length, "Kategorie ohne Gruppen: " + k.kat);
    k.gruppen.forEach(g => g.n.forEach(n => alle.push(n)));
  });
  assert.ok(alle.length > 1000, "Vorrat zu klein: " + alle.length);
  const lang = alle.filter(n => n.length > 26);
  assert.deepEqual(lang, [], "über 26 Zeichen");
  // 26 Zeichen plus „[156] “ bleibt im Dorfnamenfeld (32 Zeichen) des Spiels
  const doppelt = alle.filter((n, i) => alle.indexOf(n) !== i);
  assert.deepEqual([...new Set(doppelt)], [], "doppelte Namen");
});

test("Doppelte Nummer: das Dorf mit fremdem Namen wird zum Umnummerieren vorgeschlagen", () => {
  // Reihenfolge der Liste absichtlich andersherum: das fremde Dorf steht vorne, das eigene hinten
  const text = [
    zeile("[033] Fremdes Dorf", 700, 700),
    zeile("[033] Payris", 640, 600),
    zeile("[034] Buycelona", 632, 602)
  ].join("\n");
  const ohne = N.stand(text);
  assert.equal(ohne.doppelt[0].doerfer[0].name, "Payris", "ohne Vorrat zählt die Reihenfolge");
  const mit = N.stand(text, DATEN);
  assert.equal(mit.doppelt[0].doerfer[0].name, "Fremdes Dorf", "Payris steht im Vorrat, ist also Dennis' Dorf");
  assert.equal(mit.doppelt[0].doerfer[1].name, "Payris");
});

test("Vorrat erkennt eigene Dörfer am Namen", () => {
  const s = N.stand([zeile("[001] Payris", 1, 1), zeile("Barbarendorf", 2, 2)].join("\n"), DATEN);
  assert.equal(s.doerfer[0].ausVorrat, true);
  assert.equal(s.doerfer[1].ausVorrat, false);
  assert.ok(N.vorratSet(DATEN).size > 1000);
});
