"""Bash-Ranglisten im Gastzugang, stündlich (Dennis 1b, 29.10.2026).

Die Weltdaten (players.csv) erneuern die besiegten Gegner nur alle 3 Stunden. Die Rangliste „Besiegte Gegner“
im Gastzugang ist frischer (Probe 29.10.2026 11:55 UTC: nie niedriger, bis zu +304.000 Deff gegenüber den
Weltdaten). Je Lauf werden deshalb die ersten SEITEN Seiten zu je 25 Spielern für Angreifer, Verteidiger und
Unterstützer geholt (Top 500, 60 Abrufe) und nach data/bash/latest.csv geschrieben; die Git-Historie der
Datei ist der Stundenverlauf.

Werte ab 1 Mio. zeigt die Seite nur gerundet („7,60 Mio.“, also auf 10.000); sie stehen mit genau=0 in der
Datei. Darunter sind die Werte exakt.
"""
import re

from . import config, inaday, net, store

TYPEN = ("att", "def", "support")
SEITEN = 20
PRO_SEITE = 25
HEADER = ["type", "rank", "player_id", "name", "ally_id", "value", "genau"]
MIO_RE = re.compile(r"(\d+(?:,\d+)?)\s*Mio", re.I)


def page_url(type_, offset=0):
    u = f"{config.BASE_URL}/guest.php?screen=ranking&mode=kill_player&type={type_}"
    return u + (f"&offset={offset}" if offset else "")


def wert(text):
    """(Wert, genau): „7,60 Mio.“ -> (7600000, False), „123.456“ -> (123456, True), sonst (None, False)."""
    m = MIO_RE.search(text)
    if m:
        return round(float(m.group(1).replace(",", ".")) * 1_000_000), False
    digits = re.sub(r"\D", "", text)
    return (int(digits), True) if digits else (None, False)


def parse(html):
    """Datenzeilen der Ranglisten-Tabelle (Rang, Name, Stamm, Besiegt) als dicts."""
    p = inaday._Tables()
    p.feed(html)
    p.close()
    best = []
    for rows in p.tables:
        kopf = next((i for i, r in enumerate(rows)
                     if any(c["text"].startswith("Rang") for c in r) and any(c["text"].startswith("Name") for c in r)), None)
        if kopf is None:
            continue
        head = [c["text"] for c in rows[kopf]]
        col = lambda prefix, fb: next((j for j, t in enumerate(head) if t.startswith(prefix)), fb)
        c_rank, c_name, c_ally = col("Rang", 0), col("Name", 1), col("Stamm", 2)
        c_wert = col("Besiegt", col("Punkte", len(head) - 1))
        out = []
        for r in rows[kopf + 1:]:
            if len(r) <= max(c_rank, c_name, c_wert) or not re.fullmatch(r"[\d.]+", r[c_rank]["text"]):
                continue
            v, genau = wert(r[c_wert]["text"])
            pid = inaday._id_from(r[c_name], "info_player")
            if v is None or pid is None:
                continue
            ally = inaday._id_from(r[c_ally], "info_ally") if c_ally < len(r) else None
            out.append({"rank": inaday._num(r[c_rank]["text"]), "player_id": pid, "name": r[c_name]["text"],
                        "ally_id": ally or 0, "value": v, "genau": int(genau)})
        if len(out) > len(best):
            best = out
    return best


def update():
    """Holt die Ranglisten und schreibt data/bash/latest.csv. Fehlt ein Typ ganz, bleiben dessen alte Zeilen
    stehen, damit eine gestörte Stunde keinen Sprung auf null vortäuscht."""
    summary = {"rows": {}, "pages": 0, "errors": []}
    path = store.dpath("bash", "latest.csv")
    neu = {}
    for t in TYPEN:
        rows, seen = [], set()
        for s in range(SEITEN):
            try:
                html = inaday._get(page_url(t, s * PRO_SEITE))
            except net.FetchError as e:
                summary["errors"].append(f"{t} Seite {s + 1}: {e}")
                break
            summary["pages"] += 1
            page = [r for r in parse(html) if r["player_id"] not in seen]
            if not page:
                if s == 0:
                    summary["errors"].append(f"{t}: keine Tabellenzeilen erkannt")
                break
            seen.update(r["player_id"] for r in page)
            rows += page
            if len(page) < PRO_SEITE:
                break
        if rows:
            neu[t] = rows
            summary["rows"][t] = len(rows)
    if not neu:
        return summary
    alt = [r for r in store.read_csv(path) if r["type"] not in neu]
    out = [[r["type"], int(r["rank"]), int(r["player_id"]), r["name"], int(r["ally_id"]), int(r["value"]), int(r["genau"])]
           for r in alt]
    for t, rows in neu.items():
        out += [[t, r["rank"], r["player_id"], r["name"], r["ally_id"], r["value"], r["genau"]] for r in rows]
    store.write_csv(path, HEADER, sorted(out, key=lambda r: (r[0], r[1], r[2])))
    return summary
