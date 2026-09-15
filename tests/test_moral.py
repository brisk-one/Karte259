"""Tests für den Moralrechner: Welteinstellungen lesen und Spieldauer über das Startdorf schätzen (Kunstdaten)."""
import gzip
import os
import shutil
import tempfile
import unittest
from datetime import datetime, timezone

from collector import config, moral, store, worldconfig

CONFIG_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<config><speed>1.6</speed><unit_speed>0.625</unit_speed><moral>2</moral>
<night><active>1</active><start_hour>23</start_hour></night></config>"""


class WorldConfig(unittest.TestCase):
    def test_parse_flach(self):
        s = worldconfig.parse(CONFIG_XML)
        self.assertEqual(s["moral"], "2")
        self.assertEqual(s["night.start_hour"], "23")
        self.assertEqual(moral.moral_type(s), 2)

    def test_parse_ohne_moral_ist_fehler(self):
        with self.assertRaises(ValueError):
            worldconfig.parse(b"<config><speed>1</speed></config>")

    def test_moraltyp_unbekannt(self):
        self.assertIsNone(moral.moral_type({}))
        self.assertIsNone(moral.moral_type(None))


class Startdorf(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old = config.DATA_DIR
        config.DATA_DIR = os.path.join(self.tmp, "data")

    def tearDown(self):
        config.DATA_DIR = self.old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_uhr_linear_und_begrenzt(self):
        pts = [(0, 0), (100, 1000), (200, 1000), (300, 3000)]
        self.assertEqual(moral.id_time(pts, 50), 500)
        self.assertEqual(moral.id_time(pts, 150), 1000)
        self.assertEqual(moral.id_time(pts, 250), 2000)
        self.assertEqual(moral.id_time(pts, 999), 3000)

    def test_uhr_bleibt_monoton(self):
        d = store.dpath("daily", "villages")
        os.makedirs(d)
        for day, top in (("2030-01-02", 50), ("2030-01-03", 40)):
            rows = "id,name,x,y,player,points,bonus\n" + f"{top},Dorf,1,1,0,26,0\n"
            with open(os.path.join(d, f"{day}.csv.gz"), "wb") as f:
                f.write(gzip.compress(rows.encode("utf-8")))
        pts = moral.clock_points(d)
        self.assertEqual([p[0] for p in pts], [40, 50])
        self.assertLessEqual(pts[0][1], pts[1][1])

    def test_startdorf_ohne_eroberte_doerfer(self):
        pts = [(0, 0), (1000, 100000)]
        vrows = [(10, "a", 1, 1, 7, 100, 0), (500, "b", 2, 2, 7, 100, 0),   # Spieler 7: Startdorf 10
                 (5, "c", 3, 3, 8, 100, 0), (900, "d", 4, 4, 8, 100, 0),    # Spieler 8: Dorf 5 erobert
                 (300, "e", 5, 5, 9, 100, 0)]                                # Spieler 9: nur erobert
        conquers = [(5, 60000, 8, 0), (300, 40000, 9, 7)]
        j = moral.join_times(vrows, conquers, pts)
        self.assertEqual(j[7], 1000)
        self.assertEqual(j[8], 60000)     # erste Eroberung früher als Dorf 900 (90000)
        self.assertEqual(j[9], 40000)     # kein eigenes Startdorf, erste Eroberung zählt

    def test_weltstart_aus_rekorddatum(self):
        start = moral.world_start([(1, 2000000000, 7, 0)], ["2030-01-01", "", None])
        self.assertEqual(datetime.fromtimestamp(start, timezone.utc).date().isoformat(), "2029-12-31")


if __name__ == "__main__":
    unittest.main()
