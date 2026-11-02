"""Tests für collector/angriff.py (Weltwerte und Dorf-IDs des Angriffsplaners). Nur Kunstdaten."""
import unittest

from collector import angriff, build_site, world

VILLAGE_TXT = "7,Barbarendorf,500,500,0,26,0\n3,Dorf+A,612,544,11,1646,0\n12,Dorf+B,317,683,22,3000,4\n"


class Payload(unittest.TestCase):
    def test_weltwerte(self):
        s = {"game.fake_limit": "1", "snob.max_dist": "35", "commands.attack_gap": "200", "mood.loss_min": "20",
             "mood.loss_max": "35", "moral": "3", "commands.millis_arrival": "1"}
        p = angriff.payload(s)
        self.assertEqual(p["fake_limit"], 1)
        self.assertEqual(p["snob_max_dist"], 35)
        self.assertEqual(p["attack_gap_ms"], 200)
        self.assertEqual((p["loss_min"], p["loss_max"]), (20, 35))
        self.assertEqual(p["moral"], 3)
        self.assertTrue(p["millis_arrival"])
        self.assertEqual(p["world"], "de259")

    def test_ohne_einstellungen(self):
        self.assertIsNone(angriff.payload(None))
        self.assertIsNone(angriff.payload({}))
        self.assertEqual(angriff.payload({"speed": "1.6"})["snob_max_dist"], 35)   # Vorgaben bei fehlenden Werten


class DorfIds(unittest.TestCase):
    def test_reihenfolge_wie_villages_json(self):
        vrows = world.parse_villages(VILLAGE_TXT)
        p = build_site.village_payload(vrows, "cache", {11: 0, 22: 1})
        d = angriff.dorf_ids(vrows, p["rows"])
        self.assertEqual([r[0] for r in p["rows"]], [317683, 500500, 612544])
        self.assertEqual(d["ids"], [12, 7, 3])
        self.assertEqual(d["count"], 3)


if __name__ == "__main__":
    unittest.main()
