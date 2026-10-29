import json
import os
import tempfile
import unittest
from datetime import datetime, timezone

from collector import krieg, store

TAG = 86400
T0 = datetime(2026, 10, 1, tzinfo=timezone.utc).timestamp()


def iso(t):
    return datetime.fromtimestamp(t, timezone.utc).isoformat()


def angriff(tag, a, sa, v, sv, off, deff, sicher="w"):
    t = T0 + tag * TAG
    return dict(zip(krieg.HEADER, map(str, ["a", iso(t - 3 * 3600), iso(t), a, sa, v, sv, off, deff, sicher, 500, 500])))


def unterstuetzung(tag, s, v, sv, wert):
    t = T0 + tag * TAG
    return dict(zip(krieg.HEADER, map(str, ["u", iso(t - 3 * 3600), iso(t), s, sv, v, sv, wert, 0, "w", 500, 500])))


class KriegeTest(unittest.TestCase):
    def test_ein_grosser_kampftag_reicht_und_ist_kriegsbeginn(self):
        k, = krieg.kriege([angriff(10, 1, 7, 2, 8, 90000, 120000)], T0 + 11 * TAG, T0)
        self.assertEqual(k["s"], [7, 8])
        self.assertEqual(k["status"], "beginn")
        self.assertEqual(k["seiten"][0]["off"], 90000)
        self.assertEqual(k["seiten"][0]["deff_gegner"], 120000)

    def test_kleine_kaempfe_sind_kein_krieg(self):
        rows = [angriff(d, 1, 7, 2, 8, 5000, 20000) for d in (1, 9, 17)]    # nie 100.000 in 7 Tagen
        self.assertEqual(krieg.kriege(rows, T0 + 18 * TAG, T0), [])

    def test_pause_unter_drei_wochen_haelt_den_krieg(self):
        rows = [angriff(1, 1, 7, 2, 8, 50000, 150000), angriff(20, 3, 8, 4, 7, 40000, 30000)]
        k, = krieg.kriege(rows, T0 + 21 * TAG, T0 - 10 * TAG)
        self.assertEqual(k["status"], "krieg")
        self.assertEqual(k["seit"], iso(T0 + TAG - 3 * 3600))
        self.assertEqual(k["kampftage"], 2)
        self.assertEqual(k["summe"], 180000)

    def test_frieden_nach_drei_wochen_ohne_kampf(self):
        self.assertEqual(krieg.kriege([angriff(1, 1, 7, 2, 8, 50000, 150000)], T0 + 23 * TAG, T0), [])

    def test_neue_serie_nach_frieden_zaehlt_neu(self):
        rows = [angriff(1, 1, 7, 2, 8, 50000, 150000), angriff(30, 1, 7, 2, 8, 50000, 20000)]
        self.assertEqual(krieg.kriege(rows, T0 + 31 * TAG, T0), [])     # alte Serie zählt nicht mehr

    def test_unklare_angreifer_und_eigener_stamm_zaehlen_nicht(self):
        rows = [angriff(1, 1, 7, 2, 8, 50000, 150000, "u"), angriff(1, 1, 7, 2, 7, 50000, 150000)]
        self.assertEqual(krieg.kriege(rows, T0 + 2 * TAG, T0), [])

    def test_off_je_intervall_einmal_und_unterstuetzung_beim_gegner(self):
        rows = [angriff(1, 1, 7, 2, 8, 90000, 80000), angriff(1, 1, 7, 3, 8, 90000, 40000),
                unterstuetzung(1, 5, 2, 8, 25000)]
        k, = krieg.kriege(rows, T0 + 2 * TAG, T0)
        s = k["seiten"][0]
        self.assertEqual(s["off"], 90000)                 # derselbe Angreifer, zwei Ziele im selben Intervall
        self.assertEqual(s["deff_gegner"], 120000)
        self.assertEqual(s["gegner_unt"], [[5, 2, 25000]])
        self.assertTrue(k["seit_mindestens"])            # Beginn am Anfang der Historie


