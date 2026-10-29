import unittest

from collector import build_site, kampf

# Kunstdaten: Stämme 1 (Verteidiger), 2 (Angreifer), 3 (unbeteiligt)
ALT = {
    10: {"ally": 1, "att": 0, "def": 0, "sup": 0},       # Verteidiger West
    11: {"ally": 1, "att": 0, "def": 0, "sup": 0},       # Verteidiger Ost
    12: {"ally": 1, "att": 0, "def": 0, "sup": 0},       # Unterstützer nahe West
    13: {"ally": 1, "att": 0, "def": 0, "sup": 0},       # Unterstützer weit weg
    20: {"ally": 2, "att": 0, "def": 0, "sup": 0},       # Angreifer West, direkt daneben
    21: {"ally": 2, "att": 0, "def": 0, "sup": 0},       # Angreifer Ost
    22: {"ally": 2, "att": 0, "def": 0, "sup": 0},       # Angreifer, zu weit weg
    30: {"ally": 3, "att": 0, "def": 0, "sup": 0},
}
DOERFER = {
    10: [(100, 100), (102, 101)],
    11: [(300, 300), (301, 302)],
    12: [(110, 105)],
    13: [(600, 600)],
    20: [(101, 99), (98, 97)],
    21: [(305, 298)],
    22: [(200, 200)],
    30: [(103, 103)],
}


def neu(**d):
    """Stand am Ende des Intervalls: ALT plus Zuwächse, z. B. neu(d10=5000, a20=3000)."""
    s = {pid: dict(v) for pid, v in ALT.items()}
    for k, v in d.items():
        s[int(k[1:])][{"a": "att", "d": "def", "s": "sup"}[k[0]]] += v
    return s


class ZuordnenTest(unittest.TestCase):
    def test_ein_angriff(self):
        k, = kampf.zuordnen(ALT, neu(d10=50000, a20=40000, a22=90000), DOERFER, None)
        self.assertEqual(k["v"], 10)
        self.assertEqual([a[0] for a in k["a"]], [20])           # 22 ist mehr als R Felder entfernt
        self.assertEqual(k["a_sicher"], kampf.WAHRSCHEINLICH)
        self.assertTrue(k["geschaetzt"])                         # ohne Dorfvergleich geschätzt
        self.assertEqual(k["u"], [])

    def test_kleiner_zuwachs_ist_kein_kampf(self):
        self.assertEqual(kampf.zuordnen(ALT, neu(d10=999, a20=40000), DOERFER, None), [])

    def test_eigener_stamm_ist_kein_angreifer(self):
        k, = kampf.zuordnen(ALT, neu(d10=50000, a12=40000), DOERFER, None)
        self.assertEqual(k["a"], [])
        self.assertEqual(k["a_sicher"], kampf.UNKLAR)

    def test_mehrere_gleich_starke_angreifer_sind_moeglich(self):
        k, = kampf.zuordnen(ALT, neu(d10=50000, a20=40000, a30=38000), DOERFER, None)
        self.assertEqual(k["a_sicher"], kampf.MOEGLICH)
        self.assertEqual(len(k["a"]), 2)

    def test_angriff_mit_unterstuetzer(self):
        k, = kampf.zuordnen(ALT, neu(d10=50000, a20=40000, s12=20000), DOERFER, None)
        self.assertEqual([(u[0], u[1], u[2]) for u in k["u"]], [(12, 20000, kampf.WAHRSCHEINLICH)])
        self.assertEqual(k["staerke"], 70000)

    def test_einziger_verteidiger_im_stamm_auch_ueber_weite_wege(self):
        k, = kampf.zuordnen(ALT, neu(d10=50000, a20=40000, s13=20000), DOERFER, None)
        self.assertEqual([(u[0], u[2]) for u in k["u"]], [(13, kampf.WAHRSCHEINLICH)])

    def test_zwei_gleichzeitige_kaempfe_im_selben_stamm(self):
        ks = kampf.zuordnen(ALT, neu(d10=30000, d11=80000, a20=25000, a21=60000, s12=15000, s13=9000),
                            DOERFER, None)
        by_v = {k["v"]: k for k in ks}
        self.assertEqual([a[0] for a in by_v[10]["a"]], [20])
        self.assertEqual([a[0] for a in by_v[11]["a"]], [21])
        # 12 steht nur bei 10 in der Nähe, obwohl 11 mehr Deff hat
        self.assertEqual([(u[0], u[2]) for u in by_v[10]["u"]], [(12, kampf.WAHRSCHEINLICH)])
        # 13 steht bei keinem in der Nähe: zum größten Δdef, aber unklar
        self.assertEqual([(u[0], u[2]) for u in by_v[11]["u"]], [(13, kampf.UNKLAR)])

    def test_getroffene_doerfer_bestimmen_den_ort(self):
        k, = kampf.zuordnen(ALT, neu(d10=50000, a20=40000), DOERFER, {10: [(102, 101)]})
        self.assertFalse(k["geschaetzt"])
        self.assertEqual(k["orte"], [[102, 101]])
        self.assertEqual(k["ziel"], [102.0, 101.0])

    def test_punktverlust_ohne_deff_ist_kein_kampf(self):
        self.assertEqual(kampf.zuordnen(ALT, neu(a20=40000), DOERFER, {10: [(102, 101)]}), [])


