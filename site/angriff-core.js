/* Rechenkern des Angriffsplaners: Truppenübersicht lesen, Clean-Offs, AG-Trains und Fakes auf Ziele verteilen,
   Ankunfts- und Abschickzeiten planen und den Plan im JSON-Format von DS-Ultimate ausgeben.
   Ohne DOM, läuft im Browser (window.Angriff) und in Node (module.exports), damit er testbar bleibt.

   Spielwerte Welt 259 (geprüft 02.11.2026), Vorgabe, falls angriff.json fehlt:
   - Fakelimit 1 % der Dorfpunkte des abschickenden Dorfs (game.fake_limit).
   - AG-Reichweite 35 Felder (snob.max_dist).
   - Befehlsabstand 200 ms zwischen Angriffen aus demselben Dorf (commands.attack_gap). Gereihte Angriffe eines
     AG-Trains verlassen das Dorf im 200-ms-Abstand, Angriffe aus verschiedenen Dörfern dürfen enger einschlagen.
   - Zustimmung sinkt je AG um 20 bis 35 (mood.loss_min, mood.loss_max).
   - Laufzeit wie DS-Ultimate: round(Minuten je Feld × 60 × Entfernung) Sekunden.
   Begriffe und Regeln: Spezifikation Angriffsplaner (Clean-Off, AG-Train, Train-Form, Train mit Off).
*/
(function (root) {
"use strict";

/* ---------- Spielwerte ---------- */
// Reihenfolge wie in DS-Ultimate (slowest_unit ist der Index in dieser Liste) und in der Truppenübersicht
const UNITS = ["spear", "sword", "axe", "archer", "spy", "light", "marcher", "heavy", "ram", "catapult", "knight", "snob"];
const OVERVIEW_COLUMNS = UNITS.concat(["militia"]);
const POP = {spear: 1, sword: 1, axe: 1, archer: 1, spy: 2, light: 4, marcher: 5, heavy: 6, ram: 5, catapult: 8,
             knight: 10, snob: 100, militia: 0};
const SPEED = {spear: 18, sword: 22, axe: 18, archer: 18, spy: 9, light: 10, marcher: 10, heavy: 11, ram: 30,
               catapult: 30, knight: 10, snob: 35};
const DSU_TYPE = {clean: 8, rest: 8, ag: 11, fake: 14};
const KIND_NAME = {clean: "Clean-Off", rest: "Off", ag: "AG", fake: "Fake"};
// Einheiten einer Off; Schwere Kavallerie nur in Dörfern mit überwiegend Off-Einheiten
const OFF_UNITS = ["axe", "light", "marcher", "heavy", "ram", "catapult"];
// Begleitschutz eines AG: Äxte, ohne Äxte Schwert, dann Speer, dann der Rest
const ESCORT_ORDER = ["axe", "sword", "spear", "archer", "light", "marcher", "heavy"];

const WORLD_DEFAULT = {
  pop: POP, speed: SPEED, fake_limit: 1, snob_max_dist: 35, attack_gap_ms: 200, loss_min: 20, loss_max: 35,
  night: {active: true, start_hour: 23, end_hour: 8}, moral: 3,
};

const CFG_DEFAULT = {
  ags_per_target: 4,          // 4 oder 5
  train_form: "ganz",         // "ganz" (alle AGs eines Ziels aus einem Dorf), "zwei" (2er-Trains), "einzeln"
  split_full: false,          // ganzer Train mit Off: Off gleichmäßig auf alle AGs statt komplett beim ersten
  split_two: true,            // 2er-Train mit Off: Hälfte und Hälfte
  min_send_gap_s: 3,          // Mindestabstand zwischen Abschickvorgängen je Angreifer
  off_min_pop: 16250,         // Off-Richtwert in BH (5.000 Axt, 2.500 LKav, 250 Rammen)
  off_min_rams: 250,
  growth_pop_per_day: 1200,   // Zuwachs bis zum Abschicken, Vorauswahl knapper Offs
  growth_rams_per_day: 20,
  clean_per_target: 2,        // Richtwert Clean-Offs je AG-Ziel, mindestens 1 ist Pflicht
  clean_knapp: "weniger_offs",// zu wenige Offs: "weniger_offs" (alle Ziele, manche unter dem Richtwert) oder "weniger_ziele"
  rest_offs: "frei",          // "frei" oder "nicht_ag" (echte Angriffe auf Nicht-AG-Dörfer der Zielspieler)
  gap_off_ag_ms: 200,         // letzte Clean-Off zum ersten AG
  gap_clean_ms: 200,          // zwischen Clean-Offs
  gap_ag_ms: 200,             // zwischen AGs aus verschiedenen Dörfern
  off_first: true,            // Clean-Off vor den AGs abschicken
  off_first_lead_s: 120,      // Abschick-Vorlauf der Clean-Off vor dem ersten AG
  spies_per_off: 10,
  escort_pop: 100,            // Begleitschutz je AG in BH
  fakes_per_village: 2,        // Zahl der Fakes je Zieldorf oder je Herkunftsdorf (fake_modus)
  fake_modus: "ziel",         // "ziel": je Fakeziel (wie bisher), "herkunft": je eigenem Dorf (Dennis 09.11.2026)
  fake_extra_pop: 5,          // Zuschlag auf das Fakelimit, Dorfpunkte steigen bis zum Abschicken
  fake_vorlauf_h: 0,          // erste Fakes etwa so viele Stunden vor dem ersten Off/AG des Plans (Richtwert, 0: aus; Dennis 11.11.2026)
  max_lauf_off_h: 0,          // Laufzeit Clean-Offs und übrige Offs höchstens (Richtwert, 0: keine Grenze; Dennis 11.11.2026)
  max_lauf_ag_h: 0,           // Laufzeit AG-Trains höchstens, auch die Off im Train (Richtwert, 0: keine Grenze)
  extra_fakes: false,         // zusätzliche Fakeziele aus dem Stamm der Zielspieler
  extra_fakes_per_village: 1, // Fakes je Zieldorf für diese Stammesmitglieder, nachrangig zu den Pflicht- und weiteren Fakezielen (Dennis 10.11.2026)
  fakes_max_je_dorf: 4,       // höchstens so viele Fakes aus einem eigenen Dorf (Dennis 10.11.2026 00:52)
  fake_verteilung: "reihum",  // "reihum": erst jedes Fakeziel einen Fake, dann bis zur vollen Zahl; "haupt": Pflichtziele zuerst voll (bis 10.11.)
  moral_threshold: 1.0,
  send_gap_target_s: 10,      // Mindestabstandtendenz: Richtwert zwischen Abschickvorgängen einer Sitzung (Dennis 21:04)
  zeit_rangfolge: "standard", // Abwägung (Dennis 21:26, Auswahl in der Konfig): "standard", "sitzungen", "nachtruhe"
  zeitraeume: "wunsch",       // "wunsch": notfalls außerhalb, markiert (Dennis 2a, 21:26); "streng": nur innerhalb (bis v0.4)
  seed: 1,
};

/* ---------- Abschicksitzungen (v0.5, Spezifikation 15) ---------- */
const SITZUNG_PAUSE_MS = 15 * 60000;       // längere Pause: neue Abschicksitzung
const FAKE_RAND_MS = 10 * 60000;           // Fakes höchstens so weit vor oder nach einer Sitzung
const FAIR_S = 43200;                       // Fairness: zwölf Stunden Rammenlaufzeit (24 Felder) je Fake pro eigenem Dorf, den ein Angreifer schon hat
const PAAR_S = 3600;                        // Streuung der Fakeziele je Angreifer: zwei Felder Rammenlaufzeit je Fake auf denselben Zielspieler
const VORLAUF_TOL_MS = 60 * 60000;          // Fake-Vorlauf: frühe Sitzung höchstens so weit vom Richtwert entfernt
const FRUEH_ANTEIL = 0.25;                  // Fake-Vorlauf: etwa so viele der Fakes eines Angreifers in die frühe Sitzung
const FRUEH_BONUS_S = 72000;                // dafür bei der Wahl ein Vorteil von 20 h Rammenlaufzeit (weite Dörfer laufen früh)
const ZU_LANG = 150000;                     // Laufzeit über dem Richtwert: unter „innerhalb der Abschickzeiträume“, über „Off vor AG“
const FAKE_SITZUNG_MS = 30 * 60000;        // reine Fake-Spieler: eine Sitzung von höchstens 2 × 30 min
const ANKER_RAND_MS = 30 * 60000;          // Zuteilung: so weit vom Ankerzeitpunkt kostet nichts
const ANKUNFT_MAX_MS = 90 * 60000;         // Orientierungswert 1,5 h, Hinweis ab 1 h; seit 10.11.2026 keine feste Grenze (Dennis: für Fakes sinnvoll)
const ANKUNFT_RAT_MS = 60 * 60000;
/* Gewichte je Rangfolge. Zeitplanung in Minuten-Äquivalenten, Zuteilung in Sekunden wie die Laufzeiten.
   standard:  Ziele, innerhalb der Zeiträume, Clean-Off-Richtwert, Off vor AG, Sitzungen, Laufzeiten, Fakes
   sitzungen: Sitzungen vor Clean-Off-Richtwert und Off vor AG
   nachtruhe: wie standard, aber nachts außerhalb der Zeiträume nur, wenn es nicht anders geht, sonst fällt das Ziel weg */
const RANGFOLGE = {
  standard:  {aus: 1000, ausMin: 1, nacht: 3,  sitzung: 60,  minute: 1, eng: 0.5, ausFlow: 300000, ausFlowMin: 200, anker: 600,  kopplungMax: 50000,    nachtSperre: false, fuellNurAnker: false},
  sitzungen: {aus: 1000, ausMin: 1, nacht: 3,  sitzung: 240, minute: 3, eng: 0.5, ausFlow: 300000, ausFlowMin: 200, anker: 4000, kopplungMax: Infinity, nachtSperre: false, fuellNurAnker: true},
  nachtruhe: {aus: 1000, ausMin: 1, nacht: 20, sitzung: 60,  minute: 1, eng: 0.5, ausFlow: 300000, ausFlowMin: 200, anker: 600,  kopplungMax: 50000,    nachtSperre: true,  fuellNurAnker: false},
};
// Außerhalb zählt vor allem, dass es außerhalb ist; die Minuten wenig, sonst zöge jeder Befehl einzeln an den Rand des
// Zeitraums und es entstünden viele kleine Sitzungen. kopplungMax: Bündeln bleibt unter „Off vor AG“ (100.000).
const HART = 1e7;
const SPIELER_FREMD = 6000;                 // Clean-Off nicht vom Spieler des Trains: so viel wie rund 3,3 Felder Rammentempo                          // Mindestabstand unterschritten

/* ---------- Kleinigkeiten ---------- */
const emptyUnits = () => Object.fromEntries(UNITS.map(u => [u, 0]));
const popOf = (units, pop) => UNITS.reduce((s, u) => s + (units[u] || 0) * (pop || POP)[u], 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const travelS = (world, unit, d) => Math.round(world.speed[unit] * 60 * d);   // Formel von DS-Ultimate

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Welt aus units.json und angriff.json, fehlende Werte aus WORLD_DEFAULT. */
function makeWorld(unitsJson, angriffJson) {
  const w = JSON.parse(JSON.stringify(WORLD_DEFAULT));
  (unitsJson && unitsJson.units || []).forEach(u => {
    if (u.min_per_field > 0) w.speed[u.id] = u.min_per_field;
    if (u.pop != null) w.pop[u.id] = u.pop;
  });
  if (unitsJson && unitsJson.night) {
    const n = unitsJson.night;
    w.night = {active: !!n.active, start_hour: n.start_hour, end_hour: n.end_hour};
  }
  const a = angriffJson || {};
  ["fake_limit", "snob_max_dist", "attack_gap_ms", "loss_min", "loss_max", "moral"].forEach(k => {
    if (a[k] != null && !isNaN(+a[k])) w[k] = +a[k];
  });
  return w;
}

/** Wahrscheinlichkeit, dass n AGs aus 100 Zustimmung adeln (Verlust je AG gleichverteilt, ganze Zahlen). */
function erfolgsChance(n, lossMin, lossMax) {
  lossMin = lossMin == null ? 20 : lossMin; lossMax = lossMax == null ? 35 : lossMax;
  let d = new Map([[0, 1]]);
  const span = lossMax - lossMin + 1;
  for (let k = 0; k < n; k++) {
    const nd = new Map();
    d.forEach((p, s) => { for (let l = lossMin; l <= lossMax; l++) nd.set(s + l, (nd.get(s + l) || 0) + p / span); });
    d = nd;
  }
  let ok = 0;
  d.forEach((p, s) => { if (s >= 100) ok += p; });
  return ok;
}

/** Moral wie auf der Moral-Seite (Typ 0 keine, 1 Punkte, 2 Punkte und Zeit bis 125 Tage, 3 unbegrenzte Zeit). */
function moral(type, att, def, days) {
  if (type === 0) return 1;
  const ratio = att > 0 ? def / att : Infinity;
  const share = Math.min(3 * ratio, 10);
  if (type === 1) return Math.min(1, 0.3 + share);
  const d = Math.max(0, days || 0);
  return Math.min(1, 0.25 + share + (type === 2 ? Math.min(d, 125) : d) / 500);
}

/* ---------- Zeit in Serverzeit (Europe/Berlin) ---------- */
let tzFmt = null;
function berlinParts(ms) {
  if (!tzFmt) tzFmt = new Intl.DateTimeFormat("en-US", {timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"});
  const p = {};
  tzFmt.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  return {y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, ms: ((ms % 1000) + 1000) % 1000};
}
function berlinOffset(ms) {
  const p = berlinParts(ms);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - (ms - p.ms);
}
/** Ortszeit Berlin in Unix-Millisekunden. */
function berlinToUtc(y, mo, d, h, mi, s, ms) {
  const guess = Date.UTC(y, mo - 1, d, h || 0, mi || 0, s || 0, ms || 0);
  let utc = guess - berlinOffset(guess);
  const off2 = berlinOffset(utc);
  if (guess - off2 !== utc) utc = guess - off2;
  return utc;
}
const pad = (n, l) => String(n).padStart(l || 2, "0");
/** „03.11.2026 08:00:10:200“; ohne Millisekunden „03.11.2026 08:00:10“. */
function fmtZeit(ms, mitMs) {
  const p = berlinParts(ms);
  return pad(p.d) + "." + pad(p.mo) + "." + p.y + " " + pad(p.h) + ":" + pad(p.mi) + ":" + pad(p.s) + (mitMs ? ":" + pad(p.ms, 3) : "");
}
const ZEIT = /(?:(\d{1,2})\.(\d{1,2})\.(\d{4})\s+)?(\d{1,2}):(\d{2})(?::(\d{2})(?:[:.,](\d{1,3}))?)?/g;
/** Liest Zeitangaben aus einem Text. Ohne Datum gilt das Datum der vorherigen Angabe. */
function zeitenAus(text) {
  const out = [];
  let datum = null, m;
  ZEIT.lastIndex = 0;
  while ((m = ZEIT.exec(String(text || ""))) !== null) {
    if (m[3]) datum = [+m[3], +m[2], +m[1]];
    if (!datum) return {fehler: "Datum fehlt: " + m[0]};
    const ms = m[7] ? +(m[7] + "00").slice(0, 3) : 0;
    out.push({ms: berlinToUtc(datum[0], datum[1], datum[2], +m[4], +m[5], m[6] ? +m[6] : 0, ms), mitDatum: !!m[3]});
  }
  return {zeiten: out};
}
/** Ankunft: Zeitpunkt oder Zeitraum, z. B. „03.11.2026 08:00:00:000 bis 09:00:00:000“. */
function parseAnkunft(text) {
  const r = zeitenAus(text);
  if (r.fehler) return {fehler: r.fehler};
  const z = r.zeiten;
  if (!z.length) return {fehler: "Keine Ankunftszeit erkannt"};
  if (z.length > 2) return {fehler: "Höchstens zwei Zeiten (von, bis)"};
  let from = z[0].ms, to = z.length === 2 ? z[1].ms : z[0].ms;
  if (to < from && z.length === 2 && !z[1].mitDatum) to += 86400000;     // über Mitternacht
  if (to < from) return {fehler: "Ende liegt vor dem Anfang"};
  return {from, to};
}
/** Abschickzeiträume, je Zeile oder durch „;“ getrennt, z. B. „02.11.2026 16:00 bis 20:00“. */
function parseFenster(text) {
  const out = [], fehler = [];
  String(text || "").split(/[\n;]+/).map(s => s.trim()).filter(Boolean).forEach(zeile => {
    const r = zeitenAus(zeile);
    if (r.fehler || r.zeiten.length !== 2) { fehler.push("Zeitraum nicht erkannt: " + zeile); return; }
    let [a, b] = r.zeiten;
    let from = a.ms, to = b.ms;
    if (to < from && !b.mitDatum) to += 86400000;
    if (to < from) { fehler.push("Ende vor Anfang: " + zeile); return; }
    out.push([from, to]);
  });
  return {fenster: ivNorm(out), fehler};
}
/** Kalendertag aus „03.11.2026“, auch „3.11.26“; null, wenn es den Tag nicht gibt. */
function parseDatum(text) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})$/.exec(String(text || "").trim());
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? {y, mo, d} : null;
}
/** Uhrzeit aus „8“, „08:00“, „08:00:10“ oder „08:00:10:200“; null, wenn sie ungültig ist. */
function parseUhrzeit(text) {
  const m = /^(\d{1,2})(?::(\d{2})(?::(\d{2})(?:[:.,](\d{1,3}))?)?)?$/.exec(String(text || "").trim());
  if (!m) return null;
  const h = +m[1], mi = +(m[2] || 0), s = +(m[3] || 0), ms = m[4] ? +(m[4] + "00").slice(0, 3) : 0;
  return h < 24 && mi < 60 && s < 60 ? {h, mi, s, ms} : null;
}
const fmtDatum = t => pad(t.d) + "." + pad(t.mo) + "." + t.y;
/** Mit Millisekunden immer vollständig, sonst nur so lang wie nötig. */
function fmtUhrzeit(t, mitMs) {
  const kurz = pad(t.h) + ":" + pad(t.mi);
  if (mitMs) return kurz + ":" + pad(t.s) + ":" + pad(t.ms, 3);
  return t.s || t.ms ? kurz + ":" + pad(t.s) + (t.ms ? ":" + pad(t.ms, 3) : "") : kurz;
}
/**
 * Zeitraum aus getrennten Feldern {vonDatum, vonZeit, bisDatum, bisZeit}.
 * Ende ohne Tag: gleicher Tag wie der Start, liegt die Uhrzeit davor, der nächste. Ganz leeres Ende: mit
 * punktErlaubt ein fester Zeitpunkt, sonst ein Fehler. Ergebnis {leer}, {fehler} oder {from, to}.
 */
function zeitraumAusFeldern(f, punktErlaubt) {
  const w = k => String((f && f[k]) || "").trim();
  const vd = w("vonDatum"), vz = w("vonZeit"), bd = w("bisDatum"), bz = w("bisZeit");
  if (!vd && !vz && !bd && !bz) return {leer: true};
  if (!vd) return {fehler: "Starttag fehlt"};
  if (!vz) return {fehler: "Startzeit fehlt"};
  const tag = parseDatum(vd), zeit = parseUhrzeit(vz);
  if (!tag) return {fehler: "Tag nicht erkannt: " + vd};
  if (!zeit) return {fehler: "Uhrzeit nicht erkannt: " + vz};
  const from = berlinToUtc(tag.y, tag.mo, tag.d, zeit.h, zeit.mi, zeit.s, zeit.ms);
  if (!bd && !bz) return punktErlaubt ? {from, to: from} : {fehler: "Ende fehlt"};
  if (!bz) return {fehler: "Endzeit fehlt"};
  const bisTag = bd ? parseDatum(bd) : tag, bisZeit = parseUhrzeit(bz);
  if (!bisTag) return {fehler: "Tag nicht erkannt: " + bd};
  if (!bisZeit) return {fehler: "Uhrzeit nicht erkannt: " + bz};
  let to = berlinToUtc(bisTag.y, bisTag.mo, bisTag.d, bisZeit.h, bisZeit.mi, bisZeit.s, bisZeit.ms);
  if (to < from && !bd) to = berlinToUtc(bisTag.y, bisTag.mo, bisTag.d + 1, bisZeit.h, bisZeit.mi, bisZeit.s, bisZeit.ms);   // über Mitternacht
  if (to < from) return {fehler: "Ende liegt vor dem Anfang"};
  return {from, to};
}
/** Abschickzeiträume aus Feldzeilen; ganz leere Zeilen zählen nicht. */
function fensterAusZeilen(zeilen) {
  const out = [], fehler = [];
  (zeilen || []).forEach((z, i) => {
    const r = zeitraumAusFeldern(z, false);
    if (r.fehler) fehler.push("Zeitraum " + (i + 1) + ": " + r.fehler);
    else if (!r.leer) out.push([r.from, r.to]);
  });
  return {fenster: ivNorm(out), fehler};
}
const nachtCache = new Map();
function istNacht(world, ms) {
  if (!world.night || !world.night.active) return false;
  // Berlin weicht in ganzen Stunden von UTC ab, innerhalb einer UTC-Stunde ändert sich nichts
  const key = Math.floor(ms / 3600000) + ":" + world.night.start_hour + ":" + world.night.end_hour;
  let r = nachtCache.get(key);
  if (r == null) {
    const h = berlinParts(ms).h, s = world.night.start_hour, e = world.night.end_hour;
    r = s > e ? (h >= s || h < e) : (h >= s && h < e);
    if (nachtCache.size > 5000) nachtCache.clear();
    nachtCache.set(key, r);
  }
  return r;
}
/** Abstand in ms zwischen einem Zeitpunkt oder Intervall und einer Intervallliste (0: berührt; leere Liste: 0). */
function ivAbstand(liste, iv) {
  if (!liste || !liste.length) return 0;
  const [a, b] = Array.isArray(iv) ? iv : [iv, iv];
  let best = Infinity;
  for (const [l, u] of liste) {
    if (a <= u && b >= l) return 0;
    best = Math.min(best, b < l ? l - b : a - u);
  }
  return best;
}

/* ---------- Intervalle in ms, geschlossen und sortiert ---------- */
function ivNorm(list) {
  const a = list.filter(x => x && x[0] <= x[1]).map(x => [x[0], x[1]]).sort((p, q) => p[0] - q[0]);
  const out = [];
  a.forEach(x => {
    const l = out[out.length - 1];
    if (l && x[0] <= l[1] + 1) l[1] = Math.max(l[1], x[1]); else out.push(x);
  });
  return out;
}
function ivIntersect(a, b) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
    if (lo <= hi) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return out;
}
const ivShift = (a, d) => a.map(x => [x[0] + d, x[1] + d]);
function ivHas(a, t) {
  let lo = 0, hi = a.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (t < a[m][0]) hi = m - 1; else if (t > a[m][1]) lo = m + 1; else return true;
  }
  return false;
}

