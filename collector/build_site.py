"""Baut die statische Seite nach _site: kopiert site/ und erzeugt data/*.json.

Zuwächse (1 h, 24 h, 7 Tage) entstehen aus der Git-Historie von data/latest/players.csv:
Als Vergleich dient jeweils der jüngste Stand, dessen Datenzeitpunkt mindestens so alt ist wie das
Zeitfenster (abzüglich einer kleinen Toleranz). Maßgeblich ist der Erzeugungszeitpunkt der Weltdaten
(Last-Modified aus state.json desselben Commits), nicht der Zeitpunkt des Sammellaufs.

Die Dorfdaten der Karte kommen aus dem Rohdaten-Cache desselben Laufs. Hat der Server keine neuen
Daten erzeugt, ist der Cache leer (jeder Runner startet frisch); dann dient das jüngste Tagesarchiv
als Ersatz. Dörfer werden bewusst nicht stündlich ins Repo geschrieben, siehe HUB.
"""
import argparse
import csv
import gzip
import hashlib
import io
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from . import config, moral, net, store, units, world

WINDOWS = [("1h", 3600, 600), ("6h", 6 * 3600, 1800), ("12h", 12 * 3600, 1800), ("24h", 86400, 1800), ("7d", 7 * 86400, 3600)]
DELTA_FIELDS = ["points", "villages", "att", "def", "sup"]
BASE_FIELDS = ["id", "name", "ally", "villages", "points", "rank", "att", "def", "sup", "all"]


def _git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def _data_time(commit):
    """Erzeugungszeitpunkt der Weltdaten laut state.json im selben Commit (Unix-Zeit) oder None."""
    try:
        state = json.loads(_git("show", f"{commit}:{config.DATA_DIR}/state.json"))
        return int(parsedate_to_datetime(state["data_last_modified"]).timestamp())
    except Exception:
        return None


def _versions(path):
    """Versionen der Datei, neueste zuerst, als (commit, datenzeit). Ersatzweise Commit-Zeit."""
    try:
        out = _git("log", "--since=9 days ago", "--format=%H %ct", "--", path)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []
    result = []
    for line in out.splitlines():
        if line.strip():
            h, ct = line.split()
            result.append((h, _data_time(h) or int(ct)))
    return result


def _csv_at(commit, path):
    return list(csv.DictReader(io.StringIO(_git("show", f"{commit}:{path}"))))


def _iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds")


def _dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def tribe_series(versions, players_path, ally_names, top_ids, max_points=56):
    """Punkte und besiegte Gegner je Stamm über die Zeit, aus der Git-Historie von players.csv.

    Je Datenzeitpunkt nur ein Stand, damit mehrere Läufe mit denselben Weltdaten die Linie nicht
    verdoppeln. Ohne diese Reihe gäbe es auf der Seite nur Momentaufnahmen und keinen Verlauf.
    """
    seen, chosen = set(), []
    for commit, t in versions:                      # versions: neueste zuerst
        if t in seen:
            continue
        seen.add(t)
        chosen.append((commit, t))
        if len(chosen) >= max_points:
            break
    chosen.reverse()
    times, data = [], {tid: {"points": [], "att": [], "def": [], "all": []} for tid in top_ids}
    for commit, t in chosen:
        try:
            rows = _csv_at(commit, players_path)
        except Exception:
            continue
        agg = {tid: [0, 0, 0, 0] for tid in top_ids}
        for r in rows:
            tid = int(r["ally"])
            a = agg.get(tid)
            if a is None:
                continue
            a[0] += int(r["points"]); a[1] += int(r["att"]); a[2] += int(r["def"]); a[3] += int(r["all"])
        times.append(_iso(t))
        for tid in top_ids:
            a = agg[tid]
            d = data[tid]
            d["points"].append(a[0]); d["att"].append(a[1]); d["def"].append(a[2]); d["all"].append(a[3])
    return {"times": times,
            "tribes": [{"id": tid, "tag": ally_names.get(tid, str(tid)), **data[tid]} for tid in top_ids]}


def village_rows():
    """Dörfer als Zeilen nach world.VILLAGE_HEADER plus Herkunft.

    Reihenfolge der Quellen: Rohdaten-Cache des laufenden Sammellaufs (frisch), sonst jüngstes
    Tagesarchiv. Ohne beides (None, None).
    """
    raw = store.load_raw("village")
    if raw:
        return world.parse_villages(net.maybe_gunzip(raw).decode("utf-8", errors="replace")), "cache"
    d = store.dpath("daily", "villages")
    days = sorted(f[:-7] for f in os.listdir(d) if f.endswith(".csv.gz")) if os.path.isdir(d) else []
    if not days:
        return None, None
    with gzip.open(os.path.join(d, f"{days[-1]}.csv.gz"), "rt", encoding="utf-8", newline="") as f:
        rows = [[int(r["id"]), r["name"], int(r["x"]), int(r["y"]),
                 int(r["player"]), int(r["points"]), int(r["bonus"])] for r in csv.DictReader(f)]
    return rows, f"daily:{days[-1]}"


