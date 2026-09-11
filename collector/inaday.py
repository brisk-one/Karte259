"""Rangliste "An einem Tag" (Gastzugang, nur HTML).

Die Seite zeigt pro Spieler den besten Tag (0:00 bis 23:59) je Kategorie samt Datum.
Ablauf pro Lauf:
1. Änderungs-Check: Seite 1 jeder Kategorie (7 Abrufe) wird mit dem Vorlauf verglichen.
2. Volle Stammes-Erhebung (Mitglieder x Kategorien per Namensfilter) nur, wenn sich eine Seite 1 geändert
   hat oder die letzte volle Erhebung älter als FULL_SCRAPE_MAX_AGE_H ist.
Relative Datumsangaben ("Heute", "Gestern") werden in echte Daten umgerechnet, damit der Datumswechsel um
Mitternacht nicht als Änderung zählt.
"""
import hashlib
import json
import os
import re
import time
from datetime import datetime, timedelta
from html.parser import HTMLParser
from urllib.parse import quote_plus

from . import config, net, store

LATEST_HEADER = ["player_id", "name", "type", "rank", "value", "date"]
EVENTS_HEADER = ["detected_utc", "player_id", "name", "type", "old_value", "new_value", "rank", "date"]
ID_RE = re.compile(r"[?&;]id=(\d+)")
DATE_RE = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{2,4})")


def page_url(type_, offset=0, name=None):
    u = f"{config.BASE_URL}/guest.php?screen=ranking&mode=in_a_day&type={type_}"
    if offset:
        u += f"&offset={offset}"
    if name is not None:
        u += "&name=" + quote_plus(name)
    return u