/* ---------- Truppenübersicht ---------- */
const KOORD = /\((\d{1,3})\|(\d{1,3})\)\s*K(\d{1,2})/;
const NUM = /^(\d{1,3}(?:\.\d{3})+|\d+)$/;
const ANDERE_ZEILEN = ["im", "auswärts", "unterwegs", "insgesamt", "verteidigung", "unterstützungen"];

/** Zahlen und Bezeichnung hinter der Koordinate einer Dorfzeile. */
function zeilenZahlen(rest) {
  const tok = rest.split(/\s+/).filter(Boolean);
  let label = "";
  const nums = [];
  tok.forEach(t => {
    if (NUM.test(t)) nums.push(+t.replace(/\./g, ""));
    else if (!nums.length && !label) label = t.toLowerCase();
  });
  return {label, nums};
}

/**
 * Liest die Truppenübersicht (Übersichten, Truppen, Ansicht „Alle“ oder „Eigene“).
 * Gelesen wird die Zeile „eigene“, also was jetzt im Dorf steht; Unterstützungen zählen nicht.
 * Dazu die Stammes-Truppenübersicht eines Spielers (Stamm, Mitglieder, Truppen; Dennis 12.11.2026): eine Zeile je Dorf
 * mit den Punkten, danach die Einheiten in der Reihenfolge der Welt ohne Miliz, dahinter weitere Spalten, die nicht
 * gelesen werden. Sie zählt auch Truppen, die gerade nicht im Dorf sind.
 * @returns {{villages, errors, warnings, header, stamm}}
 */
function parseOverview(text, columns) {
  columns = columns || OVERVIEW_COLUMNS;
  const lines = String(text || "").split(/\r?\n/);
  const villages = [], errors = [], warnings = [], seen = new Set();
  let header = null, erwartet = null, offen = null, zuviel = null;
  const stamm = lines.some(l => /^\s*Dorf\s+Punkte\b/.test(l) || /Truppenübersicht zeigt die Anzahl der Truppen jedes Dorfes/.test(l));
  const einheiten = columns.filter(c => UNITS.includes(c));
  const fertig = (v, alle, nr) => {
    const cols = stamm ? einheiten : columns, nums = stamm ? alle.slice(1) : alle;      // Stamm: erste Zahl sind die Punkte
    if (nums.length < cols.length) {
      errors.push("Zeile " + nr + ": " + nums.length + " Zahlen" + (stamm ? " nach den Punkten" : "") + ", erwartet " + cols.length + " (" + v.name + ")");
      return;
    }
    if (!stamm && nums.length > cols.length + 1 && zuviel == null) zuviel = nr;
    const units = emptyUnits(), extra = {};
    cols.forEach((c, i) => { if (c in units) units[c] = nums[i]; else extra[c] = nums[i]; });
    const key = v.x * 1000 + v.y;
    if (seen.has(key)) { warnings.push("Zeile " + nr + ": Dorf " + v.x + "|" + v.y + " doppelt, nur das erste zählt"); return; }
    seen.add(key);
    villages.push({name: v.name, x: v.x, y: v.y, k: v.k, line: v.line, units});
  };
  lines.forEach((line, i) => {
    const nr = i + 1;
    if (!header) {
      const h = line.match(/\((\d+)\.\|([\d.]+) P\)/);
      if (h) header = {rank: +h[1], points: +h[2].replace(/\./g, "")};
    }
    const d = line.match(/^\s*Dorf \((\d+)\)/);
    if (d) erwartet = +d[1];
    const m = line.match(KOORD);
    if (m) {
      const v = {name: line.slice(0, m.index).trim(), x: +m[1], y: +m[2], k: +m[3], line: nr};
      const z = zeilenZahlen(line.slice(m.index + m[0].length));
      offen = null;
      if (z.label && ANDERE_ZEILEN.includes(z.label)) {
        errors.push("Zeile " + nr + ": Ansicht „" + z.label + "“ wird nicht gelesen, bitte „Alle“ oder „Eigene“ (" + v.name + ")");
        return;
      }
      if (z.nums.length) fertig(v, z.nums, nr);
      else offen = v;                       // Zahlen folgen in der Zeile „eigene“, sonst Kopfzeile des aktiven Dorfs
      return;
    }
    if (offen) {
      const z = zeilenZahlen(line);
      if (z.label === "eigene") fertig(offen, z.nums, nr);
      offen = null;
    }
  });
  if (erwartet != null && erwartet !== villages.length && villages.length) {
    warnings.push("Übersicht nennt " + erwartet + " Dörfer, gelesen " + villages.length +
                  (erwartet > villages.length ? " (weitere Seiten? „Dörfer pro Seite“ hochstellen)" : ""));
  }
  if (stamm && villages.length) warnings.push("Stammes-Truppenübersicht: zählt auch Truppen, die gerade unterwegs sind oder in anderen Dörfern stehen");
  if (zuviel != null) warnings.push("Zeile " + zuviel + ": mehr Zahlen als Einheiten. Stammes-Truppenübersicht? Dann bitte mit der Kopfzeile „Dorf Punkte“ einfügen");
  if (!villages.length && !errors.length) errors.push("Keine Dörfer erkannt. Erwartet wird die Truppenübersicht (Ansicht „Alle“ oder „Eigene“) oder die Stammes-Truppenübersicht eines Spielers.");
  return {villages, errors, warnings, header, stamm};
}

/* ---------- Dörfer einordnen ---------- */
/** Off-Größe in BH; Schwere Kavallerie zählt nur in Dörfern mit überwiegend Off-Einheiten. */
function offInfo(units, pop) {
  pop = pop || POP;
  const offInf = units.axe * pop.axe + units.light * pop.light + units.marcher * pop.marcher;
  const defInf = units.spear * pop.spear + units.sword * pop.sword + units.archer * pop.archer;
  const heavyAsOff = offInf > defInf;
  const offPop = offInf + units.ram * pop.ram + units.catapult * pop.catapult + (heavyAsOff ? units.heavy * pop.heavy : 0);
  return {offPop, heavyAsOff};
}

/**
 * Einordnung eines Dorfes: Off, knapp (Vorauswahl über den Zuwachs bis zum ersten Abschickzeitraum), Fakelimit.
 * @param {number} tage Tage bis zum Beginn des ersten Abschickzeitraums
 */
function classify(v, world, cfg, tage) {
  cfg = Object.assign({}, CFG_DEFAULT, cfg);
  const {offPop, heavyAsOff} = offInfo(v.units, world.pop);
  const rams = v.units.ram;
  const isOff = offPop >= cfg.off_min_pop && rams >= cfg.off_min_rams;
  const t = Math.max(0, tage || 0);
  const projPop = offPop + cfg.growth_pop_per_day * t, projRams = rams + cfg.growth_rams_per_day * t;
  const knapp = !isOff && offPop > 0 && projPop >= cfg.off_min_pop && projRams >= cfg.off_min_rams;
  const fakeMin = v.pts > 0 ? Math.ceil(v.pts * world.fake_limit / 100) + cfg.fake_extra_pop : null;
  return {offPop, heavyAsOff, isOff, knapp, projPop, projRams,
          fehltBH: Math.max(0, cfg.off_min_pop - offPop), fehltRammen: Math.max(0, cfg.off_min_rams - rams),
          fakeMin, nobles: v.units.snob};
}

/* ---------- Kostenfluss (Zuteilung) ---------- */
function heapPush(h, x) {
  h.push(x);
  let i = h.length - 1;
  while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
}
function heapPop(h) {
  const top = h[0], last = h.pop();
  if (h.length) {
    h[0] = last;
    for (let i = 0; ;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < h.length && h[l][0] < h[m][0]) m = l;
      if (r < h.length && h[r][0] < h[m][0]) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]]; i = m;
    }
  }
  return top;
}
class Fluss {
  constructor(n) { this.n = n; this.g = Array.from({length: n}, () => []); }
  add(u, v, cap, cost) {
    const a = {to: v, cap, cost, flow: 0, rev: null}, b = {to: u, cap: 0, cost: -cost, flow: 0, rev: a};
    a.rev = b;
    this.g[u].push(a); this.g[v].push(b);
    return a;
  }
  /** Größter Fluss mit kleinsten Kosten (Dijkstra mit Potentialen, Kosten anfangs nicht negativ). */
  run(s, t) {
    const n = this.n, pot = new Array(n).fill(0);
    let total = 0;
    for (;;) {
      const distv = new Array(n).fill(Infinity), prev = new Array(n).fill(null);
      distv[s] = 0;
      const heap = [[0, s]];
      while (heap.length) {
        const [d, u] = heapPop(heap);
        if (d > distv[u]) continue;
        for (const e of this.g[u]) {
          if (e.cap - e.flow <= 0) continue;
          const nd = d + e.cost + pot[u] - pot[e.to];
          if (nd < distv[e.to] - 1e-9) { distv[e.to] = nd; prev[e.to] = e; heapPush(heap, [nd, e.to]); }
        }
      }
      if (distv[t] === Infinity) break;
      for (let i = 0; i < n; i++) if (distv[i] < Infinity) pot[i] += distv[i];
      let f = Infinity;
      for (let v = t; v !== s; v = prev[v].rev.to) f = Math.min(f, prev[v].cap - prev[v].flow);
      for (let v = t; v !== s; v = prev[v].rev.to) { prev[v].flow += f; prev[v].rev.flow -= f; }
      total += f;
    }
    return total;
  }
}

/* ---------- Truppen zusammenstellen ---------- */
/** Fake (Dennis 10.11.2026): immer mindestens ein Späher; Katapulte vor Rammen. Langsamste Einheit ist ein Katapult, nur
    ohne freies Katapult eine Ramme. Aufgefüllt wird bis zum Fakelimit mit Katapulten und Spähern („kata“: Katapulte zuerst,
    „spaeher“: ein Katapult, Rest Späher); Rammen nur im Notfall danach. rammenMax: höchstens so viele Rammen je Fake,
    Standard 1, je Spieler einstellbar (Dennis 01:17); 0: keine Rammen. null: aus diesem Dorf geht kein Fake. */
