/* Rechnet den Prägerechner im Hintergrund, damit die Seite bei großen Konten bedienbar bleibt (Dennis 4a,
   29.10.2026). Die Seite schickt die Adresse des Rechenkerns mit Versionskennung mit, damit der Worker nicht eine
   ältere Fassung aus dem Zwischenspeicher lädt. Nachricht: {core, token, villages, P, passive, k?, perK?}, Antwort: {token, R}
   oder {token, error}. */
"use strict";
let loaded = null, loadedU = null, loadedS = null;
self.onmessage = e => {
  const m = e.data;
  try {
    if (loaded !== m.core) { importScripts(m.core); loaded = m.core; }
    // Lieferung über Zwischendörfer (inaktiv bis Supportfreigabe, 11.11.2026): {umwege: Adresse von praegen-umwege.js,
    // src, P, sites, cnt, opt}, Antwort mit Fortschritt je Klick und {token, umwegeErgebnis}
    if (m.umwege) {
      if (loadedU !== m.umwege) { importScripts(m.umwege); loadedU = m.umwege; }
      let zuletzt = 0;
      const melde = (i, n) => { const t = Date.now(); if (i === n || t - zuletzt > 150) { zuletzt = t; self.postMessage({token: m.token, fortschritt: [i, n]}); } };
      self.postMessage({token: m.token, umwegeErgebnis: self.PraegenUmwege.vergleich(m.src, m.P, m.sites, m.cnt, m.opt, melde)});
      return;
    }
    // Sitzungsanzahlplanung (11.11.2026): {sitzungen: Adresse von praegen-sitzungen.js, eingabe}, Antwort mit
    // Fortschritt je Strategie und {token, sitzErgebnis}
    if (m.sitzungen) {
      if (loadedS !== m.sitzungen) { importScripts(m.sitzungen); loadedS = m.sitzungen; }
      const melde = (i, n) => self.postMessage({token: m.token, fortschritt: [i, n]});
      self.postMessage({token: m.token, sitzErgebnis: self.PraegenSitzungen.plane(m.eingabe, melde)});
      return;
    }
    // 10.17: Suche nach dem nächsten Prägedorf unter fremden Dörfern, mit Fortschrittsmeldungen
    if (m.fremd) {
      const opt = Object.assign({}, m.opt, {fortschritt: (i, n) => self.postMessage({token: m.token, fortschritt: [i, n]})});
      self.postMessage({token: m.token, fremd: self.Praegen.fremdeSuche(m.villages, m.P, m.passive, m.welt, opt)});
      return;
    }
    // „Rohstoffprozentpunkte vorgeben“ einfach wie bis v0.4 plus Zeitplan (10.11), „maximieren“ wie v0.5
    // m.k: nur eine gewählte Aufstellung nachrechnen (10.12)
    const R = m.k ? self.Praegen.packagesForK(m.villages, m.P, m.k, m.passive, m.perK)
      : m.P.mode === "pct" ? self.Praegen.planPct(m.villages, m.P, m.passive) : self.Praegen.planPackages(m.villages, m.P, m.passive);
    if (R && R.src) delete R.src._ls;                     // Zwischenspeicher des Rechenkerns, wird nicht übertragen
    self.postMessage({token: m.token, R});
  } catch (err) {
    self.postMessage({token: m.token, error: String(err && err.stack || err)});
  }
};
