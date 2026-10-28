"""Weltwerte für den Prägerechner (site/praegen.html).

Gerechnet wird im Browser mit der Gebäudeübersicht, die der Spieler einfügt. Vom Sammler kommen nur die
Werte der Welt: Münzkosten, Weltgeschwindigkeit und ob Dauermünzprägen und Händlerbonus angeboten werden.
Händler laufen 6 Minuten je Feld geteilt durch die Weltgeschwindigkeit; die Einheitengeschwindigkeit wirkt bei
ihnen nicht (im Spiel geprüft am 28.10.2026: 34,48 Felder mit Händlerbonus 1:26:12 je Weg).
"""

BASE_MIN_PER_FIELD = 6
MERCHANT_CARRY = 1000
DEFAULT_COIN = {"wood": 28000, "stone": 30000, "iron": 25000}


def _num(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def payload(settings):
    """praegen.json aus den Welteinstellungen; None, wenn sie fehlen."""
    s = settings or {}
    speed = _num(s.get("speed"))
    if not speed:
        return None
    coin = {}
    for key, field in (("wood", "snob.coin_wood"), ("stone", "snob.coin_stone"), ("iron", "snob.coin_iron")):
        v = _num(s.get(field))
        coin[key] = int(v) if v else DEFAULT_COIN[key]
    return {
        "speed": speed,
        "coin": coin,
        "base_min_per_field": BASE_MIN_PER_FIELD,
        "merchant_carry": MERCHANT_CARRY,
        "min_per_field": round(BASE_MIN_PER_FIELD / speed, 6),
        "auto_minting": _num(s.get("snob.auto_minting"), 0) == 1,
        "merchant_bonus": _num(s.get("premium.MerchantBonus"), 0) == 1,
    }
