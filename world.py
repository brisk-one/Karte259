"""Offizielle Weltdaten (/map/*.txt.gz): Download, Validierung, Ablage.

Ablauf pro Lauf:
1. player.txt.gz bedingt abrufen (If-Modified-Since). 304 oder gleicher Inhalt heißt: Server hat noch
   keine neuen Daten erzeugt, es wird nichts weiter geladen.
2. Sonst alle übrigen Dateien einmal laden, parsen und prüfen.
3. Nur wenn alles gültig ist, werden die Ablagen überschrieben.
"""
import hashlib
import os
from datetime import datetime, timezone
from urllib.parse import unquote_plus

from . import config, net, store

KILL_COLUMNS = {"kill_att": "att", "kill_def": "def", "kill_sup": "sup", "kill_all": "all"}
# Stündliche Datei ohne Rang: der Rang verschiebt sich bei fast allen Spielern jede Stunde und würde
# die Git-Historie aufblähen (11.09.: 9.527 statt 1.473 geänderte Zeilen pro Stunde). Das Tagesarchiv behält ihn.
PLAYER_HEADER = ["id", "name", "ally", "villages", "points", "att", "def", "sup", "all"]
DAILY_PLAYER_HEADER = ["id", "name", "ally", "villages", "points", "rank", "att", "def", "sup", "all"]
ALLY_HEADER = ["id", "name", "tag", "members", "villages", "points", "all_points", "rank"]
VILLAGE_HEADER = ["id", "name", "x", "y", "player", "points", "bonus"]
CONQUER_HEADER = ["village_id", "ts", "new_owner", "old_owner", "extra"]


class ValidationError(Exception):
    pass


def url(name):
    return f"{config.BASE_URL}/map/{name}.txt.gz"


def _rows(text, min_fields, name):
    rows = []
    for i, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        parts = line.split(",")
        if len(parts) < min_fields:
            raise ValidationError(f"{name}.txt Zeile {i}: {len(parts)} statt mindestens {min_fields} Felder")
        rows.append(parts)
    return rows


def _int(value, name, field):
    try:
        return int(value)
    except ValueError:
        raise ValidationError(f"{name}.txt: Feld {field} ist keine Zahl ({value!r})") from None


def parse_players(text):
    out = {}
    for p in _rows(text, 6, "player"):
        pid = _int(p[0], "player", "id")
        out[pid] = {
            "name": unquote_plus(p[1]),
            "ally": _int(p[2], "player", "ally"),
            "villages": _int(p[3], "player", "villages"),
            "points": _int(p[4], "player", "points"),
            "rank": _int(p[5], "player", "rank"),
        }
    return out


def parse_allies(text):
    out = {}
    for p in _rows(text, 8, "ally"):
        aid = _int(p[0], "ally", "id")
        out[aid] = {
            "name": unquote_plus(p[1]),
            "tag": unquote_plus(p[2]),
            "members": _int(p[3], "ally", "members"),
            "villages": _int(p[4], "ally", "villages"),
            "points": _int(p[5], "ally", "points"),
            "all_points": _int(p[6], "ally", "all_points"),
            "rank": _int(p[7], "ally", "rank"),
        }
    return out


def parse_villages(text):
    out = []
    for p in _rows(text, 7, "village"):
        x, y = _int(p[2], "village", "x"), _int(p[3], "village", "y")
        if not (0 <= x <= 999 and 0 <= y <= 999):
            raise ValidationError(f"village.txt: Koordinate außerhalb der Karte ({x}|{y})")
        out.append([_int(p[0], "village", "id"), unquote_plus(p[1]), x, y,
                    _int(p[4], "village", "player"), _int(p[5], "village", "points"),
                    _int(p[6], "village", "bonus")])
    return out


def parse_kills(text, name):
    return {_int(p[1], name, "id"): _int(p[2], name, "score") for p in _rows(text, 3, name)}


def parse_conquers(text):
    out = []
    for p in _rows(text, 4, "conquer"):
        out.append([_int(p[0], "conquer", "village_id"), _int(p[1], "conquer", "ts"),
                    _int(p[2], "conquer", "new_owner"), _int(p[3], "conquer", "old_owner"),
                    "|".join(p[4:])])
    return out


def validate_counts(state, players, villages, allies):
    prev = state.get("counts", {})
    if len(players) < config.MIN_PLAYERS:
        raise ValidationError(f"nur {len(players)} Spieler, erwartet mindestens {config.MIN_PLAYERS}")
    if len(villages) < config.MIN_VILLAGES:
        raise ValidationError(f"nur {len(villages)} Dörfer, erwartet mindestens {config.MIN_VILLAGES}")
    if not allies:
        raise ValidationError("ally.txt ist leer")
    if prev.get("players") and len(players) < prev["players"] * (1 - config.MAX_PLAYER_DROP):
        raise ValidationError(f"Spielerzahl fiel von {prev['players']} auf {len(players)}")
    if prev.get("villages") and len(villages) < prev["villages"] * (1 - config.MAX_VILLAGE_DROP):
        raise ValidationError(f"Dorfzahl fiel von {prev['villages']} auf {len(villages)}")


