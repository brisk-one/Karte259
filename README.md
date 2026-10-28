# Karte259

Fan-Projekt: sammelt stündlich öffentliche Daten der Welt 259 von [Die Stämme](https://www.die-staemme.de) und stellt sie als Webseite dar. Die Karte mit Entwicklungs-Overlay folgt als nächster Ausbauschritt.

## Was passiert

- Ein Sammellauf auf GitHub Actions bleibt rund 5,5 Stunden aktiv, holt einmal je Stunde (ab Minute 55, UTC, kurz nach der Serveraktualisierung) und stößt danach seinen Nachfolger an (`collector/takt.py`, `.github/actions/stunde`). Der stündliche Zeitplan dient nur als Rückfallebene. Nach jedem Abruf und bei Code-Änderungen wird die Seite neu gebaut, ein Code-Push holt selbst keine Daten.
- **Weltdaten** (`/map/*.txt.gz`: player, ally, village, kill_att, kill_def, kill_sup, kill_all, conquer): Zuerst wird `player.txt.gz` bedingt abgefragt. Nur wenn der Server neue Daten erzeugt hat, werden die übrigen Dateien geladen, geprüft und abgelegt.
- **Rangliste „An einem Tag“** (Gastzugang): stündlich ein Änderungs-Check über Seite 1 jeder Kategorie (7 Abrufe). Die Mitglieder der erfassten Stämme werden nur bei einer Änderung oder spätestens nach 24 Stunden vollständig erhoben.
- Ergebnisse landen in `data/`, die Seite wird über GitHub Pages veröffentlicht.
- **Prägerechner** (`site/praegen.html`): Wer seine Gebäudeübersicht einfügt, sieht, in welchem Dorf sich ein Flaggendoppler lohnt, ob zwei nötig sind, wie viele Münzen herauskommen und wie oft er Rohstoffe anfordern muss. Gerechnet wird im Browser (`site/praegen-core.js`), die eingefügten Daten verlassen den Rechner nicht. Vom Sammler kommen nur Münzkosten und Weltgeschwindigkeit (`praegen.json`).

## Ablage in `data/`

| Pfad | Inhalt |
|---|---|
| `latest/players.csv`, `latest/allies.csv` | aktueller Stand; die Git-Historie dieser Dateien ist der Stundenverlauf |
| `daily/{players,allies,villages}/JJJJ-MM-TT.csv.gz` | Tagesarchiv, einmal pro Tag geschrieben und danach unverändert |
| `conquers/JJJJ-MM.csv` | Eroberungen |
| `inaday/tribe_latest.csv`, `inaday/events.csv` | Rekorde aus „An einem Tag“ und deren Änderungen |
| `runs.csv`, `status.json`, `state.json` | Protokoll aller Läufe, letzter Status, interner Zustand |

## Lokal ausführen

```
python3 -m unittest discover -s tests
node --test tests/praegen.test.js
python3 -m collector.build_site --out _site
```

`collector.run` ruft echte Daten von die-staemme.de ab. Lokal darf er deshalb nur gegen einen eigenen Testserver mit Kunstdaten laufen, adressiert über `K259_BASE_URL`:

```
K259_BASE_URL=http://127.0.0.1:8765 python3 -m collector.run --trigger manual
```

Ohne gesetztes `K259_BASE_URL` geht der Lauf an den echten Server. Reguläre Abrufe kommen ausschließlich aus dem stündlichen Workflow auf den GitHub-Runnern.

Nur Python-Standardbibliothek, keine Abhängigkeiten. Der Rechenkern des Prägerechners wird mit dem eingebauten Testläufer von Node geprüft.

## Hinweis

Kein Angebot von InnoGames. Alle Abrufe tragen den User-Agent `Karte259` mit Link auf dieses Repository. Kontakt über GitHub Issues.
