"""Welche JS-Tests vor dem Seiten-Bau laufen (Dennis 14.11.2026 00:56: Bereiche sollen sich nicht stören).

Bisher liefen vor jedem Seiten-Bau alle Tests, auch nach einem reinen Datenabruf; ein wackliger Test des
Prägerechners hätte so einen Deploy des Angriffsplaners oder die stündlichen Daten aufgehalten. Jetzt laufen
nur die Tests der Bereiche, deren Dateien sich seit dem letzten erfolgreichen Seiten-Bau (Push oder „Seite“)
geändert haben. Ist ein Code-Push durchgefallen, holt der nächste Bau dessen Tests nach, ungetesteter Code geht
also nicht live. Ohne gesicherten Bezugspunkt, bei geändertem Workflow oder gemeinsamen Dateien: alle Tests.

Aufruf im Workflow: python3 .github/tests_auswahl.py runs.json <eigene run_id>; schreibt name=true|false nach $GITHUB_OUTPUT.
Lokal vor dem Testen (Dennis 14.11.2026 01:11: nur testen, was die Änderung wirklich betrifft):
  python3 .github/tests_auswahl.py --lokal [Basis, Standard origin/main]
vergleicht die Arbeitskopie (auch nicht committete und neue Dateien) mit der Basis und nennt die Testbefehle
und die Seiten für den Browsertest. Diese Datei ist die eine Quelle für die Zuordnung Bereich → Tests.
"""
import json
import os
import re
import subprocess
import sys

BEREICHE = {
    "praegen": r"^(site/praegen|tests/praegen)",
    "angriff": r"^(site/angriff-core\.js|tests/angriff\.test\.js)",
    "zusatz": r"^(site/(zusatz\.json|app\.js|angriff\.html|aufstocken\.html|deff\.html)|tools/zusatz|tests/zusatz)",
    "truppen": r"^(site/truppen|tests/truppen)",
    "sortieren": r"^(site/angriff-core\.js|site/sortieren|tests/sortieren)",
    "begleit": r"^(site/angriff-core\.js|site/aufstocken|tests/begleit)",
    "deff": r"^(site/angriff-core\.js|site/sortieren\.js|site/deff|tests/deff)",
}
# gemeinsam genutzt oder der Ablauf selbst: alles testen
ALLE = r"^(\.github/|site/app\.js$|site/style\.css$|package\.json$)"
BEFEHL = {
    "praegen": "node --test tests/praegen.test.js",
    "angriff": "node --test tests/angriff.test.js",
    "zusatz": "node --test tests/zusatz.test.js",
    "truppen": "node --test tests/truppen.test.js",
    "sortieren": "node --test tests/sortieren.test.js",
    "begleit": "node --test tests/begleit.test.js",
    "deff": "node --test tests/deff.test.js",
}
PYTHON = r"^(collector/|tests/test_.*\.py$|\.github/)"


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


def seiten(dateien, site="site"):
    """Seiten für den Browsertest: geänderte HTML-Seiten und Seiten, die eine geänderte Skriptdatei laden."""
    if dateien is None:
        return ["alle"]
    if any(re.match(r"^site/(app\.js|style\.css)$", d) for d in dateien):
        return ["alle"]
    html = sorted(f for f in os.listdir(site) if f.endswith(".html")) if os.path.isdir(site) else []
    out = set()
    for d in dateien:
        if not d.startswith("site/"):
            continue
        name = d[len("site/"):]
        if name.endswith(".html"):
            out.add(name)
        elif name.endswith(".js"):
            for h in html:
                if '"' + name + '"' in open(os.path.join(site, h), encoding="utf-8").read():
                    out.add(h)
    return sorted(out)


def lokal(basis):
    r = subprocess.run(["git", "diff", "--name-only", basis], capture_output=True, text=True)
    neu = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], capture_output=True, text=True)
    dateien = None if r.returncode else sorted(set(z for z in (r.stdout + neu.stdout).splitlines() if z))
    wahl = auswahl(dateien)
    print("Basis:", basis, "·", "unbekannt, alles testen" if dateien is None else f"{len(dateien)} Dateien geändert")
    befehle = [BEFEHL[b] for b, ja in wahl.items() if ja]
    if dateien is None or any(re.match(PYTHON, d) for d in dateien):
        befehle.insert(0, "python3 -m unittest discover -s tests")
    print("Tests:", *(befehle or ["keine"]), sep="\n  ")
    print("Browsertest:", ", ".join(seiten(dateien)) or "keine Seite betroffen")


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--lokal":
        lokal(sys.argv[2] if len(sys.argv) > 2 else "origin/main")
        return
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
