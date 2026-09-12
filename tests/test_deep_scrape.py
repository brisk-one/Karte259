"""Tests für die vollständige Erhebung ganzer Ranglisten. Kein Netz: _get wird ersetzt."""
import unittest
from datetime import datetime, timezone

from collector import config, inaday


def page_html(start_rank, count, day="11.09.2026"):
    rows = "".join(
        f'<tr><td>{r}</td><td><a href="/guest.php?screen=info_player&amp;id={1000+r}">Spieler {r}</a></td>'
        f'<td><a href="/guest.php?screen=info_ally&amp;id=7">TAG</a></td>'
        f'<td>{10000-r}</td><td>{day}</td></tr>'
        for r in range(start_rank, start_rank + count))
    return ('<html><body><table class="main"><tr><td><table class="vis">'
            '<tr><th>Rang</th><th>Name</th><th>Stamm</th><th>Punkte</th><th>Datum</th></tr>'
            + rows + '</table></td></tr></table></body></html>')


class DeepScrape(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.orig_get, self.orig_types = inaday._get, config.DEEP_TYPES
        self.orig_params = config.DEEP_PAGE_PARAMS
        config.DEEP_PAGE_PARAMS = []            # Seitengrößen-Test hier aus
        self.now = datetime(2026, 9, 12, 1, 0, tzinfo=timezone.utc)

    def tearDown(self):
        inaday._get, config.DEEP_TYPES, config.DEEP_PAGE_PARAMS = self.orig_get, self.orig_types, self.orig_params

    def _serve(self, total, size=25):
        """Simuliert eine Rangliste mit `total` Einträgen und `size` Zeilen je Seite."""
        def fake(url):
            self.calls.append(url)
            off = 0
            if "offset=" in url:
                off = int(url.split("offset=")[1].split("&")[0])
            rest = max(0, total - off)
            return page_html(off + 1, min(size, rest)) if rest else page_html(1, 0)
        inaday._get = fake

    def test_blaettert_bis_zum_ende(self):
        self._serve(60)
        state = {}
        rows, pages, note = inaday.deep_scrape(state, self.now, ["loot_res"])
        self.assertEqual(len(rows), 60)
        self.assertEqual(pages, 3)                     # 25 + 25 + 10
        self.assertEqual(note["loot_res"], {"rows": 60, "complete": True})
        self.assertEqual(rows[0][0], 1001)             # Spieler-ID der ersten Zeile
        self.assertEqual(rows[0][2], "loot_res")
        self.assertEqual(rows[-1][3], 60)              # Rang der letzten Zeile

    def test_genau_volle_seite_holt_noch_eine(self):
        self._serve(25)
        rows, pages, _ = inaday.deep_scrape({}, self.now, ["loot_res"])
        self.assertEqual(len(rows), 25)
        self.assertEqual(pages, 2)                     # zweite Seite ist leer, danach Schluss

    def test_notbremse_gilt_je_kategorie(self):
        """Die Grenze darf nicht über alle Kategorien zusammenzählen, sonst wird die letzte abgeschnitten."""
        self._serve(100000)
        old = config.DEEP_MAX_PAGES
        config.DEEP_MAX_PAGES = 3
        try:
            rows, pages, note = inaday.deep_scrape({}, self.now, ["loot_res", "scavenge"])
        finally:
            config.DEEP_MAX_PAGES = old
        self.assertEqual(note["loot_res"], {"rows": 100, "complete": False})
        self.assertEqual(note["scavenge"], {"rows": 100, "complete": False})   # bekommt eigenes Kontingent
        self.assertEqual(len(rows), 200)
        self.assertEqual(pages, 8)                     # je Kategorie 1 erste Seite plus 3 weitere

    def test_mehrere_kategorien(self):
        self._serve(30)
        rows, pages, note = inaday.deep_scrape({}, self.now, ["loot_res", "scavenge"])
        self.assertEqual(len(rows), 60)
        self.assertEqual(sorted(note), ["loot_res", "scavenge"])
        self.assertTrue(all(v["complete"] for v in note.values()))
        self.assertEqual({r[2] for r in rows}, {"loot_res", "scavenge"})


class PageSizeProbe(unittest.TestCase):
    def setUp(self):
        self.orig_get, self.orig_params = inaday._get, config.DEEP_PAGE_PARAMS
        config.DEEP_PAGE_PARAMS = ["count", "limit"]

    def tearDown(self):
        inaday._get, config.DEEP_PAGE_PARAMS = self.orig_get, self.orig_params

    def test_groessere_seite_wird_erkannt(self):
        inaday._get = lambda url: page_html(1, 100 if "limit=" in url else 25)
        state = {}
        size, param = inaday.probe_page_size(state, "loot_res", 25)
        self.assertEqual((size, param), (100, "limit"))
        self.assertEqual(state["inaday"]["page_size"], 100)

    def test_ohne_wirkung_bleibt_es_bei_der_normalen_groesse(self):
        inaday._get = lambda url: page_html(1, 25)
        size, param = inaday.probe_page_size({}, "loot_res", 25)
        self.assertEqual((size, param), (25, None))

    def test_ergebnis_wird_nur_einmal_ermittelt(self):
        calls = []
        inaday._get = lambda url: (calls.append(url), page_html(1, 25))[1]
        state = {"inaday": {"page_size": 25, "page_param": None}}
        inaday.probe_page_size(state, "loot_res", 25)
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