function fakeAus(av, need, pop, modus, rammenMax) {
  const rMax = rammenMax == null ? 1 : Math.max(0, rammenMax);
  if (av.spy < 1) return null;
  const f = {catapult: 0, spy: 0, ram: 0};
  if (av.catapult >= 1) f.catapult = 1; else if (av.ram >= 1 && rMax >= 1) f.ram = 1; else return null;
  let rest = need - f.catapult * pop.catapult - f.ram * pop.ram;
  const kata = n => { const c = Math.min(av.catapult - f.catapult, Math.max(0, n)); f.catapult += c; rest -= c * pop.catapult; };
  const spaeher = n => { const k = Math.min(av.spy - f.spy, Math.max(0, n)); f.spy += k; rest -= k * pop.spy; };
  if (modus !== "spaeher" && f.catapult) kata(Math.floor(rest / pop.catapult));
  if (rest > 0) spaeher(Math.ceil(rest / pop.spy));
  if (rest > 0 && f.catapult) kata(Math.ceil(rest / pop.catapult));
  if (rest > 0) { const r = Math.min(av.ram - f.ram, rMax - f.ram, Math.ceil(rest / pop.ram)); if (r > 0) { f.ram += r; rest -= r * pop.ram; } }
  if (rest > 0) return null;
  if (f.spy < 1) f.spy = 1;
  return f;
}

/** Begleitschutz von etwa bh BH aus den verfügbaren Einheiten (Äxte zuerst). */
function begleitschutz(av, bh, pop) {
  const e = {};
  let rest = bh;
  for (const u of ESCORT_ORDER) {
    if (rest <= 0) break;
    const n = Math.min(av[u] || 0, Math.ceil(rest / pop[u]));
    if (n > 0) { e[u] = n; av[u] -= n; rest -= n * pop[u]; }
  }
  return e;
}

/* ---------- Plan ---------- */
/** Ankunftszeiträume (v0.6, Dennis 09.11.2026): input.arrivals [{from, to}, …] oder wie bisher input.arrival. Der erste
    ist der Hauptzeitraum für Offs und AGs; Fakes verteilt der Rechner auf alle (Dennis 1a, reine Fake-Pläne). */
function ankunftsListe(input) {
  return (input.arrivals && input.arrivals.length ? input.arrivals : [input.arrival]).filter(Boolean);
}
/** Ankünfte nie im Nachtbonus (Dennis 10.11.2026): die Tagesteile eines Ankunftszeitraums. „bis 23:00:00“ heißt
    höchstens 22:59:59.999 und gilt nicht als Kürzung. Leere Liste, wenn nichts übrig bleibt (Zeitpunkt oder Zeitraum ganz
    in der Nacht). Ein langer Zeitraum über die Nacht ergibt zwei Teile. Der Nachtbonus wechselt nur zu vollen Stunden. */
function tagesTeile(world, a) {
  if (!a) return [];
  if (!world.night || !world.night.active) return [{from: a.from, to: a.to}];
  const H = 3600000, out = [];
  let s = istNacht(world, a.from) ? null : a.from;
  for (let h = Math.ceil((a.from + 1) / H) * H; h <= a.to; h += H) {
    const n = istNacht(world, h);
    if (s != null && n) { out.push({from: s, to: h - 1}); s = null; }
    else if (s == null && !n) s = h;
  }
  if (s != null) out.push({from: s, to: a.to});
  return out;
}
/** true, wenn der Nachtbonus mehr als die letzte Sekunde vor 23 Uhr abschneidet (Hinweis an Dennis). */
function nachtGekuerzt(a, teile) {
  return teile.length !== 1 || teile[0].from !== a.from || a.to - teile[0].to > 1000;
}

/**
 * Plant Clean-Offs, AG-Trains und Fakes.
 * input = {world, cfg, attackers:[{id, name, points, windows, villages:[{id, name, x, y, pts, units, nobles, useOff}]}],
 *          agTargets:[{id, x, y, owner, name, assignee}], fakeTargets:[{id, x, y, owner}],
 *          extraFakeTargets:[{id, x, y, owner, ownerPoints, ownerDays}], arrival:{from, to}, windows:[[from, to]], now}
 * Zeiten in Unix-Millisekunden. useOff: Dorf als Off verplanen (Standard: Off nach Richtwert).
 */
