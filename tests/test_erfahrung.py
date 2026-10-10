"""Tests für die Erfahrungs-Stufe (Dennis 11.10.2026, E12 bis E14)."""
import unittest

from collector import erfahrung


class TitelPunkte(unittest.TestCase):
    def test_leere_liste_null_punkte(self):
        self.assertEqual(erfahrung.titel_punkte({}), 0)
        self.assertEqual(erfahrung.titel_punkte(None), 0)

    def test_gewichtung_verteidiger_angreifer_vor_raeuber_vor_sammler(self):
        self.assertEqual(erfahrung.titel_punkte({"kill_def": 1}), 3)
        self.assertEqual(erfahrung.titel_punkte({"kill_att": 1}), 3)
        self.assertEqual(erfahrung.titel_punkte({"loot_res": 1}), 2)
        self.assertEqual(erfahrung.titel_punkte({"scavenge": 1}), 1)

    def test_pluenderer_und_eroberer_zaehlen_nicht(self):
        self.assertEqual(erfahrung.titel_punkte({"loot_vil": 50, "conquer": 50}), 0)


class BesterBashRang(unittest.TestCase):
    def test_kleinster_rang_zaehlt(self):
        self.assertEqual(erfahrung.bester_bash_rang({"att": 50, "def": 9, "sup": 200}), 9)

    def test_fehlende_raenge_ignoriert(self):
        self.assertEqual(erfahrung.bester_bash_rang({"att": None, "def": 0}), None)
        self.assertEqual(erfahrung.bester_bash_rang({}), None)
        self.assertEqual(erfahrung.bester_bash_rang(None), None)


class StufeIndex(unittest.TestCase):
    def test_rekrut_ohne_alles(self):
        self.assertEqual(erfahrung.stufe_index(50, 7000), 0)

    def test_phalanx_krieger_ab_mindestpunkten(self):
        self.assertEqual(erfahrung.stufe_index(1500, 7000), 1)

    def test_hauptmann_per_rang_oder_bash_top_100(self):
        self.assertEqual(erfahrung.stufe_index(50, 450), 2)
        self.assertEqual(erfahrung.stufe_index(50, 7000, {"att": 80}), 2)

    def test_spartiat_per_raeuber_oder_zwei_sammler_auszeichnungen(self):
        self.assertEqual(erfahrung.stufe_index(50, 7000, None, {"loot_res": 1}), 3)
        self.assertEqual(erfahrung.stufe_index(50, 7000, None, {"scavenge": 2}), 3)

    def test_kriegsherr_per_verteidiger_oder_angreifer_auszeichnung(self):
        self.assertEqual(erfahrung.stufe_index(50, 7000, None, {"kill_def": 1}), 4)
        self.assertEqual(erfahrung.stufe_index(50, 7000, None, {"kill_att": 1}), 4)

    def test_unsterblich_braucht_top_20_und_starke_auszeichnung(self):
        self.assertEqual(erfahrung.stufe_index(50, 15, None, {"kill_def": 1}), 5)
        # Top 20 allein ohne Auszeichnung reicht nicht für die höchste Stufe
        self.assertEqual(erfahrung.stufe_index(50, 15), 4)

    def test_mehrere_verteidiger_auszeichnungen_allein_reichen(self):
        self.assertEqual(erfahrung.stufe_index(50, 7000, None, {"kill_def": 2}), 5)


class TribeHistogram(unittest.TestCase):
    def test_zaehlt_je_stufe(self):
        hist = erfahrung.tribe_histogram([0, 0, 2, 5, 5])
        self.assertEqual(hist, [2, 0, 1, 0, 0, 2])

    def test_leere_mitgliederliste(self):
        self.assertEqual(erfahrung.tribe_histogram([]), [0] * 6)


if __name__ == "__main__":
    unittest.main()
