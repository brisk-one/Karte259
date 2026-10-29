import gzip
import os
import shutil
import tempfile
import unittest
from datetime import datetime, timezone
from unittest import mock

from collector import config, net, store, world


class DorfverlusteTest(unittest.TestCase):
    def test_nur_verlust_ohne_besitzerwechsel(self):
        alt = [[1, "A", 500, 500, 7, 3000, 0],    # verliert Punkte, gleicher Besitzer: zählt
               [2, "B", 501, 500, 7, 3000, 0],    # erobert (Besitzer 7 → 8) und Punkte verloren: zählt nicht
               [3, "C", 502, 500, 0, 900, 0],     # Barbarendorf: zählt nicht
               [4, "D", 503, 500, 9, 1000, 0]]    # wächst: zählt nicht
        neu = [[1, "A", 500, 500, 7, 2800, 0],
               [2, "B", 501, 500, 8, 2500, 0],
               [3, "C", 502, 500, 0, 850, 0],
               [4, "D", 503, 500, 9, 1100, 0],
               [5, "E", 504, 500, 9, 26, 0]]      # neu: zählt nicht
        self.assertEqual(world.dorfverluste(alt, neu), [[1, 500, 500, 7, 3000, 2800]])


def _gz(text):
    return gzip.compress(text.encode("utf-8"))


class UpdateMitDorfstandTest(unittest.TestCase):
    """Zwei Läufe gegen Kunstdaten: der zweite schreibt die Verluste mit beiden Standzeiten."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.patches = [mock.patch.object(config, "DATA_DIR", os.path.join(self.tmp, "data")),
                        mock.patch.object(config, "CACHE_DIR", os.path.join(self.tmp, "cache")),
                        mock.patch.object(config, "MIN_PLAYERS", 1),
                        mock.patch.object(config, "MIN_VILLAGES", 1)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        shutil.rmtree(self.tmp)

    def _lauf(self, state, stand, players, villages):
        files = {"player": players, "ally": "1,Kunst,K,2,3,1000,1000,1\n", "village": villages,
                 "kill_att": "", "kill_def": "", "kill_sup": "", "kill_all": "", "conquer": ""}

        def fetch(url, headers=None):
            name = url.rsplit("/", 1)[1].split(".")[0]
            return 200, _gz(files[name]), {"Last-Modified": stand}

        with mock.patch.object(net, "fetch", fetch):
            now = datetime(2026, 10, 29, 10, 55, tzinfo=timezone.utc)
            return world.update(state, now, now)

    def test_zweiter_lauf_schreibt_verluste(self):
        state = {}
        players1 = "7,Kunstspieler+A,1,2,5000,1\n8,Kunstspieler+B,0,1,800,2\n"
        dorf1 = "1,A,500,500,7,3000,0\n2,B,501,500,7,2000,0\n3,C,510,510,8,800,0\n"
        r1 = self._lauf(state, "Thu, 29 Oct 2026 09:50:10 GMT", players1, dorf1)
        self.assertIsNone(r1["dorfverluste"])                       # ohne vorigen Stand kein Vergleich
        players2 = "7,Kunstspieler+A,1,1,4500,1\n8,Kunstspieler+B,0,2,2800,2\n"
        dorf2 = "1,A,500,500,7,2900,0\n2,B,501,500,8,1900,0\n3,C,510,510,8,800,0\n"
        r2 = self._lauf(state, "Thu, 29 Oct 2026 10:50:12 GMT", players2, dorf2)
        self.assertEqual(r2["dorfverluste"], 1)
        rows = store.read_csv(store.dpath("kampf", "dorfverluste_2026-10.csv"))
        self.assertEqual([(r["stand_utc"], r["vorher_utc"], r["village_id"], r["player"], r["points_vorher"], r["points"])
                          for r in rows],
                         [("2026-10-29T10:50:12+00:00", "2026-10-29T09:50:10+00:00", "1", "7", "3000", "2900")])

    def test_fremder_cache_wird_nicht_verglichen(self):
        state = {}
        players = "7,Kunstspieler+A,1,1,5000,1\n"
        self._lauf(state, "Thu, 29 Oct 2026 09:50:10 GMT", players, "1,A,500,500,7,3000,0\n")
        store.save_raw("village", _gz("1,A,500,500,7,9000,0\n"))     # Cache passt nicht zum gespeicherten Stand
        r = self._lauf(state, "Thu, 29 Oct 2026 10:50:12 GMT", players + " ", "1,A,500,500,7,2900,0\n")
        self.assertIsNone(r["dorfverluste"])


if __name__ == "__main__":
    unittest.main()
