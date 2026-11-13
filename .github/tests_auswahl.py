"""Welche JS-Tests vor dem Seiten-Bau laufen (Dennis 14.11.2026 00:56: Bereiche sollen sich nicht stören).

Bisher liefen vor jedem Seiten-Bau alle Tests, auch nach einem reinen Datenabruf; ein wackliger Test des
Prägerechners hätte so einen Deploy des Angriffsplaners oder die stündlichen Daten aufgehalten. Jetzt laufen
nur die Tests der Bereiche, deren Dateien sich seit dem letzten erfolgreichen Seiten-Bau (Push oder „Seite“)
geändert haben. Ist ein Code-Push durchgefallen, holt der nächste Bau dessen Tests nach, ungetesteter Code geht
also nicht live. Ohne gesicherten Bezugspunkt, bei geändertem Workflow oder gemeinsamen Dateien: alle Tests.

Aufruf: python3 .github/tests_auswahl.py runs.json <eigene run_id>; schreibt name=true|false nach $GITHUB_OUTPUT.
"""
import json
import os
import re
import subprocess
import sys

BEREICHE = {
    "praegen": r"^(site/praegen|tests/praegen)",
    "angriff": r"^(site/angriff-core\.js|tests/angriff\.test\.js)",
    "zusatz": r"^(site/(zusatz\.json|app\.js|angriff\.html|aufstocken\.html)|tools/zusatz|tests/zusatz)",
    "truppen": r"^(site/truppen|tests/truppen)",
    "sortieren": r"^(site/angriff-core\.js|site/sortieren|tests/sortieren)",
}
# gemeinsam genutzt oder der Ablauf selbst: alles testen
ALLE = r"^(\.github/|site/app\.js$|site/style\.css$|package\.json$)"


def auswahl(dateien):
    """dateien: Liste geänderter Pfade, None = unbekannt. Ergebnis {bereich: bool}."""
    if dateien is None or any(re.match(ALLE, d) for d in dateien):
        return {b: True for b in BEREICHE}
    return {b: any(re.match(m, d) for d in dateien) for b, m in BEREICHE.items()}


def bezug(runs, eigen):
    """Commit des letzten erfolgreichen Seiten-Baus (Push oder „Seite“, nicht der lange „Lauf“)."""
    kand = [r for r in runs if r.get("conclusion") == "success" and str(r.get("id")) != str(eigen)
            and r.get("display_title") != "Lauf"]
    kand.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return kand[0]["head_sha"] if kand else None


def geaendert(sha):
    if not sha or subprocess.run(["git", "cat-file", "-e", sha + "^{commit}"], capture_output=True).returncode:
        return None
    r = subprocess.run(["git", "diff", "--name-only", sha, "HEAD"], capture_output=True, text=True)
    return None if r.returncode else [z for z in r.stdout.splitlines() if z]


def main():
    try:
        runs = json.load(open(sys.argv[1], encoding="utf-8")).get("workflow_runs", [])
    except (OSError, ValueError, IndexError):
        runs = []
    sha = bezug(runs, sys.argv[2] if len(sys.argv) > 2 else "")
    dateien = geaendert(sha)
    wahl = auswahl(dateien)
    print("Bezug:", sha or "keiner", "·", "geänderte Dateien unbekannt, alle Tests" if dateien is None else f"{len(dateien)} Dateien geändert")
    for b, ja in wahl.items():
        print(f"  {b}: {'läuft' if ja else 'entfällt'}")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
            for b, ja in wahl.items():
                f.write(f"{b}={'true' if ja else 'false'}\n")


if __name__ == "__main__":
    main()