function plan(input) {
  const world = input.world || makeWorld();
  const cfg = Object.assign({}, CFG_DEFAULT, input.cfg);
  const pop = world.pop, rng = mulberry32(cfg.seed | 0 || 1);
  const k = cfg.ags_per_target === 5 ? 5 : 4;
  const clean = Math.max(1, Math.min(3, cfg.clean_per_target | 0 || 1));
  const EIN = ankunftsListe(input);
  const warnings = [];
  if (!EIN.length || EIN.some(a => !(a.to >= a.from))) return {fehler: "Ankunft fehlt oder ist ungültig"};
  // nie im Nachtbonus ankommen (Dennis 10.11.2026): je Zeitraum die Tagesteile; der erste Tagesteil des ersten Zeitraums
  // ist der Hauptzeitraum für Offs und AGs, Fakes dürfen in jeden Teil
  const TEILE = EIN.map(a => tagesTeile(world, a)), ANK = [].concat(...TEILE), A = ANK[0];
  const nachtText = world.night ? " (" + world.night.start_hour + " bis " + world.night.end_hour + " Uhr)" : "";
  const leer = TEILE.findIndex(t => !t.length);
  if (leer >= 0) return {fehler: "Ankunft" + (EIN.length > 1 ? "szeitraum " + (leer + 1) : "") + " liegt ganz im Nachtbonus" + nachtText + ", dort darf nichts ankommen"};
  const teilText = t => t.map(x => fmtZeit(x.from).slice(0, 19) + " bis " + fmtZeit(x.to).slice(fmtZeit(x.from).slice(0, 10) === fmtZeit(x.to).slice(0, 10) ? 11 : 0, 19)).join(" und ");
  EIN.forEach((a, i) => { if (nachtGekuerzt(a, TEILE[i])) warnings.push({art: "nacht", text: "Ankunftszeitraum " + (EIN.length > 1 ? (i + 1) + " " : "") + "ragt in den Nachtbonus" + nachtText + ", geplant nur " + teilText(TEILE[i])}); });
  const streng = cfg.zeitraeume === "streng";
  const R = RANGFOLGE[cfg.zeit_rangfolge] || RANGFOLGE.standard;
  // Orientierung für Offs und AGs (Dennis 10.11.2026: keine feste Grenze, für Fakes sind lange Zeiträume sinnvoll)
  if ((input.agTargets || []).length && A.to - A.from > ANKUNFT_RAT_MS)
    warnings.push({art: "ankunft", text: "Ankunftszeitraum für Offs und AGs über " + (A.to - A.from > ANKUNFT_MAX_MS ? "1,5 Stunden (Orientierungswert)" : "1 Stunde")});

  // Dörfer der Angreifer mit Laufzeitdaten
  const att = new Map(), villages = [];
  // nie in der Vergangenheit abschicken: frühestens eine Minute nach der Berechnung (harte Grenze in jedem Fall)
  const ab = input.now != null ? [[input.now + 60000, Number.MAX_SAFE_INTEGER]] : [[0, Number.MAX_SAFE_INTEGER]];
  (input.attackers || []).forEach(a => {
    const wunsch = ivIntersect(ivNorm(a.windows && a.windows.length ? a.windows : (input.windows || [])), ab);
    // „wunsch“: die Zeiträume sind Wunsch, harte Grenze ist nur „nicht vor jetzt“ (Dennis 2a, 21:26)
    const fenster = streng ? wunsch : ab;
    // Je Spieler (Dennis 03.11.2026 15:12): Clean-Offs „beitrag“ (höchstens N je Ziel von diesem Spieler, 2b) oder
    // „eigene“ (N Clean-Offs für Ziele mit seinem AG-Train, 2a); Fakes „dorf“ (höchstens N je eigenem Dorf, 3a) oder
    // „ziel“ (N Fakes je Fakeziel von diesem Spieler, zusätzlich zu denen der übrigen, 3b). Ohne Angabe gilt die Konfig.
    const zahl = (x, max) => x == null || x === "" || isNaN(+x) ? null : Math.max(0, Math.min(max, Math.round(+x)));
    const cleanModus = ["beitrag", "eigene"].includes(a.cleanModus) ? a.cleanModus : null;
    const fakeModus = ["dorf", "ziel"].includes(a.fakeModus) ? a.fakeModus : null;
    att.set(a.id, {id: a.id, name: a.name, points: a.points || 0, fenster, wunsch,
      cleanModus: cleanModus && zahl(a.cleanN, 3) != null ? cleanModus : null, cleanN: zahl(a.cleanN, 3),
      fakeModus: fakeModus && zahl(a.fakeN, 20) != null ? fakeModus : null, fakeN: zahl(a.fakeN, 20),
      rammenMax: zahl(a.rammenMax, 1000) != null ? zahl(a.rammenMax, 1000) : 1});      // Rammen je Fake höchstens (Dennis 10.11.2026)
    if (!wunsch.length) warnings.push({art: "fenster", text: "Kein Abschickzeitraum für " + (a.name || a.id) + (streng ? "" : ", Abschickzeiten frei gewählt")});
    // Teilnahme je Spieler (Offs, AGs, Fakes) und Dorfauswahl für Offs und AGs (Dennis 16:57)
    const rollen = Object.assign({off: true, ag: true, fake: true}, a.rollen);
    const auswahl = a.auswahl && a.auswahl.length ? new Set(a.auswahl) : null;
    (a.villages || []).forEach(v => {
      const info = offInfo(v.units, pop);
      const useOff = v.useOff != null ? !!v.useOff : (info.offPop >= cfg.off_min_pop && v.units.ram >= cfg.off_min_rams);
      const inAuswahl = !auswahl || auswahl.has(v.x * 1000 + v.y);
      const offHier = useOff && rollen.off && inAuswahl;
      villages.push(Object.assign({}, v, {att: a.id, offPop: info.offPop, heavyAsOff: info.heavyAsOff, useOff, offHier,
        rolleAG: rollen.ag && inAuswahl, rolleFake: rollen.fake,
        reserviert: useOff && !offHier,              // Off bleibt für etwas anderes: Fakes nehmen ihr nichts Wichtiges
        nobles: v.nobles != null ? v.nobles : v.units.snob, avail: Object.assign(emptyUnits(), v.units)}));
    });
  });
  const vById = new Map(villages.map(v => [v.id, v]));
  const ankunft = [[A.from, A.to]];
  // Zulässige Blockbeginne T für einen Befehl dieses Dorfes (Laufzeit in ms, Abstand zum Blockbeginn): Abschickzeit im
  // Fenster und Ankunft im Zeitraum; bei einem festen Zeitpunkt liegt nur der Blockbeginn darauf (zeitBasis).
  const tset = (v, travelMs, offset) => zeitBasis(A, att.get(v.att).fenster, travelMs, offset || 0);
  const offsetErstesAG = (nClean) => (nClean - 1) * cfg.gap_clean_ms + cfg.gap_off_ag_ms;

  /* ---- 1. AGs auf Ziele ---- */
  const form = cfg.train_form === "zwei" ? "zwei" : cfg.train_form === "einzeln" ? "einzeln" : "ganz";
  const capJeDorf = form === "ganz" ? k : form === "zwei" ? 2 : 1;
  const agVillages = villages.filter(v => v.nobles > 0 && v.rolleAG);
  let ziele = (input.agTargets || []).map(t => Object.assign({}, t, {status: "offen"}));
  const ausgeschlossen = new Map();          // Ziel-ID → Grund
  const offPool = villages.filter(v => v.offHier).length;
  const knappOffs = offPool < ziele.length * clean;

  /* ---- Zeitlage (v0.5): Abschick-Intervall eines Befehls, Lage zu den Wunschzeiträumen, Ankerzeit je Angreifer ---- */
  const sendIv = (travelMs, offset) => [A.from + (offset || 0) - travelMs, A.to + (offset || 0) - travelMs];
  // Fakes dürfen in jeden Ankunftszeitraum (v0.6); mit einem Zeitraum genau wie bisher
  const sendIvFake = travelMs => ANK.length > 1 ? ivNorm(ANK.map(a => [a.from - travelMs, a.to - travelMs])) : [sendIv(travelMs, 0)];
  const tsetFake = (v, travelMs) => ANK.length > 1
    ? ivNorm([].concat(...ANK.map(a => zeitBasis(a, att.get(v.att).fenster, travelMs, 0)))) : tset(v, travelMs, 0);
  const nachtIv = iv => istNacht(world, iv[0]) && istNacht(world, iv[1]) && istNacht(world, (iv[0] + iv[1]) / 2);
  const anker = new Map();
  const zeitKosten = (v, travelMs, offset) => {
    if (streng) return 0;
    const iv = sendIv(travelMs, offset), d = ivAbstand(att.get(v.att).wunsch, iv);
    let c = d > 0 ? R.ausFlow + d / 60000 * R.ausFlowMin : 0;
    if (d > 0 && nachtIv(iv)) c *= R.nacht;
    const an = anker.get(v.att);
    if (an != null) c += Math.min(R.kopplungMax, Math.max(0, ivAbstand([iv], an) - ANKER_RAND_MS) / 60000 * R.anker);
    return c;
  };
  // Rangfolge „nachtruhe“: nachts außerhalb der Zeiträume nur, wenn es nicht anders geht; sonst fällt das Ziel weg
  const gesperrt = (v, travelMs, offset) => {
    if (streng || !R.nachtSperre) return false;
    const iv = sendIv(travelMs, offset);
    return ivAbstand(att.get(v.att).wunsch, iv) > 0 && nachtIv(iv);
  };
  // Laufzeit-Richtwerte (Dennis 11.11.2026, 2.1a und 2.2a): darüber nur, wenn sonst ein Ziel weniger geadelt würde oder die
  // Clean-Offs unter den Richtwert fielen; die Zuteilung maximiert zuerst die Zahl, die Kosten wählen dann die kürzeren
  const maxOffS = cfg.max_lauf_off_h > 0 ? cfg.max_lauf_off_h * 3600 : Infinity;
  const maxAgS = cfg.max_lauf_ag_h > 0 ? cfg.max_lauf_ag_h * 3600 : Infinity;
  const zuLangKosten = (trS, maxS) => trS > maxS ? ZU_LANG + Math.min(100000, (trS - maxS) / 60 * 50) : 0;
  // Ankerzeit: der Zeitpunkt, zu dem die meisten möglichen AGs (ohne AGs: Offs) des Angreifers losgehen könnten,
  // innerhalb der Wunschzeiträume bevorzugt. Die Zuteilung zieht die Befehle dorthin (Bündeln). AG-Dörfer sind knapp
  // und am wenigsten beweglich, deshalb richtet sich der Anker zuerst nach ihnen; nach der AG-Zuteilung wird er neu
  // aus den tatsächlichen Trains bestimmt (Abschnitt 2).
  const ankerAus = (a, nurOffs, zl) => {
    const ag = [], off = [];
    villages.forEach(v => {
      if (v.att !== a.id) return;
      zl.forEach(t => {
        if (t.assignee != null && t.assignee !== v.att) return;
        const d = dist(v, t);
        if (!nurOffs && v.nobles > 0 && v.rolleAG && d <= world.snob_max_dist + 1e-9) ag.push(sendIv(travelS(world, "snob", d) * 1000, offsetErstesAG(clean)));
        if (v.offHier) off.push(sendIv(travelS(world, "ram", d) * 1000, 0));
      });
    });
    return dichtesterPunkt(ag.length ? ag : off, a.wunsch);
  };
  if (!streng) att.forEach(a => { const p = ankerAus(a, false, ziele); if (p != null) anker.set(a.id, p); });

  const gapSicher = cfg.min_send_gap_s * 1000 + 500;
  const kollidiert = (a, liste) => liste.some(b => b.att === a.att && Math.abs(b.rel - a.rel) < gapSicher);
  const verboten = new Set();               // Kanten Dorf:Ziel ohne gemeinsame Ankunftszeit mit den übrigen AGs
  // Gruppen eines Ziels in Ankunftsreihenfolge: längste Laufzeit zuerst
  const ordne = (t, gruppen) => gruppen.slice().sort((a, b) =>
    travelS(world, "snob", dist(b.v, t)) - travelS(world, "snob", dist(a.v, t)) || a.v.id - b.v.id);
  // gemeinsame Blockbeginne der AGs eines Ziels
  const agJoint = (t, gruppen, nClean) => {
    let s = ankunft, off = offsetErstesAG(nClean);
    if (A.from === A.to) s = [[A.from, A.to]];
    ordne(t, gruppen).forEach(g => {
      s = ivIntersect(s, tset(g.v, travelS(world, "snob", dist(g.v, t)) * 1000, off));
      off += (g.n - 1) * world.attack_gap_ms + cfg.gap_ag_ms;
    });
    return s;
  };

  // Abschickvorgänge der AG-Gruppen eines Ziels relativ zum Blockbeginn
  const agAktionen = (t, gruppen, nClean) => {
    const out = [];
    let off = offsetErstesAG(nClean);
    ordne(t, gruppen).forEach(g => {
      out.push({att: g.v.att, rel: off - travelS(world, "snob", dist(g.v, t)) * 1000, g});
      off += (g.n - 1) * world.attack_gap_ms + cfg.gap_ag_ms;
    });
    return out;
  };

  function agZuteilen() {
    const aktiv = ziele.filter(t => !ausgeschlossen.has(t.id));
    const S = 0, T = 1, vBase = 2, tBase = 2 + agVillages.length;
    const fl = new Fluss(tBase + aktiv.length);
    const kanten = [];
    agVillages.forEach((v, i) => fl.add(S, vBase + i, form === "ganz" ? Math.floor(v.nobles / k) : v.nobles, 0));
    aktiv.forEach((t, j) => {
      fl.add(tBase + j, T, form === "ganz" ? 1 : k, 0);
      agVillages.forEach((v, i) => {
        if (t.assignee != null && t.assignee !== v.att) return;
        if (form === "ganz" && v.nobles < k) return;
        if (verboten.has(v.id + ":" + t.id)) return;
        const d = dist(v, t);
        if (d > world.snob_max_dist + 1e-9) return;
        const tr = travelS(world, "snob", d);
        if (!tset(v, tr * 1000, offsetErstesAG(clean)).length) return;
        if (gesperrt(v, tr * 1000, offsetErstesAG(clean))) return;
        let cost = form === "ganz" ? tr + rng() * 60 : rng() * 3600 + tr / 10;
        if (knappOffs && v.offHier && form !== "einzeln") cost += 3600;       // Off-Dörfer behalten ihre Off als Clean-Off
        cost += zeitKosten(v, tr * 1000, offsetErstesAG(clean)) + zuLangKosten(tr, maxAgS);
        kanten.push({e: fl.add(vBase + i, tBase + j, form === "ganz" ? 1 : Math.min(capJeDorf, v.nobles), Math.round(cost)), v, t});
      });
    });
    fl.run(S, T);
    const zuteilung = new Map();
    kanten.forEach(({e, v, t}) => {
      if (e.flow <= 0) return;
      if (!zuteilung.has(t.id)) zuteilung.set(t.id, []);
      zuteilung.get(t.id).push({v, n: form === "ganz" ? k : e.flow});
    });
    return {aktiv, zuteilung};
  }

  let z1 = null;
  for (let runde = 0; runde < 400; runde++) {
    z1 = agZuteilen();
    const teil = [];
    z1.aktiv.forEach(t => {
      const g = z1.zuteilung.get(t.id) || [];
      const n = g.reduce((s, x) => s + x.n, 0);
      if (!n) ausgeschlossen.set(t.id, "kein freies AG in Reichweite und Abschickzeitraum");
      else if (n < k) teil.push({t, n});
    });
    // Unvollständige Ziele einzeln streichen (das mit den wenigsten AGs), damit die übrigen ihre AGs bekommen
    if (teil.length) {
      teil.sort((a, b) => a.n - b.n || a.t.id - b.t.id);
      ausgeschlossen.set(teil[0].t.id, "zu wenige freie AGs aus " + (form === "ganz" ? "einem Dorf" : "verschiedenen Dörfern") + " in Reichweite");
      continue;
    }
    // AGs aus verschiedenen Dörfern brauchen eine gemeinsame Ankunftszeit; sonst die Kante des Ausreißers sperren
    // ebenso zwei Gruppen eines Angreifers, die im Mindestabstand abgeschickt werden müssten
    const zuDicht = t => {
      const akt = agAktionen(t, z1.zuteilung.get(t.id), clean);
      for (let i = 0; i < akt.length; i++) for (let j = i + 1; j < akt.length; j++)
        if (akt[i].att === akt[j].att && Math.abs(akt[i].rel - akt[j].rel) < gapSicher) return akt[j].g;
      return null;
    };
    const schlecht = z1.aktiv.filter(t => z1.zuteilung.has(t.id) && !ausgeschlossen.has(t.id) &&
                                     (!agJoint(t, z1.zuteilung.get(t.id), clean).length || zuDicht(t)));
    if (!schlecht.length) break;
    schlecht.forEach(t => {
      const dicht = zuDicht(t);
      if (dicht) { verboten.add(dicht.v.id + ":" + t.id); return; }
      const gr = z1.zuteilung.get(t.id);
      let sperre = gr[0], best = -1;
      gr.forEach(g => {
        const rest = gr.filter(x => x !== g);
        const n = rest.length ? agJoint(t, rest, clean).reduce((s, x) => s + x[1] - x[0] + 1, 0) : 0;
        if (n > best) { best = n; sperre = g; }
      });
      verboten.add(sperre.v.id + ":" + t.id);
    });
  }

  /* ---- 2. Trains bilden, Train mit Off markieren ---- */
  const trains = new Map();                  // Ziel-ID → [{v, n, carriesOff}]
  const offImTrain = new Set();
  const zielListe = ziele.filter(t => !ausgeschlossen.has(t.id) && z1.zuteilung.has(t.id));
  zielListe.forEach(t => {
    const gruppen = ordne(t, z1.zuteilung.get(t.id).map(x => ({v: x.v, n: x.n, carriesOff: false})));
    gruppen.forEach(g => {
      if (g.v.offHier && g.n >= 2 && form !== "einzeln" && !offImTrain.has(g.v.id)) { g.carriesOff = true; offImTrain.add(g.v.id); }
    });
    trains.set(t.id, gruppen);
  });
  // Abschick-Intervalle der Trains je Spieler (für die Clean-Offs: in die Nähe der eigenen Trains bündeln)
  const trainIvs = new Map();
  zielListe.forEach(t => trains.get(t.id).forEach(g => {
    if (!trainIvs.has(g.v.att)) trainIvs.set(g.v.att, []);
    trainIvs.get(g.v.att).push(sendIv(travelS(world, "snob", dist(g.v, t)) * 1000, offsetErstesAG(clean)));
  }));
  // Anker neu: aus den Abschickzeiten der zugeteilten Trains, ohne Trains aus den Offs zu den verbliebenen Zielen
  if (!streng) att.forEach(a => {
    const ivs = [];
    zielListe.forEach(t => trains.get(t.id).forEach(g => { if (g.v.att === a.id) ivs.push(sendIv(travelS(world, "snob", dist(g.v, t)) * 1000, offsetErstesAG(clean))); }));
    const p = ivs.length ? dichtesterPunkt(ivs, a.wunsch) : ankerAus(a, true, zielListe);
    if (p != null) anker.set(a.id, p); else anker.delete(a.id);
  });

  /* ---- 3. Clean-Offs ---- */
  const cleanPool = () => villages.filter(v => v.offHier && !offImTrain.has(v.id) && !v.verplant);
  const cleanOffs = new Map(zielListe.map(t => [t.id, []]));
  // Ankunftszeiten der AGs eines Ziels (für die Prüfung, ob eine Clean-Off dazu passt)
  const agSet = (t, nClean) => {
    let s = ankunft, off = offsetErstesAG(nClean);
    trains.get(t.id).forEach(g => {
      s = ivIntersect(s, tset(g.v, travelS(world, "snob", dist(g.v, t)) * 1000, off));
      off += (g.n - 1) * world.attack_gap_ms + cfg.gap_ag_ms;
    });
    return s;
  };
  // Clean-Off vor dem ersten AG abgeschickt? Unabhängig von der Ankunftszeit.
  const offZuerst = (o, t, pos, nClean) => {
    let off = offsetErstesAG(nClean), frueh = Infinity;
    trains.get(t.id).forEach(g => {
      frueh = Math.min(frueh, off - travelS(world, "snob", dist(g.v, t)) * 1000);
      off += (g.n - 1) * world.attack_gap_ms + cfg.gap_ag_ms;
    });
    const sendeOff = pos * cfg.gap_clean_ms - travelS(world, "ram", dist(o, t)) * 1000;
    return sendeOff + cfg.off_first_lead_s * 1000 <= frueh;
  };
  const offKosten = (o, t, pos, nClean) => {
    let c = travelS(world, "ram", dist(o, t)) + rng() * 60 + zuLangKosten(travelS(world, "ram", dist(o, t)), maxOffS);
    if (cfg.off_first && !offZuerst(o, t, pos, nClean)) c += 100000;
    // Clean-Offs möglichst vom Spieler, der den Train schickt: dann timt er alles selbst (Dennis 15:00, niedrige Priorität:
    // unter „Off vor AG“ und dem Bündeln, über den Laufzeiten)
    if (!trains.get(t.id).some(g => g.v.att === o.att)) c += SPIELER_FREMD;
    c += zeitKosten(o, travelS(world, "ram", dist(o, t)) * 1000, pos * cfg.gap_clean_ms);
    // Bündeln: Abstand der Abschickzeit zu den Trains desselben Spielers, egal für welches Ziel. Bis 03.11. zählte nur der
    // Train dieses Ziels; das schob Clean-Offs zu fremden Spielern, ohne eine Sitzung zu sparen.
    if (!streng && trainIvs.has(o.att)) {
      const iv = sendIv(travelS(world, "ram", dist(o, t)) * 1000, pos * cfg.gap_clean_ms);
      const d = Math.min(...trainIvs.get(o.att).map(x => ivAbstand([x], iv)));
      c += Math.min(R.kopplungMax, Math.max(0, d - SITZUNG_PAUSE_MS) / 60000 * R.anker);
    }
    return Math.round(c);
  };
  const passt = (o, t, pos, nClean, basis) => {
    const ao = att.get(o.att);
    if (ao.cleanModus === "beitrag" && (cleanOffs.get(t.id) || []).filter(x => x.att === o.att).length >= ao.cleanN) return false;
    if (gesperrt(o, travelS(world, "ram", dist(o, t)) * 1000, pos * cfg.gap_clean_ms)) return false;
    // Rangfolge „sitzungen“: weitere Clean-Offs nur, wenn sie in die Sitzung des Angreifers passen
    if (pos > 0 && R.fuellNurAnker && !streng && anker.has(o.att) &&
        ivAbstand([sendIv(travelS(world, "ram", dist(o, t)) * 1000, pos * cfg.gap_clean_ms)], anker.get(o.att)) > ANKER_RAND_MS) return false;
    const rel = {att: o.att, rel: pos * cfg.gap_clean_ms - travelS(world, "ram", dist(o, t)) * 1000};
    const vorhanden = agAktionen(t, trains.get(t.id), nClean).concat((cleanOffs.get(t.id) || []).map((x, i) =>
      ({att: x.att, rel: i * cfg.gap_clean_ms - travelS(world, "ram", dist(x, t)) * 1000})));
    if (kollidiert(rel, vorhanden)) return false;
    const s = tset(o, travelS(world, "ram", dist(o, t)) * 1000, pos * cfg.gap_clean_ms);
    return ivIntersect(basis || agSet(t, nClean), s).length > 0;
  };

  for (let runde = 0; runde < 20; runde++) {
    // Runde 1: jedem Ziel eine Clean-Off, so viele Ziele wie möglich
    const offen = zielListe.filter(t => trains.has(t.id) && !cleanOffs.get(t.id).length);
    if (!offen.length) break;
    const pool = cleanPool();
    const S = 0, T = 1, oBase = 2, tBase = 2 + pool.length;
    const fl = new Fluss(tBase + offen.length);
    const kanten = [];
    pool.forEach((o, i) => fl.add(S, oBase + i, 1, 0));
    offen.forEach((t, j) => {
      fl.add(tBase + j, T, 1, 0);
      pool.forEach((o, i) => { if (passt(o, t, 0, clean)) kanten.push({e: fl.add(oBase + i, tBase + j, 1, offKosten(o, t, 0, clean)), o, t}); });
    });
    fl.run(S, T);
    kanten.forEach(({e, o, t}) => { if (e.flow > 0) { cleanOffs.get(t.id).push(o); o.verplant = true; } });
    const ohne = offen.filter(t => !cleanOffs.get(t.id).length);
    if (!ohne.length) break;
    // Ziele ohne Clean-Off sind nicht adelbar; ihre AGs werden frei. Trägt ihr Train eine Off, wird sie zur Clean-Off
    // für ein anderes Ziel, deshalb dann nur dieses eine Ziel streichen und neu zuteilen.
    const mitOff = ohne.filter(t => trains.get(t.id).some(g => g.carriesOff));
    (mitOff.length ? [mitOff[mitOff.length - 1]] : ohne).forEach(t => {
      ausgeschlossen.set(t.id, agSet(t, clean).length ? "keine freie Clean-Off in Reichweite und Abschickzeitraum" : "AGs ohne gemeinsame Ankunftszeit");
      trains.get(t.id).forEach(g => { if (g.carriesOff) offImTrain.delete(g.v.id); });
      trains.delete(t.id);
    });
    if (!mitOff.length) break;
  }
  // Runde 2: bis zum Richtwert auffüllen, reihum. Richtwert je Ziel: „eigene“ beim Spieler des ersten Trains, sonst die Konfig
  const richtwert = t => {
    const tr = trains.get(t.id), a = tr && tr.length ? att.get(tr[0].v.att) : null;
    return a && a.cleanModus === "eigene" ? Math.max(1, a.cleanN) : clean;
  };
  const auffuellen = () => {
    for (let pos = 1; pos < 3; pos++) {
      zielListe.filter(t => trains.has(t.id)).map(t => ({t, r: rng()})).sort((a, b) => a.r - b.r).map(x => x.t).forEach(t => {
        const liste = cleanOffs.get(t.id);
        if (liste.length !== pos || pos >= richtwert(t)) return;
        let basis = agSet(t, pos + 1);
        liste.forEach((o, i) => { basis = ivIntersect(basis, tset(o, travelS(world, "ram", dist(o, t)) * 1000, i * cfg.gap_clean_ms)); });
        let best = null, bc = Infinity;
        cleanPool().forEach(o => {
          if (!passt(o, t, pos, pos + 1, basis)) return;
          const c = offKosten(o, t, pos, pos + 1);
          if (c < bc) { bc = c; best = o; }
        });
        if (best) { liste.push(best); best.verplant = true; }
      });
    }
  };
  auffuellen();
  // Zu wenige Offs: der Spieler wählt, ob Ziele unter dem Richtwert bleiben oder Ziele wegfallen (Dennis 16:48)
  const unterRichtwert = () => zielListe.filter(t => trains.has(t.id) && cleanOffs.get(t.id).length < richtwert(t));
  const knapp = {unterRichtwert: unterRichtwert().length, gestrichen: 0};
  if (cfg.clean_knapp === "weniger_ziele") {
    for (let unter = unterRichtwert(); unter.length; unter = unterRichtwert()) {
      unter.sort((a, b) => cleanOffs.get(a.id).length - cleanOffs.get(b.id).length || a.id - b.id);
      const weg = unter[0];
      ausgeschlossen.set(weg.id, "zu wenige Offs für " + richtwert(weg) + " Clean-Offs je Ziel (Variante weniger Ziele)");
      cleanOffs.get(weg.id).forEach(o => { o.verplant = false; });
      cleanOffs.set(weg.id, []);
      trains.get(weg.id).forEach(g => { if (g.carriesOff) offImTrain.delete(g.v.id); });
      trains.delete(weg.id);
      knapp.gestrichen++;
      auffuellen();
    }
  }
  const geadelt = zielListe.filter(t => trains.has(t.id) && cleanOffs.get(t.id).length);
  geadelt.forEach(t => {
    const n = cleanOffs.get(t.id).length, k = richtwert(t);
    if (n < k) warnings.push({art: "richtwert", ziel: t.id, text: "Ziel " + t.x + "|" + t.y + ": " + n + " statt " + k + " Clean-Offs"});
  });

  /* ---- 4. Übrige Offs ---- */
  const fakeZiele = (input.fakeTargets || []).map(t => Object.assign({}, t, {pflicht: true}));
  ziele.forEach(t => { if (!trains.has(t.id) && !fakeZiele.some(f => f.id === t.id)) fakeZiele.push(Object.assign({}, t, {pflicht: true, warAG: true})); });
  const restZiele = [];
  if (cfg.rest_offs === "nicht_ag") {
    const frei = new Set(fakeZiele.map(t => t.id));
    cleanPool().sort(() => rng() - 0.5).forEach(o => {
      let best = null, bc = Infinity;
      fakeZiele.forEach(t => {
        if (!frei.has(t.id)) return;
        const tr = travelS(world, "ram", dist(o, t));
        if (tr > maxOffS || !tset(o, tr * 1000, 0).length) return;      // übrige Offs nie über dem Laufzeit-Richtwert
        if (tr < bc) { bc = tr; best = t; }
      });
      if (best) { frei.delete(best.id); o.verplant = true; restZiele.push({o, t: best}); }
    });
  }
  const freieOffs = cleanPool();

  /* ---- 4b. Vorläufige Zeitlage der Offs und AGs (v0.5): Sitzungen, in die die Fakes passen sollen ---- */
  const kernBloecke = () => {
    const out = [];
    let nr = 0;
    const offIt = (o, t, offset, kind) => ({kind, att: o.att, v: o, t, travelMs: travelS(world, "ram", dist(o, t)) * 1000, offset, aktion: ++nr});
    geadelt.forEach(t => {
      const its = cleanOffs.get(t.id).map((o, i) => offIt(o, t, i * cfg.gap_clean_ms, "clean"));
      let off = offsetErstesAG(cleanOffs.get(t.id).length);
      trains.get(t.id).forEach(g => {
        const a = ++nr;
        for (let i = 0; i < g.n; i++) {
          its.push({kind: "ag", att: g.v.att, v: g.v, t, travelMs: travelS(world, "snob", dist(g.v, t)) * 1000, offset: off, aktion: a});
          off += i < g.n - 1 ? world.attack_gap_ms : cfg.gap_ag_ms;
        }
      });
      out.push({art: "ag", key: "ag:" + t.id, ziel: t, items: its});
    });
    restZiele.forEach(({o, t}) => out.push({art: "rest", key: "rest:" + t.id + ":" + o.id, ziel: t, items: [offIt(o, t, 0, "rest")]}));
    return out;
  };
  const zeitCtx = {A, ANK, att, gapMs: cfg.min_send_gap_s * 1000, zielMs: (cfg.send_gap_target_s || 0) * 1000, rng, world, R, streng, anker};
  let vorgabe = null, T0 = Infinity;         // T0: erster Off- oder AG-Abschick des Plans (vorläufig), Bezug des Fake-Vorlaufs
  const fakeFenster = new Map();             // Angreifer → Abschickzeiten, in denen seine Fakes liegen dürfen
  if (!streng) {
    const vb = kernBloecke();
    const vz = zeitenPlanen(vb, Object.assign({}, zeitCtx, {warnings: [], nurKern: true, schnell: !!input._schnell}));
    vorgabe = new Map(vb.filter(b => b.T != null).map(b => [b.key, b.T]));
    vz.sitzungen.forEach((s, a) => { if (s.length) fakeFenster.set(a, ivNorm(s.map(([x, y]) => [x - FAKE_RAND_MS, y + FAKE_RAND_MS]))); });
    vz.sitzungen.forEach(s => s.forEach(([x]) => { if (x < T0) T0 = x; }));
  }

  /* ---- 5. Fakes ---- */
  // Was ein Dorf für Fakes hergibt: Katapulte nur so weit, dass eine verplante Off über dem Richtwert bleibt;
  // Rammen nur aus Dörfern ohne Off im Plan; Späher abzüglich der Späher für die Off.
  const offVerplant = v => v.verplant || offImTrain.has(v.id) || v.reserviert;
  villages.forEach(v => {
    const u = v.units, ov = offVerplant(v);
    const kataFrei = ov ? Math.max(0, Math.floor((v.offPop - cfg.off_min_pop) / pop.catapult)) : u.catapult;
    v.fakeAv = {catapult: Math.min(u.catapult, kataFrei), ram: ov ? 0 : u.ram,
                spy: Math.max(0, u.spy - (ov ? Math.min(cfg.spies_per_off, u.spy) : 0))};
    v.fakeMin = v.pts > 0 ? Math.ceil(v.pts * world.fake_limit / 100) + cfg.fake_extra_pop : null;
    v.fakes = 0;
  });
  const fakes = [];
  const fakeQuellen = villages.filter(v => v.fakeMin && v.rolleFake);
  const ohneSpaeherListe = fakeQuellen.filter(v => v.fakeAv.spy < 1 && v.fakeAv.catapult + v.fakeAv.ram >= 1), ohneSpaeher = ohneSpaeherListe.length;
  if (villages.some(v => !v.fakeMin)) warnings.push({art: "punkte", text: "Dörfer ohne Dorfpunkte in den Weltdaten schicken keine Fakes"});
  // Stammesmitglieder reihum (je Mitglied ein Dorf, starke zuerst), damit jedes gewählte Mitglied Fakes bekommt, auch wenn
  // die Truppen nicht für alle Dörfer reichen (10.11.2026; vorher alle Dörfer des stärksten Mitglieds zuerst)
  const extra = [];
  if (cfg.extra_fakes) {
    const jeBesitzer = new Map();
    (input.extraFakeTargets || []).slice().sort((a, b) => (b.ownerPoints || 0) - (a.ownerPoints || 0))
      .forEach(t => { if (!jeBesitzer.has(t.owner)) jeBesitzer.set(t.owner, []); jeBesitzer.get(t.owner).push(t); });
    const listen = [...jeBesitzer.values()];
    for (let i = 0; listen.some(l => i < l.length); i++) listen.forEach(l => { if (i < l.length) extra.push(l[i]); });
  }
  // Fakes nur in den Sitzungen der Offs und AGs (mit Rand); reine Fake-Spieler bekommen eine dichte Sitzung um den
  // Zeitpunkt, zu dem die meisten ihrer Fakes losgehen könnten (Dennis 21:04: Fakes sind Richtwert, Bündeln geht vor)
  const fakeAnker = new Map();
  // Reine Fake-Spieler: je Ankunftszeitraum der dichteste Abschickzeitpunkt; gewählt wird der Zeitraum, der am besten zu
  // seinen Abschickzeiträumen passt, bei fast gleich gutem der mit den wenigsten Spielern (Verteilen, Dennis 1a)
  const fensterLast = ANK.map(() => 0);
  // Abschickzeiten aller möglichen Fakes eines Angreifers für einen Ankunftszeitraum, nur ab jetzt (10.11.2026: sonst lag
  // die Sitzung bei weiten Zielen in der Vergangenheit und alle Fakes entfielen)
  const fakeIvs = (a, an) => {
    const ivs = [];
    fakeQuellen.forEach(q => { if (q.att === a) fakeZiele.concat(extra).forEach(z => { const tr = travelS(world, "ram", dist(q, z)) * 1000; ivIntersect([[an.from - tr, an.to - tr]], ab).forEach(iv => ivs.push(iv)); }); });
    return ivs;
  };
  // dichtester Punkt in den Abschickzeiträumen gegen den dichtesten überhaupt; außerhalb zählt halb, wie bisher (10.11.2026,
  // Dennis 1a: sonst landete die Sitzung bei langen Ankunftszeiträumen jetzt mitten in der Nacht vor den Zeiträumen)
  const punktWahl = (ivs, w) => {
    const drin = w.length ? [].concat(...ivs.map(iv => ivIntersect([iv], w))) : [];
    const zahl = p => p == null ? 0 : ivs.filter(([x, y]) => x <= p && p <= y).length * (!w.length || ivHas(w, p) ? 1 : 0.5);
    const pIn = drin.length ? dichtesterPunkt(drin, w) : null, pAll = dichtesterPunkt(ivs, w);
    const p = zahl(pIn) >= zahl(pAll) ? pIn : pAll;
    return {p, n: zahl(p)};
  };
  // eine Stunde um den Punkt, ganz in den Zeitraum mit dem Punkt geschoben (der Punkt bleibt drin), nicht vor jetzt
  const sitzungUm = (p, w) => {
    let f = [[p - FAKE_SITZUNG_MS, p + FAKE_SITZUNG_MS]];
    const wi = w.find(([x, y]) => x <= p && p <= y), lang = 2 * FAKE_SITZUNG_MS;
    const von = Math.max(ab[0][0], wi ? wi[0] : -Infinity), bis = wi ? wi[1] : Infinity;
    if (bis - von >= lang) { const lo = Math.min(Math.max(f[0][0], von), bis - lang); if (lo <= p && p <= lo + lang) f = [[lo, lo + lang]]; }
    if (w.length && ivIntersect(f, w).length) f = ivIntersect(f, w);         // nicht über die Zeiträume hinaus
    return f;
  };
  const fakeSitzung = a => {
    const w = att.get(a).wunsch;
    const wahl = ANK.map((an, i) => Object.assign({i}, punktWahl(fakeIvs(a, an), w)));
    const max = Math.max(...wahl.map(x => x.n));
    if (!(max > 0)) return [];
    const best = wahl.filter(x => x.n >= max * 0.9).sort((x, y) => fensterLast[x.i] - fensterLast[y.i] || y.n - x.n || x.i - y.i)[0];
    fensterLast[best.i]++;
    return sitzungUm(best.p, w);
  };
  // Fake-Vorlauf (Dennis 11.11.2026, 1.1a und 1.2a): die ersten Fakes laufen etwa so viele Stunden vor dem ersten Off- oder
  // AG-Abschick des ganzen Plans los. Je Angreifer höchstens eine zusätzliche frühe Sitzung (eine Stunde, im Umkreis von
  // einer Stunde um den Richtwert); die übrigen Fakes bleiben in seinen Sitzungen. Ohne Offs und AGs im Plan kein Vorlauf.
  const vorlaufMs = !streng && cfg.fake_vorlauf_h > 0 ? cfg.fake_vorlauf_h * 3600000 : 0;
  const fakeFrueh = new Map();
  const fruehFenster = a => {
    if (!fakeFrueh.has(a)) {
      let f = [];
      if (vorlaufMs && T0 < Infinity) {
        const ziel = T0 - vorlaufMs, ivs = [];
        ANK.forEach(an => fakeIvs(a, an).forEach(iv => ivIntersect([iv], [[ziel - VORLAUF_TOL_MS, ziel + VORLAUF_TOL_MS]]).forEach(x => ivs.push(x))));
        const w = att.get(a).wunsch, pw = ivs.length ? punktWahl(ivs, w) : {p: null};
        if (pw.p != null) f = sitzungUm(pw.p, w);
      }
      fakeFrueh.set(a, f);
    }
    return fakeFrueh.get(a);
  };
  const fakeZeitOk = (v, t) => {
    if (streng) return true;
    const s = sendIvFake(travelS(world, "ram", dist(v, t)) * 1000);
    if (!fakeFenster.has(v.att)) {
      if (!fakeAnker.has(v.att)) fakeAnker.set(v.att, fakeSitzung(v.att));
      return ivIntersect(s, ivNorm(fakeAnker.get(v.att).concat(fruehFenster(v.att)))).length > 0;
    }
    return ivIntersect(s, ivNorm(fakeFenster.get(v.att).concat(fruehFenster(v.att)))).length > 0;
  };
  // Fakes je Zieldorf (wie bisher) oder je Herkunftsdorf (Dennis 09.11.2026, Konfig); Einstellungen je Spieler gehen vor
  const herkunft = cfg.fake_modus === "herkunft";
  const sollQ = v => { const a = att.get(v.att); return Math.min(a.fakeModus === "dorf" ? a.fakeN : cfg.fakes_per_village, Math.max(1, Math.round(cfg.fakes_max_je_dorf || 4))); };
  const maxQ = Math.max(1, Math.round(cfg.fakes_max_je_dorf || 4));
  // Ziele je Angreifer streuen (Dennis 10.11.2026 00:58: ein Spieler lief fast nur auf einen Zielspieler): jeder schon
  // geplante Fake dieses Angreifers auf denselben Zielspieler kostet bei der Wahl so viel wie zwei Felder mehr Rammenlaufzeit
  const paar = new Map(), paarK = (v, t) => v.att + ":" + (t.owner != null ? t.owner : "t" + t.id);
  const paarZahl = (v, t) => paar.get(paarK(v, t)) || 0;
  // Fakes fair über die Angreifer, im Verhältnis zu ihrer Dorfzahl (Dennis 10.11.2026 01:04): je Fake pro eigenem Dorf, den ein
  // Angreifer schon hat, kostet die Wahl so viel wie 24 Felder mehr Rammenlaufzeit (bei Fakes zählt die Laufzeit wenig)
  const attFakes = new Map(), attDoerfer = new Map();
  fakeQuellen.forEach(v => attDoerfer.set(v.att, (attDoerfer.get(v.att) || 0) + 1));
  const last = v => (attFakes.get(v.att) || 0) / (attDoerfer.get(v.att) || 1);
  const paarPlus = (v, t) => { paar.set(paarK(v, t), paarZahl(v, t) + 1); attFakes.set(v.att, (attFakes.get(v.att) || 0) + 1); };
  // Fake-Vorlauf (1.2a): rund ein Viertel der Fakes eines Angreifers in seine frühe Sitzung, soweit Quelle und Ziel dafür
  // weit genug auseinander liegen; diese Fakes werden dort auch abgeschickt, die übrigen bleiben in seinen Sitzungen
  const fruehZahl = new Map();
  const fruehMoeglich = (v, t) => vorlaufMs > 0 && fruehFenster(v.att).length > 0 &&
    ivIntersect(sendIvFake(travelS(world, "ram", dist(v, t)) * 1000), fruehFenster(v.att)).length > 0;
  const fruehGewuenscht = v => vorlaufMs > 0 && (fruehZahl.get(v.att) || 0) < FRUEH_ANTEIL * ((attFakes.get(v.att) || 0) + 1);
  const fruehBonus = (v, t) => fruehGewuenscht(v) && fruehMoeglich(v, t) ? -FRUEH_BONUS_S : 0;
  const fakeDazu = (v, t, f, ex) => {
    const fr = fruehGewuenscht(v) && fruehMoeglich(v, t);
    if (fr) fruehZahl.set(v.att, (fruehZahl.get(v.att) || 0) + 1);
    paarPlus(v, t);
    fakes.push({v, t, f, extra: ex, frueh: fr});
  };
  /** grenze: höchstens so viele Fakes je Ziel in diesem Lauf (Verteilung reihum). */
  const fakeLauf = (liste, istExtra, modus, grenze) => {
    const kand = liste.map(t => {
      const q = fakeQuellen.filter(v => {
        // von Hand gewählte Mitglieder unter der Moral-Schwelle (Dennis 10.11.2026): jeder Angreifer darf sie faken
        if (istExtra && !t.manuell) {
          const a = att.get(v.att);
          if (moral(world.moral, a.points, t.ownerPoints || 0, t.ownerDays) < cfg.moral_threshold) return false;
        }
        return tsetFake(v, travelS(world, "ram", dist(v, t)) * 1000).length > 0 && fakeZeitOk(v, t);
      });
      return {t, q};
    });
    if (!istExtra) kand.sort((a, b) => a.q.length - b.q.length);
    kand.forEach(({t, q}) => {
      const schon = new Set(fakes.filter(f => f.t.id === t.id).map(f => f.v.id));
      const sortiert = q.map(v => ({v, c: travelS(world, "ram", dist(v, t)) + rng() * 1800 + v.fakes * 600 + paarZahl(v, t) * PAAR_S + last(v) * FAIR_S + fruehBonus(v, t)}))
        .sort((a, b) => a.c - b.c);
      // Topf je Fakeziel: die Spieler mit „ziel“ je eigener Topf mit ihrer Zahl, alle übrigen zusammen die Zahl der Konfig
      const topf = v => { const a = att.get(v.att); return a.fakeModus === "ziel" ? "s" + a.id : "alle"; };
      // Stammesmitglieder nachrangig mit eigener Zahl je Zieldorf (Dennis 10.11.2026)
      const soll0 = k => k === "alle" ? (herkunft ? 0 : istExtra ? cfg.extra_fakes_per_village : cfg.fakes_per_village)
        : istExtra ? Math.min(att.get(+k.slice(1)).fakeN, cfg.extra_fakes_per_village) : att.get(+k.slice(1)).fakeN;
      const soll = k => grenze != null ? Math.min(grenze, soll0(k)) : soll0(k);
      const hat = new Map();
      fakes.forEach(f => { if (f.t.id === t.id) { const k = topf(f.v); hat.set(k, (hat.get(k) || 0) + 1); } });
      for (const {v} of sortiert) {
        const k = topf(v), a = att.get(v.att);
        if ((hat.get(k) || 0) >= soll(k)) continue;
        if (schon.has(v.id)) continue;
        if (a.fakeModus === "dorf" && v.fakes >= a.fakeN) continue;          // Obergrenze je eigenem Dorf
        if (v.fakes >= maxQ) continue;                                          // höchstens N Fakes je eigenem Dorf
        const f = fakeAus(v.fakeAv, v.fakeMin, pop, modus, att.get(v.att).rammenMax);
        if (!f) continue;
        v.fakeAv.catapult -= f.catapult; v.fakeAv.spy -= f.spy; v.fakeAv.ram -= f.ram;
        v.fakes++; schon.add(v.id); hat.set(k, (hat.get(k) || 0) + 1);
        fakeDazu(v, t, f, istExtra);
      }
    });
  };
  const laeufe = (liste, ex, grenze) => { if (liste.length) { fakeLauf(liste, ex, "kata", grenze); fakeLauf(liste, ex, "spaeher", grenze); } };
  if (cfg.fake_verteilung === "haupt") { laeufe(fakeZiele, false); laeufe(extra, true); }
  else {
    // reihum (Dennis 10.11.2026 00:52: sonst bekam fast nur der Hauptspieler Fakes): erst jedes Pflichtziel, dann jedes
    // Dorf der Stammesmitglieder einen Fake, danach Pflichtziele bis zur vollen Zahl, dann Mitglieder bis zu ihrer Zahl
    laeufe(fakeZiele, false, 1); laeufe(extra, true, 1);
    laeufe(fakeZiele, false); laeufe(extra, true);
  }
  // Je Herkunftsdorf: jedes Dorf schickt N Fakes, Ziele gleichmäßig verteilt (wenig befakte und nahe zuerst), nie zweimal
  // dasselbe Ziel aus einem Dorf; Spieler mit „N je Fakeziel“ bleiben bei ihrem eigenen Topf
  const herkunftLauf = modus => {
    const liste = fakeZiele.map(t => ({t, ex: false})).concat(extra.map(t => ({t, ex: true})));
    if (!liste.length) return;
    const zahl = new Map();
    fakes.forEach(f => zahl.set(f.t.id, (zahl.get(f.t.id) || 0) + 1));
    const quellen = fakeQuellen.filter(v => att.get(v.att).fakeModus !== "ziel");
    const runden = Math.max(0, ...quellen.map(sollQ));
    for (let r = 0; r < runden; r++) quellen.forEach(v => {
      if (v.fakes >= sollQ(v)) return;
      const a = att.get(v.att), schon = new Set(fakes.filter(f => f.v.id === v.id).map(f => f.t.id));
      let best = null, bestC = Infinity;
      liste.forEach(({t, ex}) => {
        if (schon.has(t.id)) return;
        // je Fake auf dem Ziel 8 h Aufschlag: Gleichmäßigkeit geht vor Nähe (rund 16 Felder Rammenlaufzeit)
        if (ex && (zahl.get(t.id) || 0) >= cfg.extra_fakes_per_village) return;      // Stammesmitglieder: eigene Zahl je Zieldorf
        const tr = travelS(world, "ram", dist(v, t)), c = (zahl.get(t.id) || 0) * 28800 + tr + rng() * 1800 + (ex ? 57600 : 0) + paarZahl(v, t) * PAAR_S + fruehBonus(v, t);
        if (c >= bestC) return;
        if (ex && !t.manuell && moral(world.moral, a.points, t.ownerPoints || 0, t.ownerDays) < cfg.moral_threshold) return;
        if (!tsetFake(v, tr * 1000).length || !fakeZeitOk(v, t)) return;
        best = {t, ex}; bestC = c;
      });
      if (!best) return;
      const f = fakeAus(v.fakeAv, v.fakeMin, pop, modus, att.get(v.att).rammenMax);
      if (!f) return;
      v.fakeAv.catapult -= f.catapult; v.fakeAv.spy -= f.spy; v.fakeAv.ram -= f.ram;
      v.fakes++; zahl.set(best.t.id, (zahl.get(best.t.id) || 0) + 1);
      fakeDazu(v, best.t, f, best.ex);
    });
  };
  if (herkunft) { herkunftLauf("kata"); herkunftLauf("spaeher"); }
  // Fakes je Dorf ist Richtwert (Dennis 21:04): eine Sammelzeile statt einer Warnung je Ziel
  let fakeSoll = 0;
  if (!herkunft && fakeQuellen.some(v => att.get(v.att).fakeModus !== "ziel")) fakeSoll += cfg.fakes_per_village;
  att.forEach(a => { if (a.fakeModus === "ziel" && fakeQuellen.some(v => v.att === a.id)) fakeSoll += a.fakeN; });
  const fakeUnter = fakeZiele.filter(t => fakes.filter(f => f.t.id === t.id).length < fakeSoll).length;
  if (fakeUnter && fakeSoll > 0) warnings.push({art: "fake", text: fakeUnter + " von " + fakeZiele.length + " Fakezielen unter dem Richtwert von " + fakeSoll + " Fakes"});
  // von Hand gewählte Stammesmitglieder ganz ohne Fake: Hinweis (sonst sind fehlende Fakes bei Mitgliedern kein Hinweis wert)
  const manuell = new Set(extra.filter(t => t.manuell).map(t => t.owner)), mitFake = new Set(fakes.filter(f => f.extra && f.t.manuell).map(f => f.t.owner));
  const ohne = [...manuell].filter(o => !mitFake.has(o)).length;
  if (ohne) warnings.push({art: "fake", text: ohne + " von Hand gewählte" + (ohne === 1 ? "s Stammesmitglied" : " Stammesmitglieder") + " ohne Fake: Laufzeit passt in keine Abschicksitzung oder Truppen reichen nicht"});
  if (herkunft) {
    const qs = fakeQuellen.filter(v => att.get(v.att).fakeModus !== "ziel"), unter = qs.filter(v => v.fakes < sollQ(v)).length;
    if (unter) warnings.push({art: "fake", text: unter + " von " + qs.length + " Herkunftsdörfern unter ihrer Fakezahl (Truppen, Fakelimit, Abschickzeiten oder zu wenige Fakeziele)"});
  }
  if (ohneSpaeher && (fakeZiele.length || extra.length || herkunft)) {
    // je Angreifer, damit klar ist, wem die Späher fehlen (10.11.2026)
    const je = [...att.values()].map(a => ({a, n: ohneSpaeherListe.filter(v => v.att === a.id).length, m: fakeQuellen.filter(v => v.att === a.id).length}))
      .filter(x => x.n).sort((x, y) => y.n - x.n).map(x => x.a.name + " " + x.n + " von " + x.m).join(", ");
    warnings.push({art: "fake", text: ohneSpaeher + (ohneSpaeher === 1 ? " Dorf" : " Dörfer") + " ohne freien Späher " + (ohneSpaeher === 1 ? "schickt" : "schicken") +
      " keine Fakes, jeder Fake braucht mindestens einen Späher (" + je + ")" + (cfg.spies_per_off > 0 && villages.some(offVerplant) ? "; Späher je Off sind vorher abgezogen" : "")});
  }

  /* ---- 6. Truppen zusammenstellen ---- */
  fakes.forEach(({v, f}) => { v.avail.catapult -= f.catapult; v.avail.spy -= f.spy; v.avail.ram -= f.ram; });
  const offEinheiten = v => {
    const o = emptyUnits();
    OFF_UNITS.forEach(u => { if (u !== "heavy" || v.heavyAsOff) { o[u] = Math.max(0, v.avail[u]); v.avail[u] -= o[u]; } });
    o.spy = Math.min(cfg.spies_per_off, Math.max(0, v.avail.spy)); v.avail.spy -= o.spy;
    return o;
  };
  const blocks = [];
  // AG-Begleitschutz zuerst (aus Dörfern ohne mitlaufende Off), dann die Offs
  const agBefehle = new Map();
  geadelt.forEach(t => {
    const liste = [];
    trains.get(t.id).forEach(g => {
      const ags = [];
      for (let i = 0; i < g.n; i++) { const u = emptyUnits(); u.snob = 1; ags.push(u); }
      if (!g.carriesOff) ags.forEach(u => Object.assign(u, addUnits(u, begleitschutz(g.v.avail, cfg.escort_pop, pop))));
      liste.push({g, ags});
    });
    agBefehle.set(t.id, liste);
  });
  geadelt.forEach(t => {
    agBefehle.get(t.id).forEach(({g, ags}) => {
      if (!g.carriesOff) return;
      const split = g.n === 2 ? cfg.split_two : cfg.split_full;
      if (split) {
        const off = offEinheiten(g.v);
        UNITS.forEach(u => {
          if (u === "snob") return;
          const je = Math.floor(off[u] / g.n), rest = off[u] - je * g.n;
          ags.forEach((a, i) => { a[u] += je + (i === 0 ? rest : 0); });
        });
      } else {
        for (let i = 1; i < g.n; i++) Object.assign(ags[i], addUnits(ags[i], begleitschutz(g.v.avail, cfg.escort_pop, pop)));
        Object.assign(ags[0], addUnits(ags[0], offEinheiten(g.v)));
      }
    });
  });

  /* ---- 7. Blöcke und Zeiten ---- */
  const item = (kind, v, t, units, unitSlow, offset, aktion) => {
    const tr = travelS(world, unitSlow, dist(v, t)) * 1000;
    return {kind, att: v.att, v, t, units, slow: unitSlow, travelMs: tr, offset, aktion};
  };
  let aktionNr = 0;
  geadelt.forEach(t => {
    const its = [];
    const offs = cleanOffs.get(t.id);
    offs.forEach((o, i) => its.push(item("clean", o, t, offEinheiten(o), langsamste(null), i * cfg.gap_clean_ms, ++aktionNr)));
    let off = offsetErstesAG(offs.length);
    agBefehle.get(t.id).forEach(({g, ags}) => {
      const a = ++aktionNr;
      ags.forEach((u, i) => {
        its.push(item("ag", g.v, t, u, "snob", off, a));
        off += i < ags.length - 1 ? world.attack_gap_ms : cfg.gap_ag_ms;
      });
    });
    // die Clean-Off läuft mit der langsamsten enthaltenen Einheit
    its.forEach(it => { if (it.kind === "clean") { it.slow = langsamste(it.units, world); it.travelMs = travelS(world, it.slow, dist(it.v, t)) * 1000; } });
    blocks.push({art: "ag", key: "ag:" + t.id, ziel: t, items: its});
  });
  restZiele.forEach(({o, t}) => {
    const u = offEinheiten(o);
    blocks.push({art: "rest", key: "rest:" + t.id + ":" + o.id, ziel: t, items: [item("rest", o, t, u, langsamste(u, world), 0, ++aktionNr)]});
  });
  fakes.forEach(({v, t, f, frueh}) => {
    const u = emptyUnits(); u.catapult = f.catapult; u.spy = f.spy; u.ram = f.ram;
    blocks.push({art: "fake", key: "fake:" + t.id + ":" + v.id, ziel: t, frueh: !!frueh, items: [item("fake", v, t, u, "ram", 0, ++aktionNr)]});
  });

  const zeit = zeitenPlanen(blocks, Object.assign({}, zeitCtx, {warnings, vorgabe, fakeAnker, fakeFrueh, schnell: !!input._schnell}));
  const items = [];
  blocks.forEach(b => {
    if (b.T == null) return;
    b.items.forEach(it => {
      it.arrivalMs = b.T + it.offset;
      it.sendMs = it.arrivalMs - it.travelMs;
      items.push(it);
    });
  });
  items.sort((a, b) => a.sendMs - b.sendMs || a.offset - b.offset);

  // Hinweise je Ziel
  const zielInfo = ziele.map(t => {
    const b = blocks.find(x => x.art === "ag" && x.ziel.id === t.id);
    if (!b || b.T == null) return {id: t.id, x: t.x, y: t.y, geadelt: false, grund: ausgeschlossen.get(t.id) || (b ? "keine gemeinsame Ankunftszeit" : "nicht adelbar")};
    const offs = b.items.filter(i => i.kind === "clean"), ags = b.items.filter(i => i.kind === "ag");
    const ersteAG = Math.min(...ags.map(i => i.sendMs));
    const zuerst = offs.every(o => o.sendMs + cfg.off_first_lead_s * 1000 <= ersteAG);
    if (cfg.off_first && !zuerst) warnings.push({art: "reihenfolge", ziel: t.id, text: "Ziel " + t.x + "|" + t.y + ": AG vor der Clean-Off abgeschickt"});
    return {id: t.id, x: t.x, y: t.y, geadelt: true, clean: offs.length, ags: ags.length, offZuerst: zuerst, T: b.T};
  });
  items.forEach(it => {
    if (istNacht(world, it.arrivalMs)) it.nacht = true;
    // Abschickzeit außerhalb der Wunschzeiträume und nachts (v0.5): markiert, damit der Spieler es sieht
    const w = att.get(it.att).wunsch;
    if (w.length && !ivHas(w, it.sendMs)) it.ausserhalb = true;
    if (istNacht(world, it.sendMs)) it.nachtSenden = true;
    // Laufzeit über dem Richtwert (Dennis 11.11.2026): Offs mit ihrem Wert, AGs (auch mit der Off im Train) mit dem der AGs
    if (it.kind !== "fake" && it.travelMs > (it.kind === "ag" ? maxAgS : maxOffS) * 1000) it.zuLang = true;
  });
  const zuLang = items.filter(it => it.zuLang);
  if (zuLang.length) warnings.push({art: "laufzeit", text: new Set(zuLang.map(it => it.att + ":" + it.aktion)).size +
    " Abschickvorgänge mit Laufzeit über dem Richtwert (" + [maxOffS < Infinity ? "Offs " + cfg.max_lauf_off_h + " h" : "", maxAgS < Infinity ? "AGs " + cfg.max_lauf_ag_h + " h" : ""].filter(Boolean).join(", ") +
    "), nötig für diese Ziele"});
  if (vorlaufMs && T0 < Infinity) {
    const fr = items.filter(it => it.kind === "fake"), erste = fr.length ? Math.min(...fr.map(it => it.sendMs)) : null;
    const kern1 = items.filter(it => it.kind !== "fake").map(it => it.sendMs);
    const t1 = kern1.length ? Math.min(...kern1) : T0;
    const ohne = [...att.values()].filter(a => fakeFrueh.has(a.id) && !fakeFrueh.get(a.id).length).map(a => a.name);
    warnings.push({art: "vorlauf", text: "Fake-Vorlauf " + cfg.fake_vorlauf_h + " h: erste Off oder AG " + fmtZeit(t1).slice(0, 16) +
      (erste != null ? ", erste Fakes " + fmtZeit(erste).slice(0, 16) + " (" + (Math.round((t1 - erste) / 360000) / 10).toLocaleString("de-DE") + " h vorher)" : ", keine Fakes") +
      (ohne.length ? "; so früh keine Fakes möglich für " + ohne.join(", ") : "")});
  }
  const sitzungen = sitzungsListe(items, att, world);
  const hinweise = streng ? [] : zeitHinweise(items, att, world);
  const aussenKern = items.filter(it => it.ausserhalb && it.kind !== "fake");
  if (aussenKern.length) warnings.push({art: "ausserhalb", text: new Set(aussenKern.map(it => it.att + ":" + it.aktion)).size +
    " Abschickvorgänge für Offs und AGs außerhalb der Abschickzeiträume" + (aussenKern.some(it => it.nachtSenden) ? ", davon nachts" : "") + ", siehe Hinweise je Angreifer"});
  if (items.some(it => it.nacht)) warnings.push({art: "nacht", text: "Ankünfte im Nachtbonus (" + world.night.start_hour + " bis " + world.night.end_hour + " Uhr)"});
  if (input.now != null && items.some(it => it.sendMs < input.now)) warnings.push({art: "vergangen", text: "Abschickzeiten in der Vergangenheit"});

  return {items, ziele: zielInfo, freieOffs: freieOffs.map(v => ({id: v.id, x: v.x, y: v.y, name: v.name, att: v.att, offPop: v.offPop})),
          freieAGs: agVillages.map(v => ({id: v.id, x: v.x, y: v.y, att: v.att, frei: v.nobles - verplanteAGs(v, trains)})).filter(x => x.frei > 0),
          warnings, stats: statistik(items, zielInfo, att), cfg, k, form, zeit, knapp, sitzungen, hinweise,
          bewertung: bewertung(items, zielInfo, att, world)};
}

