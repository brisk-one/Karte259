// Tests der Zusatzfunktionen: Verschlüsselung und öffentliche Teile, ohne das echte Passwort (Dennis 4a, 03.11.2026)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), os = require("os"), path = require("path");
const Z = require("../tools/zusatz_verschluesseln.js");

function quelle() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "zusatz-"));
  fs.mkdirSync(path.join(d, "site"));
  fs.writeFileSync(path.join(d, "site", "angriff.html"), "<html><head><style>.x{color:red}</style></head><body><main class=\"wrap\"><p>Plan</p></main>" +
    "<script src=\"app.js\"></script><script src=\"angriff-core.js\"></script><script>window.SEITE = 1;</script></body></html>");
  fs.writeFileSync(path.join(d, "site", "angriff-core.js"), "window.KERN = 1;");
  return d;
}

test("Verschlüsseln und mit WebCrypto wie im Browser entschlüsseln", async () => {
  const last = Z.nutzlast(quelle());
  assert.deepEqual(last.skripte, ["window.KERN = 1;", "window.SEITE = 1;"]);
  assert.equal(last.html, "<main class=\"wrap\"><p>Plan</p></main>");
  const z = Z.bauen("Testpasswort", last, null, true);
  assert.equal(z.iter, Z.ITER);
  const {subtle} = require("crypto").webcrypto;
  const b = s => Buffer.from(s, "base64");
  const basis = await subtle.importKey("raw", Buffer.from("Testpasswort"), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({name: "PBKDF2", hash: "SHA-256", salt: b(z.salt), iterations: z.iter}, basis, 256);
  const key = await subtle.importKey("raw", bits, "AES-GCM", false, ["decrypt"]);
  const text = Buffer.from(await subtle.decrypt({name: "AES-GCM", iv: b(z.seiten.angriff.iv)}, key, b(z.seiten.angriff.ct))).toString("utf8");
  assert.deepEqual(JSON.parse(text), last);
  const pruef = Buffer.from(await subtle.decrypt({name: "AES-GCM", iv: b(z.pruef.iv)}, key, b(z.pruef.ct))).toString("utf8");
  assert.equal(pruef, Z.PRUEF);
});

test("Falsches Passwort wird abgelehnt, das richtige behält das Salz", () => {
  const last = Z.nutzlast(quelle());
  const alt = Z.bauen("Testpasswort", last, null, true);
  assert.throws(() => Z.bauen("Tippfehler", last, alt, false), /passt nicht/);
  const neu = Z.bauen("Testpasswort", last, alt, false);
  assert.equal(neu.salt, alt.salt);
  assert.notEqual(neu.seiten.angriff.iv, alt.seiten.angriff.iv);
});

test("Öffentliche Teile enthalten keinen Planer im Klartext", () => {
  const site = path.join(__dirname, "..", "site");
  assert.ok(!fs.existsSync(path.join(site, "angriff-core.js")), "Rechenkern nicht im Repo");
  const lader = fs.readFileSync(path.join(site, "angriff.html"), "utf8");
  assert.ok(lader.length < 6000 && !/parseOverview|zeitenPlanen|Truppenübersicht/.test(lader));
  const zf = path.join(site, "zusatz.json");
  if (fs.existsSync(zf)) {
    const z = JSON.parse(fs.readFileSync(zf, "utf8"));
    assert.ok(z.salt && z.iter >= 100000 && z.pruef && z.seiten && z.seiten.angriff);
    assert.ok(!/Angriffsplaner|function |zeitenPlanen/.test(JSON.stringify(z.seiten)), "nur Chiffrat");
  }
});
