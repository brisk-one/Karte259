"""Zentrale Einstellungen des Sammlers. Werte lassen sich per Umgebungsvariable überschreiben (Tests)."""
import os

WORLD = os.environ.get("K259_WORLD", "de259")
BASE_URL = os.environ.get("K259_BASE_URL", f"https://{WORLD}.die-staemme.de").rstrip("/")

# Stämme, deren Mitglieder in der Rangliste "An einem Tag" vollständig erhoben werden (456 = REPEAT)
TRIBE_IDS = [int(x) for x in os.environ.get("K259_TRIBE_IDS", "456").split(",") if x.strip()]

USER_AGENT = "Karte259/0.1 (+https://github.com/brisk-one/Karte259)"
TZ = "Europe/Berlin"  # Serverzeit der deutschen Welten

DATA_DIR = os.environ.get("K259_DATA_DIR", "data")
CACHE_DIR = os.environ.get("K259_CACHE_DIR", ".cache/raw")

# Weltdaten-Dateien unter /map/<name>.txt.gz
WORLD_FILES = ["player", "ally", "village", "kill_att", "kill_def", "kill_sup", "kill_all", "conquer"]

# Unterlisten der Rangliste "An einem Tag"
INADAY_TYPES = ["loot_vil", "loot_res", "scavenge", "kill_att", "kill_def", "kill_sup", "conquer"]

GUEST_DELAY_S = float(os.environ.get("K259_GUEST_DELAY_S", "1.0"))  # Pause zwischen Seitenabrufen
FULL_SCRAPE_MAX_AGE_H = 24  # spätestens nach so vielen Stunden wird der Stamm voll erhoben

# Vollständige Erhebung ganzer Ranglisten (Blättern durch den Gastzugang).
# Nur diese Kategorien haben keine Entsprechung in den offiziellen Weltdaten; Bash und Eroberungen
# lassen sich aus den stündlichen Ständen berechnen und werden deshalb nicht geblättert.
DEEP_TYPES = [t for t in os.environ.get("K259_DEEP_TYPES", "loot_res,scavenge,loot_vil").split(",") if t.strip()]
DEEP_MAX_PAGES = int(os.environ.get("K259_DEEP_MAX_PAGES", "500"))   # Notbremse je Kategorie
DEEP_MAX_AGE_H = float(os.environ.get("K259_DEEP_MAX_AGE_H", "20"))  # frühestens so viele Stunden nach der letzten
# Kandidaten für eine größere Seite. Wird einmal geprüft: liefert die Seite mehr Zeilen als üblich,
# spart das ein Vielfaches an Abrufen. Ergebnis landet in state.json.
DEEP_PAGE_PARAMS = [p for p in os.environ.get("K259_DEEP_PAGE_PARAMS", "count,limit,per_page").split(",") if p.strip()]
DEEP_PAGE_TRY = int(os.environ.get("K259_DEEP_PAGE_TRY", "100"))

# Plausibilitätsgrenzen für die Validierung
MIN_PLAYERS = int(os.environ.get("K259_MIN_PLAYERS", "100"))
MIN_VILLAGES = int(os.environ.get("K259_MIN_VILLAGES", "1000"))
MAX_PLAYER_DROP = 0.2   # mehr als 20 % weniger Spieler als im Vorlauf gilt als defekte Datei
MAX_VILLAGE_DROP = 0.02  # Dörfer verschwinden praktisch nie
