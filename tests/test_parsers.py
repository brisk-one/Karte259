"""Tests ohne Netzwerk: Parser, Validierung, Datumslogik."""
import unittest
from datetime import date

from collector import inaday, world

PLAYER_TXT = "9490221,und+alle+so+yeeow,456,1,1587,2227\n1577126109,Le+G%C3%BCnni,456,1,1767,2100\n" \
             "1577150723,Wanna+Play%3F,456,1,1359,2500\n"

HTML = """<html><body><table class="main"><tr><td>
<table class="vis"><tr><th>Rang</th><th>Name</th><th>Stamm</th><th>Punkte</th><th>Datum</th></tr>
<tr><td>1</td><td><a href="/guest.php?screen=info_player&amp;id=111">existenzxd</a></td>
<td><a href="/guest.php?screen=info_ally&amp;id=9">Banane</a></td><td>24.036</td><td>Gestern</td></tr>
<tr><td>1.208</td><td><a href="/guest.php?screen=info_player&amp;id=9490221">und alle so yeeow</a></td>
<td><a href="/guest.php?screen=info_ally&amp;id=456">REPEAT</a></td><td>107</td><td>Heute</td></tr>
<tr><td>3</td><td><a href="/guest.php?screen=info_player&amp;id=333">Blazed420AG</a></td><td></td>
<td>16.473</td><td>09.09.2026</td></tr>
</table></td></tr></table></body></html>"""


class WorldParsers(unittest.TestCase):
    def test_players_decode_names(self):
        p = world.parse_players(PLAYER_TXT)
        self.assertEqual(p[9490221]["name"], "und alle so yeeow")
        self.assertEqual(p[1577126109]["name"], "Le Günni")
        self.assertEqual(p[1577150723]["name"], "Wanna Play?")
        self.assertEqual(p[9490221]["ally"], 456)

    def test_village_out_of_map(self):
        with self.assertRaises(world.ValidationError):
            world.parse_villages("1,Dorf,1000,5,0,26,0\n")

    def test_bad_number(self):
        with self.assertRaises(world.ValidationError):
            world.parse_players("x,name,0,1,2,3\n")

    def test_player_drop_detected(self):
        state = {"counts": {"players": 1000, "villages": 5000}}
        players = {i: {} for i in range(500)}
        villages = [[i] for i in range(5000)]
        with self.assertRaises(world.ValidationError):
            world.validate_counts(state, players, villages, {1: {}})

    def test_conquers_keep_extra_fields(self):
        c = world.parse_conquers("12,1757600000,5,6,7,8,300\n")
        self.assertEqual(c[0][:4], [12, 1757600000, 5, 6])
        self.assertEqual(c[0][4], "7|8|300")


class InADay(unittest.TestCase):
    def test_parse_nested_table(self):
        rows = inaday.parse_ranking(HTML, date(2026, 9, 11))
        self.assertEqual(len(rows), 3)
        me = rows[1]
        self.assertEqual((me["rank"], me["player_id"], me["tribe_id"], me["value"], me["date"]),
                         (1208, 9490221, 456, 107, "2026-09-11"))
        self.assertEqual(rows[0]["date"], "2026-09-10")
        self.assertEqual(rows[0]["value"], 24036)
        self.assertEqual(rows[2]["tribe_id"], None)

    def test_midnight_rollover_is_not_a_change(self):
        before = inaday.parse_ranking(HTML, date(2026, 9, 11))
        after_html = HTML.replace("Gestern", "10.09.2026").replace("Heute", "Gestern")
        after = inaday.parse_ranking(after_html, date(2026, 9, 12))
        self.assertEqual(inaday.signature(before), inaday.signature(after))

    def test_page_url_encoding(self):
        self.assertTrue(inaday.page_url("loot_vil", name="Wanna Play?").endswith("&name=Wanna+Play%3F"))
        self.assertIn("name=Le+G%C3%BCnni", inaday.page_url("loot_res", name="Le Günni"))

    def test_norm_date(self):
        self.assertEqual(inaday.norm_date("am 07.09.26", date(2026, 9, 11)), "2026-09-07")
        self.assertIsNone(inaday.norm_date("irgendwann", date(2026, 9, 11)))


if __name__ == "__main__":
    unittest.main()
