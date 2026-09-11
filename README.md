# Karte259

Fan-Projekt: sammelt stündlich öffentliche Daten der Welt 259 von [Die Stämme](https://www.die-staemme.de) und stellt sie als Webseite dar. Die Karte mit Entwicklungs-Overlay folgt als nächster Ausbauschritt.

## Was passiert

- GitHub Actions startet den Sammler stündlich (Minute 17, UTC), zusätzlich bei Code-Änderungen und per Hand.
- **Weltdaten** (`/map/*.txt.gz`: player, ally, village, kill_att, kill_def, kill_sup, kill_all, conquer): Zuerst wird `player.txt.gz` bedingt abgefragt. Nur wenn der Server neue Daten erzeugt hat, werden die übrigen Dateien geladen, geprüft und abgelegt.
- **Rangliste „An einem Tag“** (Gastzugang): stündlich ein Änderungs-Check über Seite 1 jeder Kategorie (7 Abrufe). Die Mitglieder der erfassten Stämme werden nur bei einer Änderung oder spätestens nach 24 Stunden vollständig erhoben.
- Ergebnisse landen in `data/`, die Seite wird über GitHub Pages veröffentlicht.

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
python3 -m collector.run --trigger manual
python3 -m collector.build_site --out _site
```

Nur Python-Standardbibliothek, keine Abhängigkeiten.

## Hinweis

Kein Angebot von InnoGames. Alle Abrufe tragen den User-Agent `Karte259` mit Link auf dieses Repository. Kontakt über GitHub Issues.
