#!/usr/bin/env node
/* Legt ein neues Passwort für die Zusatzfunktionen (Angriffsplaner) fest. Nur nötig, wenn sich das Passwort ändern soll.

   Seit 10.11.2026 (Dennis) liegt der Planer lesbar im Repo (site/angriff-core.js, site/angriff-seite.js). Das Passwort ist
   nur noch eine einfache Sperre im Browser, kein Schutz gegen Leser des Repos. Bei Updates des Planers ist kein
   Verschlüsseln mehr nötig. site/zusatz.json enthält nur Salz, Runden und einen Prüfwert (AES-GCM über "Karte259",
   Schlüssel per PBKDF2-SHA-256 aus dem Passwort); app.js prüft damit die Eingabe.

   Aufruf im Repo:   node tools/zusatz_passwort.js
   Passwort:         verdeckte Eingabe (zweimal), oder Umgebungsvariable K259_ZUSATZ_PW. Das Passwort steht nie in einer Datei.
   Danach müssen alle Browser neu freischalten. Nur eingebaute Node-Module. */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");

const ITER = 600000, PRUEF = "Karte259";

const schluessel = (pw, salz, iter) => crypto.pbkdf2Sync(Buffer.from(pw, "utf8"), salz, iter, 32, "sha256");
/** AES-256-GCM wie WebCrypto: Chiffrat mit angehängtem 16-Byte-Tag. */
function verschluesseln(key, text) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(Buffer.from(text, "utf8")), c.final(), c.getAuthTag()]);
  return {iv: iv.toString("base64"), ct: ct.toString("base64")};
}
/** Inhalt von zusatz.json für ein Passwort, mit neuem Salz. */
function bauen(pw, iter = ITER) {
  const salz = crypto.randomBytes(16);
  return {v: 2, salt: salz.toString("base64"), iter, pruef: verschluesseln(schluessel(pw, salz, iter), PRUEF)};
}

function verdeckt(frage) {
  return new Promise((ok, fehl) => {
    // Git Bash (mintty) ist für Node kein Terminal, die Eingabe wäre sichtbar: dann lieber abbrechen
    if (!process.stdin.isTTY) { fehl(new Error("Kein Terminal für die verdeckte Eingabe. In PowerShell oder cmd ausführen, in Git Bash mit „winpty node tools/zusatz_passwort.js“.")); return; }
    const rl = require("readline").createInterface({input: process.stdin, output: process.stdout, terminal: true});
    rl._writeToOutput = s => { if (s.includes(frage)) process.stdout.write(s); };
    rl.question(frage, a => { rl.close(); process.stdout.write("\n"); ok(a); });
    rl.on("SIGINT", () => { rl.close(); fehl(new Error("abgebrochen")); });
  });
}

async function main() {
  const ziel = path.join(path.resolve(__dirname, ".."), "site", "zusatz.json");
  let pw = process.env.K259_ZUSATZ_PW;
  if (!pw) {
    pw = await verdeckt("Neues Passwort für die Zusatzfunktionen: ");
    if (pw !== await verdeckt("Noch einmal: ")) throw new Error("Die beiden Eingaben sind verschieden.");
  }
  if (!pw || pw.length < 6) throw new Error("Passwort fehlt oder ist kürzer als 6 Zeichen.");
  fs.writeFileSync(ziel, JSON.stringify(bauen(pw)) + "\n");
  console.log("site/zusatz.json geschrieben: neues Passwort, alle Browser müssen neu freischalten.");
}

module.exports = {bauen, schluessel, verschluesseln, ITER, PRUEF};
if (require.main === module) main().catch(e => { console.error("Fehler:", e.message); process.exit(1); });