def village_payload(vrows, source, player_index, data_time=None):
    """Kompakte Kartendaten: eine Zeile je Dorf, Koordinate als x*1000+y, Spieler als Zeilennummer
    in players.json (-1 für Barbaren und für Spieler, die dort fehlen, etwa nach einer Löschung)."""
    rows, unknown = [], 0
    for _vid, name, x, y, pid, points, bonus in vrows:
        p = player_index.get(pid, -1)
        if pid and p < 0:
            unknown += 1
        rows.append([x * 1000 + y, p, points, bonus, name])
    rows.sort(key=lambda r: r[0])
    return {"fields": ["xy", "p", "pts", "b", "name"], "rows": rows,
            "source": source, "data_time_utc": data_time, "unknown_players": unknown}


def _cache_bust(out_dir):
    """Hängt an style.css und app.js eine Kennung aus dem Dateiinhalt.

    Ohne sie liefert der Browser nach einer Änderung weiter die alte Fassung aus dem Zwischenspeicher.
    Die Kennung ändert sich nur, wenn sich die Datei wirklich ändert.
    """
    stamps = {}
    for name in ("style.css", "app.js"):
        p = os.path.join(out_dir, name)
        if os.path.exists(p):
            with open(p, "rb") as f:
                stamps[name] = hashlib.sha1(f.read()).hexdigest()[:8]
    if not stamps:
        return
    for fn in os.listdir(out_dir):
        if not fn.endswith(".html"):
            continue
        p = os.path.join(out_dir, fn)
        with open(p, encoding="utf-8") as f:
            html = f.read()
        for name, stamp in stamps.items():
            html = html.replace('"' + name + '"', '"' + name + "?v=" + stamp + '"')
        with open(p, "w", encoding="utf-8") as f:
            f.write(html)