function addUnits(a, b) { const o = Object.assign({}, a); Object.keys(b).forEach(u => { o[u] = (o[u] || 0) + b[u]; }); return o; }
function verplanteAGs(v, trains) {
  let n = 0;
  trains.forEach(gs => gs.forEach(g => { if (g.v.id === v.id) n += g.n; }));
  return n;
}
/** Langsamste Einheit eines Befehls (für Laufzeit und slowest_unit); Ramme vor Katapult bei gleichem Tempo. */
function langsamste(units, world) {
  if (!units) return "ram";
  const sp = (world || WORLD_DEFAULT).speed;
  let best = null;
  UNITS.forEach(u => { if ((units[u] || 0) > 0 && (best == null || sp[u] > sp[best])) best = u; });
  return best || "ram";
}

/** Zulässige Blockbeginne T eines Befehls: T + offset im Ankunftszeitraum (fester Zeitpunkt: T darauf) und
    T + offset − Laufzeit im Abschickfenster. */
function zeitBasis(A, fenster, travelMs, offset) {
  const ank = A.from === A.to ? [[A.from + offset, A.to + offset]] : [[A.from, A.to]];
  return ivShift(ivIntersect(ank, ivShift(fenster, travelMs)), -offset);
}

/** Zeitpunkt, der in den meisten Intervallen liegt; innerhalb der Wunschzeiträume zählt jedes Intervall 1,5-fach.
    Bei Gleichstand die Mitte der besten Punkte. null bei leerer Liste. */
