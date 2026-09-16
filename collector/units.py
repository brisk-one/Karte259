"""Einheitendaten für die Laufzeiten auf der Karte.

Laufzeit = Entfernung in Feldern × Minuten je Feld. Die Minuten je Feld stehen in get_unit_info; sie
werden durch Weltgeschwindigkeit × Einheitengeschwindigkeit geteilt (auf Welt 259 ist dieses Produkt
1,6 × 0,625 = 1,0, dort sind beide Lesarten deshalb gleich). Die Reihenfolge ist die des Spiels.
"""
ORDER = ["spear", "sword", "axe", "archer", "spy", "light", "marcher", "heavy", "ram", "catapult",
         "knight", "snob", "militia"]
NAMES = {"spear": "Speerträger", "sword": "Schwertkämpfer", "axe": "Axtkämpfer", "archer": "Bogenschütze",
         "spy": "Späher", "light": "Leichte Kavallerie", "marcher": "Berittener Bogenschütze",
         "heavy": "Schwere Kavallerie", "ram": "Rammbock", "catapult": "Katapult", "knight": "Paladin",
         "snob": "Adelsgeschlecht", "militia": "Miliz"}
# Einheiten, die es nur bei passender Welteinstellung gibt
NEEDS = {"archer": "game.archer", "marcher": "game.archer", "knight": "game.knight", "militia": "game.militia"}


def _num(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def payload(unit_settings, world_settings):
    """units.json: je Einheit Minuten pro Feld, dazu die Geschwindigkeiten der Welt und der Nachtbonus."""
    u = unit_settings or {}
    w = world_settings or {}
    factor = (_num(w.get("speed"), 1) or 1) * (_num(w.get("unit_speed"), 1) or 1)
    units = []
    for key in ORDER:
        base = _num(u.get(f"{key}.speed"))
        if base is None:
            continue
        need = NEEDS.get(key)
        if need and _num(w.get(need), 1) == 0:
            continue                      # Einheit auf dieser Welt abgeschaltet
        units.append({"id": key, "name": NAMES.get(key, key), "min_per_field": round(base / factor, 6),
                      "pop": _num(u.get(f"{key}.pop")), "carry": _num(u.get(f"{key}.carry"))})
    return {
        "units": units,
        "world_speed": _num(w.get("speed")),
        "unit_speed": _num(w.get("unit_speed")),
        "night": {"active": _num(w.get("night.active"), 0) == 1,
                  "start_hour": _num(w.get("night.start_hour")),
                  "end_hour": _num(w.get("night.end_hour")),
                  "def_factor": _num(w.get("night.def_factor"))},
    }
