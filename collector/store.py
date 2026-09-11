"""Dateiablage: Zustand, CSV/JSON schreiben, Rohdaten-Cache. Schreibvorgänge sind atomar (tmp + replace)."""
import csv
import gzip
import io
import json
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from . import config

TZ = ZoneInfo(config.TZ)


def dpath(*parts):
    return os.path.join(config.DATA_DIR, *parts)


def now_pair():
    utc = datetime.now(timezone.utc).replace(microsecond=0)
    return utc, utc.astimezone(TZ)


def iso(dt):
    return dt.isoformat(timespec="seconds") if dt else None


def _prepare(p):
    d = os.path.dirname(p)
    if d:
        os.makedirs(d, exist_ok=True)
    return p + ".tmp"


def load_json(p, default=None):
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(p, obj, indent=1):
    tmp = _prepare(p)
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent, sort_keys=True)
        f.write("\n")
    os.replace(tmp, p)


def load_state():
    return load_json(dpath("state.json"), {}) or {}


def save_state(state):
    save_json(dpath("state.json"), state)


def _csv_text(header, rows):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    if header:
        w.writerow(header)
    w.writerows(rows)
    return buf.getvalue()


def write_csv(p, header, rows):
    tmp = _prepare(p)
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(_csv_text(header, rows))
    os.replace(tmp, p)


def write_csv_gz(p, header, rows):
    tmp = _prepare(p)
    with open(tmp, "wb") as f:
        f.write(gzip.compress(_csv_text(header, rows).encode("utf-8"), mtime=0))
    os.replace(tmp, p)


def append_csv(p, header, rows):
    new = not os.path.exists(p)
    _prepare(p)
    with open(p, "a", encoding="utf-8", newline="") as f:
        f.write(_csv_text(header if new else None, rows))


def read_csv(p):
    if not os.path.exists(p):
        return []
    with open(p, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def save_raw(name, body):
    p = os.path.join(config.CACHE_DIR, f"{name}.txt.gz")
    tmp = _prepare(p)
    with open(tmp, "wb") as f:
        f.write(body)
    os.replace(tmp, p)


def load_raw(name):
    p = os.path.join(config.CACHE_DIR, f"{name}.txt.gz")
    if os.path.exists(p):
        with open(p, "rb") as f:
            return f.read()
    return None
