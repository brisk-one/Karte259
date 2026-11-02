"""Weltwerte und Dorf-IDs für den Angriffsplaner (site/angriff.html, Rechenkern site/angriff-core.js).

Gerechnet wird im Browser mit der Truppenübersicht, die der Spieler einfügt; sie verlässt den Browser nicht.
Vom Sammler kommen nur Werte der Welt (Fakelimit, AG-Reichweite, Befehlsabstand, Zustimmungsverlust je AG,
Moraltyp) und die Dorf-IDs für den Export nach DS-Ultimate. Die IDs stehen in einer eigenen Datei in der
Reihenfolge von villages.json, damit die Kartendaten nicht wachsen (Stand 02.11.2026: 47.772 Dörfer, 1,7 MB).
"""
from . import config


def _num(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def payload(settings):
    """angriff.json aus den Welteinstellungen; None, wenn sie fehlen."""
    s = settings or {}
    if not s:
        return None
    return {
        "world": config.WORLD,
        "fake_limit": _num(s.get("game.fake_limit"), 1),
        "snob_max_dist": _num(s.get("snob.max_dist"), 35),
        "attack_gap_ms": _num(s.get("commands.attack_gap"), 200),
        "loss_min": _num(s.get("mood.loss_min"), 20),
        "loss_max": _num(s.get("mood.loss_max"), 35),
        "moral": _num(s.get("moral"), 3),
        "millis_arrival": _num(s.get("commands.millis_arrival"), 0) == 1,
    }


def dorf_ids(vrows, payload_rows, data_time=None):
    """dorf_ids.json: Dorf-ID je Zeile von villages.json (gleiche Reihenfolge, Schlüssel x*1000+y)."""
    id_of = {x * 1000 + y: vid for vid, _name, x, y, _pid, _pts, _bonus in vrows}
    return {"ids": [id_of[r[0]] for r in payload_rows], "count": len(payload_rows), "data_time_utc": data_time}
