import os
import shutil
import tempfile
import unittest
from datetime import datetime, timezone

from collector import store, takt


def t(s):
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


class TaktTest(unittest.TestCase):
    def test_fenster_beginnt_zur_minute_50(self):
        self.assertEqual(takt.fenster(t("2026-10-29T10:49:59")), t("2026-10-29T09:00"))
        self.assertEqual(takt.fenster(t("2026-10-29T10:50:00")), t("2026-10-29T10:00"))

    def test_ohne_lauf_sofort(self):
        self.assertEqual(takt.naechster_abruf(t("2026-10-29T10:20"), None), t("2026-10-29T10:20"))

    def test_fenster_noch_offen_heisst_sofort(self):
        # letzter Abruf 08:56 gehört zum Fenster 08:50 bis 09:50, jetzt 10:20 liegt im Fenster ab 09:50
        self.assertEqual(takt.naechster_abruf(t("2026-10-29T10:20"), t("2026-10-29T08:56")), t("2026-10-29T10:20"))

    def test_kurz_nach_fensterbeginn_bis_minute_55_warten(self):
        self.assertEqual(takt.naechster_abruf(t("2026-10-29T10:51"), t("2026-10-29T09:56")), t("2026-10-29T10:55"))

    def test_fenster_erledigt_heisst_naechste_stunde(self):
        self.assertEqual(takt.naechster_abruf(t("2026-10-29T10:20"), t("2026-10-29T09:56")), t("2026-10-29T10:55"))
        self.assertEqual(takt.naechster_abruf(t("2026-10-29T10:57"), t("2026-10-29T10:56")), t("2026-10-29T11:55"))

    def test_spaeter_abruf_im_fenster_zaehlt(self):
        # Abruf 10:40 (verspätet für das Fenster ab 09:50): das nächste Fenster ab 10:50 ist trotzdem fällig
        self.assertEqual(takt.naechster_abruf(t("2026-10-29T10:41"), t("2026-10-29T10:40")), t("2026-10-29T10:55"))


class LetzterLaufTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_letzte_zeile(self):
        p = os.path.join(self.tmp, "runs.csv")
        store.append_csv(p, ["run_utc", "trigger"], [["2026-10-29T08:56:01+00:00", "takt"],
                                                     ["2026-10-29T09:55:40+00:00", "takt"]])
        self.assertEqual(takt.letzter_lauf(p), t("2026-10-29T09:55:40"))

    def test_ohne_datei(self):
        self.assertIsNone(takt.letzter_lauf(os.path.join(self.tmp, "fehlt.csv")))


if __name__ == "__main__":
    unittest.main()
