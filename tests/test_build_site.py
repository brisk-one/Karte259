"""Tests für die Kartendaten im Seitenbau: Herkunft der Dörfer und das kompakte Format."""
import gzip
import os
import shutil
import tempfile
import unittest

from collector import build_site, config, store

VILLAGE_TXT = "1,Barbarendorf,500,500,0,26,0\n2,Mein+Dorf,631,601,9490221,1646,0\n" \
              "3,Bonusdorf,317,683,777,3000,4\n"
DAILY_CSV = "id,name,x,y,player,points,bonus\n10,Altes+Dorf,400,400,55,100,0\n11,Barbarendorf,401,400,0,26,0\n"


class VillageSource(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old = config.DATA_DIR, config.CACHE_DIR
        config.DATA_DIR = os.path.join(self.tmp, "data")
        config.CACHE_DIR = os.path.join(self.tmp, "cache")

    def tearDown(self):
        config.DATA_DIR, config.CACHE_DIR = self.old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _daily(self, day, text=DAILY_CSV):
        p = store.dpath("daily", "villages", f"{day}.csv.gz")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(gzip.compress(text.encode("utf-8")))

    def test_ohne_quelle_kein_ergebnis(self):
        self.assertEqual(build_site.village_rows(), (None, None))

    def test_cache_wird_bevorzugt(self):
        store.save_raw("village", gzip.compress(VILLAGE_TXT.encode("utf-8")))
        self._daily("2026-09-12")
        rows, source = build_site.village_rows()
        self.assertEqual(source, "cache")
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[1][1], "Mein Dorf")  # Name wird dekodiert

    def test_rueckfall_auf_juengstes_tagesarchiv(self):
        self._daily("2026-09-11")
        self._daily("2026-09-12")
        rows, source = build_site.village_rows()
        self.assertEqual(source, "daily:2026-09-12")
        self.assertEqual([r[0] for r in rows], [10, 11])

    def test_cache_auch_unkomprimiert_lesbar(self):
        store.save_raw("village", VILLAGE_TXT.encode("utf-8"))
        rows, source = build_site.village_rows()
        self.assertEqual((source, len(rows)), ("cache", 3))


class VillagePayload(unittest.TestCase):
    def setUp(self):
        from collector import world
        self.rows = world.parse_villages(VILLAGE_TXT)

    def test_format_und_sortierung(self):
        p = build_site.village_payload(self.rows, "cache", {9490221: 7, 777: 3}, "2026-09-12T06:47:12+00:00")
        self.assertEqual(p["fields"], ["xy", "p", "pts", "b", "name"])
        self.assertEqual([r[0] for r in p["rows"]], [317683, 500500, 631601])  # nach Koordinate sortiert
        self.assertEqual(p["rows"][2], [631601, 7, 1646, 0, "Mein Dorf"])
        self.assertEqual(p["source"], "cache")
        self.assertEqual(p["unknown_players"], 0)

    def test_barbaren_und_fehlende_spieler(self):
        p = build_site.village_payload(self.rows, "daily:2026-09-12", {})
        by_xy = {r[0]: r for r in p["rows"]}
        self.assertEqual(by_xy[500500][1], -1)  # Barbarendorf
        self.assertEqual(by_xy[631601][1], -1)  # Spieler fehlt in players.json
        self.assertEqual(p["unknown_players"], 2)  # nur die beiden echten Spieler zählen
        self.assertIsNone(p["data_time_utc"])


if __name__ == "__main__":
    unittest.main()