def update(state, now_utc, now_local):
    files = state.setdefault("files", {})
    summary = {"changed": False, "downloads": []}

    def remember(name, status, body, headers):
        summary["downloads"].append({"file": name, "status": status, "bytes": len(body),
                                     "last_modified": headers.get("Last-Modified")})

    prev = files.get("player", {})
    cond = {"If-Modified-Since": prev["last_modified"]} if prev.get("last_modified") else {}
    status, body, headers = net.fetch(url("player"), headers=cond)
    remember("player", status, body, headers)
    if status == 304:
        summary["note"] = "Server hat seit dem letzten Lauf keine neuen Weltdaten erzeugt (304)"
        return summary
    if prev.get("sha1") == hashlib.sha1(body).hexdigest():
        summary["note"] = "player.txt inhaltlich unverändert"
        return summary

    bodies = {"player": (body, headers)}
    for name in config.WORLD_FILES:
        if name != "player":
            st, b, h = net.fetch(url(name))
            remember(name, st, b, h)
            bodies[name] = (b, h)

    texts = {n: net.maybe_gunzip(b).decode("utf-8", errors="replace") for n, (b, _) in bodies.items()}
    players = parse_players(texts["player"])
    allies = parse_allies(texts["ally"])
    villages = parse_villages(texts["village"])
    kills = {col: parse_kills(texts[f], f) for f, col in KILL_COLUMNS.items()}
    conquers = parse_conquers(texts["conquer"])
    validate_counts(state, players, villages, allies)

    # Ab hier gilt der Datensatz als gültig: Ablagen schreiben
    player_rows, daily_player_rows = [], []
    for pid in sorted(players):
        p = players[pid]
        bash = [kills["att"].get(pid, 0), kills["def"].get(pid, 0), kills["sup"].get(pid, 0), kills["all"].get(pid, 0)]
        player_rows.append([pid, p["name"], p["ally"], p["villages"], p["points"]] + bash)
        daily_player_rows.append([pid, p["name"], p["ally"], p["villages"], p["points"], p["rank"]] + bash)
    ally_rows = [[aid, a["name"], a["tag"], a["members"], a["villages"], a["points"], a["all_points"], a["rank"]]
                 for aid, a in sorted(allies.items())]
    store.write_csv(store.dpath("latest", "players.csv"), PLAYER_HEADER, player_rows)
    store.write_csv(store.dpath("latest", "allies.csv"), ALLY_HEADER, ally_rows)

    # Tagesarchiv: einmal pro Kalendertag (Serverzeit), Dateien werden danach nie mehr geändert
    day = now_local.date().isoformat()
    for sub, header, rows in (("players", DAILY_PLAYER_HEADER, daily_player_rows),
                              ("allies", ALLY_HEADER, ally_rows),
                              ("villages", VILLAGE_HEADER, sorted(villages))):
        p = store.dpath("daily", sub, f"{day}.csv.gz")
        if not os.path.exists(p):
            store.write_csv_gz(p, header, rows)

    # Eroberungen: nur neue Einträge anhängen, getrennt nach Monat (UTC)
    last_ts = int(state.get("conquer_last_ts", 0))
    new = sorted((c for c in conquers if c[1] > last_ts), key=lambda c: (c[1], c[0]))
    by_month = {}
    for c in new:
        month = datetime.fromtimestamp(c[1], timezone.utc).strftime("%Y-%m")
        by_month.setdefault(month, []).append(c)
    for month, rows in by_month.items():
        store.append_csv(store.dpath("conquers", f"{month}.csv"), CONQUER_HEADER, rows)
    if new:
        state["conquer_last_ts"] = new[-1][1]

    for name, (b, h) in bodies.items():
        store.save_raw(name, b)
        files[name] = {"last_modified": h.get("Last-Modified"), "sha1": hashlib.sha1(b).hexdigest(),
                       "bytes": len(b), "fetched_utc": store.iso(now_utc)}
    state["counts"] = {"players": len(players), "allies": len(allies), "villages": len(villages),
                       "conquers_total": len(conquers)}
    state["data_last_modified"] = headers.get("Last-Modified")
    if not state.get("history_since_utc"):
        state["history_since_utc"] = store.iso(now_utc)
    summary.update(changed=True, counts=dict(state["counts"]), new_conquers=len(new))
    return summary