class AuswertenTest(unittest.TestCase):
    def test_je_intervall_getrennt(self):
        # Phase 1: 20 greift 10 an. Phase 2: 21 greift 11 an, 12 unterstützt 11 (einziger Verteidiger).
        s1 = neu(d10=50000, a20=40000)
        s2 = {pid: dict(v) for pid, v in s1.items()}
        s2[11]["def"] += 80000; s2[21]["att"] += 60000; s2[12]["sup"] += 20000
        iso = lambda t: f"T{t}"
        res = kampf.auswerten([(0, ALT), (1, s1), (2, s2)], DOERFER, {("T1", "T2"): {11: [(301, 302)]}}, iso)
        self.assertEqual(res["intervalle"], [{"von": "T0", "bis": "T1", "dorfvergleich": False},
                                             {"von": "T1", "bis": "T2", "dorfvergleich": True}])
        f = {n: i for i, n in enumerate(res["felder"])}
        rows = [(r[f["i"]], r[f["v"]], [a[0] for a in r[f["a"]]], [u[0] for u in r[f["u"]]], r[f["orte"]])
                for r in res["rows"]]
        self.assertEqual(rows, [(0, 10, [20], [], [100100, 102101]), (1, 11, [21], [12], [301302])])


    def test_staende_ohne_bashaenderung_werden_zusammengefasst(self):
        # T1 bringt nur Punkte, keine Bashwerte: Intervall T0 bis T2, Dorfverluste aus beiden Teilen
        s2 = neu(d10=50000, a20=40000)
        iso = lambda t: f"T{t}"
        vl = {("T0", "T1"): {10: [(100, 100)]}, ("T1", "T2"): {10: [(102, 101)]}}
        res = kampf.auswerten([(0, ALT), (1, ALT), (2, s2), (3, s2)], DOERFER, vl, iso)
        self.assertEqual(res["intervalle"], [{"von": "T0", "bis": "T2", "dorfvergleich": True}])
        f = {n: i for i, n in enumerate(res["felder"])}
        self.assertEqual(res["rows"][0][f["orte"]], [100100, 102101])


class StaendeTest(unittest.TestCase):
    def test_letzter_stand_vor_dem_fenster_und_veraltete_raus(self):
        h = 3600
        versions = [("e", 30 * h), ("d", 28 * h), ("c", 29 * h), ("b", 5 * h), ("a", 1 * h)]   # neueste zuerst
        # d ist älter als c, obwohl später geholt: fällt heraus; b ist der letzte Stand vor dem 24-h-Fenster
        self.assertEqual([v[0] for v in build_site.kampf_staende(versions)], ["b", "c", "e"])


if __name__ == "__main__":
    unittest.main()