function dichtesterPunkt(ivs, wunsch) {
  if (!ivs.length) return null;
  const liste = ivs.length > 3000 ? ivs.filter((x, i) => i % Math.ceil(ivs.length / 3000) === 0) : ivs;
  const punkte = [];
  liste.forEach(([a, b]) => { punkte.push(a, b, (a + b) / 2); });
  (wunsch || []).forEach(([a, b]) => { punkte.push(a, b); });
  let best = -1, bp = [];
  // Zählung per Binärsuche statt über alle Intervalle (v0.6, reine Fake-Pläne mit mehreren Zeiträumen): Intervalle mit
  // a ≤ p ≤ b = (Anfänge ≤ p) minus (Enden < p); gleiches Ergebnis wie die direkte Zählung
  const anf = liste.map(x => x[0]).sort((p, q) => p - q), end = liste.map(x => x[1]).sort((p, q) => p - q);
  const zaehl = (arr, p, strikt) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (strikt ? arr[m] < p : arr[m] <= p) lo = m + 1; else hi = m; } return lo; };
  punkte.forEach(p => {
    const n = zaehl(anf, p, false) - zaehl(end, p, true);
    if (!n) return;
    const w = n * (ivHas(wunsch || [], p) ? 1.5 : 1);
    if (w > best + 1e-9) { best = w; bp = [p]; } else if (Math.abs(w - best) <= 1e-9) bp.push(p);
  });
  if (!bp.length) return null;
  bp.sort((x, y) => x - y);
  return bp[bp.length >> 1];
}
/** Sitzungen aus sortierten Abschickzeiten: Pausen über SITZUNG_PAUSE_MS trennen. */
function sitzungenAus(arr) {
  const out = [];
  arr.forEach(s => { const l = out[out.length - 1]; if (l && s - l[1] <= SITZUNG_PAUSE_MS) l[1] = s; else out.push([s, s]); });
  return out;
}
function einsortieren(arr, s) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < s) lo = m + 1; else hi = m; }
  arr.splice(lo, 0, s);
}
function nachbarAbstand(arr, s) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < s) lo = m + 1; else hi = m; }
  return Math.min(lo < arr.length ? arr[lo] - s : Infinity, lo > 0 ? s - arr[lo - 1] : Infinity);
}

