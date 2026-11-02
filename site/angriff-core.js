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
  fakes_per_village: 2,
  fake_extra_pop: 5,          // Zuschlag auf das Fakelimit, Dorfpunkte steigen bis zum Abschicken
  extra_fakes: false,         // zusätzliche Fakeziele aus dem Stamm der Zielspieler
  moral_threshold: 1.0,
  seed: 1,
};

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
function istNacht(world, ms) {
  if (!world.night || !world.night.active) return false;
  const h = berlinParts(ms).h, s = world.night.start_hour, e = world.night.end_hour;
  return s > e ? (h >= s || h < e) : (h >= s && h < e);
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
 * @returns {{villages, errors, warnings, header}}
 */
function parseOverview(text, columns) {
  columns = columns || OVERVIEW_COLUMNS;
  const lines = String(text || "").split(/\r?\n/);
  const villages = [], errors = [], warnings = [], seen = new Set();
  let header = null, erwartet = null, offen = null;
  const fertig = (v, nums, nr) => {
    if (nums.length < columns.length) {
      errors.push("Zeile " + nr + ": " + nums.length + " Zahlen, erwartet " + columns.length + " (" + v.name + ")");
      return;
    }
    const units = emptyUnits(), extra = {};
    columns.forEach((c, i) => { if (c in units) units[c] = nums[i]; else extra[c] = nums[i]; });
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
  if (!villages.length && !errors.length) errors.push("Keine Dörfer erkannt. Erwartet wird die Truppenübersicht, Ansicht „Alle“ oder „Eigene“.");
  return {villages, errors, warnings, header};
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
/** Fake aus Katapulten (zuerst), Spähern und, wo erlaubt, Rammen. Mindestens ein Katapult oder eine Ramme. */
function fakeAus(av, need, pop, modus) {
  const f = {catapult: 0, spy: 0, ram: 0};
  if (av.catapult < 1 && av.ram < 1) return null;
  let rest = need;
  if (modus === "spaeher") {
    if (av.catapult >= 1) { f.catapult = 1; rest -= pop.catapult; } else { f.ram = 1; rest -= pop.ram; }
    const s = Math.min(av.spy, Math.max(0, Math.ceil(rest / pop.spy)));
    f.spy = s; rest -= s * pop.spy;
  } else {
    f.catapult = Math.min(av.catapult, Math.max(av.catapult >= 1 ? 1 : 0, Math.floor(rest / pop.catapult)));
    rest -= f.catapult * pop.catapult;
    if (rest > 0) { const s = Math.min(av.spy, Math.ceil(rest / pop.spy)); f.spy = s; rest -= s * pop.spy; }
  }
  if (rest > 0) { const c = Math.min(av.catapult - f.catapult, Math.ceil(rest / pop.catapult)); f.catapult += c; rest -= c * pop.catapult; }
  if (rest > 0) { const r = Math.min(av.ram - f.ram, Math.ceil(rest / pop.ram)); f.ram += r; rest -= r * pop.ram; }
  if (f.catapult + f.ram < 1) {
    if (av.ram >= 1) { f.ram = 1; rest -= pop.ram; } else return null;
  }
  return rest > 0 ? null : f;
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
  const A = input.arrival;
  const warnings = [];
  if (!A || !(A.to >= A.from)) return {fehler: "Ankunft fehlt oder ist ungültig"};

  // Dörfer der Angreifer mit Laufzeitdaten
  const att = new Map(), villages = [];
  (input.attackers || []).forEach(a => {
    let fenster = ivNorm(a.windows && a.windows.length ? a.windows : (input.windows || []));
    // nie in der Vergangenheit abschicken: frühestens eine Minute nach der Berechnung
    if (input.now != null) fenster = ivIntersect(fenster, [[input.now + 60000, Number.MAX_SAFE_INTEGER]]);
    att.set(a.id, {id: a.id, name: a.name, points: a.points || 0, fenster});
    if (!fenster.length) warnings.push({art: "fenster", text: "Kein Abschickzeitraum für " + (a.name || a.id)});
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
        let cost = form === "ganz" ? tr + rng() * 60 : rng() * 3600 + tr / 10;
        if (knappOffs && v.offHier && form !== "einzeln") cost += 3600;       // Off-Dörfer behalten ihre Off als Clean-Off
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
    let c = travelS(world, "ram", dist(o, t)) + rng() * 60;
    if (cfg.off_first && !offZuerst(o, t, pos, nClean)) c += 100000;
    const agAtt = trains.get(t.id)[0].v.att;
    if (o.att !== agAtt) c += 300;
    return Math.round(c);
  };
  const passt = (o, t, pos, nClean, basis) => {
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
  // Runde 2: bis zum Richtwert auffüllen, reihum
  const auffuellen = () => {
    for (let pos = 1; pos < clean; pos++) {
      zielListe.filter(t => trains.has(t.id)).map(t => ({t, r: rng()})).sort((a, b) => a.r - b.r).map(x => x.t).forEach(t => {
        const liste = cleanOffs.get(t.id);
        if (liste.length !== pos) return;
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
  const unterRichtwert = () => zielListe.filter(t => trains.has(t.id) && cleanOffs.get(t.id).length < clean);
  const knapp = {unterRichtwert: unterRichtwert().length, gestrichen: 0};
  if (cfg.clean_knapp === "weniger_ziele") {
    for (let unter = unterRichtwert(); unter.length; unter = unterRichtwert()) {
      unter.sort((a, b) => cleanOffs.get(a.id).length - cleanOffs.get(b.id).length || a.id - b.id);
      const weg = unter[0];
      ausgeschlossen.set(weg.id, "zu wenige Offs für " + clean + " Clean-Offs je Ziel (Variante weniger Ziele)");
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
    const n = cleanOffs.get(t.id).length;
    if (n < clean) warnings.push({art: "richtwert", ziel: t.id, text: "Ziel " + t.x + "|" + t.y + ": " + n + " statt " + clean + " Clean-Offs"});
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
        if (!tset(o, tr * 1000, 0).length) return;
        if (tr < bc) { bc = tr; best = t; }
      });
      if (best) { frei.delete(best.id); o.verplant = true; restZiele.push({o, t: best}); }
    });
  }
  const freieOffs = cleanPool();

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
  if (villages.some(v => !v.fakeMin)) warnings.push({art: "punkte", text: "Dörfer ohne Dorfpunkte in den Weltdaten schicken keine Fakes"});
  const extra = cfg.extra_fakes ? (input.extraFakeTargets || []).slice().sort((a, b) => (b.ownerPoints || 0) - (a.ownerPoints || 0)) : [];
  const fakeLauf = (liste, istExtra, modus) => {
    const kand = liste.map(t => {
      const q = fakeQuellen.filter(v => {
        if (istExtra) {
          const a = att.get(v.att);
          if (moral(world.moral, a.points, t.ownerPoints || 0, t.ownerDays) < cfg.moral_threshold) return false;
        }
        return tset(v, travelS(world, "ram", dist(v, t)) * 1000, 0).length > 0;
      });
      return {t, q};
    });
    if (!istExtra) kand.sort((a, b) => a.q.length - b.q.length);
    kand.forEach(({t, q}) => {
      const schon = new Set(fakes.filter(f => f.t.id === t.id).map(f => f.v.id));
      let n = schon.size;
      const sortiert = q.map(v => ({v, c: travelS(world, "ram", dist(v, t)) + rng() * 1800 + v.fakes * 600}))
        .sort((a, b) => a.c - b.c);
      for (const {v} of sortiert) {
        if (n >= cfg.fakes_per_village) break;
        if (schon.has(v.id)) continue;
        const f = fakeAus(v.fakeAv, v.fakeMin, pop, modus);
        if (!f) continue;
        v.fakeAv.catapult -= f.catapult; v.fakeAv.spy -= f.spy; v.fakeAv.ram -= f.ram;
        v.fakes++; n++; schon.add(v.id);
        fakes.push({v, t, f, extra: istExtra});
      }
    });
  };
  fakeLauf(fakeZiele, false, "kata");
  fakeLauf(fakeZiele, false, "spaeher");
  if (extra.length) fakeLauf(extra, true, "kata");
  fakeZiele.forEach(t => {
    const n = fakes.filter(f => f.t.id === t.id).length;
    if (n < cfg.fakes_per_village) warnings.push({art: "fake", ziel: t.id, text: "Fakeziel " + t.x + "|" + t.y + ": " + n + " statt " + cfg.fakes_per_village + " Fakes"});
  });

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
    blocks.push({art: "ag", ziel: t, items: its});
  });
  restZiele.forEach(({o, t}) => {
    const u = offEinheiten(o);
    blocks.push({art: "rest", ziel: t, items: [item("rest", o, t, u, langsamste(u, world), 0, ++aktionNr)]});
  });
  fakes.forEach(({v, t, f}) => {
    const u = emptyUnits(); u.catapult = f.catapult; u.spy = f.spy; u.ram = f.ram;
    blocks.push({art: "fake", ziel: t, items: [item("fake", v, t, u, "ram", 0, ++aktionNr)]});
  });

  const zeit = zeitenPlanen(blocks, {A, att, gapMs: cfg.min_send_gap_s * 1000, rng, warnings});
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
  items.forEach(it => { if (istNacht(world, it.arrivalMs)) it.nacht = true; });
  if (items.some(it => it.nacht)) warnings.push({art: "nacht", text: "Ankünfte im Nachtbonus (" + world.night.start_hour + " bis " + world.night.end_hour + " Uhr)"});
  if (input.now != null && items.some(it => it.sendMs < input.now)) warnings.push({art: "vergangen", text: "Abschickzeiten in der Vergangenheit"});

  return {items, ziele: zielInfo, freieOffs: freieOffs.map(v => ({id: v.id, x: v.x, y: v.y, name: v.name, att: v.att, offPop: v.offPop})),
          freieAGs: agVillages.map(v => ({id: v.id, x: v.x, y: v.y, att: v.att, frei: v.nobles - verplanteAGs(v, trains)})).filter(x => x.frei > 0),
          warnings, stats: statistik(items, zielInfo, att), cfg, k, form, zeit, knapp};
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

/** Ankunftszeit je Block: verteilt über den Zeitraum, Abschickzeiten in den Fenstern, Mindestabstand je Angreifer. */
function zeitenPlanen(blocks, ctx) {
  const {A, att, gapMs, rng, warnings} = ctx;
  const fest = A.from === A.to;
  const sends = new Map();                         // Angreifer → sortierte Abschickzeiten
  const konflikt = (a, s) => {
    const arr = sends.get(a);
    if (!arr) return false;
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < s) lo = m + 1; else hi = m; }
    return (lo < arr.length && arr[lo] - s < gapMs) || (lo > 0 && s - arr[lo - 1] < gapMs);
  };
  const eintragen = (a, s) => {
    if (!sends.has(a)) sends.set(a, []);
    const arr = sends.get(a);
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < s) lo = m + 1; else hi = m; }
    arr.splice(lo, 0, s);
  };
  // je Block: zulässige Startzeiten und die Abschickvorgänge (relativ zum Start)
  blocks.forEach(b => {
    let s = [[A.from, A.to]];
    b.items.forEach(it => { s = ivIntersect(s, zeitBasis(A, att.get(it.att).fenster, it.travelMs, it.offset)); });
    b.tset = s;
    const akt = new Map();
    b.items.forEach(it => { if (!akt.has(it.aktion)) akt.set(it.aktion, {att: it.att, rel: it.offset - it.travelMs}); });
    b.aktionen = [...akt.values()];
    const a = b.aktionen;
    for (let i = 0; i < a.length && !b.innenDicht; i++)
      for (let j = i + 1; j < a.length; j++) if (a[i].att === a[j].att && Math.abs(a[i].rel - a[j].rel) < gapMs) { b.innenDicht = true; break; }
  });
  const ordnung = {ag: 0, rest: 1, fake: 2};
  const nachArt = {ag: [], rest: [], fake: []};
  blocks.forEach(b => nachArt[b.art].push(b));
  let ok = 0, ohne = 0, gezwungen = 0, gestrichen = 0;
  const laenge = l => l.reduce((s, x) => s + x[1] - x[0] + 1, 0);
  Object.keys(ordnung).forEach(art => {
    // Wunschzeiten gleichmäßig in Zufallsreihenfolge; gesetzt werden die Blöcke mit dem engsten Spielraum zuerst
    const zufall = nachArt[art].map(b => ({b, r: rng()})).sort((p, q) => p.r - q.r).map(x => x.b);
    const n = zufall.length;
    zufall.forEach((b, i) => { b.wunschIndex = i; b.spielraum = laenge(b.tset); });
    const liste = zufall.slice().sort((p, q) => p.spielraum - q.spielraum || p.wunschIndex - q.wunschIndex);
    liste.forEach(b => {
      const i = b.wunschIndex;
      if (!b.tset.length) { ohne++; warnings.push({art: "zeit", ziel: b.ziel.id, text: (art === "ag" ? "Ziel " : art === "fake" ? "Fake auf " : "Off auf ") + b.ziel.x + "|" + b.ziel.y + ": keine passende Ankunftszeit"}); return; }
      const frei = T => b.aktionen.every(a => !konflikt(a.att, T + a.rel));
      let T = null;
      if (fest) {
        if (ivHas(b.tset, A.from)) T = A.from;
      } else {
        const lo0 = Math.ceil(A.from / 1000) * 1000, hi0 = Math.floor(A.to / 1000) * 1000;
        let D = A.from + ((i + 0.1 + 0.8 * rng()) / n) * (A.to - A.from);
        D = Math.min(hi0, Math.max(lo0, Math.round(D / 1000) * 1000));
        const schritte = Math.ceil((A.to - A.from) / 1000) + 1;
        let erstes = null;
        for (let s = 0; s <= schritte && T == null; s++) {
          for (const kand of s === 0 ? [D] : [D + s * 1000, D - s * 1000]) {
            if (kand < lo0 || kand > hi0 || !ivHas(b.tset, kand)) continue;
            if (erstes == null) erstes = kand;
            if (frei(kand)) { T = kand; break; }
          }
        }
        if (T == null && erstes != null) { T = erstes; }
      }
      if (T == null) { ohne++; warnings.push({art: "zeit", ziel: b.ziel.id, text: "Keine passende Ankunftszeit für " + b.ziel.x + "|" + b.ziel.y}); return; }
      if (!frei(T) || b.innenDicht) {
        if (art === "fake") {                       // ein Fake weniger ist besser als ein zu dichter Abschickvorgang
          gestrichen++;
          warnings.push({art: "fake", ziel: b.ziel.id, text: "Fake auf " + b.ziel.x + "|" + b.ziel.y + " gestrichen: kein Platz im Mindestabstand"});
          return;
        }
        gezwungen++; b.gapVerletzt = true;
      }
      b.T = T; ok++;
      b.aktionen.forEach(a => eintragen(a.att, T + a.rel));
    });
  });
  if (gezwungen) warnings.push({art: "abstand", text: gezwungen + " Befehle ohne Mindestabstand von " + gapMs / 1000 + " s (fester Zeitpunkt oder zu enges Fenster)"});
  return {ok, ohne, gezwungen, gestrichen};
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
  const A = input.arrival;
  const fenster = new Map((input.attackers || []).map(a => [a.id, ivNorm(a.windows && a.windows.length ? a.windows : (input.windows || []))]));
  const gap = cfg.min_send_gap_s * 1000;
  // Einheiten je Dorf
  const verbrauch = new Map();
  res.items.forEach(it => {
    if (it.arrivalMs < A.from || it.arrivalMs > A.to + (A.from === A.to ? 10000 : 0)) v.push("Ankunft außerhalb des Zeitraums: " + it.v.id + " → " + it.t.id);
    if (!ivHas(fenster.get(it.att) || [], it.sendMs)) v.push("Abschickzeit außerhalb der Fenster: " + it.v.id + " → " + it.t.id);
    if (it.sendMs !== it.arrivalMs - travelS(world, it.slow, dist(it.v, it.t)) * 1000) v.push("Laufzeit weicht von DS-Ultimate ab");
    if (it.kind === "ag" && dist(it.v, it.t) > world.snob_max_dist + 1e-9) v.push("AG außerhalb der Reichweite: " + it.v.id);
    if (it.kind === "fake") {
      const u = it.units;
      if (u.catapult + u.ram < 1) v.push("Fake ohne Katapult und Ramme");
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

const api = {UNITS, OVERVIEW_COLUMNS, POP, SPEED, DSU_TYPE, KIND_NAME, WORLD_DEFAULT, CFG_DEFAULT, makeWorld, erfolgsChance, moral,
             berlinToUtc, berlinParts, fmtZeit, parseAnkunft, parseFenster, parseDatum, parseUhrzeit, fmtDatum, fmtUhrzeit,
             zeitraumAusFeldern, fensterAusZeilen, istNacht, ivNorm, ivIntersect, ivShift, ivHas,
             parseOverview, offInfo, classify, fakeAus, begleitschutz, plan, pruefePlan, toDSU, exportAuswahl, parseKoordListe,
             travelS, dist, popOf, langsamste,
             mulberry32, Fluss};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.Angriff = api;
})(typeof window !== "undefined" ? window : globalThis);
