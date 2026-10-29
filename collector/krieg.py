"""Kampfverlauf und Kriege zwischen Stämmen (Entscheidungen Dennis 2b und 3c vom 29.10.2026).

1. Kampfverlauf: Der Sammler schreibt nach jedem Abruf die fertigen Kampfintervalle aus der Git-Historie von
   latest/players.csv nach data/kampf/kaempfe_JJJJ-MM.csv (Monat nach Intervallende), je Beziehung eine Zeile:
   Angriff (a) vom wahrscheinlichsten Angreifer zum Verteidiger, Unterstützung (u) vom Unterstützer zum
   Verteidiger. Inkrementell ab dem letzten eingetragenen Intervallende wie tagessieger.py. Fehlt der Verlauf,
   füllt der erste Lauf die ganze Historie nach, mit dem Dorfstand aus dem Tagesarchiv des Intervalltags.
2. Kriege (Seitenbau, data/krieg.json): je Stammespaar die laufende Serie von Kämpfen; eine Serie reißt erst
   nach FRIEDEN_TAGE ohne Kampf ab. Krieg, sobald in der Serie ein Fenster von FENSTER_TAGE zusammen
   MIN_KRIEG besiegte Gegner der Verteidiger (beide Richtungen) erreicht; schon ein großer Kampftag reicht.
   „Kriegsbeginn“, solange der Krieg jünger als BEGINN_TAGE ist.

Nur Angriffe mit wahrscheinlichem oder möglichem Angreifer zählen. Keine Netzabrufe.
"""
import csv
import gzip
import io
import os
import subprocess
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from . import config, kampf, store, tagessieger

HEADER = ["art", "von_utc", "bis_utc", "spieler", "spieler_stamm", "ziel", "ziel_stamm", "wert", "ziel_deff",
          "sicher", "x", "y"]
MIN_KRIEG = 100_000
FENSTER_TAGE = 7
FRIEDEN_TAGE = 21
BEGINN_TAGE = 3
FRISCH_TAGE = 2          # jüngere Intervalle nutzen den aktuellen Dorfstand statt des Tagesarchivs
MAX_KRIEGE = 60
MAX_LISTE = 8
STUECK = 48            # Stände je Rechenschritt


def _ts(iso):
    return datetime.fromisoformat(iso).timestamp()


def _iso(t):
    return datetime.fromtimestamp(t, timezone.utc).isoformat()


def log_zeilen(von, bis, kaempfe):
    """Zeilen nach HEADER für die Kämpfe eines Intervalls."""
    out = []
    for k in kaempfe:
        x, y = k["ziel"]
        if k["a"]:
            a = k["a"][0]
            out.append(["a", von, bis, a[0], a[5], k["v"], k["ally"], a[1], k["dv"], kampf.KURZ[k["a_sicher"]], x, y])
        for u in k["u"]:
            out.append(["u", von, bis, u[0], u[5], k["v"], k["ally"], u[1], k["dv"], kampf.KURZ[u[2]], x, y])
    return out


def verlauf_laden(data_dir=None):
    d = os.path.join(data_dir or store.dpath(), "kampf")
    rows = []
    if os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if f.startswith("kaempfe_") and f.endswith(".csv"):
                rows += store.read_csv(os.path.join(d, f))
    return rows


