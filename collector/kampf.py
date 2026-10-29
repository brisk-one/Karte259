"""Kämpfe auf der Karte: Verteidiger, Angreifer und Unterstützer je Intervall zwischen zwei Ständen
(Entscheidung 8.3a vom 29.10.2026).

Ein Fenster wie „6 h“ fasst getrennte Kampfphasen zusammen und paart dann Spieler, die zeitlich nichts
miteinander zu tun hatten. Deshalb wird jedes Intervall zwischen zwei aufeinanderfolgenden Ständen von
latest/players.csv einzeln ausgewertet:

1. Verteidiger: Zuwachs der besiegten Gegner als Verteidiger (Δdef) ab MIN_DEF.
2. Unterstützer: Δsup ab MIN_SUP im selben Intervall und im selben Stamm wie der Verteidiger (Unterstützung
   geht auf Welt 259 nur in den eigenen Stamm). Bei mehreren Verteidigern im Stamm der mit dem größten Δdef
   in der Nähe der Unterstützerdörfer, sonst unklar. Ist er der einzige Verteidiger im Stamm, gilt er ohne
   Rücksicht auf den Weg (Unterstützung läuft oft quer über das Stammesgebiet).
3. Stärke des Kampfes: Δdef des Verteidigers plus Δsup der ihm zugeordneten Unterstützer.
4. Angreifer: Δatt ab MIN_ATT im selben Intervall, anderer Stamm, ein Dorf höchstens R Felder vom Ort des
   Kampfes. Gültig nur, wenn die Off zur Stärke passt: höchstens OFF_MAX × und mindestens OFF_MIN × die Stärke
   (Spezifikation Kämpfe 12, Dennis K2a 29.10.2026); sonst wurde ein großer Angreifer zum Angreifer jedes kleinen
   Verteidigers in seiner Nähe. Rangfolge nach Nähe × Passung (kleinere ÷ größere der beiden Zahlen). Verworfene
   Kandidaten stehen in "av" für das Infofeld.
5. Ort: die Dörfer des Verteidigers, die im Intervall Punkte verloren haben, ohne Besitzerwechsel
   (data/kampf/dorfverluste_*.csv, geschrieben vom Sammler). Fehlen sie, die dem Angreifer nächsten Dörfer
   des Verteidigers, gekennzeichnet als geschätzt.
6. Sicherheit je Zuordnung: wahrscheinlich, möglich oder unklar.

Ein Punktverlust allein ist kein Kampf (Abriss durch den Besitzer); er zählt nur zusammen mit Δdef desselben
Spielers im selben Intervall. Die Karte fasst nahe Kämpfe selbst zu Kampfgebieten zusammen.
"""
import math
import os
from collections import defaultdict

from . import store

MIN_DEF = 1000
MIN_ATT = 1000
MIN_SUP = 1000
R = 25                # Felder um den Ort des Kampfes, in denen ein Angreifer oder Unterstützer Dörfer haben muss
NAEHE = 5             # Felder, ab denen die Nähe das Gewicht eines Angreifers halbiert (1 / (1 + d / NAEHE))
DOMINANZ = 3          # ein Kandidat ist „wahrscheinlich“, wenn sein Gewicht mindestens das Dreifache des nächsten ist
MAX_ANGREIFER = 3
OFF_MAX = 5           # Off höchstens 5 × die Stärke des Kampfes (Dennis K2a)
OFF_MIN = 0.05        # und mindestens 5 % davon (ein gescheiterter Angriff in eine große Deff bleibt)
MAX_VERWORFEN = 3
MAX_ZIELE = 6
ZELLE = R

WAHRSCHEINLICH, MOEGLICH, UNKLAR = "wahrscheinlich", "möglich", "unklar"
# Mindest-Stärke filtert die Karte im Browser (Dennis K1d): Auswahl und Startwert; der Seitenbau schreibt alle Kämpfe
STAERKE_STUFEN = [1000, 5000, 10000, 25000, 50000, 100000]
STAERKE_START = 10000
REGEL = 2             # Stand der Zuordnungsregel; ein anderer Stand im Kampfverlauf löst dessen Neuberechnung aus


def _dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _mitte(punkte):
    return (round(sum(p[0] for p in punkte) / len(punkte), 1), round(sum(p[1] for p in punkte) / len(punkte), 1))


