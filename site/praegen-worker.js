/* Rechnet den Prägerechner im Hintergrund, damit die Seite bei großen Konten bedienbar bleibt (Dennis 4a,
   29.10.2026). Die Seite schickt die Adresse des Rechenkerns mit Versionskennung mit, damit der Worker nicht eine
   ältere Fassung aus dem Zwischenspeicher lädt. Nachricht: {core, token, villages, P, passive}, Antwort: {token, R}
   oder {token, error}. */
"use strict";
let loaded = null;
self.onmessage = e => {
  const m = e.data;
  try {
    if (loaded !== m.core) { importScripts(m.core); loaded = m.core; }
    // „Rohstoffprozentpunkte vorgeben“ einfach wie bis v0.4 plus Zeitplan (10.11), „maximieren“ wie v0.5
    const R = m.P.mode === "pct" ? self.Praegen.planPct(m.villages, m.P, m.passive) : self.Praegen.planPackages(m.villages, m.P, m.passive);
    if (R.src) delete R.src._ls;                     // Zwischenspeicher des Rechenkerns, wird nicht übertragen
    self.postMessage({token: m.token, R});
  } catch (err) {
    self.postMessage({token: m.token, error: String(err && err.stack || err)});
  }
};
