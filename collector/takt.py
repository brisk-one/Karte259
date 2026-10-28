"""Stundentakt des langen Sammellaufs (Entscheidung 8.1a, 29.10.2026).

Ein Lauf auf GitHub Actions bleibt rund 5,5 h aktiv und ruft diesen Befehl vor jedem Abruf auf:

    python3 -m collector.takt warten --ende 2026-10-29T05:20:00Z

Er wartet bis zum nächsten fälligen Abruf und meldet über GITHUB_OUTPUT `abruf=true`, oder sofort
`abruf=false`, wenn der nächste Abruf nach dem Ende des Laufs läge. Nach dem Warten und `git pull`
prüft `python3 -m collector.takt faellig` noch einmal (`faellig=true/false`), ob inzwischen ein anderer
Lauf geholt hat.

Fällig ist ein Abruf einmal je Stundenfenster: Der Server erzeugt die Weltdaten etwa zur Minute 47 bis 53 (UTC), ein Fenster beginnt
deshalb zur Minute 50 und es wird ab Minute 55 geholt. Hat schon ein Lauf im aktuellen Fenster geholt
(letzte Zeile von data/runs.csv), wird bis zum nächsten Fenster gewartet. So holen sich überlappende
Läufe nichts doppelt.
"""
import argparse
import os
import sys
import time
from datetime import datetime, timedelta, timezone

from . import store

FENSTER_BEGINN = 50   # Minute, ab der die Weltdaten einer Stunde als erzeugt gelten
ABRUF_MINUTE = 55     # Minute des Abrufs, kurz nach der Erzeugung


def fenster(t):
    """Stundenfenster eines Zeitpunkts als volle Stunde, in deren Minute 50 es beginnt."""
    return (t - timedelta(minutes=FENSTER_BEGINN)).replace(minute=0, second=0, microsecond=0)


def naechster_abruf(now, letzter):
    """Zeitpunkt des nächsten Abrufs: im aktuellen Fenster, falls dort noch keiner war, sonst im nächsten."""
    f = fenster(now)
    if letzter is not None and fenster(letzter) >= f:
        f += timedelta(hours=1)
    return max(now, f + timedelta(minutes=ABRUF_MINUTE))


def letzter_lauf(path=None):
    rows = store.read_csv(path or store.dpath("runs.csv"))
    for r in reversed(rows):
        t = _parse(r.get("run_utc"))
        if t:
            return t
    return None


def _parse(s):
    if not s:
        return None
    try:
        t = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _ausgabe(**kw):
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            for k, v in kw.items():
                f.write(f"{k}={v}\n")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("befehl", choices=["warten", "faellig"])
    ap.add_argument("--ende", help="spätester Abruf (ISO, UTC), nur für warten")
    args = ap.parse_args(argv)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    ziel = naechster_abruf(now, letzter_lauf())
    if args.befehl == "faellig":
        faellig = ziel <= now
        print("Abruf fällig." if faellig else f"Im aktuellen Fenster wurde schon geholt, nächster Abruf {store.iso(ziel)}.")
        _ausgabe(faellig="true" if faellig else "false")
        return 0
    ende = _parse(args.ende)
    if ziel > ende:
        print(f"Nächster Abruf {store.iso(ziel)} liegt nach dem Laufende {store.iso(ende)}, kein Abruf mehr.")
        _ausgabe(abruf="false")
        return 0
    warte = (ziel - now).total_seconds()
    print(f"Warte {warte / 60:.1f} min bis {store.iso(ziel)}.", flush=True)
    if warte > 0:
        time.sleep(warte)
    _ausgabe(abruf="true")
    return 0


if __name__ == "__main__":
    sys.exit(main())
