#!/usr/bin/env node
/* Verschlüsselt die Zusatzfunktionen (Angriffsplaner) nach site/zusatz.json (Entscheidung Dennis 4a, 03.11.2026).

   Der lesbare Quelltext liegt außerhalb des Repos (Standard: ../privat/angriffsplaner, also D:\Karte259\privat\angriffsplaner).
   Ins Repo kommt nur site/zusatz.json: AES-256-GCM, Schlüssel per PBKDF2-SHA-256 aus dem Passwort. Die Seite
   site/angriff.html entschlüsselt sie im Browser mit dem nach dem Freischalten gespeicherten Schlüssel (app.js).

   Aufruf im Repo:   node tools/zusatz_verschluesseln.js [--quelle <Ordner>] [--neu]
   Passwort:         verdeckte Eingabe, oder Umgebungsvariable K259_ZUSATZ_PW. Das Passwort steht nie in einer Datei.
   Ohne --neu muss das Passwort zum bisherigen site/zusatz.json passen (Schutz vor Tippfehlern); dann bleiben die
   Schlüssel in den Browsern gültig. --neu legt ein neues Passwort fest, alle Browser müssen neu freischalten.
   Nur eingebaute Node-Module. */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");

const ITER = 600000, PRUEF = "Karte259";

/** Teile der lesbaren Planerseite: Stil, Inhalt (<main>), Skripte in Reihenfolge (Rechenkern, Seite). */
function nutzlast(quelle) {
  const html = fs.readFileSync(path.join(quelle, "site", "angriff.html"), "utf8");
  const kern = fs.readFileSync(path.join(quelle, "site", "angriff-core.js"), "utf8");
  const stil = html.match(/<style>([\s\S]*?)<\/style>/);
  const main = html.match(/<main[\s\S]*?<\/main>/);
  const skripte = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!stil || !main || skripte.length !== 1 || !/<script src="angriff-core\.js"><\/script>/.test(html))
    throw new Error("angriff.html hat nicht den erwarteten Aufbau (ein <style>, ein <main>, angriff-core.js und ein eigenes <script>)");
  return {v: 1, style: stil[1], html: main[0], skripte: [kern, skripte[0]]};
}

const schluessel = (pw, salz, iter) => crypto.pbkdf2Sync(Buffer.from(pw, "utf8"), salz, iter, 32, "sha256");
/** AES-256-GCM wie WebCrypto: Chiffrat mit angehängtem 16-Byte-Tag. */
function verschluesseln(key, text) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(Buffer.from(text, "utf8")), c.final(), c.getAuthTag()]);
  return {iv: iv.toString("base64"), ct: ct.toString("base64")};
}
function entschluesseln(key, teil) {
  const buf = Buffer.from(teil.ct, "base64"), d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(teil.iv, "base64"));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString("utf8");
}
/** Baut den Inhalt von zusatz.json. alt: bisherige Datei (Salz und Runden bleiben, wenn das Passwort passt). */
function bauen(pw, last, alt, neu) {
  let salz, iter = ITER;
  if (alt && !neu) {
    salz = Buffer.from(alt.salt, "base64"); iter = alt.iter;
    let ok = false;
    try { ok = entschluesseln(schluessel(pw, salz, iter), alt.pruef) === PRUEF; } catch (e) { ok = false; }
    if (!ok) throw new Error("Passwort passt nicht zum bisherigen site/zusatz.json. Tippfehler? Für ein neues Passwort mit --neu aufrufen.");
  } else salz = crypto.randomBytes(16);
  const key = schluessel(pw, salz, iter);
  return {v: 1, salt: salz.toString("base64"), iter, pruef: verschluesseln(key, PRUEF),
          seiten: {angriff: verschluesseln(key, JSON.stringify(last))}, stand: new Date().toISOString()};
}

function verdeckt(frage) {
  return new Promise((ok, fehl) => {
    // Git Bash (mintty) ist für Node kein Terminal, die Eingabe wäre sichtbar: dann lieber abbrechen
    if (!process.stdin.isTTY) { fehl(new Error("Kein Terminal für die verdeckte Eingabe. In PowerShell oder cmd ausführen, in Git Bash mit „winpty node tools/zusatz_verschluesseln.js“.")); return; }
    const rl = require("readline").createInterface({input: process.stdin, output: process.stdout, terminal: true});
    rl._writeToOutput = s => { if (s.includes(frage)) process.stdout.write(s); };
    rl.question(frage, a => { rl.close(); process.stdout.write("\n"); ok(a); });
    rl.on("SIGINT", () => { rl.close(); fehl(new Error("abgebrochen")); });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const neu = args.includes("--neu");
  const qi = args.indexOf("--quelle");
  const repo = path.resolve(__dirname, "..");
  const quelle = path.resolve(qi >= 0 ? args[qi + 1] : path.join(repo, "..", "privat", "angriffsplaner"));
  const ziel = path.join(repo, "site", "zusatz.json");
  const last = nutzlast(quelle);
  const alt = fs.existsSync(ziel) && !neu ? JSON.parse(fs.readFileSync(ziel, "utf8")) : null;
  let pw = process.env.K259_ZUSATZ_PW;
  if (!pw) {
    pw = await verdeckt("Passwort für die Zusatzfunktionen: ");
    if (!alt && pw !== await verdeckt("Noch einmal: ")) throw new Error("Die beiden Eingaben sind verschieden.");
  }
  if (!pw || pw.length < 6) throw new Error("Passwort fehlt oder ist kürzer als 6 Zeichen.");
  const z = bauen(pw, last, alt, neu || !alt);
  fs.writeFileSync(ziel, JSON.stringify(z) + "\n");
  console.log("site/zusatz.json geschrieben:", Math.round(fs.statSync(ziel).size / 1024) + " KB, Quelle " + quelle +
              (alt ? ", bisheriges Passwort" : ", neues Passwort (alle Browser neu freischalten)"));
}

module.exports = {nutzlast, bauen, schluessel, entschluesseln, verschluesseln, ITER, PRUEF};
if (require.main === module) main().catch(e => { console.error("Fehler:", e.message); process.exit(1); });
