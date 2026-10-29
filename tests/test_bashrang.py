"""Tests für die stündlichen Bash-Ranglisten (Dennis 1b, 29.10.2026). Kunstdaten, kein Netz."""
import os
import shutil
import tempfile
import unittest

from collector import bashrang, config, inaday, store


def seite(start, n, wert=lambda r: f"{(100000 - r):,}".replace(",", ".")):
    zeilen = "".join(
        f'<tr><td class="lit-item">{r}</td><td><a href="/guest.php?screen=info_player&amp;id={1000 + r}">'
        f'<img src="x"/> Spieler {r} </a></td><td><a href="/guest.php?screen=info_ally&amp;id={r % 3}">S{r % 3}</a></td>'
        f'<td class="lit-item">{wert(r)}</td></tr>' for r in range(start, start + n))
    return ('<table id="kill_player_ranking_table"><tr><td><a href="?type=att">Als Angreifer</a></td></tr></table>'
            '<table class="vis"><tr><th>Rang</th><th>Name</th><th>Stamm</th><th>Besiegt</th></tr>' + zeilen + "</table>")


class Wert(unittest.TestCase):
    def test_gerundet_und_genau(self):
        self.assertEqual(bashrang.wert("7,60 Mio."), (7_600_000, False))
        self.assertEqual(bashrang.wert("3 Mio."), (3_000_000, False))
        self.assertEqual(bashrang.wert("123.456"), (123_456, True))
        self.assertEqual(bashrang.wert(""), (None, False))

    def test_parse(self):
        r = bashrang.parse(seite(1, 2, lambda r: "2,98 Mio." if r == 1 else "987.654"))
        self.assertEqual([(x["rank"], x["player_id"], x["name"], x["ally_id"], x["value"], x["genau"]) for x in r],
                         [(1, 1001, "Spieler 1", 1, 2_980_000, 0), (2, 1002, "Spieler 2", 2, 987_654, 1)])


class Update(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old_data, self.old_get = config.DATA_DIR, inaday._get
        config.DATA_DIR = os.path.join(self.tmp, "data")
        self.urls = []

    def tearDown(self):
        config.DATA_DIR, inaday._get = self.old_data, self.old_get
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_blaettert_bis_zur_kurzen_seite_hoechstens_zwanzig(self):
        def get(url):
            self.urls.append(url)
            off = int(url.split("offset=")[1]) if "offset=" in url else 0
            if "type=att" in url:
                return seite(off + 1, 25)                 # immer volle Seiten: Grenze SEITEN greift
            if "type=def" in url:
                return seite(off + 1, 25 if off < 50 else 7)
            return seite(1, 25) if off == 0 else seite(1, 25)   # wiederholt Seite 1: keine neuen Spieler
        inaday._get = get
        s = bashrang.update()
        self.assertEqual(s["rows"], {"att": 500, "def": 57, "support": 25})
        self.assertEqual(s["pages"], 20 + 3 + 2)
        self.assertEqual(s["errors"], [])
        rows = store.read_csv(store.dpath("bash", "latest.csv"))
        self.assertEqual(len(rows), 582)
        self.assertEqual(rows[0]["type"], "att")

    def test_gestoerter_typ_behaelt_alte_zeilen(self):
        inaday._get = lambda url: seite(1, 3)
        bashrang.update()
        def get(url):
            if "type=def" in url:
                raise inaday.net.FetchError("503")
            return seite(1, 2)
        inaday._get = get
        s = bashrang.update()
        self.assertEqual(len(s["errors"]), 1)
        rows = store.read_csv(store.dpath("bash", "latest.csv"))
        self.assertEqual(sorted((r["type"], len([x for x in rows if x["type"] == r["type"]])) for r in rows
                                if r["rank"] == "1"), [("att", 2), ("def", 3), ("support", 2)])


if __name__ == "__main__":
    unittest.main()
