"""Erfahrungs-Stufe für Spieler und Stämme auf Welt 259 (Entscheidungen Dennis 11.10.2026, E12 bis E14).

Nur Daten von Welt 259, keine weltübergreifende Account-Historie (E12: die gehört ins private
Netzwerk-Tool). Stufen statt Zahl (E13), Namen angelehnt an Mittelalter und Kriegertum, Vorbild Film
300. Die vier echten Tages-Auszeichnungen fließen gewichtet ein (E14): Verteidiger und Angreifer am
stärksten, danach Räuber, danach Sammler. Plünderer und Eroberer des Tages zählen nicht, weil sie sich
laut Dennis leicht an schwachen Barbarendörfern erzeugen lassen; sie werden trotzdem angezeigt.

Alle Schwellwerte sind ein erster Entwurf (11.10.2026) und bewusst als Konstanten gehalten, damit sie
sich ohne Eingriff in die Rechnung anpassen lassen, siehe HUB Decision-Log.
"""

STUFEN = ["Rekrut", "Phalanx-Krieger", "Hauptmann", "Spartiat", "Kriegsherr", "Unsterblicher"]

# Gewicht je Auszeichnungstyp im Score. loot_vil (Plünderer) und conquer (Eroberer) bewusst ohne
# Gewicht, siehe Modul-Text; sie stehen trotzdem in AUSZEICHNUNG_NAME für die Anzeige.
TITEL_GEWICHT = {"kill_def": 3, "kill_att": 3, "loot_res": 2, "scavenge": 1}

AUSZEICHNUNG_NAME = {
    "kill_def": "Verteidiger des Tages", "kill_att": "Angreifer des Tages",
    "loot_res": "Räuber des Tages", "scavenge": "Sammler des Tages",
    "loot_vil": "Plünderer des Tages", "conquer": "Eroberer des Tages",
}
# Typen, die in die Stufe einfließen (Reihenfolge = Wichtigkeit laut Dennis 11.10.)
TITEL_GEWERTET = ["kill_def", "kill_att", "loot_res", "scavenge"]

# Rang-Schwellen (Punkte-Weltrang) je Stufe, von oben nach unten geprüft
RANG_UNSTERBLICH, RANG_KRIEGSHERR, RANG_SPARTIAT, RANG_HAUPTMANN = 20, 50, 100, 500
# Bash-Rang-Schwellen (bester Rang unter Off/Deff/Unterstützer)
BASH_KRIEGSHERR, BASH_SPARTIAT, BASH_HAUPTMANN = 10, 25, 100
# Minimale Punkte, um überhaupt aus "Rekrut" herauszukommen
PUNKTE_KRIEGER = 1000


def titel_punkte(counts):
    """counts: {typ: anzahl}. Gewichtete Summe der vier gewerteten Auszeichnungstypen."""
    return sum(TITEL_GEWICHT.get(t, 0) * n for t, n in (counts or {}).items())


def bester_bash_rang(bash_rang):
    """bash_rang: {att, def, sup} -> Weltrang oder None. Kleinster (bester) Rang zählt."""
    werte = [v for v in (bash_rang or {}).values() if v]
    return min(werte) if werte else None


def stufe_index(points, rang, bash_rang=None, titel_counts=None):
    """Höchste erfüllte Stufe als Index in STUFEN (0 bis 5)."""
    tp = titel_punkte(titel_counts)
    bb = bester_bash_rang(bash_rang)
    if tp >= 6 or (rang is not None and rang <= RANG_UNSTERBLICH and tp >= 2):
        return 5
    if tp >= 3 or (rang is not None and rang <= RANG_KRIEGSHERR) or (bb is not None and bb <= BASH_KRIEGSHERR):
        return 4
    if tp >= 2 or (rang is not None and rang <= RANG_SPARTIAT) or (bb is not None and bb <= BASH_SPARTIAT):
        return 3
    if tp >= 1 or (rang is not None and rang <= RANG_HAUPTMANN) or (bb is not None and bb <= BASH_HAUPTMANN):
        return 2
    if (points or 0) >= PUNKTE_KRIEGER:
        return 1
    return 0


def tribe_histogram(member_tiers):
    """member_tiers: Liste von Stufen-Indizes der Mitglieder. Zählung je Stufe, Länge 6."""
    hist = [0] * len(STUFEN)
    for t in member_tiers:
        if 0 <= t < len(hist):
            hist[t] += 1
    return hist
