"""Weltwerte für den Prägerechner. Der Rechenkern selbst wird mit Node getestet (tests/praegen.test.js)."""
import unittest

from collector import praegen

WELT = {"speed": "1.6", "unit_speed": "0.625", "snob.coin_wood": "28000", "snob.coin_stone": "30000",
        "snob.coin_iron": "25000", "snob.auto_minting": "1", "premium.MerchantBonus": "1"}


class Payload(unittest.TestCase):
    def test_werte_aus_den_welteinstellungen(self):
        p = praegen.payload(WELT)
        self.assertEqual(p["coin"], {"wood": 28000, "stone": 30000, "iron": 25000})
        self.assertEqual(p["speed"], 1.6)
        self.assertTrue(p["auto_minting"])
        self.assertTrue(p["merchant_bonus"])

    def test_haendler_nur_mit_weltgeschwindigkeit(self):
        # Einheitengeschwindigkeit 0,625 spielt für Händler keine Rolle: 6 / 1,6 = 3,75 Minuten je Feld
        self.assertEqual(praegen.payload(WELT)["min_per_field"], 3.75)

    def test_fehlende_muenzkosten_fallen_auf_standard(self):
        p = praegen.payload({"speed": "1"})
        self.assertEqual(p["coin"], praegen.DEFAULT_COIN)
        self.assertFalse(p["auto_minting"])

    def test_bauwerte_aus_get_building_info(self):
        b = {}
        for g, w in (("main", 90), ("market", 100), ("storage", 60), ("farm", 45)):
            for f in praegen.GEB_FELDER:
                b[g + "." + f] = "30" if f == "max_level" else str(w if f == "wood" else 1.2)
        b.pop("farm.build_time")                      # unvollständig: Bauernhof fällt weg
        p = praegen.payload(WELT, b)
        self.assertEqual(sorted(p["gebaeude"]), ["main", "market", "storage"])
        self.assertEqual(p["gebaeude"]["main"]["wood"], 90)
        self.assertEqual(p["gebaeude"]["storage"]["max_level"], 30)
        self.assertNotIn("gebaeude", praegen.payload(WELT))

    def test_ohne_welteinstellungen_keine_datei(self):
        self.assertIsNone(praegen.payload(None))
        self.assertIsNone(praegen.payload({}))


if __name__ == "__main__":
    unittest.main()
