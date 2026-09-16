"""Tests für die Einheitendaten der Laufzeiten auf der Karte (Kunstdaten)."""
import unittest

from collector import units


class Einheiten(unittest.TestCase):
    UNITS = {"spear.speed": "18", "spear.pop": "1", "spy.speed": "9", "archer.speed": "18",
             "knight.speed": "10", "snob.speed": "35"}

    def test_minuten_je_feld_nach_weltgeschwindigkeit(self):
        p = units.payload(self.UNITS, {"speed": "1.6", "unit_speed": "0.625"})
        self.assertEqual({u["id"] for u in p["units"]}, {"spear", "spy", "archer", "knight", "snob"})
        self.assertAlmostEqual(dict((u["id"], u["min_per_field"]) for u in p["units"])["spear"], 18.0)
        p2 = units.payload(self.UNITS, {"speed": "2", "unit_speed": "1"})
        self.assertAlmostEqual(dict((u["id"], u["min_per_field"]) for u in p2["units"])["spy"], 4.5)

    def test_abgeschaltete_einheiten_fehlen(self):
        p = units.payload(self.UNITS, {"speed": "1", "unit_speed": "1", "game.archer": "0", "game.knight": "0"})
        self.assertEqual({u["id"] for u in p["units"]}, {"spear", "spy", "snob"})

    def test_nachtbonus_uebernommen(self):
        p = units.payload(self.UNITS, {"speed": "1", "unit_speed": "1", "night.active": "1",
                                       "night.start_hour": "23", "night.end_hour": "8", "night.def_factor": "2"})
        self.assertTrue(p["night"]["active"])
        self.assertEqual(p["night"]["start_hour"], 23)


if __name__ == "__main__":
    unittest.main()
