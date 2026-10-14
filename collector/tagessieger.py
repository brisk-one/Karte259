"""Angreifer und Verteidiger des Tages aus der Git-Historie der Spielerliste (Dennis 2a, 14.10.2026).

Befund 13.10.2026: data/inaday/titel.csv enthält die Rang-1-Zeile der Rangliste "an einem Tag". Diese Rangliste
zeigt je Spieler seinen besten Tag aller Zeiten, Rang 1 wechselt nur bei einem neuen Allzeit-Rekord. Echte
Tagestitel stehen weder dort noch bei TWStats, DS-Ultimate oder im öffentlichen Profil.

Für Angreifer und Verteidiger lässt sich der Tagessieger aus eigenen Daten bestimmen: data/latest/players.csv steht
mit jedem Lauf in der Git-Historie, mit den Bashpunkten als Angreifer (att) und Verteidiger (def). Tagessieger ist
der Spieler mit dem größten Zuwachs zwischen dem letzten Stand vor Mitternacht (Serverzeit) und dem letzten Stand
vor der nächsten Mitternacht. Zeitpunkt eines Standes ist die Erzeugungszeit der Weltdaten laut state.json im
selben Commit, ersatzweise die Commit-Zeit. Ein Tag zählt nur, wenn beide Stände höchstens RAND_H Stunden vor
Mitternacht liegen. Räuber und Sammler haben keine Weltdaten, dort bleibt titel.csv (Rekordtage).

Arbeitet inkrementell: Nur fertige Tage, die noch nicht in tagessieger.csv stehen, werden nachgetragen, höchstens
RUECKBLICK_TAGE zurück. Ohne Git-Historie (lokaler Testlauf) passiert nichts. Keine Netzabrufe.
"""
import csv
import io
import json
import subprocess
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime

from . import config, store

HEADER = ["date", "type", "player_id", "name", "value"]
TYPEN = {"kill_att": "att", "kill_def": "def"}
RAND_H = 6
RUECKBLICK_TAGE = 60


def _git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


class Historie:
    """Stände der Spielerliste aus Git, mit Zwischenspeicher für Datenzeit und Inhalt."""

    def __init__(self, git=_git, pfad=None):
        self.git = git
        self.pfad = pfad or f"{config.DATA_DIR}/latest/players.csv"
        self._zeit, self._inhalt = {}, {}
        try:
            log = self.git("log", "--format=%H %ct", "--", self.pfad)
        except (subprocess.CalledProcessError, FileNotFoundError, OSError):
            log = ""
        self.staende = sorted(((h, int(ct)) for h, ct in (z.split() for z in log.splitlines() if z.strip())),
                              key=lambda s: s[1])

    def datenzeit(self, commit, commitzeit):
        if commit not in self._zeit:
            try:
                state = json.loads(self.git("show", f"{commit}:{config.DATA_DIR}/state.json"))
                self._zeit[commit] = int(parsedate_to_datetime(state["data_last_modified"]).timestamp())
            except Exception:
                self._zeit[commit] = commitzeit
        return self._zeit[commit]

    def stand_vor(self, zeitpunkt):
        """Letzter Stand mit Datenzeit vor zeitpunkt, höchstens RAND_H Stunden davor; sonst None."""
        for commit, ct in reversed(self.staende):
            if ct >= zeitpunkt + 2 * 3600:                # Commits deutlich nach Mitternacht überspringen
                continue
            dz = self.datenzeit(commit, ct)
            if dz < zeitpunkt:
                return commit if zeitpunkt - dz <= RAND_H * 3600 else None
            if ct < zeitpunkt - RAND_H * 3600:
                return None
        return None

    def werte(self, commit):
        if commit not in self._inhalt:
            self._inhalt[commit] = {int(r["id"]): r for r in csv.DictReader(io.StringIO(self.git("show", f"{commit}:{self.pfad}")))}
        return self._inhalt[commit]


def sieger_des_tages(vorher, nachher):
    """{typ: (spieler_id, name, zuwachs)} aus zwei Ständen {id: Zeile}; nur bei Zuwachs über 0."""
    ergebnis = {}
    for typ, feld in TYPEN.items():
        best = None
        for pid, r in nachher.items():
            zuwachs = int(r.get(feld) or 0) - int((vorher.get(pid) or {}).get(feld) or 0)
            if zuwachs > 0 and (best is None or (zuwachs, -pid) > (best[2], -best[0])):
                best = (pid, r.get("name", ""), zuwachs)
        if best:
            ergebnis[typ] = best
    return ergebnis


def update(now_local, historie=None):
    """Fertige Tage nachtragen. Gibt die Zahl neuer Zeilen zurück."""
    historie = historie or Historie()
    if len(historie.staende) < 2:
        return 0
    path = store.dpath("inaday", "tagessieger.csv")
    zeilen = store.read_csv(path)
    fertig = {r["date"] for r in zeilen}
    mitternacht = lambda tag: int(datetime(tag.year, tag.month, tag.day, tzinfo=store.TZ).timestamp())
    erster = datetime.fromtimestamp(historie.staende[0][1], store.TZ).date()
    tag = max(erster, now_local.date() - timedelta(days=RUECKBLICK_TAGE))
    neu = []
    while tag < now_local.date():                         # heute ist noch nicht fertig
        if tag.isoformat() not in fertig:
            a, b = historie.stand_vor(mitternacht(tag)), historie.stand_vor(mitternacht(tag + timedelta(days=1)))
            if a and b and a != b:
                for typ, (pid, name, zuwachs) in sieger_des_tages(historie.werte(a), historie.werte(b)).items():
                    neu.append({"date": tag.isoformat(), "type": typ, "player_id": pid, "name": name, "value": zuwachs})
        tag += timedelta(days=1)
    if neu:
        alle = sorted(zeilen + neu, key=lambda r: (r["date"], r["type"]))
        store.write_csv(path, HEADER, [[r["date"], r["type"], r["player_id"], r["name"], r["value"]] for r in alle])
    return len(neu)
