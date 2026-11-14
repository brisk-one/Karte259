"""Auswahl der JS-Tests vor dem Seiten-Bau (.github/tests_auswahl.py, Dennis 14.11.2026)."""
import importlib.util
import os
import unittest

_pfad = os.path.join(os.path.dirname(__file__), "..", ".github", "tests_auswahl.py")
_spec = importlib.util.spec_from_file_location("tests_auswahl", _pfad)
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)


class TestsAuswahlTest(unittest.TestCase):
    def test_planer_nur_planer(self):
        w = A.auswahl(["site/angriff-core.js", "site/angriff-seite.js", "tests/angriff.test.js"])
        self.assertTrue(w["angriff"])
        self.assertTrue(w["sortieren"])          # nutzt angriff-core.js
        self.assertFalse(w["praegen"])
        self.assertFalse(w["truppen"])

    def test_begleitschutz(self):
        self.assertTrue(A.auswahl(["site/angriff-core.js"])["begleit"])
        self.assertTrue(A.auswahl(["site/aufstocken-seite.js"])["begleit"])
        self.assertEqual([b for b, ja in A.auswahl(["tests/begleit.test.js"]).items() if ja], ["begleit"])

    def test_praegen_nur_praegen(self):
        w = A.auswahl(["site/praegen-core.js"])
        self.assertEqual([b for b, ja in w.items() if ja], ["praegen"])

    def test_nur_daten_keine_js_tests(self):
        self.assertFalse(any(A.auswahl(["data/villages.json", "site/data/angriff.json"]).values()))

    def test_gemeinsam_und_unbekannt_alles(self):
        self.assertTrue(all(A.auswahl([".github/workflows/sammler.yml"]).values()))
        self.assertTrue(all(A.auswahl(["site/app.js"]).values()))
        self.assertTrue(all(A.auswahl(None).values()))

    def test_bezug_letzter_erfolgreicher_seitenbau(self):
        runs = [
            {"id": 5, "conclusion": "success", "display_title": "Lauf", "head_sha": "l", "created_at": "2026-11-14T00:05Z"},
            {"id": 4, "conclusion": "failure", "display_title": "Planer", "head_sha": "f", "created_at": "2026-11-14T00:04Z"},
            {"id": 3, "conclusion": "success", "display_title": "Seite", "head_sha": "s", "created_at": "2026-11-14T00:03Z"},
            {"id": 9, "conclusion": "success", "display_title": "Seite", "head_sha": "eigen", "created_at": "2026-11-14T00:09Z"},
        ]
        self.assertEqual(A.bezug(runs, 9), "s")
        self.assertIsNone(A.bezug([], 1))

    def test_seiten_fuer_den_browsertest(self):
        site = os.path.join(os.path.dirname(__file__), "..", "site")
        self.assertEqual(A.seiten(["site/praegen-core.js"], site), ["praegen.html"])
        self.assertIn("aufstocken.html", A.seiten(["site/angriff-core.js"], site))
        self.assertEqual(A.seiten(["site/style.css"], site), ["alle"])
        self.assertEqual(A.seiten(["data/villages.json"], site), [])


if __name__ == "__main__":
    unittest.main()
