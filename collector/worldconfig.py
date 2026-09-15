"""Welteinstellungen (interface.php?func=get_config), unter anderem die Art der Moral.

Die Einstellungen einer Welt ändern sich praktisch nie. Deshalb höchstens ein Abruf je Woche; die Datei
data/world_config.json wird nur neu geschrieben, wenn sich ein Wert tatsächlich geändert hat.
"""
import xml.etree.ElementTree as ET
from datetime import datetime

from . import config, net, store

MAX_AGE_H = 7 * 24


def url():
    return f"{config.BASE_URL}/interface.php?func=get_config"


def parse(body):
    """Flache Zuordnung Pfad -> Text, z. B. {"speed": "1.6", "moral": "2", "night.active": "1"}."""
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
    if "moral" not in out or "speed" not in out:
        raise ValueError("get_config ohne Felder moral und speed")
    return out


def update(state, now_utc):
    checked = state.get("world_config_checked_utc")
    path = store.dpath("world_config.json")
    if checked and store.load_json(path):
        age_h = (now_utc - datetime.fromisoformat(checked)).total_seconds() / 3600
        if age_h < MAX_AGE_H:
            return {"fetched": False}
    status, body, _ = net.fetch(url())
    settings = parse(body)
    old = store.load_json(path, {}) or {}
    changed = old.get("settings") != settings
    if changed:
        store.save_json(path, {"settings": settings, "since_utc": store.iso(now_utc)})
    state["world_config_checked_utc"] = store.iso(now_utc)
    return {"fetched": True, "changed": changed, "moral": settings.get("moral")}
