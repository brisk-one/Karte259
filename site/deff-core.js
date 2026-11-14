/* Deffplaner (Wunsch Dennis 14.11.2026 04:46): Deff aus den eigenen Deff-Dörfern hinter die laufenden AG-Trains timen,
   Export für DS-Ultimate.

   Eingaben: Befehlsübersicht (laufende Befehle, darin die AG-Trains) und Truppenübersicht, Ansicht „Alle“.
   Regeln (Dennis):
   - Je geadeltem Dorf (Ziel eines laufenden AG-Trains) kommt die Deff 1 s nach dem letzten AG an.
   - Möglichst wenige Unterstützungen: die ganze Deff eines Dorfs als eine Unterstützung.
   - Deff-Dörfer mit Paladin im Dorf schicken ihn mit, die Unterstützung läuft dann mit Paladin-Laufzeit; immer als Ganzes.
   - Je Dorf ungefähr Deff im Wert von 7000 Speer und 7000 Schwert. Wert (Dennis 05:08, 1b mit Kavallerie): Verteidigung gegen
     Infanterie plus gegen Kavallerie, Verteidigung gegen Bogen zählt nicht. Alle Späher des Dorfs gehen mit (gegen Späh-
     angriffe). Typisches Deffpaket für 500 BH: 126 Speer, 200 Schwert, 170 Bogen, 2 Späher.
   - Dazu Fake-Unterstützungen mit 1 Schwert oder 1 Speer, damit jedes geadelte Dorf mehrere Unterstützungen bekommt.
   Umsetzung (Claude, Code-Ebene):
   - Wert = Summe aus allgemeiner und Kavallerie-Verteidigung der geschickten Einheiten (Werte laut get_unit_info der Welt
     259, gleich den Standardwerten); Soll = Wert von speer Speer plus schwert Schwert. Erreicht gilt ab toleranz Prozent.
   - Deff-Dorf: Einordnung wie „Dörfer sortieren“ (Truppen, die zum Dorf gehören). Geschickt wird, was laut Zeile „eigene“
     im Dorf steht: Speer, Schwert, Bogen, SKav, Späher, mit Paladin. LKav und Katapulte bleiben (sie würden bremsen).
   - Verteilung: Ziele mit den wenigsten erreichbaren Deff-Dörfern zuerst; je Ziel das kleinste Dorf, das den Rest allein
     deckt, sonst das größte, bis das Soll erreicht ist. Ein Dorf geht nur an ein Ziel. Erreichbar heißt Abschick frühestens
     jetzt plus vorlaufMin.
   - Kein kleiner Rest allein (Dennis 04:53: 3.134 BH auf ein Dorf ist zu wenig): bekäme ein Ziel weniger als minAnteil Prozent
     des Solls, bekommt es keine echte Deff. Die Dörfer bilden, wenn es reicht, die Deff eines anderen Ziels, sonst verstärken
     sie das erreichbare Ziel mit der wenigsten Deff.
   - Fakes: je Ziel aus verschiedenen Dörfern, Schwert wenn vorhanden, sonst Speer, gleiche Ankunft; Dörfer mit den wenigsten
     Fakes zuerst, Abschick möglichst mindestens abstandS von allen anderen Abschickzeiten entfernt.
   Ohne DOM, im Browser window.Deff (braucht window.Angriff und window.Sortieren), in Node module.exports. */