class _Tables(HTMLParser):
    """Sammelt alle Tabellen (auch verschachtelte) als Zeilen mit Zellen {text, hrefs}."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self._stack = []  # je Tabelle: {"rows": [], "row": None, "cell": None}

    def _close_cell(self, fr):
        if fr["cell"] is not None and fr["row"] is not None:
            fr["cell"]["text"] = " ".join(fr["cell"]["text"].split())
            fr["row"].append(fr["cell"])
        fr["cell"] = None

    def _close_row(self, fr):
        self._close_cell(fr)
        if fr["row"]:
            fr["rows"].append(fr["row"])
        fr["row"] = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._stack.append({"rows": [], "row": None, "cell": None})
            return
        if not self._stack:
            return
        fr = self._stack[-1]
        if tag == "tr":
            self._close_row(fr)
            fr["row"] = []
        elif tag in ("td", "th"):
            if fr["row"] is None:
                fr["row"] = []
            self._close_cell(fr)
            fr["cell"] = {"text": "", "hrefs": []}
        elif tag == "a" and fr["cell"] is not None:
            href = dict(attrs).get("href")
            if href:
                fr["cell"]["hrefs"].append(href)

    def handle_endtag(self, tag):
        if not self._stack:
            return
        fr = self._stack[-1]
        if tag in ("td", "th"):
            self._close_cell(fr)
        elif tag == "tr":
            self._close_row(fr)
        elif tag == "table":
            self._close_row(fr)
            self.tables.append(self._stack.pop()["rows"])

    def handle_data(self, data):
        if self._stack and self._stack[-1]["cell"] is not None:
            self._stack[-1]["cell"]["text"] += data


def _num(text):
    digits = re.sub(r"\D", "", text)
    return int(digits) if digits else None


def norm_date(raw, today):
    low = raw.lower()
    if "heute" in low:
        return today.isoformat()
    if "gestern" in low:
        return (today - timedelta(days=1)).isoformat()
    m = DATE_RE.search(raw)
    if m:
        d, mo, y = (int(g) for g in m.groups())
        if y < 100:
            y += 2000
        try:
            return datetime(y, mo, d).date().isoformat()
        except ValueError:
            return None
    return None


def _id_from(cell, kind):
    for h in cell["hrefs"]:
        if f"screen={kind}" in h or f"screen%3D{kind}" in h:
            m = ID_RE.search(h)
            if m:
                return int(m.group(1))
    return None


def parse_ranking(html, today):
    """Liefert die Datenzeilen der Ranglisten-Tabelle als Liste von dicts (leer, wenn nichts erkannt)."""
    parser = _Tables()
    parser.feed(html)
    parser.close()
    best = []
    for rows in parser.tables:
        header_idx = None
        for i, row in enumerate(rows):
            texts = [c["text"] for c in row]
            if any(t.startswith("Rang") for t in texts) and any(t.startswith("Name") for t in texts):
                header_idx = i
                break
        if header_idx is None:
            continue
        head = [c["text"] for c in rows[header_idx]]

        def col(prefix, fallback):
            for j, t in enumerate(head):
                if t.startswith(prefix):
                    return j
            return fallback

        c_rank, c_name = col("Rang", 0), col("Name", 1)
        c_tribe, c_date = col("Stamm", 2), col("Datum", len(head) - 1)
        c_value = col("Punkte", c_date - 1)
        data = []
        for row in rows[header_idx + 1:]:
            if len(row) <= max(c_rank, c_name, c_value, c_date):
                continue
            if not re.fullmatch(r"[\d.]+", row[c_rank]["text"]):
                continue
            value = _num(row[c_value]["text"])
            if value is None:
                continue
            tribe_cell = row[c_tribe] if c_tribe < len(row) else {"text": "", "hrefs": []}
            data.append({
                "rank": _num(row[c_rank]["text"]),
                "name": row[c_name]["text"],
                "player_id": _id_from(row[c_name], "info_player"),
                "tribe": tribe_cell["text"],
                "tribe_id": _id_from(tribe_cell, "info_ally"),
                "value": value,
                "date": norm_date(row[c_date]["text"], today),
                "date_raw": row[c_date]["text"],
            })
        if len(data) > len(best):
            best = data
    return best


def signature(rows):
    payload = [[r["rank"], r["player_id"] or r["name"], r["value"], r["date"]] for r in rows]
    return hashlib.sha1(json.dumps(payload, ensure_ascii=False).encode("utf-8")).hexdigest()


def _get(url):
    status, body, _ = net.fetch(url, kind="guest")
    time.sleep(config.GUEST_DELAY_S)
    return net.maybe_gunzip(body).decode("utf-8", errors="replace")


def _save_debug(name, html):
    p = store.dpath("debug", name)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(html)


def update(state, now_utc, now_local, members):
    """members: Liste von (player_id, name) der erfassten Stämme."""
    st = state.setdefault("inaday", {})
    sigs = st.setdefault("signatures", {})
    today = now_local.date()
    summary = {"changed_types": [], "full_scrape": False, "errors": [], "top_rows": {}}
    save_samples = not st.get("samples_saved")

    for t in config.INADAY_TYPES:
        try:
            html = _get(page_url(t))
        except net.FetchError as e:
            summary["errors"].append(f"{t}: {e}")
            continue
        rows = parse_ranking(html, today)
        if save_samples and t == config.INADAY_TYPES[0]:
            _save_debug(f"sample_{t}_page1.html", html)
        if not rows:
            summary["errors"].append(f"{t}: keine Tabellenzeilen erkannt")
            _save_debug(f"unparsed_{t}_page1.html", html)
            continue
        summary["top_rows"][t] = len(rows)
        sig = signature(rows)
        if sigs.get(t) and sigs[t] != sig:
            summary["changed_types"].append(t)
        sigs[t] = sig

    last_full = st.get("last_full_scrape_utc")
    too_old = (not last_full) or (now_utc - datetime.fromisoformat(last_full)
                                  >= timedelta(hours=config.FULL_SCRAPE_MAX_AGE_H))
    if not members or not (too_old or summary["changed_types"]):
        return summary

    results, sample_done = {}, not save_samples
    for pid, name in members:
        for t in config.INADAY_TYPES:
            try:
                html = _get(page_url(t, name=name))
            except net.FetchError as e:
                summary["errors"].append(f"{t}/{name}: {e}")
                continue
            if not sample_done:
                _save_debug(f"sample_{t}_name_filter.html", html)
                sample_done = True
            rows = parse_ranking(html, today)
            hit = next((r for r in rows if r["player_id"] == pid), None)
            if hit is None:
                hit = next((r for r in rows if r["name"] == name), None)
            if hit:
                results[(pid, t)] = hit

    latest_path = store.dpath("inaday", "tribe_latest.csv")
    prev = {(int(r["player_id"]), r["type"]): r for r in store.read_csv(latest_path)}
    names = dict(members)
    events = []
    for (pid, t), r in sorted(results.items()):
        old = prev.get((pid, t))
        if old is None or int(old["value"]) != r["value"] or old["date"] != (r["date"] or ""):
            events.append([store.iso(now_utc), pid, names[pid], t, old["value"] if old else "",
                           r["value"], r["rank"], r["date"] or ""])
    rows_out = [[pid, names[pid], t, r["rank"], r["value"], r["date"] or ""]
                for (pid, t), r in sorted(results.items(), key=lambda kv: (names[kv[0][0]].lower(), kv[0][1]))]
    store.write_csv(latest_path, LATEST_HEADER, rows_out)
    if events:
        store.append_csv(store.dpath("inaday", "events.csv"), EVENTS_HEADER, events)
    st["last_full_scrape_utc"] = store.iso(now_utc)
    st["samples_saved"] = True
    summary.update(full_scrape=True, members=len(members), entries=len(results), events=len(events))
    return summary
