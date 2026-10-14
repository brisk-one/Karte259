"""Tests für Angreifer und Verteidiger des Tages aus der Git-Historie (Dennis 2a, 14.10.2026). Kein Netz, kein Git."""
import json
import os
import shutil
import tempfile
import unittest
from datetime import datetime
from email.utils import format_datetime

from collector import build_site, config, store, tagessieger

KOPF = "id,name,ally,villages,points,att,def,sup,all\n"


def ts(tag, stunde, minute=0):
    return int(datetime(2026, 10, tag, stunde, minute, tzinfo=store.TZ).timestamp())


class GitAttrappe:
    """Spielt git log und git show für eine Liste von Ständen (commit, commitzeit, datenzeit, zeilen)."""

    def __init__(self, staende):
        self.staende = staende
        self.aufrufe = 0

    def __call__(self, *args):
        self.aufrufe += 1
        if args[0] == "log":
            return "".join(f"{h} {ct}\n" for h, ct, _, _ in reversed(self.staende))
        commit, pfad = args[1].split(":", 1)
        h, ct, dz, zeilen = next(s for s in self.staende if s[0] == commit)
        if pfad.endswith("state.json"):
            return json.dumps({"data_last_modified": format_datetime(datetime.fromtimestamp(dz, store.TZ), usegmt=False)})
        return KOPF + "".join(f"{pid},{name},0,1,100,{att},{dff},0,0\n" for pid, name, att, dff in zeilen)


class Tagessieger(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old_data = config.DATA_DIR
        config.DATA_DIR = os.path.join(self.tmp, "data")

    def tearDown(self):
        config.DATA_DIR = self.old_data
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _lesen(self):
        return store.read_csv(store.dpath("inaday", "tagessieger.csv"))

    def test_sieger_je_tag_und_inkrementell(self):
        git = GitAttrappe([
            ("a", ts(1, 23, 30), ts(1, 23, 0), [(1, "Anna", 100, 0), (2, "Bert", 0, 0)]),
            ("b", ts(2, 23, 30), ts(2, 23, 0), [(1, "Anna", 600, 0), (2, "Bert", 400, 900)]),
            ("c", ts(3, 23, 30), ts(3, 23, 0), [(1, "Anna", 600, 0), (2, "Bert", 1400, 900)]),
        ])
        jetzt = datetime(2026, 10, 4, 1, 0, tzinfo=store.TZ)
        self.assertEqual(tagessieger.update(jetzt, tagessieger.Historie(git=git)), 3)
        rows = self._lesen()
        self.assertEqual([(r["date"], r["type"], r["player_id"], r["value"]) for r in rows],
                         [("2026-10-02", "kill_att", "1", "500"), ("2026-10-02", "kill_def", "2", "900"),
                          ("2026-10-03", "kill_att", "2", "1000")])
        # zweiter Lauf: nichts Neues, die fertigen Tage werden nicht noch einmal gelesen
        git2 = GitAttrappe(git.staende)
        self.assertEqual(tagessieger.update(jetzt, tagessieger.Historie(git=git2)), 0)
        self.assertEqual(len(self._lesen()), 3)

    def test_datenzeit_entscheidet_nicht_die_commitzeit(self):
        # Commit erst um 00:20, die Daten stammen aber von 23:40 und gehören damit zum alten Tag
        git = GitAttrappe([
            ("a", ts(1, 23, 0), ts(1, 22, 50), [(1, "Anna", 0, 0)]),
            ("b", ts(3, 0, 20), ts(2, 23, 40), [(1, "Anna", 700, 0)]),
        ])
        tagessieger.update(datetime(2026, 10, 3, 12, 0, tzinfo=store.TZ), tagessieger.Historie(git=git))
        self.assertEqual([(r["date"], r["value"]) for r in self._lesen()], [("2026-10-02", "700")])

    def test_zu_grosse_luecke_vor_mitternacht_zaehlt_nicht(self):
        git = GitAttrappe([
            ("a", ts(1, 15, 0), ts(1, 15, 0), [(1, "Anna", 0, 0)]),        # 9 Stunden vor Mitternacht
            ("b", ts(2, 23, 0), ts(2, 23, 0), [(1, "Anna", 700, 0)]),
        ])
        self.assertEqual(tagessieger.update(datetime(2026, 10, 3, 12, 0, tzinfo=store.TZ), tagessieger.Historie(git=git)), 0)

    def test_ohne_historie_nichts(self):
        def kaputt(*args):
            raise FileNotFoundError("git")
        self.assertEqual(tagessieger.update(datetime(2026, 10, 3, tzinfo=store.TZ), tagessieger.Historie(git=kaputt)), 0)

    def test_karte_zaehlt_angreifer_aus_historie_nicht_aus_rekordtagen(self):
        store.write_csv(store.dpath("inaday", "titel.csv"), ["date", "type", "player_id", "name", "value"],
                        [["2026-10-01", "kill_att", 1, "Anna", 9], ["2026-10-01", "loot_res", 1, "Anna", 5]])
        store.write_csv(store.dpath("inaday", "tagessieger.csv"), tagessieger.HEADER,
                        [["2026-10-02", "kill_att", 2, "Bert", 500], ["2026-10-03", "kill_att", 2, "Bert", 400]])
        # Annas Angreifer-Rekordtag zählt nicht mehr, ihr Räuber-Rekordtag schon; Bert hat zwei Tagessiege
        self.assertEqual(build_site.titel_zaehlen(), {1: {"loot_res": 1}, 2: {"kill_att": 2}})


if __name__ == "__main__":
    unittest.main()