(function (root) {
"use strict";
const node = typeof module !== "undefined" && module.exports;
const K = node ? require("./angriff-core.js") : root.Angriff;
const So = node ? require("./sortieren.js") : root.Sortieren;

const DEFF_UNITS = ["spear", "sword", "archer", "heavy", "spy"];
/** Verteidigung [allgemein, Kavallerie] je Einheit, laut get_unit_info Welt 259 (data/unit_info.json, 14.11.2026). */
const DEF = {spear: [15, 45], sword: [50, 15], axe: [10, 5], archer: [50, 40], spy: [2, 1], light: [30, 40], marcher: [40, 30], heavy: [200, 80],
             ram: [20, 50], catapult: [100, 50], knight: [250, 400], snob: [100, 50]};
/** Typisches Deffpaket (Dennis 14.11.2026 05:08): 500 BH. */
const PAKET = {spear: 126, sword: 200, archer: 170, spy: 2};
const STANDARD = {speer: 7000, schwert: 7000, fakes: 3, vorlaufMin: 5, toleranz: 90, minAnteil: 50, minBH: 1000, abstandS: 3, nachAgMs: 1000};
const GRENZEN = {speer: [0, 100000], schwert: [0, 100000], fakes: [0, 20], vorlaufMin: [0, 600], toleranz: [50, 100], minAnteil: [0, 100],
                 minBH: [0, 100000], abstandS: [0, 60], nachAgMs: [0, 600000]};
/** DS-Ultimate-Symbole (ds-ultimatev2, AttackListItem::statTypeIDToName): 0 Unterstützung, 46 Fake-Unterstützung. */
const DSU_SUPPORT = {deff: 0, fake: 46};

function einstellungen(cfg) {
  const c = Object.assign({}, STANDARD);
  Object.keys(STANDARD).forEach(k => {
    const v = cfg && cfg[k] != null && cfg[k] !== "" ? +String(cfg[k]).replace(",", ".") : NaN;
    if (Number.isFinite(v)) c[k] = Math.min(GRENZEN[k][1], Math.max(GRENZEN[k][0], Math.round(v)));
  });
  return c;
}
const leer = () => Object.fromEntries(K.UNITS.map(u => [u, 0]));
const bh = (units, pop) => DEFF_UNITS.concat(["knight"]).reduce((s, u) => s + (units[u] || 0) * (pop || K.POP)[u], 0);
/** Deffwert: allgemeine plus Kavallerie-Verteidigung. */
const wert = units => Object.keys(DEF).reduce((s, u) => s + ((units && units[u]) || 0) * (DEF[u][0] + DEF[u][1]), 0);
const sollWert = c => wert({spear: c.speer, sword: c.schwert});
const koord = d => d.x + "|" + d.y;

/** AG-Ziele aus der gelesenen Befehlsübersicht: je Ziel letzte AG-Ankunft, Zahl der AGs, Herkunft. */
function agZiele(befehle) {
  const m = new Map();
  (befehle || []).filter(b => b && b.units && b.units.snob > 0 && b.nach).forEach(b => {
    const k = koord(b.nach);
    if (!m.has(k)) m.set(k, {t: {x: b.nach.x, y: b.nach.y}, letzteAG: 0, ersteAG: Infinity, ags: 0, von: new Set()});
    const z = m.get(k);
    z.letzteAG = Math.max(z.letzteAG, b.arrivalMs); z.ersteAG = Math.min(z.ersteAG, b.arrivalMs);
    z.ags += b.units.snob; z.von.add(koord(b.von));
  });
  return [...m.values()].map(z => Object.assign(z, {von: [...z.von]})).sort((a, b) => a.letzteAG - b.letzteAG);
}

/** Laufende Unterstützungen aus der Befehlsübersicht (Zeilen „Unterstützung für …“): so zählt schon geschickte Deff beim
    Neurechnen mit. parseBefehle liest nur Angriffe; die Unterstützungszeilen laufen deshalb umbenannt durch denselben Leser. */
function laufendeUnterstuetzung(text, now, spalten) {
  const zeilen = String(text || "").split(/\r?\n/).filter(z => /^\s*Unterstützung/i.test(z) || /Serverzeit/.test(z))
    .map(z => z.replace(/^(\s*)Unterstützung/i, "$1Angriff"));
  return K.parseBefehle(zeilen.join("\n"), now, spalten).befehle;
}
/** Deff-Dörfer mit sendbarer Deff (Zeile „eigene“) aus der gelesenen Truppenübersicht. */
function deffDoerfer(villages, cfg, world) {
  const c = einstellungen(cfg), pop = (world && world.pop) || K.POP;
  return (villages || []).filter(v => v.eigene && So.einordnen(v.units, null, pop).art === "deff").map(v => {
    const u = leer();
    DEFF_UNITS.forEach(x => { u[x] = v.eigene[x] || 0; });
    const pala = (v.eigene.knight || 0) > 0;
    if (pala) u.knight = 1;
    return {x: v.x, y: v.y, name: v.name, units: u, bh: bh(u, pop), wert: wert(u), pala, slow: pala ? "knight" : K.langsamste(u, world)};
  }).filter(d => d.bh >= c.minBH);
}

/**
 * Plan rechnen. eingabe {ziele (agZiele), villages (leseDorfTruppen), world, now, cfg}.
 * Ergebnis {ziele: [{t, letzteAG, ankunft, ags, echt: [cmd], fakes: [cmd], bh, soll, erreicht, kandidaten, geloest, geloestBH}],
 *           befehle (nach Abschick),
 *           ungenutzt: [Deff-Dörfer ohne Ziel], soll}. cmd {art: "deff"|"fake", von, nach, units, slow, sendMs, arrivalMs, bh, pala, verstaerkung}.
 */
function planen(eingabe) {
  const c = einstellungen(eingabe.cfg), world = eingabe.world || K.WORLD_DEFAULT, pop = world.pop || K.POP;
  const ab = (eingabe.now != null ? eingabe.now : Date.now()) + c.vorlaufMin * 60000;
  const soll = sollWert(c), genug = soll * c.toleranz / 100;
  const quellen = deffDoerfer(eingabe.villages, c, world);
  const send = (v, unit, z) => z.ankunft - K.travelS(world, unit, K.dist(v, z.t)) * 1000;
  // schon laufende Deff (nach dem letzten AG) zählt mit
  const ziele = (eingabe.ziele || []).map(z => {
    const l = (eingabe.laufend || []).filter(b => b.nach && b.nach.x === z.t.x && b.nach.y === z.t.y && b.arrivalMs > z.letzteAG && bh(b.units, pop) >= c.minBH);
    const lw = l.reduce((s, b) => s + wert(b.units), 0), lb = l.reduce((s, b) => s + bh(b.units, pop), 0);
    return {t: z.t, letzteAG: z.letzteAG, ags: z.ags, von: z.von, ankunft: z.letzteAG + c.nachAgMs, echt: [], fakes: [],
            wert: lw, bh: lb, laufendWert: lw, laufendBH: lb, laufend: l.length, soll};
  });
  ziele.forEach(z => { z.kandidaten = quellen.filter(q => send(q, q.slow, z) >= ab); });
  const frei = new Set(quellen);
  const reihenfolge = ziele.slice().sort((a, b) => a.kandidaten.length - b.kandidaten.length || a.ankunft - b.ankunft);
  // wie viele noch offene Ziele ein Dorf erreicht: knappe Dörfer zuletzt nehmen
  const bedarf = q => reihenfolge.filter(z => z.wert < genug && z.kandidaten.includes(q)).length;
  const cmd = (q, z) => ({art: "deff", von: q, nach: z.t, units: q.units, slow: q.slow, pala: q.pala, bh: q.bh, wert: q.wert, arrivalMs: z.ankunft, sendMs: send(q, q.slow, z)});
  const dazu = (z, q, extra) => { frei.delete(q); z.echt.push(Object.assign(cmd(q, z), extra)); z.wert += q.wert; z.bh += q.bh; };
  reihenfolge.forEach(z => {
    while (z.wert < genug) {
      const k = z.kandidaten.filter(q => frei.has(q));
      if (!k.length) break;
      const rest = genug - z.wert;
      const passt = k.filter(q => q.wert >= rest).sort((a, b) => a.wert - b.wert || bedarf(a) - bedarf(b));
      dazu(z, passt.length ? passt[0] : k.sort((a, b) => b.wert - a.wert || bedarf(a) - bedarf(b))[0]);
    }
  });
  // kleine Reste lösen und anders verwenden
  const mindest = soll * c.minAnteil / 100;
  ziele.forEach(z => {
    if (z.echt.length && z.wert < mindest) {
      z.geloest = z.echt.map(e => e.von); z.geloestBH = z.bh - z.laufendBH; z.geloestWert = z.wert - z.laufendWert;
      z.echt.forEach(e => frei.add(e.von)); z.echt = []; z.bh = z.laufendBH; z.wert = z.laufendWert;
    }
  });
  const gesichert = z => z.wert >= mindest && z.wert > 0;
  for (;;) {                          // aus freien Dörfern ein weiteres Ziel bis zum Mindestanteil, das mit der meisten Deff zuerst
    const offen = ziele.filter(z => !gesichert(z)).map(z => ({z, k: z.kandidaten.filter(q => frei.has(q))}))
      .map(o => Object.assign(o, {summe: o.k.reduce((s, q) => s + q.wert, 0)})).filter(o => o.summe >= mindest && o.summe > 0)
      .sort((a, b) => b.summe - a.summe || a.z.ankunft - b.z.ankunft);
    if (!offen.length) break;
    const {z, k} = offen[0];
    k.sort((a, b) => b.wert - a.wert);
    while (z.wert < genug && k.length) {
      const rest = genug - z.wert, passt = k.filter(q => q.wert >= rest).sort((a, b) => a.wert - b.wert);
      const q = passt.length ? passt[0] : k[0];
      k.splice(k.indexOf(q), 1);
      dazu(z, q);
    }
  }
  quellen.filter(q => frei.has(q) && ziele.some(z => z.geloest && z.geloest.includes(q))).sort((a, b) => b.wert - a.wert).forEach(q => {
    const z = ziele.filter(x => gesichert(x) && x.kandidaten.includes(q)).sort((a, b) => a.wert - b.wert || a.ankunft - b.ankunft)[0];
    if (z) dazu(z, q, {verstaerkung: true});
  });
  ziele.forEach(z => { z.erreicht = z.wert >= genug; z.anteil = soll > 0 ? z.wert / soll : 0; });
  // Fakes: 1 Schwert oder 1 Speer aus Dörfern, die nicht ihre ganze Deff schicken
  const genutzt = new Set(ziele.flatMap(z => z.echt.map(e => koord(e.von))));
  const rest = new Map();
  (eingabe.villages || []).forEach(v => { if (v.eigene && !genutzt.has(koord(v))) rest.set(koord(v), {v, sword: v.eigene.sword || 0, spear: v.eigene.spear || 0, n: 0}); });
  const sends = ziele.flatMap(z => z.echt.map(e => e.sendMs));
  const abstand = s => sends.reduce((m, x) => Math.min(m, Math.abs(x - s)), Infinity);
  ziele.forEach(z => {
    const schon = new Set();
    for (let i = 0; i < c.fakes; i++) {
      const kand = [];
      rest.forEach((r, k) => {
        if (schon.has(k)) return;
        const unit = r.sword > 0 && send(r.v, "sword", z) >= ab ? "sword" : r.spear > 0 && send(r.v, "spear", z) >= ab ? "spear" : null;
        if (unit) kand.push({r, k, unit, s: send(r.v, unit, z)});
      });
      if (!kand.length) break;
      kand.sort((a, b) => a.r.n - b.r.n || (abstand(b.s) >= c.abstandS * 1000) - (abstand(a.s) >= c.abstandS * 1000) || b.s - a.s);
      const f = kand[0];
      f.r[f.unit]--; f.r.n++; schon.add(f.k); sends.push(f.s);
      const u = leer(); u[f.unit] = 1;
      z.fakes.push({art: "fake", von: {x: f.r.v.x, y: f.r.v.y, name: f.r.v.name}, nach: z.t, units: u, slow: f.unit, pala: false, bh: 0, wert: 0,
                    arrivalMs: z.ankunft, sendMs: f.s});
    }
  });
  const befehle = ziele.flatMap(z => z.echt.concat(z.fakes)).sort((a, b) => a.sendMs - b.sendMs);
  return {ziele, befehle, ungenutzt: quellen.filter(q => frei.has(q)), quellen, soll, genug, mindest, ab};
}

/** Export für den JSON-Import von DS-Ultimate; idVon(x, y) liefert die Dorf-ID (Weltdaten). Einheiten als Zahlen. */
function exportDSU(befehle, idVon, meta) {
  const m = meta || {};
  const items = [], fehlt = [];
  befehle.forEach(b => {
    const s = idVon(b.von.x, b.von.y), d = idVon(b.nach.x, b.nach.y);
    if (s == null || d == null) { fehlt.push(b); return; }
    const o = {source: s, destination: d, slowest_unit: K.UNITS.indexOf(b.slow), arrival_time: Math.floor(b.arrivalMs / 1000),
               type: DSU_SUPPORT[b.art], support_boost: 0, tribe_skill: 0, ms: b.arrivalMs % 1000};
    K.UNITS.forEach(u => { o[u] = b.units[u] || 0; });
    items.push(o);
  });
  return {text: JSON.stringify({title: m.title || "Deff", uvMode: 0, world: m.world || "de259", twWorld: m.world || "de259", items}), n: items.length, fehlt};
}

const api = {DEFF_UNITS, DEF, PAKET, STANDARD, GRENZEN, DSU_SUPPORT, einstellungen, agZiele, laufendeUnterstuetzung, deffDoerfer, planen, exportDSU, bh, wert, sollWert};
if (node) module.exports = api;
else root.Deff = api;
})(typeof window !== "undefined" ? window : globalThis);
