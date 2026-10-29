"""Tests für den Verlauf echter Tagesauszeichnungen (Dennis 11.10.2026, E14). Kein Netz."""
import os
import shutil
import tempfile
import unittest

from collector import config, inaday, store


def zeile(rank, player_id, name, value, date):
    return {"rank": rank, "player_id": player_id, "name": name, "value": value, "date": date}


class ProbeProfil(unittest.TestCase):
    """Einmalige Probe des öffentlichen Spielerprofils (Dennis 3b, 13.10.2026)."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old_data, self.old_get = config.DATA_DIR, inaday._get
        config.DATA_DIR = os.path.join(self.tmp, "data")
        self.urls = []
        inaday._get = lambda url: (self.urls.append(url), "<html>Profil</html>")[1]

    def tearDown(self):
        config.DATA_DIR, inaday._get = self.old_data, self.old_get
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_einmalig_zwei_seiten_des_rang_1_spielers(self):
        state = {}
        n = inaday.probe_profil(state, {"conquer": zeile(1, 5, "Eroberer", 3, "2026-10-10"),
                                        "kill_def": zeile(1, 42, "Anna", 9000, "2026-10-10")})
        self.assertEqual(n, 2)
        self.assertTrue(all(u.endswith("id=42") for u in self.urls))       # Verteidiger vor Eroberer
        self.assertTrue(os.path.exists(store.dpath("debug", "sample_info_player.html")))
        self.assertEqual(inaday.probe_profil(state, {"kill_def": zeile(1, 42, "Anna", 9000, "2026-10-10")}), 0)
        self.assertEqual(len(self.urls), 2)                                 # kein zweites Mal

    def test_bash_probe_einmalig_drei_seiten_nur_bei_alten_weltdaten(self):
        from datetime import datetime, timezone
        state = {}
        self.assertEqual(inaday.probe_bash(state, datetime(2026, 10, 29, 10, 55, tzinfo=timezone.utc)), 0)
        self.assertEqual(inaday.probe_bash(state, datetime(2026, 10, 29, 11, 55, tzinfo=timezone.utc)), 3)
        self.assertEqual(inaday.probe_bash(state, datetime(2026, 10, 29, 14, 55, tzinfo=timezone.utc)), 0)
        self.assertEqual(len(self.urls), 3)
        self.assertTrue(all("mode=kill_player" in u for u in self.urls))
        self.assertTrue(os.path.exists(store.dpath("debug", "probe_kill_player_support.html")))

    def test_ohne_rang_1_kein_abruf(self):
        state = {}
        self.assertEqual(inaday.probe_profil(state, {"kill_def": None}), 0)
        self.assertEqual((self.urls, state["inaday"].get("profil_probe_saved")), ([], None))


class UpdateTitel(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old_data = config.DATA_DIR
        config.DATA_DIR = os.path.join(self.tmp, "data")

    def tearDown(self):
        config.DATA_DIR = self.old_data
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _lesen(self):
        return store.read_csv(store.dpath("inaday", "titel.csv"))

    def test_erste_eintragung(self):
        n = inaday.update_titel({"kill_def": zeile(1, 42, "Anna", 9000, "2026-10-10")})
        self.assertEqual(n, 1)
        rows = self._lesen()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["player_id"], "42")
        self.assertEqual(rows[0]["type"], "kill_def")

    def test_ohne_rang_1_keine_eintragung(self):
        n = inaday.update_titel({"kill_def": zeile(2, 42, "Anna", 9000, "2026-10-10")})
        self.assertEqual(n, 0)
        self.assertEqual(self._lesen(), [])

    def test_leere_zeile_wird_ignoriert(self):
        self.assertEqual(inaday.update_titel({"kill_def": None}), 0)

    def test_gleicher_tag_unveraendert_keine_neue_zeile(self):
        inaday.update_titel({"kill_def": zeile(1, 42, "Anna", 9000, "2026-10-10")})
        n = inaday.update_titel({"kill_def": zeile(1, 42, "Anna", 9000, "2026-10-10")})
        self.assertEqual(n, 0)
        self.assertEqual(len(self._lesen()), 1)

    def test_neuer_tag_derselben_kategorie_kommt_dazu(self):
        inaday.update_titel({"kill_def": zeile(1, 42, "Anna", 9000, "2026-10-10")})
        inaday.update_titel({"kill_def": zeile(1, 7, "Bert", 12000, "2026-10-11")})
        rows = self._lesen()
        self.assertEqual(len(rows), 2)
        self.assertEqual({(r["type"], r["date"]) for r in rows}, {("kill_def", "2026-10-10"), ("kill_def", "2026-10-11")})

    def test_noch_laufender_tag_wird_ueberschrieben_bei_anderem_spitzenreiter(self):
        inaday.update_titel({"loot_res": zeile(1, 42, "Anna", 500, "2026-10-10")})
        n = inaday.update_titel({"loot_res": zeile(1, 7, "Bert", 900, "2026-10-10")})
        self.assertEqual(n, 1)
        rows = self._lesen()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["player_id"], "7")
        self.assertEqual(rows[0]["value"], "900")

    def test_mehrere_kategorien_gleichzeitig(self):
        n = inaday.update_titel({
            "kill_def": zeile(1, 42, "Anna", 9000, "2026-10-10"),
            "kill_att": zeile(1, 7, "Bert", 11000, "2026-10-10"),
        })
        self.assertEqual(n, 2)
        self.assertEqual(len(self._lesen()), 2)


if __name__ == "__main__":
    unittest.main()
