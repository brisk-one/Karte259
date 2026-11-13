// Tests der Zusatzfunktionen: einfache Passwortsperre im Browser, ohne das echte Passwort.
// Seit 10.11.2026 (Dennis) liegt der Planer lesbar im Repo; zusatz.json enthält nur noch den Prüfwert.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const Z = require("../tools/zusatz_passwort.js");
const SITE = path.join(__dirname, "..", "site");

/** Schlüssel ableiten und Prüfwert lesen wie zusatzFreischalten() in app.js (WebCrypto). */
async function wieImBrowser(pw, z) {
  const {subtle} = require("crypto").webcrypto;
  const b = s => Buffer.from(s, "base64");
  const basis = await subtle.importKey("raw", Buffer.from(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({name: "PBKDF2", hash: "SHA-256", salt: b(z.salt), iterations: z.iter}, basis, 256);
  const key = await subtle.importKey("raw", bits, "AES-GCM", false, ["decrypt"]);
  try { return Buffer.from(await subtle.decrypt({name: "AES-GCM", iv: b(z.pruef.iv)}, key, b(z.pruef.ct))).toString("utf8"); }
  catch (e) { return null; }
}

test("Neues Passwort: der Browser erkennt das richtige und lehnt ein falsches ab", async () => {
  const z = Z.bauen("Testpasswort", 1000);
  assert.deepEqual(Object.keys(z).sort(), ["iter", "pruef", "salt", "v"]);
  assert.equal(await wieImBrowser("Testpasswort", z), Z.PRUEF);
  assert.equal(await wieImBrowser("Tippfehler", z), null);
  assert.notEqual(Z.bauen("Testpasswort", 1000).salt, z.salt, "jedes Mal neues Salz");
});

test("zusatz.json: nur Prüfwert, kein Chiffrat der Seite mehr", () => {
  const z = JSON.parse(fs.readFileSync(path.join(SITE, "zusatz.json"), "utf8"));
  assert.ok(z.salt && z.iter >= 100000 && z.pruef && z.pruef.iv && z.pruef.ct);
  assert.equal(z.seiten, undefined);
  assert.ok(fs.readFileSync(path.join(SITE, "app.js"), "utf8").includes('ZUSATZ_PRUEF = "' + Z.PRUEF + '"'));
});

test("angriff.html: Planer gesperrt, Skripte erst nach dem Freischalten", () => {
  const h = fs.readFileSync(path.join(SITE, "angriff.html"), "utf8");
  assert.match(h, /id="zusatz-sperre"/);
  assert.match(h, /<main class="wrap" id="planer" hidden>/);
  assert.ok(!/<script src="angriff-(core|seite)\.js">/.test(h), "kein direktes Laden vor der Prüfung");
  assert.match(h, /\["angriff-core\.js", "angriff-seite\.js"\]/);
  assert.match(h, /zusatzEntschluesseln\(z\.k, d\.pruef\) === ZUSATZ_PRUEF/);
  for (const f of ["angriff-core.js", "angriff-seite.js"]) assert.ok(fs.existsSync(path.join(SITE, f)), f);
});

test("aufstocken.html: Reiter „Fakes aufstocken“ gesperrt wie der Planer, Skripte erst nach dem Freischalten", () => {
  const h = fs.readFileSync(path.join(SITE, "aufstocken.html"), "utf8");
  assert.match(h, /id="zusatz-sperre"/);
  assert.match(h, /<main class="wrap" id="seite" hidden>/);
  assert.ok(!/<script src="(angriff-core|aufstocken-seite)\.js">/.test(h), "kein direktes Laden vor der Prüfung");
  assert.match(h, /\["angriff-core\.js", "aufstocken-seite\.js"\]/);
  assert.match(h, /zusatzEntschluesseln\(z\.k, d\.pruef\) === ZUSATZ_PRUEF/);
  assert.ok(fs.existsSync(path.join(SITE, "aufstocken-seite.js")));
  assert.match(fs.readFileSync(path.join(SITE, "app.js"), "utf8"), /\["aufstocken\.html", "Fakes aufstocken", "aufstocken", true\]/);
});
