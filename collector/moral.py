"""Daten für den Moralrechner: Welteinstellung und geschätzte Spieldauer je Spieler.

Die zeitbasierte Moral hängt davon ab, wie lange der Verteidiger schon auf der Welt ist. Die Weltdaten
nennen keinen Startzeitpunkt. Geschätzt wird er über das Startdorf: Dorf-IDs werden fortlaufend
vergeben (HUB 5, geprüft 15.09.), die kleinste ID unter den Dörfern, die ein Spieler nicht erobert hat,
ist also sein Startdorf. Die Uhr dazu entsteht aus Stützpunkten (höchste Dorf-ID zu bekannten Zeitpunkten
aus den Tagesarchiven und dem aktuellen Lauf) plus dem Weltstart. Zwischen den Stützpunkten wird linear
gerechnet. Die Moral ändert sich um 0,2 Prozentpunkte je Tag, ein Fehler von einigen Tagen ist deshalb klein.
"""
import csv
import gzip
import os
from bisect import bisect_right
from datetime import datetime, time

from . import store

DAY = 86400


def clock_points(daily_dir, history_since_utc=None, current=None, world_start=None):
    """Stützpunkte (höchste Dorf-ID, Unix-Zeit), aufsteigend nach ID und monoton in der Zeit.

    Ein Tagesarchiv entsteht beim ersten Lauf eines Tages kurz nach Mitternacht (Serverzeit), das
    erste Archiv beim allerersten Lauf (history_since_utc).
    """
    pts = []
    first = None
    if history_since_utc:
        first = datetime.fromisoformat(history_since_utc)
    days = sorted(f[:-7] for f in os.listdir(daily_dir) if f.endswith(".csv.gz")) if os.path.isdir(daily_dir) else []
    for day in days:
        with gzip.open(os.path.join(daily_dir, f"{day}.csv.gz"), "rt", encoding="utf-8", newline="") as f:
            top = max((int(r["id"]) for r in csv.DictReader(f)), default=0)
        midnight = datetime.combine(datetime.fromisoformat(day).date(), time(0, 30), store.TZ)
        ts = first if first and first.astimezone(store.TZ).date().isoformat() == day else midnight
        pts.append((top, int(ts.timestamp())))
    if current:
        pts.append(current)
    if world_start is not None:
        pts.append((0, world_start))
    pts.sort()
    out = []
    for vid, ts in pts:
        if out and ts < out[-1][1]:
            ts = out[-1][1]          # höhere ID kann nicht älter sein
        out.append((vid, ts))
    return out


def id_time(points, vid):
    """Entstehungszeit einer Dorf-ID nach den Stützpunkten, außerhalb begrenzt auf den Rand."""
    if not points:
        return None
    ids = [p[0] for p in points]
    i = bisect_right(ids, vid)
    if i == 0:
        return points[0][1]
    if i == len(points):
        return points[-1][1]
    (a, ta), (b, tb) = points[i - 1], points[i]
    return int(ta + (tb - ta) * (vid - a) / (b - a)) if b > a else ta


def join_times(vrows, conquers, points):
    """Geschätzter Start je Spieler (Unix-Zeit).

    vrows: Dörfer nach world.VILLAGE_HEADER, conquers: (village_id, ts, new_owner, old_owner).
    Hat ein Spieler vor dem geschätzten Start schon erobert, gilt die erste Eroberung als spätester Start.
    Ohne eigenes Startdorf (verloren) bleibt nur die erste Eroberung, sonst kein Wert.
    """
    taken = {(int(c[0]), int(c[2])) for c in conquers}
    first_conq = {}
    for c in conquers:
        pid, ts = int(c[2]), int(c[1])
        if pid and (pid not in first_conq or ts < first_conq[pid]):
            first_conq[pid] = ts
    start_id = {}
    for vid, _name, _x, _y, pid, _pts, _b in vrows:
        if pid and (vid, pid) not in taken and (pid not in start_id or vid < start_id[pid]):
            start_id[pid] = vid
    out = {}
    for pid in {r[4] for r in vrows if r[4]}:
        est = id_time(points, start_id[pid]) if pid in start_id else None
        fc = first_conq.get(pid)
        if est is None:
            est = fc
        elif fc is not None:
            est = min(est, fc)
        if est is not None:
            out[pid] = est
    return out


def world_start(conquers, record_dates):
    """Frühester belegter Zeitpunkt der Welt: erste Eroberung oder frühestes Rekorddatum (Mitternacht)."""
    cands = [int(c[1]) for c in conquers]
    for d in record_dates:
        try:
            cands.append(int(datetime.combine(datetime.fromisoformat(d).date(), time(0), store.TZ).timestamp()))
        except (TypeError, ValueError):
            continue
    return min(cands) if cands else None


def read_conquers(conquer_dir):
    rows = []
    if os.path.isdir(conquer_dir):
        for fn in sorted(os.listdir(conquer_dir)):
            if fn.endswith(".csv"):
                rows += [(int(r["village_id"]), int(r["ts"]), int(r["new_owner"]), int(r["old_owner"]))
                         for r in store.read_csv(os.path.join(conquer_dir, fn))]
    return rows


def moral_type(settings):
    """Moraltyp aus get_config: 0 keine, 1 nach Punkten, 2 nach Punkten und Zeit, 3 vermutlich zeitlich
    begrenzt nach Punkten (Welt 259 meldet 3). None, wenn unbekannt."""
    try:
        return int((settings or {}).get("moral"))
    except (TypeError, ValueError):
        return None


def payload(vrows, player_ids, conquers, record_dates, history_since_utc, data_time, settings, checked_utc):
    """moral.json: Start je Spieler als Tage nach Weltstart (eine Nachkommastelle), ausgerichtet an
    players.json, dazu die Welteinstellungen."""
    start = world_start(conquers, record_dates)
    current = (max(r[0] for r in vrows), data_time) if vrows and data_time else None
    points = clock_points(store.dpath("daily", "villages"), history_since_utc, current, start)
    joins = join_times(vrows, conquers, points)
    base = start if start is not None else (min(joins.values()) if joins else 0)
    days = [round((joins[pid] - base) / DAY, 1) if pid in joins else None for pid in player_ids]
    return {
        "world_start_utc": datetime.fromtimestamp(base, store.TZ).isoformat(timespec="seconds") if base else None,
        "join_days": days,
        "clock_points": len(points),
        "estimated": sum(1 for d in days if d is not None),
        "moral": moral_type(settings),
        "settings": settings or {},
        "settings_checked_utc": checked_utc,
    }