/** Ankunftszeit je Block (v0.5, Spezifikation 15): Offs und AGs so legen, dass jeder Angreifer möglichst wenige und
    kurze Sitzungen hat, innerhalb seiner Wunschzeiträume, mit Mindestabstand (hart) und Mindestabstandtendenz (weich).
    Danach füllen die Fakes Lücken in diesen Sitzungen. Suche Block für Block über ein Raster der zulässigen Zeiten,
    mehrere Startlagen, der beste Plan bleibt. */
function zeitenPlanen(blocks, ctx) {
  const {A, att, gapMs, rng, warnings, world} = ctx;
  const R = ctx.R || RANGFOLGE.standard;
  const zielMs = Math.max(gapMs, ctx.zielMs || 0);
  const fest = A.from === A.to;
  blocks.forEach(b => {
    // Fakes in jedem Ankunftszeitraum (v0.6), Offs und AGs im ersten
    const fen = b.art === "fake" && ctx.ANK && ctx.ANK.length > 1 ? ctx.ANK : [A];
    let s = [];
    fen.forEach(a => {
      let x = [[a.from, a.to]];
      b.items.forEach(it => { x = ivIntersect(x, zeitBasis(a, att.get(it.att).fenster, it.travelMs, it.offset)); });
      s = s.concat(x);
    });
    b.tset = fen.length > 1 ? ivNorm(s) : s;
    const akt = new Map();
    b.items.forEach(it => { if (!akt.has(it.aktion)) akt.set(it.aktion, {att: it.att, rel: it.offset - it.travelMs}); });
    b.aktionen = [...akt.values()];
    b.innenDicht = false; b.T = null;
    const a = b.aktionen;
    for (let i = 0; i < a.length && !b.innenDicht; i++)
      for (let j = i + 1; j < a.length; j++) if (a[i].att === a[j].att && Math.abs(a[i].rel - a[j].rel) < gapMs) { b.innenDicht = true; break; }
  });
  let ok = 0, ohne = 0, gezwungen = 0, gestrichen = 0;
  const kern = [], fakes = [];
  blocks.forEach(b => {
    if (b.tset.length) { (b.art === "fake" ? fakes : kern).push(b); return; }
    if (b.art === "fake") { gestrichen++; return; }
    ohne++;
    warnings.push({art: "zeit", ziel: b.ziel.id, text: (b.art === "ag" ? "Ziel " : "Off auf ") + b.ziel.x + "|" + b.ziel.y + ": keine passende Ankunftszeit"});
  });

  // Kosten: Lage zu den Wunschzeiträumen je Abschickvorgang, Sitzungen und Abstände je Angreifer
  const ausK = (a, s) => {
    if (ctx.streng) return 0;
    const d = ivAbstand(att.get(a).wunsch, s);
    return d ? (R.aus + d / 60000 * R.ausMin) * (istNacht(world, s) ? R.nacht : 1) : 0;
  };
  const sitzK = arr => {
    if (!arr.length) return 0;
    let c = 0, st = arr[0];
    for (let i = 1; i < arr.length; i++) {
      const g = arr[i] - arr[i - 1];
      if (g > SITZUNG_PAUSE_MS) { c += R.sitzung + (arr[i - 1] - st) / 60000 * R.minute; st = arr[i]; }
      else if (g < gapMs) c += HART;
      else if (g < zielMs) c += (zielMs - g) / 1000 * R.eng;
    }
    return c + R.sitzung + (arr[arr.length - 1] - st) / 60000 * R.minute;
  };
  const proAtt = new Map();
  kern.forEach(b => b.aktionen.forEach(x => { if (!proAtt.has(x.att)) proAtt.set(x.att, new Set()); proAtt.get(x.att).add(b); }));
  const T = new Map();
  const sendsVon = (a, ersatz, tNeu) => {
    const arr = [];
    proAtt.get(a).forEach(b => {
      const t = b === ersatz ? tNeu : T.get(b);
      if (t != null) b.aktionen.forEach(x => { if (x.att === a) arr.push(t + x.rel); });
    });
    return arr.sort((p, q) => p - q);
  };
  // je Block die Abstände seiner Abschickvorgänge je Angreifer (sortiert); beim Bewerten eines Kandidaten werden sie in die
  // sortierten Abschickzeiten der übrigen Blöcke eingemischt, ohne neu zu sortieren
  kern.forEach(b => {
    b.relJe = new Map();
    b.aktionen.forEach(x => { if (!b.relJe.has(x.att)) b.relJe.set(x.att, []); b.relJe.get(x.att).push(x.rel); });
    b.relJe.forEach(l => l.sort((p, q) => p - q));
  });
  const mischen = (basis, rel, t) => {
    const out = new Array(basis.length + rel.length);
    let i = 0, j = 0, k = 0;
    while (i < basis.length || j < rel.length) {
      if (j >= rel.length || (i < basis.length && basis[i] <= rel[j] + t)) out[k++] = basis[i++];
      else out[k++] = rel[j++] + t;
    }
    return out;
  };
  const blockKosten = (b, tNeu, basen) => {
    let c = 0;
    b.relJe.forEach((rel, a) => { c += sitzK(basen ? mischen(basen.get(a), rel, tNeu) : sendsVon(a, b, tNeu)); });
    b.aktionen.forEach(x => { c += ausK(x.att, tNeu + x.rel); });
    return c;
  };
  const basenOhne = b => {
    const m = new Map();
    b.relJe.forEach((_, a) => {
      const arr = [];
      proAtt.get(a).forEach(o => { if (o !== b && T.get(o) != null) o.aktionen.forEach(x => { if (x.att === a) arr.push(T.get(o) + x.rel); }); });
      m.set(a, arr.sort((p, q) => p - q));
    });
    return m;
  };
  const gesamt = () => {
    let c = 0;
    proAtt.forEach((_, a) => { c += sitzK(sendsVon(a, null, null)); });
    kern.forEach(b => b.aktionen.forEach(x => { c += ausK(x.att, T.get(b) + x.rel); }));
    return c;
  };
  const raster = ctx.schnell ? 60000 : 30000, fein = ctx.schnell ? 10 : 30;
  const kandidaten = b => {
    const out = [];
    b.tset.forEach(([l, u]) => {
      const lo = Math.ceil(l / 1000) * 1000, hi = Math.floor(u / 1000) * 1000;
      if (hi < lo) { out.push(l); return; }
      const n = Math.max(1, Math.min(240, Math.round((hi - lo) / raster)));
      for (let i = 0; i <= n; i++) out.push(lo + Math.round((hi - lo) * i / n / 1000) * 1000);
    });
    return out;
  };
  const naechster = (b, w) => {
    let best = null, bd = Infinity;
    b.tset.forEach(([l, u]) => {
      const lo = Math.ceil(l / 1000) * 1000, hi = Math.floor(u / 1000) * 1000;
      const c = hi >= lo ? Math.min(hi, Math.max(lo, Math.round(w / 1000) * 1000)) : l;
      if (Math.abs(c - w) < bd) { bd = Math.abs(c - w); best = c; }
    });
    return best;
  };
  const startLage = (b, art) => {
    if (art === "vorgabe" && ctx.vorgabe && ctx.vorgabe.has(b.key) && ivHas(b.tset, ctx.vorgabe.get(b.key))) return ctx.vorgabe.get(b.key);
    if (art === "frueh") return naechster(b, b.tset[0][0]);
    if (art === "spaet") return naechster(b, b.tset[b.tset.length - 1][1]);
    const w = b.aktionen.filter(x => ctx.anker && ctx.anker.has(x.att)).map(x => ctx.anker.get(x.att) - x.rel).sort((p, q) => p - q);
    return naechster(b, w.length ? w[w.length >> 1] : (b.tset[0][0] + b.tset[b.tset.length - 1][1]) / 2);
  };
  // Reihenfolge: Blöcke mit vielen Abschickvorgängen zuerst, Gleichstand per Zufall
  const reihe = kern.map(b => ({b, r: rng()})).sort((p, q) => q.b.aktionen.length - p.b.aktionen.length || p.r - q.r).map(x => x.b);
  const lauf = art => {
    T.clear();
    kern.forEach(b => T.set(b, startLage(b, art)));
    if (!fest) for (let pass = 0; pass < (ctx.schnell ? 2 : 4); pass++) {
      let geaendert = false;
      for (const b of reihe) {
        const basen = basenOhne(b);
        let bestT = T.get(b), bestC = blockKosten(b, bestT, basen);
        for (const c of kandidaten(b)) { const k = blockKosten(b, c, basen); if (k < bestC - 1e-9) { bestC = k; bestT = c; } }
        for (let d = -fein; d <= fein; d++) {
          const c = bestT + d * 1000;
          if (d && ivHas(b.tset, c)) { const k = blockKosten(b, c, basen); if (k < bestC - 1e-9) { bestC = k; bestT = c; } }
        }
        if (bestT !== T.get(b)) { T.set(b, bestT); geaendert = true; }
      }
      if (!geaendert) break;
    }
    return {c: gesamt(), T: new Map(T)};
  };
  const starts = ctx.vorgabe ? ["vorgabe", "anker"] : ctx.schnell ? ["anker"] : ["anker", "frueh", "spaet"];
  let best = null;
  if (kern.length) starts.forEach(art => { const r = lauf(art); if (!best || r.c < best.c - 1e-9) best = r; });
  const sends = new Map();
  kern.forEach(b => {
    b.T = best.T.get(b); ok++;
    if (b.innenDicht) { b.gapVerletzt = true; }
    b.aktionen.forEach(x => { if (!sends.has(x.att)) sends.set(x.att, []); sends.get(x.att).push(b.T + x.rel); });
  });
  sends.forEach(arr => arr.sort((p, q) => p - q));
  kern.forEach(b => {
    if (b.gapVerletzt || b.aktionen.some(x => { const arr = sends.get(x.att), s = b.T + x.rel;
      return arr.some(y => y !== s && Math.abs(y - s) < gapMs); })) { b.gapVerletzt = true; gezwungen++; }
  });
  const sitzungen = new Map();
  sends.forEach((arr, a) => sitzungen.set(a, sitzungenAus(arr)));

  // Fakes in die Lücken der Sitzungen (mit Rand); reine Fake-Spieler in ihre eine Fake-Sitzung
  if (!ctx.nurKern) {
    const fruehVon = a => (ctx.fakeFrueh && ctx.fakeFrueh.get(a)) || [];
    const erlaubt = a => {
      const s = sitzungen.get(a);
      if (s && s.length) return ivNorm(s.map(([x, y]) => [x - FAKE_RAND_MS, y + FAKE_RAND_MS]).concat(fruehVon(a)));
      if (ctx.streng) return [[0, Number.MAX_SAFE_INTEGER]];
      const fa = ctx.fakeAnker && ctx.fakeAnker.get(a);
      return fa && fa.length ? ivNorm(fa.concat(fruehVon(a))) : [[0, Number.MAX_SAFE_INTEGER]];
    };
    const laenge = l => l.reduce((x, y) => x + y[1] - y[0], 0);
    fakes.map(b => ({b, r: rng(), l: laenge(b.tset)})).sort((p, q) => p.l - q.l || p.r - q.r).forEach(({b}) => {
      const x = b.aktionen[0];
      if (!sends.has(x.att)) sends.set(x.att, []);
      const arr = sends.get(x.att);
      const nurFrueh = b.frueh ? ivIntersect(ivShift(b.tset, x.rel), fruehVon(x.att)) : [];      // Fake-Vorlauf
      const bereich = nurFrueh.length ? nurFrueh : ivIntersect(ivShift(b.tset, x.rel), erlaubt(x.att));
      const wunsch = ctx.streng ? [] : att.get(x.att).wunsch;
      const spanne = arr.length ? [arr[0], arr[arr.length - 1]] : null;
      let bestS = null, bestW = -Infinity;
      const pruef = c => {
        c = Math.round(c / 1000) * 1000;
        if (!ivHas(bereich, c) || !ivHas(b.tset, c - x.rel)) return;
        const d = nachbarAbstand(arr, c);
        if (d < gapMs) return;
        // die frühe Fake-Sitzung (Vorlauf) zählt wie die Spanne der übrigen Befehle, sonst bliebe sie leer
        const raus = spanne && !ivHas(fruehVon(x.att), c) ? Math.max(0, spanne[0] - c, c - spanne[1]) : 0;
        const w = Math.min(d, zielMs * 2) / 1000 * 10 - raus / 60000 * 2 + (ivHas(wunsch, c) ? 5 : 0);
        if (w > bestW) { bestW = w; bestS = c; }
      };
      bereich.forEach(([l, u]) => {
        pruef(l); pruef(u);
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] < l - zielMs * 2 || arr[i] > u + zielMs * 2) continue;
          pruef(arr[i] + zielMs); pruef(arr[i] - zielMs);
          if (i + 1 < arr.length) pruef((arr[i] + arr[i + 1]) / 2);
        }
        if (!arr.length) pruef((l + u) / 2);
      });
      if (bestS == null) { gestrichen++; return; }
      b.T = bestS - x.rel; ok++;
      einsortieren(arr, bestS);
    });
    if (gestrichen) warnings.push({art: "fake", text: gestrichen + " Fakes entfallen: kein Platz im Mindestabstand innerhalb der Abschicksitzungen"});
  }
  if (gezwungen) warnings.push({art: "abstand", text: gezwungen + " Ziele mit Befehlen ohne Mindestabstand von " + gapMs / 1000 + " s (fester Zeitpunkt oder zu dichte Laufzeiten)"});
  return {ok, ohne, gezwungen, gestrichen, sitzungen};
}

/** Sitzungen je Angreifer aus den fertigen Befehlen: Beginn, Ende, Abschickvorgänge, nachts, außerhalb. */
function sitzungsListe(items, att, world) {
  const jeAtt = new Map();
  const gesehen = new Set();
  items.forEach(it => {
    const key = it.att + ":" + it.aktion;
    if (gesehen.has(key)) return;
    gesehen.add(key);
    if (!jeAtt.has(it.att)) jeAtt.set(it.att, []);
    jeAtt.get(it.att).push(it);
  });
  const out = {};
  att.forEach(a => {
    const its = (jeAtt.get(a.id) || []).slice().sort((p, q) => p.sendMs - q.sendMs);
    const liste = [];
    its.forEach(it => {
      const l = liste[liste.length - 1];
      if (!l || it.sendMs - l.bis > SITZUNG_PAUSE_MS) liste.push({von: it.sendMs, bis: it.sendMs, n: 0, kern: 0, fakes: 0, nachts: false, ausserhalb: 0});
      const z = liste[liste.length - 1];
      z.bis = it.sendMs; z.n++;
      if (it.kind === "fake") z.fakes++; else z.kern++;
      if (it.nachtSenden) z.nachts = true;
      if (it.ausserhalb && it.kind !== "fake") z.ausserhalb++;
    });
    out[a.id] = liste;
  });
  return out;
}