def _dorfstand(tag, data_dir):
    """{pid: [(x, y)]} aus dem Tagesarchiv des Tages (oder dem nächstälteren, sonst dem ältesten)."""
    d = os.path.join(data_dir, "daily", "villages")
    tage = sorted(f[:-7] for f in os.listdir(d) if f.endswith(".csv.gz")) if os.path.isdir(d) else []
    if not tage:
        return {}
    wahl = max((t for t in tage if t <= tag), default=tage[0])
    out = {}
    with gzip.open(os.path.join(d, f"{wahl}.csv.gz"), "rt", encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            if int(r["player"]):
                out.setdefault(int(r["player"]), []).append((int(r["x"]), int(r["y"])))
    return out


def _aktueller_dorfstand():
    from . import build_site                      # erst hier, build_site importiert dieses Modul
    vrows, _ = build_site.village_rows()
    out = {}
    for _vid, _name, x, y, pid, _pts, _bonus in vrows or ():
        if pid:
            out.setdefault(pid, []).append((x, y))
    return out


def fortschreiben(historie=None, data_dir=None, jetzt=None):
    """Trägt fertige Intervalle nach, die noch nicht im Verlauf stehen. Gibt die Zahl neuer Zeilen zurück."""
    data_dir = data_dir or store.dpath()
    historie = historie or tagessieger.Historie()
    jetzt = jetzt or datetime.now(timezone.utc).timestamp()
    alt = verlauf_laden(data_dir)
    letzte = max((_ts(r["bis_utc"]) for r in alt), default=None)

    staende = []                                  # (commit, datenzeit) aufsteigend, ältere Auslieferungen raus
    for h, ct in historie.staende:
        if letzte is not None and ct < letzte - 86400:     # Datenzeit nur für die jüngsten Stände bestimmen
            continue
        t = historie.datenzeit(h, ct)
        if not staende or t > staende[-1][1]:
            staende.append((h, t))
    if letzte is not None:
        ab = max((i for i, (_, t) in enumerate(staende) if t <= letzte), default=0)
        staende = staende[ab:]
    if len(staende) < 2:
        return 0

    cache = {}

    def doerfer(t):
        if jetzt - t < FRISCH_TAGE * 86400:
            key = "aktuell"
            if key not in cache:
                cache[key] = _aktueller_dorfstand()
        else:
            key = datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d")
            if key not in cache:
                cache[key] = _dorfstand(key, data_dir)
        return cache[key]

    def stand(h):
        return kampf.stand(csv.DictReader(io.StringIO(historie.git("show", f"{h}:{historie.pfad}"))))

    # in Stücken, damit bei der Rückfüllung nicht alle Stände gleichzeitig im Speicher liegen
    verluste = kampf.verluste_laden(data_dir)
    neu = defaultdict(list)
    ab = 0
    while ab < len(staende) - 1:
        stueck = staende[ab:ab + STUECK]
        werte = [(t, stand(h)) for h, t in stueck]
        ende = None
        for von, bis, _alle, kaempfe in kampf.intervalle(werte, doerfer, verluste, _iso):
            ende = bis
            if letzte is not None and _ts(bis) <= letzte:
                continue
            neu[bis[:7]] += log_zeilen(von, bis, kaempfe)
        if ende is None:
            if ab + STUECK >= len(staende):
                break
            raise RuntimeError(f"Kampfverlauf: {STUECK} Stände ohne neue Bashwerte ab {_iso(stueck[0][1])}")
        ab += next(i for i, (_, t) in enumerate(stueck) if _iso(t) == ende)
    n = 0
    for monat, rows in sorted(neu.items()):
        store.append_csv(os.path.join(data_dir, "kampf", f"kaempfe_{monat}.csv"), HEADER, rows)
        n += len(rows)
    return n


def update():
    """Für collector.run: ohne Git-Historie (lokaler Testlauf) passiert nichts."""
    try:
        subprocess.run(["git", "rev-parse", "--git-dir"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return 0
    return fortschreiben()


# ---------- Kriege ----------

def kriege(rows, jetzt, historie_ab, tags=None):
    """Kriege aus Verlaufszeilen (Wörterbücher nach HEADER). jetzt, historie_ab als Unix-Zeit."""
    tags = tags or {}
    angriffe = defaultdict(list)                  # (s1, s2) mit s1 < s2 -> Angriffe
    unt = {}                                      # (bis, ziel) -> [(unterstützer, wert)]
    for r in rows:
        sa, sz = int(r["spieler_stamm"]), int(r["ziel_stamm"])
        if r["art"] == "u":
            if r["sicher"] != "u":
                unt.setdefault((r["bis_utc"], int(r["ziel"])), []).append((int(r["spieler"]), int(r["wert"])))
            continue
        if r["sicher"] == "u" or not sa or not sz or sa == sz:
            continue
        angriffe[(min(sa, sz), max(sa, sz))].append(r)

    out = []
    for (s1, s2), liste in angriffe.items():
        liste.sort(key=lambda r: _ts(r["bis_utc"]))
        # laufende Serie: nach hinten, bis eine Lücke von FRIEDEN_TAGE kommt
        serie = [liste[-1]]
        for r in reversed(liste[:-1]):
            if _ts(serie[-1]["bis_utc"]) - _ts(r["bis_utc"]) >= FRIEDEN_TAGE * 86400:
                break
            serie.append(r)
        serie.reverse()
        letzte = _ts(serie[-1]["bis_utc"])
        if jetzt - letzte >= FRIEDEN_TAGE * 86400:
            continue
        # Kriegsbeginn: erster Kampf des ersten Fensters, das MIN_KRIEG erreicht
        zeiten = [_ts(r["bis_utc"]) for r in serie]
        deff = [int(r["ziel_deff"]) for r in serie]
        seit_i, j, summe = None, 0, 0
        for i in range(len(serie)):
            while j < len(serie) and zeiten[j] - zeiten[i] < FENSTER_TAGE * 86400:
                summe += deff[j]
                j += 1
            if summe >= MIN_KRIEG:
                seit_i = i
                break
            summe -= deff[i]
        if seit_i is None:
            continue
        seit = _ts(serie[seit_i]["von_utc"])
        erste = _ts(serie[0]["von_utc"])
        richtung = {s1: _seite(), s2: _seite()}
        tage = defaultdict(lambda: {s1: 0, s2: 0})
        off_gesehen = set()
        ort, ort_t = None, -1
        for r in serie:
            sa, t = int(r["spieler_stamm"]), _ts(r["bis_utc"])
            s = richtung[sa]
            s["kaempfe"] += 1
            s["deff_gegner"] += int(r["ziel_deff"])
            key = (r["bis_utc"], r["spieler"])
            if key not in off_gesehen:            # Off eines Angreifers je Intervall nur einmal
                off_gesehen.add(key)
                s["off"] += int(r["wert"])
                s["angreifer"][int(r["spieler"])] += int(r["wert"])
            s["ziele"][int(r["ziel"])] += int(r["ziel_deff"])
            tag = datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d")
            tage[tag][sa] += int(r["ziel_deff"])
            for sup, wert in unt.get((r["bis_utc"], int(r["ziel"])), ()):     # Unterstützung im angegriffenen Stamm
                s["unt"][(sup, int(r["ziel"]))] += wert
            if t >= ort_t:
                ort, ort_t = [float(r["x"]), float(r["y"])], t
        letzte7 = sum(int(r["ziel_deff"]) for r in serie if jetzt - _ts(r["bis_utc"]) < FENSTER_TAGE * 86400)
        out.append({
            "s": [s1, s2],
            "tags": [tags.get(s1, str(s1)), tags.get(s2, str(s2))],
            "status": "beginn" if jetzt - seit < BEGINN_TAGE * 86400 else "krieg",
            "seit": _iso(seit), "seit_mindestens": erste - historie_ab < 86400 and seit_i == 0,
            "erste": _iso(erste), "letzte": _iso(letzte),
            "kampftage": len(tage), "summe": sum(deff), "summe_7d": letzte7,
            "seiten": [_seite_json(richtung[s1]), _seite_json(richtung[s2])],
            "verlauf": [[t, v[s1], v[s2]] for t, v in sorted(tage.items())],
            "ort": ort,
        })
    out.sort(key=lambda k: (-k["summe_7d"], -k["summe"]))
    return out


def _seite():
    return {"kaempfe": 0, "off": 0, "deff_gegner": 0, "angreifer": defaultdict(int), "ziele": defaultdict(int),
            "unt": defaultdict(int)}


def _seite_json(s):
    """Eine Seite als Angreifer: eigene Off, Deff der angegriffenen Gegner, stärkste Angreifer, meist
    angegriffene Gegner, und die Unterstützung, die die Gegner dabei intern geleistet haben."""
    top = lambda d: sorted(d.items(), key=lambda kv: -kv[1])[:MAX_LISTE]
    return {"kaempfe": s["kaempfe"], "off": s["off"], "deff_gegner": s["deff_gegner"],
            "angreifer": [[p, v] for p, v in top(s["angreifer"])],
            "ziele": [[p, v] for p, v in top(s["ziele"])],
            "gegner_unt": [[a, b, v] for (a, b), v in top(s["unt"])]}


def bauen(live_rows, jetzt, tags, data_dir=None):
    """data/krieg.json: Verlauf plus Intervalle, die nur in der Git-Historie stehen (Seitenbau)."""
    rows = verlauf_laden(data_dir)
    bekannt = max((r["bis_utc"] for r in rows), default="")
    rows += [r for r in live_rows if r["bis_utc"] > bekannt]
    historie_ab = min((_ts(r["von_utc"]) for r in rows), default=jetzt)
    alle = kriege(rows, jetzt, historie_ab, tags)
    return {"regeln": {"min_krieg": MIN_KRIEG, "fenster_tage": FENSTER_TAGE, "frieden_tage": FRIEDEN_TAGE,
                       "beginn_tage": BEGINN_TAGE},
            "historie_ab": _iso(historie_ab), "stand": _iso(jetzt), "verlaufszeilen": len(rows),
            "anzahl": len(alle), "kriege": alle[:MAX_KRIEGE]}