def build(out_dir):
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    shutil.copytree("site", out_dir)
    _cache_bust(out_dir)
    ddir = os.path.join(out_dir, "data")

    players_path = f"{config.DATA_DIR}/latest/players.csv"
    current = store.read_csv(store.dpath("latest", "players.csv"))
    versions = _versions(players_path)
    newest = versions[0][1] if versions else None
    refs = {}
    for key, secs, tol in WINDOWS:
        if newest is None:
            break
        cand = next(((h, ct) for h, ct in versions if ct <= newest - secs + tol), None)
        if cand:
            refs[key] = (cand[1], {int(r["id"]): r for r in _csv_at(cand[0], players_path)})

    # Rang nach Punkten (die stündliche Datei speichert keinen Rang mehr, siehe world.PLAYER_HEADER)
    order = sorted(current, key=lambda r: (-int(r["points"]), int(r["id"])))
    rank_of = {int(r["id"]): i for i, r in enumerate(order, 1)}
    rows = []
    for r in current:
        pid = int(r["id"])
        row = [pid, r["name"]] + [rank_of[pid] if f == "rank" else int(r[f]) for f in BASE_FIELDS[2:]]
        for key, _, _ in WINDOWS:
            old = refs.get(key, (None, {}))[1].get(pid)
            row += [int(r[f]) - int(old[f]) for f in DELTA_FIELDS] if old else [None] * len(DELTA_FIELDS)
        rows.append(row)
    fields = BASE_FIELDS + [f"d{key}_{f}" for key, _, _ in WINDOWS for f in DELTA_FIELDS]
    _dump(os.path.join(ddir, "players.json"), {
        "fields": fields, "rows": rows,
        "data_time_utc": _iso(newest) if newest else None,
        "refs_utc": {k: _iso(v[0]) for k, v in refs.items()},
    })

    # Karte: eigene Datei, damit die Statusseite die rund 300 KB nicht mitladen muss.
    # Ein Fehler hier darf den übrigen Seitenbau nicht verhindern.
    villages = {"count": 0, "source": None}
    try:
        vrows, vsource = village_rows()
        if vrows:
            payload = village_payload(vrows, vsource, {r[0]: i for i, r in enumerate(rows)},
                                      _iso(newest) if newest and vsource == "cache" else None)
            _dump(os.path.join(ddir, "villages.json"), payload)
            villages = {"count": len(payload["rows"]), "source": vsource,
                        "unknown_players": payload["unknown_players"]}
    except Exception as e:  # Karte fehlt, Statusseite bleibt nutzbar
        villages = {"count": 0, "source": None, "error": repr(e)}

    # Moralrechner: Welteinstellung und geschätzte Spieldauer, ebenfalls ohne Einfluss auf den Rest
    moral_info = {"estimated": 0}
    try:
        if vrows:
            state = store.load_state()
            wc = store.load_json(store.dpath("world_config.json"), {}) or {}
            dates = [r.get("date") for name in ("tribe_latest.csv", "top_latest.csv", "deep_latest.csv")
                     for r in store.read_csv(store.dpath("inaday", name))]
            mp = moral.payload(vrows, [r[0] for r in rows], moral.read_conquers(store.dpath("conquers")), dates,
                               state.get("history_since_utc"), newest if vsource == "cache" else None,
                               wc.get("settings"), state.get("world_config_checked_utc"))
            _dump(os.path.join(ddir, "moral.json"), mp)
            moral_info = {"estimated": mp["estimated"], "moral": mp["moral"]}
    except Exception as e:
        moral_info = {"estimated": 0, "error": repr(e)}

    # Laufzeiten auf der Karte: Einheitendaten plus Weltgeschwindigkeit
    unit_info = {"units": 0}
    try:
        ui = store.load_json(store.dpath("unit_info.json"), {}) or {}
        wc = store.load_json(store.dpath("world_config.json"), {}) or {}
        if ui.get("settings"):
            up = units.payload(ui["settings"], wc.get("settings"))
            _dump(os.path.join(ddir, "units.json"), up)
            unit_info = {"units": len(up["units"])}
    except Exception as e:
        unit_info = {"units": 0, "error": repr(e)}

    allies = store.read_csv(store.dpath("latest", "allies.csv"))
    ally_fields = ["id", "name", "tag", "members", "villages", "points", "all_points", "rank"]
    _dump(os.path.join(ddir, "allies.json"), {
        "fields": ally_fields,
        "rows": [[int(a["id"]), a["name"], a["tag"]] + [int(a[f]) for f in ally_fields[3:]] for a in allies],
    })

    # Zeitverlauf der stärksten Stämme, damit die Seite Linien zeigen kann statt nur Momentaufnahmen
    series = {"times": [], "tribes": []}
    try:
        top_ids = [int(a["id"]) for a in sorted(allies, key=lambda a: -int(a["points"]))[:60]]
        names = {int(a["id"]): (a["tag"] or a["name"]) for a in allies}
        series = tribe_series(versions, players_path, names, top_ids)
    except Exception as e:
        series = {"times": [], "tribes": [], "error": repr(e)}
    _dump(os.path.join(ddir, "series.json"), series)

    records = store.read_csv(store.dpath("inaday", "tribe_latest.csv"))
    events = store.read_csv(store.dpath("inaday", "events.csv"))
    top = store.read_csv(store.dpath("inaday", "top_latest.csv"))
    deep = store.read_csv(store.dpath("inaday", "deep_latest.csv"))
    rec_rows = [[int(r["player_id"]), r["type"], int(r["rank"]), int(r["value"]), r["date"]] for r in records]
    top_rows = [[int(r["player_id"]), r["type"], int(r["rank"]), int(r["value"]), r["date"]] for r in top]
    # Die Karte braucht beides in einem Zugriff: Mitglieder der erfassten Stämme und die Weltspitze.
    seen = {(r[0], r[1]) for r in rec_rows}
    _dump(os.path.join(ddir, "tribe.json"), {
        "tribe_ids": config.TRIBE_IDS,
        "records": rec_rows,
        "top": top_rows,
        "inaday_all": rec_rows + [r for r in top_rows if (r[0], r[1]) not in seen],
        "events": events[-200:],
    })

    # Die vollständigen Ranglisten sind zu groß für tribe.json und werden erst geladen,
    # wenn jemand eine Ranglisten-Ansicht öffnet.
    deep_rows = [[int(r["player_id"]), r["type"], int(r["rank"]), int(r["value"]), r["date"]] for r in deep]
    if deep_rows:
        types = sorted({r[1] for r in deep_rows})
        _dump(os.path.join(ddir, "inaday.json"), {
            "types": types, "rows": deep_rows,
            "counts": {t: sum(1 for r in deep_rows if r[1] == t) for t in types},
        })

    status = store.load_json(store.dpath("status.json"), {}) or {}
    runs = store.read_csv(store.dpath("runs.csv"))
    _dump(os.path.join(ddir, "meta.json"), {
        "built_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "status": status,
        "runs": runs[-48:],
        "world": config.WORLD,
    })
    return {"players": len(rows), "refs": sorted(refs), "allies": len(allies),
            "records": len(records), "top": len(top_rows), "deep": len(deep_rows), "villages": villages, "moral": moral_info, "units": unit_info}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="_site")
    args = ap.parse_args(argv)
    print(json.dumps(build(args.out), ensure_ascii=False))


if __name__ == "__main__":
    main()