/** Hinweise je Angreifer: wie die Abschickzeiträume für die Offs und AGs außerhalb zu erweitern wären. */
function zeitHinweise(items, att, world) {
  const hm = ms => { const p = berlinParts(ms); return pad(p.d) + "." + pad(p.mo) + ". " + pad(p.h) + ":" + pad(p.mi); };
  const ab5 = ms => Math.floor(ms / 300000) * 300000, auf5 = ms => Math.ceil(ms / 300000) * 300000;
  const out = [];
  att.forEach(a => {
    const s = [...new Set(items.filter(it => it.att === a.id && it.ausserhalb && it.kind !== "fake").map(it => it.sendMs))].sort((p, q) => p - q);
    if (!s.length) return;
    sitzungenAus(s).forEach(([von, bis]) => {
      const n = s.filter(x => x >= von && x <= bis).length;
      const nachts = s.some(x => x >= von && x <= bis && istNacht(world, x));
      const v5 = ab5(von), b5 = auf5(bis + 1);
      let text = null;
      let nah = null, nd = Infinity;
      a.wunsch.forEach(w => { const d = bis < w[0] ? w[0] - bis : von - w[1]; if (d >= 0 && d < nd) { nd = d; nah = w; } });
      if (nah && nd <= 3 * 3600000) {
        text = bis < nah[0] ? "Zeitraum " + hm(nah[0]) + " bis " + hm(nah[1]) + " früher beginnen: ab " + hm(v5)
                            : "Zeitraum " + hm(nah[0]) + " bis " + hm(nah[1]) + " länger: bis " + hm(b5);
      } else text = "zusätzlicher Zeitraum " + hm(v5) + " bis " + hm(b5);
      out.push({att: a.id, name: a.name, von: v5, bis: b5, n, nachts, text: text + " (" + n + (n === 1 ? " Abschickvorgang" : " Abschickvorgänge") + (nachts ? ", nachts" : "") + ")"});
    });
  });
  return out;
}

/** Kennzahlen für den Vergleich von Plänen (nur Offs und AGs). */
function bewertung(items, ziele, att, world) {
  const kern = items.filter(it => it.kind !== "fake");
  const vorg = new Map();
  kern.forEach(it => { const k = it.att + ":" + it.aktion; if (!vorg.has(k)) vorg.set(k, it); });
  let sitz = 0, dauer = 0;
  att.forEach(a => {
    const arr = [...vorg.values()].filter(it => it.att === a.id).map(it => it.sendMs).sort((p, q) => p - q);
    sitzungenAus(arr).forEach(([x, y]) => { sitz++; dauer += (y - x) / 60000; });
  });
  const v = [...vorg.values()];
  return {geadelt: ziele.filter(z => z.geadelt).length, aussen: v.filter(it => it.ausserhalb).length,
          nachtAussen: v.filter(it => it.ausserhalb && it.nachtSenden).length, sitzungen: sitz, dauerMin: Math.round(dauer)};
}
/** true, wenn Bewertung a besser ist als b, je Rangfolge. */
function besser(a, b, rangfolge) {
  const reihe = rangfolge === "nachtruhe" ? ["nachtAussen", "geadelt", "aussen", "sitzungen", "dauerMin"]
              : rangfolge === "sitzungen" ? ["geadelt", "aussen", "sitzungen", "dauerMin", "nachtAussen"]
              : ["geadelt", "aussen", "nachtAussen", "sitzungen", "dauerMin"];
  for (const k of reihe) {
    const x = k === "geadelt" ? -a[k] : a[k], y = k === "geadelt" ? -b[k] : b[k];
    if (x !== y) return x < y;
  }
  return false;
}
/** Bewertung eines anderen Ankunftszeitraums: Plan nur mit Offs und AGs, schnelle Zeitsuche. null bei Fehler. */
function bewerteAnkunft(input, A) {
  const cfg = Object.assign({}, input.cfg, {fakes_per_village: 0, extra_fakes: false});
  const r = plan(Object.assign({}, input, {arrival: A, cfg, fakeTargets: [], extraFakeTargets: [], _schnell: true}));
  return r.fehler ? null : r.bewertung;
}
/** Andere Ankunftszeiträume gleicher Länge für den Vorschlag: 15-Minuten-Schritte bis 12 h vor und nach der Eingabe,
    nie im Nachtbonus (Dennis 21:26) und nicht so früh, dass schon vor jetzt abgeschickt werden müsste. */
function ankunftKandidaten(A, world, opt) {
  const o = Object.assign({schrittMin: 15, spanneH: 12, jetzt: null, mindestLaufMs: 0}, opt);
  const L = A.to - A.from, out = [];
  for (let d = -o.spanneH * 60; d <= o.spanneH * 60; d += o.schrittMin) {
    if (!d) continue;
    const from = A.from + d * 60000, to = from + L;
    if (o.jetzt != null && from - o.mindestLaufMs < o.jetzt + 60000) continue;
    let nacht = false;
    for (let t = from; t <= to && !nacht; t += 5 * 60000) if (istNacht(world, t)) nacht = true;
    if (nacht || istNacht(world, to)) continue;
    out.push({from, to});
  }
  return out;
}

function statistik(items, ziele, att) {
  const je = {};
  att.forEach(a => { je[a.id] = {name: a.name, clean: 0, ag: 0, fake: 0, rest: 0, vorgaenge: 0}; });
  const aktionen = new Set();
  items.forEach(it => {
    const s = je[it.att];
    if (!s) return;
    s[it.kind]++;
    if (!aktionen.has(it.aktion)) { aktionen.add(it.aktion); s.vorgaenge++; }
  });
  return {geadelt: ziele.filter(z => z.geadelt).length, ziele: ziele.length, je};
}

/* ---------- Prüfung ---------- */
/** Prüft einen fertigen Plan gegen die Regeln der Spezifikation. Gibt eine Liste von Verstößen zurück. */
function pruefePlan(res, input) {
  const world = input.world || makeWorld();
  const cfg = Object.assign({}, CFG_DEFAULT, input.cfg);
  const v = [];
  const ANK = [].concat(...ankunftsListe(input).map(a => tagesTeile(world, a))), A = ANK[0];
  const drin = (a, ms) => ms >= a.from && ms <= a.to + (a.from === a.to ? 10000 : 0);
  const fenster = new Map((input.attackers || []).map(a => [a.id, ivNorm(a.windows && a.windows.length ? a.windows : (input.windows || []))]));
  const gap = cfg.min_send_gap_s * 1000;
  // Einheiten je Dorf
  const verbrauch = new Map();
  res.items.forEach(it => {
    if (it.kind === "fake" ? !ANK.some(a => drin(a, it.arrivalMs)) : !drin(A, it.arrivalMs)) v.push("Ankunft außerhalb des Zeitraums: " + it.v.id + " → " + it.t.id);
    if (istNacht(world, it.arrivalMs)) v.push("Ankunft im Nachtbonus: " + it.v.id + " → " + it.t.id);
    // v0.5: Zeiträume sind Wunsch, Befehle außerhalb müssen markiert sein; „streng“: nie außerhalb
    if (!ivHas(fenster.get(it.att) || [], it.sendMs) && (cfg.zeitraeume === "streng" || !it.ausserhalb) && (fenster.get(it.att) || []).length)
      v.push("Abschickzeit außerhalb der Fenster ohne Markierung: " + it.v.id + " → " + it.t.id);
    if (input.now != null && it.sendMs < input.now) v.push("Abschickzeit vor der Berechnung: " + it.v.id);
    if (it.sendMs !== it.arrivalMs - travelS(world, it.slow, dist(it.v, it.t)) * 1000) v.push("Laufzeit weicht von DS-Ultimate ab");
    if (it.kind === "ag" && dist(it.v, it.t) > world.snob_max_dist + 1e-9) v.push("AG außerhalb der Reichweite: " + it.v.id);
    if (it.kind === "fake") {
      const u = it.units;
      if (u.catapult + u.ram < 1) v.push("Fake ohne Katapult und Ramme");
      if (u.spy < 1) v.push("Fake ohne Späher: " + it.v.id);
      const rMax = (input.attackers || []).filter(a => a.id === it.att).map(a => a.rammenMax == null || a.rammenMax === "" ? 1 : +a.rammenMax)[0];
      if (u.ram > (rMax == null ? 1 : rMax)) v.push("Fake mit mehr Rammen als erlaubt: " + it.v.id);
      const andere = UNITS.filter(x => !["catapult", "spy", "ram"].includes(x) && u[x] > 0);
      if (andere.length) v.push("Fake mit anderen Einheiten: " + andere.join(", "));
      const vv = (input.attackers || []).flatMap(a => a.villages).find(x => x.id === it.v.id);
      const min = Math.ceil(vv.pts * world.fake_limit / 100);
      if (popOf(u, world.pop) < min) v.push("Fake unter dem Fakelimit: " + it.v.id);
    }
    if (!verbrauch.has(it.v.id)) verbrauch.set(it.v.id, emptyUnits());
    const s = verbrauch.get(it.v.id);
    UNITS.forEach(u => { s[u] += it.units[u] || 0; });
  });
  (input.attackers || []).forEach(a => a.villages.forEach(x => {
    const s = verbrauch.get(x.id);
    if (!s) return;
    UNITS.forEach(u => {
      const max = u === "snob" ? (x.nobles != null ? x.nobles : x.units.snob) : x.units[u];
      if (s[u] > max) v.push("Mehr " + u + " verplant als vorhanden in " + x.id + ": " + s[u] + " > " + max);
    });
  }));
  // Mindestabstand je Angreifer zwischen Abschickvorgängen
  const akt = new Map();
  res.items.forEach(it => { const key = it.att + ":" + it.aktion; if (!akt.has(key)) akt.set(key, {att: it.att, s: it.sendMs}); });
  const jeAtt = new Map();
  akt.forEach(x => { if (!jeAtt.has(x.att)) jeAtt.set(x.att, []); jeAtt.get(x.att).push(x.s); });
  jeAtt.forEach((arr, a) => {
    arr.sort((p, q) => p - q);
    for (let i = 1; i < arr.length; i++) if (arr[i] - arr[i - 1] < gap) v.push("Mindestabstand verletzt bei " + a);
  });
  // Einstellungen je Spieler: höchstens N Clean-Offs je Ziel („beitrag“), höchstens N Fakes je Dorf („dorf“)
  (input.attackers || []).forEach(a => {
    const n = a.cleanN != null && a.cleanN !== "" ? +a.cleanN : null, f = a.fakeN != null && a.fakeN !== "" ? +a.fakeN : null;
    if (a.cleanModus === "beitrag" && n != null) {
      const je = new Map();
      res.items.forEach(it => { if (it.kind === "clean" && it.att === a.id) je.set(it.t.id, (je.get(it.t.id) || 0) + 1); });
      je.forEach((x, z) => { if (x > n) v.push("Mehr als " + n + " Clean-Offs von " + a.id + " auf " + z); });
    }
    if (a.fakeModus === "dorf" && f != null) {
      const je = new Map();
      res.items.forEach(it => { if (it.kind === "fake" && it.att === a.id) je.set(it.v.id, (je.get(it.v.id) || 0) + 1); });
      je.forEach((x, d) => { if (x > f) v.push("Mehr als " + f + " Fakes aus Dorf " + d); });
    }
  });
  // je Ziel: Clean-Off vor dem ersten AG, AGs aus einem Dorf im Spielabstand
  const jeZiel = new Map();
  res.items.forEach(it => { if (it.kind === "ag" || it.kind === "clean") { if (!jeZiel.has(it.t.id)) jeZiel.set(it.t.id, []); jeZiel.get(it.t.id).push(it); } });
  jeZiel.forEach((its, z) => {
    const offs = its.filter(i => i.kind === "clean"), ags = its.filter(i => i.kind === "ag");
    if (ags.length && !offs.length) v.push("Ziel " + z + " ohne Clean-Off");
    if (ags.length && offs.length && Math.max(...offs.map(i => i.arrivalMs)) >= Math.min(...ags.map(i => i.arrivalMs))) v.push("Clean-Off nicht vor dem ersten AG: " + z);
    const jeDorf = new Map();
    ags.forEach(i => { if (!jeDorf.has(i.v.id)) jeDorf.set(i.v.id, []); jeDorf.get(i.v.id).push(i.arrivalMs); });
    jeDorf.forEach(arr => { arr.sort((p, q) => p - q); for (let i = 1; i < arr.length; i++) if (arr[i] - arr[i - 1] < world.attack_gap_ms) v.push("AGs aus einem Dorf enger als " + world.attack_gap_ms + " ms: " + z); });
  });
  return v;
}

/* ---------- Export ---------- */
/** Befehle für einen Export: art „alle“, „angriff“ (Clean-Offs, Offs, AGs) oder „fake“, wahlweise nur ein Angreifer. */
function exportAuswahl(items, art, attId) {
  return items.filter(it => (attId == null || it.att === attId) &&
    (art === "fake" ? it.kind === "fake" : art === "angriff" ? it.kind !== "fake" : true));
}

/** Dorfliste: Koordinaten je Dorf, mit oder ohne Namen, auch eingefügte Links wie „[Name (639|602) K66](…)“. */
function parseKoordListe(text) {
  const keys = [], seen = new Set(), re = /(\d{1,3})\|(\d{1,3})/g;
  let doppelt = 0, m;
  while ((m = re.exec(String(text || ""))) !== null) {
    const k = +m[1] * 1000 + +m[2];
    if (seen.has(k)) { doppelt++; continue; }
    seen.add(k); keys.push(k);
  }
  return {keys, doppelt};
}
/** Plan im Importformat von DS-Ultimate (Feldreihenfolge wie im DS-Ultimate-Export). */
function toDSU(items, meta) {
  meta = meta || {};
  return {
    title: meta.title == null ? null : meta.title, uvMode: 0, world: meta.world || "de259", twWorld: meta.twWorld || meta.world || "de259",
    items: items.map(it => {
      const o = {source: it.v.id, destination: it.t.id, slowest_unit: it.kind === "fake" ? UNITS.indexOf("ram") : UNITS.indexOf(it.slow),
                 arrival_time: Math.floor(it.arrivalMs / 1000), type: DSU_TYPE[it.kind], support_boost: 0, tribe_skill: 0,
                 ms: ((it.arrivalMs % 1000) + 1000) % 1000};
      UNITS.forEach(u => { o[u] = String(it.units[u] || 0); });
      return o;
    }),
  };
}

/**
 * Export für DS Workbench („Aus Zwischenablage einfügen“ im Angriffsplaner), DS-Ultimate liest dasselbe als WB-Import.
 * Je Befehl eine Zeile „Herkunft&Ziel&langsamste Einheit&Ankunft in ms&Symbol&false&false&Truppen“; Truppen als die
 * zwölf Einheiten plus militia, jeweils Einheit=Base64 der Dezimalzahl, mit „/“ verbunden. Format laut Dennis
 * (09.11.2026, Beispielzeilen) und DSWB Attack#fromInternalRepresentation. Langsamste Einheit und Symbol wie in toDSU.
 */
const b64 = s => typeof btoa === "function" ? btoa(s) : Buffer.from(s, "utf8").toString("base64");
function toWB(items) {
  const zeilen = items.map(it => {
    const slow = it.kind === "fake" ? "ram" : it.slow;
    const truppen = UNITS.map(u => u + "=" + b64(String(Math.max(0, Math.round(it.units[u] || 0))))).concat("militia=" + b64("0"));
    return [it.v.id, it.t.id, slow, Math.round(it.arrivalMs), DSU_TYPE[it.kind], "false", "false", truppen.join("/")].join("&");
  });
  return zeilen.length ? zeilen.join("\n") + "\n" : "";
}

const api = {UNITS, OVERVIEW_COLUMNS, POP, SPEED, DSU_TYPE, KIND_NAME, WORLD_DEFAULT, CFG_DEFAULT, makeWorld, erfolgsChance, moral,
             berlinToUtc, berlinParts, fmtZeit, parseAnkunft, parseFenster, parseDatum, parseUhrzeit, fmtDatum, fmtUhrzeit,
             zeitraumAusFeldern, fensterAusZeilen, istNacht, ivNorm, ivIntersect, ivShift, ivHas,
             parseOverview, offInfo, classify, fakeAus, begleitschutz, plan, pruefePlan, toDSU, toWB, exportAuswahl, parseKoordListe,
             travelS, dist, popOf, langsamste, ivAbstand, sitzungenAus, dichtesterPunkt, besser, ankunftKandidaten, bewerteAnkunft, zeitHinweise,
             RANGFOLGE, SITZUNG_PAUSE_MS, ANKUNFT_MAX_MS, ANKUNFT_RAT_MS, ankunftsListe, tagesTeile, nachtGekuerzt,
             mulberry32, Fluss};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.Angriff = api;
})(typeof window !== "undefined" ? window : globalThis);
