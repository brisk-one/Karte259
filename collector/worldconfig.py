"""Welteinstellungen und Einheitendaten (interface.php?func=get_config bzw. get_unit_info).

Beides ändert sich während einer Welt praktisch nie. Deshalb höchstens ein Abruf je Woche und Datei;
data/world_config.json und data/unit_info.json werden nur neu geschrieben, wenn sich ein Wert ändert.
"""
import xml.etree.ElementTree as ET
from datetime import datetime

from . import config, net, store

MAX_AGE_H = 7 * 24


def url(func):
    return f"{config.BASE_URL}/interface.php?func={func}"


def parse(body):
    """Flache Zuordnung Pfad -> Text, z. B. {"speed": "1.6", "moral": "3", "night.active": "1"}
    bzw. {"spear.speed": "18", "spear.pop": "1", ...} bei get_unit_info."""
    root = ET.fromstring(net.maybe_gunzip(body))
    out = {}

    def walk(node, prefix):
        kids = list(node)
        if not kids:
            out[prefix] = (node.text or "").strip()
        for k in kids:
            walk(k, f"{prefix}.{k.tag}" if prefix else k.tag)

    walk(root, "")
    out.pop("", None)
    return out


def _update_one(state, now_utc, func, filename, required, key):
    checked = state.get(key)
    path = store.dpath(filename)
    if checked and store.load_json(path):
        age_h = (now_utc - datetime.fromisoformat(checked)).total_seconds() / 3600
        if age_h < MAX_AGE_H:
            return {"fetched": False}
    _status, body, _headers = net.fetch(url(func))
    values = parse(body)
    missing = [f for f in required if f not in values]
    if missing:
        raise ValueError(f"{func} ohne Felder {', '.join(missing)}")
    old = store.load_json(path, {}) or {}
    changed = old.get("settings") != values
    if changed:
        store.save_json(path, {"settings": values, "since_utc": store.iso(now_utc)})
    state[key] = store.iso(now_utc)
    return {"fetched": True, "changed": changed}


def update(state, now_utc):
    """Beide Abrufe, höchstens einer je Woche und Datei. Einheitendaten sind für die Laufzeiten
    auf der Karte nötig, die Welteinstellungen für den Moralrechner."""
    out = {"config": _update_one(state, now_utc, "get_config", "world_config.json",
                                 ("moral", "speed"), "world_config_checked_utc")}
    out["units"] = _update_one(state, now_utc, "get_unit_info", "unit_info.json",
                               ("spear.speed", "snob.speed"), "unit_info_checked_utc")
    return out