def _raster(doerfer, pids):
    g = defaultdict(list)
    for pid in pids:
        for x, y in doerfer.get(pid, ()):
            g[(x // ZELLE, y // ZELLE)].append((pid, x, y))
    return g


def _naehe(raster, orte):
    """Kleinster Abstand je Spieler aus dem Raster zu einem der Orte, nur bis R: {pid: (d, sein Dorf)}."""
    best = {}
    for ox, oy in orte:
        cx, cy = int(ox // ZELLE), int(oy // ZELLE)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for pid, x, y in raster.get((cx + dx, cy + dy), ()):
                    d = math.hypot(x - ox, y - oy)
                    if d <= R and d < best.get(pid, (R + 1,))[0]:
                        best[pid] = (d, (x, y))
    return best


def _sicherheit(gewichte):
    if not gewichte:
        return UNKLAR
    if len(gewichte) == 1 or gewichte[0] >= DOMINANZ * gewichte[1]:
        return WAHRSCHEINLICH
    return MOEGLICH


def _front(doerfer, ziel):
    """Schwerpunkt der Dörfer innerhalb R um das Ziel, sonst das nächste Dorf."""
    nah = [p for p in doerfer if _dist(p, ziel) <= R]
    return _mitte(nah) if nah else min(doerfer, key=lambda p: _dist(p, ziel))


def zuordnen(alt, neu, doerfer, verluste):
    """Kämpfe eines Intervalls.

    alt, neu: {pid: {"ally", "att", "def", "sup"}} zu Beginn und Ende des Intervalls
    doerfer: {pid: [(x, y), ...]} Dörfer je Spieler
    verluste: {pid: [(x, y[, (vorher_utc, stand_utc), Δpunkte]), ...]} Dörfer mit Punktverlust im Intervall, None ohne
        Dorfvergleich. Ein Dorf kann mehrfach vorkommen (Verlust in mehreren Stunden).
    """
    def delta(pid, f):
        a = alt.get(pid)
        return neu[pid][f] - a[f] if a else 0

    verteidiger = sorted((pid for pid in neu if delta(pid, "def") >= MIN_DEF and doerfer.get(pid)),
                         key=lambda pid: -delta(pid, "def"))
    angreifer = [pid for pid in neu if delta(pid, "att") >= MIN_ATT and doerfer.get(pid)]
    raster_a = _raster(doerfer, angreifer)

    def orte_fuer(v, getroffen, punkte, fa):
        """Ort des Kampfes: getroffene Dörfer, sonst die Dörfer des Verteidigers am nächsten Dorf des Angreifers
        (fa), sonst das Dorf in der Mitte seiner Dörfer."""
        if getroffen:
            return punkte[:MAX_ZIELE], False
        if fa:
            return sorted(doerfer[v], key=lambda p: _dist(p, fa))[:3], True
        mitte = _mitte(doerfer[v])
        return [min(doerfer[v], key=lambda p: _dist(p, mitte))], True

    # 1. Verteidiger mit Kandidaten; vorläufiger Ort (für die Unterstützer) am stärksten nahen Kandidaten
    kaempfe = []
    for v in verteidiger:
        getroffen = (verluste or {}).get(v) or []
        punkte = list(dict.fromkeys((p[0], p[1]) for p in getroffen))
        naehe = _naehe(raster_a, punkte or doerfer[v])
        ally_v = neu[v]["ally"]
        kand = [(a, d, dorf) for a, (d, dorf) in naehe.items() if a != v and not (ally_v and neu[a]["ally"] == ally_v)]
        vorl = min(kand, key=lambda c: (-delta(c[0], "att") / (1 + c[1] / NAEHE), c[0]), default=None)
        ziele, geschaetzt = orte_fuer(v, getroffen, punkte, vorl[2] if vorl else None)
        kaempfe.append({
            "v": v, "dv": delta(v, "def"), "ally": ally_v, "ziel": list(_mitte(ziele)),
            "orte": [list(p) for p in ziele], "geschaetzt": geschaetzt,
            # alle getroffenen Dörfer mit Stunde und Punktverlust, für die Liste im Infofeld
            "treffer": sorted(((p[0], p[1], p[2] if len(p) > 2 else None, p[3] if len(p) > 3 else 0)
                               for p in getroffen), key=lambda t: (t[2] or (), t[0], t[1])),
            "u": [], "_kand": kand, "_getroffen": getroffen, "_punkte": punkte,
        })

    # 2. Unterstützer: nur im eigenen Stamm, zum Verteidiger mit dem größten Δdef in der Nähe
    nach_stamm = defaultdict(list)
    for k in kaempfe:
        if k["ally"]:
            nach_stamm[k["ally"]].append(k)
    for s in neu:
        if delta(s, "sup") < MIN_SUP or not doerfer.get(s):
            continue
        kandidaten = [k for k in nach_stamm.get(neu[s]["ally"], ()) if k["v"] != s]
        if not kandidaten:
            continue
        nah = [k for k in kandidaten if min(_dist(p, q) for p in doerfer[s] for q in k["orte"]) <= R]
        if len(kandidaten) == 1:                 # einziger Verteidiger im Stamm, auch über weite Wege
            k, sicher = kandidaten[0], WAHRSCHEINLICH
        elif nah:
            nah.sort(key=lambda k: -k["dv"])
            sicher = WAHRSCHEINLICH if len(nah) == 1 or nah[0]["dv"] >= DOMINANZ * nah[1]["dv"] else MOEGLICH
            k = nah[0]
        else:
            k, sicher = max(kandidaten, key=lambda k: k["dv"]), UNKLAR
        k["u"].append([s, delta(s, "sup"), sicher, neu[s]["ally"]])

    # 3. Stärke, 4. Angreifer nach Passung, 5. endgültiger Ort
    for k in kaempfe:
        v, kand = k["v"], k.pop("_kand")
        getroffen, punkte = k.pop("_getroffen"), k.pop("_punkte")
        k["u"].sort(key=lambda u: -u[1])
        st = k["staerke"] = k["dv"] + sum(u[1] for u in k["u"])
        gueltig, verworfen = [], []
        for a, d, dorf in kand:
            off = delta(a, "att")
            if OFF_MIN * st <= off <= OFF_MAX * st:
                gueltig.append((min(off, st) / max(off, st) / (1 + d / NAEHE), a, d, dorf))
            else:
                verworfen.append((off / (1 + d / NAEHE), a, d, off))
        gueltig.sort(key=lambda g: (-g[0], g[1]))
        verworfen.sort(key=lambda g: (-g[0], g[1]))
        ziele, geschaetzt = orte_fuer(v, getroffen, punkte, gueltig[0][3] if gueltig else None)
        ziel = _mitte(ziele)
        k.update(ziel=list(ziel), orte=[list(p) for p in ziele], geschaetzt=geschaetzt,
                 a=[[a, delta(a, "att"), round(d, 1), *_front(doerfer[a], ziel), neu[a]["ally"]]
                    for _, a, d, _ in gueltig[:MAX_ANGREIFER]],
                 a_sicher=_sicherheit([g[0] for g in gueltig]),
                 av=[[a, off, round(d, 1)] for _, a, d, off in verworfen[:MAX_VERWORFEN]])
        # Unterstützer zeigen vom nächsten Teil ihres Gebiets auf den endgültigen Ort
        k["u"] = [[s, w, sicher, *_mitte(sorted(doerfer[s], key=lambda p: _dist(p, ziel))[:3]), ally]
                  for s, w, sicher, ally in k["u"]]
    return kaempfe


def verluste_laden(data_dir=None):
    """Dorfverluste je Intervall: {(vorher_utc, stand_utc): {pid: [(x, y, (vorher_utc, stand_utc), Δpunkte), ...]}}."""
    d = os.path.join(data_dir or store.dpath(), "kampf")
    out = defaultdict(lambda: defaultdict(list))
    if not os.path.isdir(d):
        return {}
    for f in sorted(os.listdir(d)):
        if f.startswith("dorfverluste_") and f.endswith(".csv"):
            for r in store.read_csv(os.path.join(d, f)):
                out[(r["vorher_utc"], r["stand_utc"])][int(r["player"])].append(
                    (int(r["x"]), int(r["y"]), (r["vorher_utc"], r["stand_utc"]),
                     int(r["points"]) - int(r["points_vorher"])))
    return out


def stand(rows):
    return {int(r["id"]): {"ally": int(r["ally"]), "att": int(r["att"]), "def": int(r["def"]), "sup": int(r["sup"])}
            for r in rows}


KURZ = {WAHRSCHEINLICH: "w", MOEGLICH: "m", UNKLAR: "u"}
FELDER = ["i", "v", "dv", "x", "y", "geschaetzt", "staerke", "a_sicher", "orte", "a", "u", "treffer", "av"]


def zeile(i, k, stunde_nr):
    """Kompakte Zeile nach FELDER. Orte als x*1000+y, Angreifer [pid, Δatt, Abstand, x, y],
    Unterstützer [pid, Δsup, Sicherheit, x, y], Sicherheit als w, m oder u. Treffer [x*1000+y, Stunde, Δpunkte],
    Stunde als Index in "stunden" ([vorher, stand] der Stunde mit dem Punktverlust), -1 ohne Zeit. Verworfene
    Angreifer (Off passt nicht zur Stärke) [pid, Δatt, Abstand]."""
    return [i, k["v"], k["dv"], k["ziel"][0], k["ziel"][1], int(k["geschaetzt"]), k["staerke"], KURZ[k["a_sicher"]],
            [x * 1000 + y for x, y in k["orte"]], [a[:5] for a in k["a"]],
            [[u[0], u[1], KURZ[u[2]], u[3], u[4]] for u in k["u"]],
            [[x * 1000 + y, stunde_nr.get(t, -1), dp] for x, y, t, dp in k["treffer"]], k.get("av", [])]


def _bash_gleich(a, b):
    """Keine Änderung der Bashwerte bei Spielern, die in beiden Ständen vorkommen (neue und gelöschte
    Konten ändern sich laufend und zählen nicht)."""
    return all((v["att"], v["def"], v["sup"]) == (a[pid]["att"], a[pid]["def"], a[pid]["sup"])
               for pid, v in b.items() if pid in a)


def intervalle(staende, doerfer, verluste, iso):
    """Kämpfe je Intervall, aufsteigend: (von, bis, dorfvergleich, kämpfe) mit Kämpfen wie zuordnen().

    staende: [(zeit, {pid: {...}})] aufsteigend nach Zeit. doerfer: {pid: [(x, y)]} oder eine Funktion
    zeit -> solches Wörterbuch (Rückfüllung alter Intervalle mit dem Dorfstand ihres Tages).

    Der Server rechnet die Bashwerte nur alle 3 Stunden neu (Messung 29.10.2026), die Punkte dagegen laufend.
    Stände mit unveränderten Bashwerten werden deshalb zusammengefasst: ein Intervall reicht vom ersten Stand
    mit den alten Werten bis zum ersten mit neuen, die Dorfverluste aller Teilintervalle zählen zusammen.
    Stände nach der letzten Änderung bilden noch kein Intervall."""
    start = 0
    for j in range(1, len(staende)):
        if _bash_gleich(staende[j - 1][1], staende[j][1]):
            continue
        (t0, s0), (t1, s1) = staende[start], staende[j]
        vl, alle = defaultdict(list), True
        for (ta, _), (tb, _) in zip(staende[start:j], staende[start + 1:j + 1]):
            teil = verluste.get((iso(ta), iso(tb)))
            if teil is None:
                alle = False
                continue
            for pid, orte in teil.items():
                vl[pid] += orte
        d = doerfer(t1) if callable(doerfer) else doerfer
        yield iso(t0), iso(t1), alle, zuordnen(s0, s1, d, dict(vl) if (vl or alle) else None)
        start = j


def auswerten(staende, doerfer, verluste, iso):
    """Ergebnis für data/kampf.json aus intervalle()."""
    return als_json(intervalle(staende, doerfer, verluste, iso))


def als_json(ivs):
    liste, roh = [], []
    for von, bis, alle, kaempfe in ivs:
        roh.append((len(liste), kaempfe))
        liste.append({"von": von, "bis": bis, "dorfvergleich": alle})
    stunden = sorted({t[2] for _, ks in roh for k in ks for t in k["treffer"] if t[2]})
    nr = {t: i for i, t in enumerate(stunden)}
    rows = [zeile(i, k, nr) for i, ks in roh for k in ks]
    return {"intervalle": liste, "stunden": [list(t) for t in stunden], "felder": FELDER, "rows": rows,
            "regeln": regeln()}


def regeln():
    return {"min_def": MIN_DEF, "min_att": MIN_ATT, "min_sup": MIN_SUP, "r": R, "dominanz": DOMINANZ,
            "off_max": OFF_MAX, "off_min": OFF_MIN, "staerke_stufen": STAERKE_STUFEN, "staerke_start": STAERKE_START,
            "regel": REGEL}


def zusammenfuegen(details):
    """Mehrere Intervalle aus den Kampfdetails (krieg.detail) zu einem Ergebnis wie als_json: Intervall- und
    Stundennummern werden fortlaufend neu vergeben."""
    liste, stunden, rows = [], [], []
    ti = FELDER.index("treffer")
    for i, d in enumerate(details):
        off = len(stunden)
        liste.append({"von": d["von"], "bis": d["bis"], "dorfvergleich": d["dorfvergleich"]})
        stunden += d["stunden"]
        for r in d["rows"]:
            r = list(r)
            r[0] = i
            r[ti] = [[xy, s + off if s >= 0 else -1, dp] for xy, s, dp in r[ti]]
            rows.append(r)
    return {"intervalle": liste, "stunden": stunden, "felder": FELDER, "rows": rows, "regeln": regeln()}