class FortschreibenTest(unittest.TestCase):
    def test_traegt_nur_neue_fertige_intervalle_nach(self):
        kopf = "id,name,ally,villages,points,rank,att,def,sup\n"
        zeile = lambda pid, ally, att, d, sup: f"{pid},x,{ally},1,100,1,{att},{d},{sup}\n"
        inhalte = {
            "c0": kopf + zeile(1, 7, 0, 0, 0) + zeile(2, 8, 0, 0, 0),
            "c1": kopf + zeile(1, 7, 60000, 0, 0) + zeile(2, 8, 0, 50000, 0),      # Kampf
            "c2": kopf + zeile(1, 7, 60000, 0, 0) + zeile(2, 8, 0, 50000, 0),      # keine neuen Bashwerte
        }

        class Hist:
            pfad = "data/latest/players.csv"
            staende = [("c0", 1000), ("c1", 4600), ("c2", 8200)]
            def datenzeit(self, h, ct): return ct
            def git(self, *args): return inhalte[args[1].split(":")[0]]

        with tempfile.TemporaryDirectory() as d:
            orig = krieg._aktueller_dorfstand
            krieg._aktueller_dorfstand = lambda: {1: [(500, 500)], 2: [(502, 500)]}
            try:
                self.assertEqual(krieg.fortschreiben(Hist(), d, jetzt=9000), 1)
                self.assertEqual(krieg.fortschreiben(Hist(), d, jetzt=9000), 0)
            finally:
                krieg._aktueller_dorfstand = orig
            r, = krieg.verlauf_laden(d)
            self.assertEqual((r["art"], r["spieler"], r["ziel"], r["wert"], r["ziel_deff"]), ("a", "1", "2", "60000", "50000"))
            self.assertEqual(sorted(os.listdir(os.path.join(d, "kampf"))), ["details_1970-01.jsonl.gz", "kaempfe_1970-01.csv"])
            det, = krieg.details_laden(d)
            self.assertEqual(det["bis"], iso(4600))
            z, = det["rows"]
            self.assertEqual((z[0], z[1], z[2]), (0, 2, 50000))          # Intervall 0, Verteidiger, Δdef

    def test_fehlende_details_werden_nachgerechnet_ohne_doppelten_verlauf(self):
        kopf = "id,name,ally,villages,points,rank,att,def,sup\n"
        zeile = lambda pid, ally, att, d: f"{pid},x,{ally},1,100,1,{att},{d},0\n"
        inhalte = {"c0": kopf + zeile(1, 7, 0, 0) + zeile(2, 8, 0, 0),
                   "c1": kopf + zeile(1, 7, 60000, 0) + zeile(2, 8, 0, 50000),
                   "c2": kopf + zeile(1, 7, 90000, 0) + zeile(2, 8, 0, 80000)}

        class Hist:
            pfad = "data/latest/players.csv"
            staende = [("c0", 1000), ("c1", 4600)]
            def datenzeit(self, h, ct): return ct
            def git(self, *args): return inhalte[args[1].split(":")[0]]

        with tempfile.TemporaryDirectory() as d:
            orig = krieg._aktueller_dorfstand
            krieg._aktueller_dorfstand = lambda: {1: [(500, 500)], 2: [(502, 500)]}
            try:
                krieg.fortschreiben(Hist(), d, jetzt=9000)
                for f in os.listdir(os.path.join(d, "kampf")):
                    if f.startswith("details_"):
                        os.remove(os.path.join(d, "kampf", f))          # Stand vor Einführung der Details
                h = Hist()
                h.staende = [("c0", 1000), ("c1", 4600), ("c2", 8200)]
                self.assertEqual(krieg.fortschreiben(h, d, jetzt=9000), 1)   # nur das neue Intervall im Verlauf
            finally:
                krieg._aktueller_dorfstand = orig
            self.assertEqual(len(krieg.verlauf_laden(d)), 2)
            self.assertEqual([x["bis"] for x in krieg.details_laden(d)], [iso(4600), iso(8200)])    # beide Glieder lesbar


def lies(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


class TageTest(unittest.TestCase):
    def test_tage_nach_berliner_kalendertag_mit_fortlaufenden_nummern(self):
        from collector import build_site, kampf
        felder = len(kampf.FELDER)

        def det(von, bis, stunde):
            r = [0] * felder
            r[1], r[2] = 9, 5000
            r[kampf.FELDER.index("treffer")] = [[500500, 0, -40]]
            return {"von": von, "bis": bis, "dorfvergleich": True, "stunden": [stunde], "rows": [r]}

        with tempfile.TemporaryDirectory() as d:
            krieg._details_anhaengen(os.path.join(d, "kampf", "details_2026-10.jsonl.gz"), [
                det("2026-10-27T20:00:00+00:00", "2026-10-27T22:30:00+00:00", ["a", "b"]),   # 23:30 Berlin: 27.10.
                det("2026-10-27T22:30:00+00:00", "2026-10-28T01:30:00+00:00", ["c", "d"]),   # 02:30 Berlin: 28.10.
                det("2026-10-28T01:30:00+00:00", "2026-10-28T04:30:00+00:00", ["e", "f"])])
            out = os.path.join(d, "out")
            self.assertEqual(build_site.kampf_tage_bauen([], out, d), 2)
            idx = lies(os.path.join(out, "kampf_tage.json"))["tage"]
            self.assertEqual([(t["tag"], t["intervalle"], t["kaempfe"], t["deff"]) for t in idx],
                             [("2026-10-27", 1, 1, 5000), ("2026-10-28", 2, 2, 10000)])
            k = lies(os.path.join(out, "kampf_tage", "2026-10-28.json"))
            ti = kampf.FELDER.index("treffer")
            self.assertEqual([r[0] for r in k["rows"]], [0, 1])
            self.assertEqual([r[ti][0][1] for r in k["rows"]], [0, 1])          # Stunde zeigt in die eigene Liste
            self.assertEqual(k["stunden"], [["c", "d"], ["e", "f"]])


if __name__ == "__main__":
    unittest.main()
