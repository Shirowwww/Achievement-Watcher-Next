---
title: "Game Health"
description: "Der Bericht pro Spiel, der sagt, warum ein Spiel verfolgt wird oder nicht, mit den geführten Reparaturen, die für es gelten."
---

# Game Health

Wenn ein Spiel Probleme macht, öffne zuerst sein **Game Health**-Fenster. Es sagt, ob AW Next das
Spiel sehen, seine Erfolge lesen und seine Freischaltungen melden kann, und bietet nur die Reparaturen an, die zutreffen.

Öffne es über die Schaltfläche **Werkzeuge** in der oberen rechten Ecke einer Spielkachel oder über das Rechtsklickmenü
des Spiels. Das Fenster hat drei Tabs: **Zustand**, **Programmdatei**, die das Programm festlegt, das während des Spielens überwacht wird,
und **Benachrichtigung**, wo das Spiel ein eigenes Popup-Preset, eine eigene Position, einen eigenen
Ton und eine eigene Größe bekommen kann (siehe [Verhalten pro Spiel](notifications.md#per-game-behavior)).

<div align="center">
<picture><source srcset="../assets/shot/game-health-800.webp 800w, ../assets/shot/game-health.webp 903w" sizes="(max-width: 700px) 100vw, 620px"><img src="../screenshot/game-health.png" width="620" height="557" alt="Das Game-Health-Fenster mit dem Zustand Prüfen, seinen Prüfungen und den Reparaturen, die zutreffen"></picture><br>
<sub>Ein Zustand, der Grund dafür, die Prüfungen dahinter und die Reparaturen, die zutreffen</sub>
</div>

## Die drei Zustände {#the-three-states}

| Zustand | Was er bedeutet |
|---|---|
| **Bereit** | Das Spiel wird erkannt, seine Erfolgsdaten sind vorhanden, und AW Next überwacht es auf Freischaltungen. |
| **Prüfen** | Das Spiel funktioniert, aber ein Teil seiner Einrichtung ist unvollständig. Die Prüfungen zeigen, welcher. |
| **Nicht verfolgt** | Etwas Wesentliches fehlt, sodass keine Freischaltung erfasst werden kann: Das Spiel lässt sich nicht finden, es hat keine Erfolgsdaten oder ihm fehlt der Emulator, der seine Freischaltungen schreibt. |

Der Satz unter dem Zustand nennt die Ursache, die Prüfungen zeigen, welcher Teil schuld ist, und eine Reparaturschaltfläche wirkt
genau darauf.

- Der Modus **Einfach** nennt Ergebnisse in schlichten Worten (*Erfolgsdaten gefunden*, *Wird beim Spielstart erkannt*).
  **Erweitert** ergänzt genaue Anzahlen, den überwachten Prozess und den Benachrichtigungsweg.
- **Technische Details** unten, in beiden Modi, enthalten jeden Rohwert. Drücke **Kopieren** für einen Fehler-
  bericht. Ein langer Wert scrollt beim Darüberfahren.

Bei Konsolen-Emulator-Spielen wird weder nach einer Windows-Programmdatei noch nach Spieldateien gefragt.

Manche Spiele erfassen offline nichts, egal wie sie eingerichtet sind. Bei Halo: Campaign Evolved und The Crew
Motorfest werden die Erfolge von den Servern des Publishers vergeben, ein Crack speichert also keine. Ihr
Fenster sagt das ab dem ersten Start.

## Die Prüfungen {#the-checks}

| Prüfung | Was sie beantwortet | Typische Lösung |
|---|---|---|
| **Spieldateien** | Ist der Installationsordner noch da? | **Spiel suchen** |
| **Programmdatei** | Welches Programm soll beim Spielen überwacht werden? | **Spiel suchen** |
| **Spielzuordnung** | Welcher AppID und welcher Plattform wurde dieses Spiel zugeordnet? Der Modus Einfach lässt sie weg. | **Spiel-ID-Datei korrigieren** oder **AppID manuell festlegen** |
| **Erfolgsdaten** | Gibt es eine Erfolgsliste, und ist sie vollständig? | **Erfolgsdaten neu schreiben** |
| **Emulator-Einrichtung** | Hat ein Spiel, das einen Steam-Emulator braucht, einen, und welcher bedient es? Bei einem Ubisoft-Spiel umfasst das auch den Uplay-Loader und ob er je einen Erfolg angefordert hat. | **Emulator-Datei installieren**, **Zum unterstützten Emulator wechseln** oder **Ubisoft-Erfolge reparieren** |
| **Fortschritt** | Wurde schon eine Freischaltung oder ein Spielstand gefunden? | Starte das Spiel und schalte etwas frei |
| **Fortschrittszähler** | Hat AW Next bei Spielen im CODEX/RUNE-Stil, die eine Statistik statt einer einfachen Freischaltung verfolgen, die Statistik hinter jedem Erfolg abgerufen? Nur bei Spielen angezeigt, die eine nutzen. | **Fortschrittszähler abrufen** |
| **Erkennung des Spielstarts** | Bemerkt der Hintergrund-Tracker, wann dieses Spiel startet? Für sich erfasst er keine Freischaltung: Das ist die Aufgabe des Emulators. | **Dieses Spiel überwachen** |
| **Benachrichtigungen** | Welcher Weg hat die letzte Benachrichtigung für dieses Spiel zugestellt, und warum? | **Testbenachrichtigung senden** |

## Die Reparaturen {#the-repairs}

Das Fenster zeigt nur die Reparaturen, die dieses Spiel beheben können. Jede sagt, was sie ändern wird und wo die
vorherigen Dateien aufbewahrt werden. Nichts wird ohne Sicherung oder Bestätigung neu geschrieben.

| Reparatur | Was sie tut |
|---|---|
| **Spiel suchen** | Öffnet eine Auswahl, um die zu überwachende Programmdatei zu wählen. |
| **Spielordner öffnen** | Öffnet den Installationsordner im Explorer. |
| **Erfolgsdaten neu schreiben** | Schreibt die Erfolgsliste, die Symbole und die Emulator-Einstellungen und kopiert vorhandene Dateien zuerst in eine Sicherung. |
| **Emulator-Datei installieren** | Lädt die unterstützte Emulator-Version in den Spielordner herunter und behält die ersetzte Datei als `.bak`. |
| **Zum unterstützten Emulator wechseln** | Für ein Spiel, das von einem anderen Crack bedient wird, der nichts erfasst hat: Installiert den unterstützten Emulator darüber und benennt die Konfiguration dieses Cracks in `.bak` um. |
| **Emulatorwechsel rückgängig machen** | Erscheint überall dort, wo eine der beiden obigen Reparaturen lief. Stellt die eigenen Dateien des Spiels aus ihren `.bak`-Kopien wieder her und entfernt den unterstützten Emulator. |
| **Spiel-ID-Datei korrigieren** | Schreibt `steam_appid.txt` neu, wenn der Emulator ein Spiel meldet und AW Next ein anderes zugeordnet hat. Sie fragt nach der richtigen AppID, schlägt die Zuordnung von AW Next vor und behält die vorherige Datei. |
| **Fortschrittszähler abrufen** | Fragt Steam, welche Statistik jeden Erfolg antreibt, bei Spielen im CODEX/RUNE-Stil. Schreibt nichts in den Spielordner. |
| **Ubisoft-Erfolge reparieren** | Schreibt bei einem kompatiblen Ubisoft-Spiel Loader-Konfiguration, Schema und Spielstandumleitung in einer Transaktion neu, wobei jede berührte Datei gesichert wird. Siehe [Uplay einrichten](uplay-r2.md). |
| **Erfolge offline aktivieren** | Für ein Ubisoft-Spiel, bei dem das Loader-Protokoll beweist, dass es nie einen Erfolg angefordert hat, weil es sich abgemeldet glaubt. Fügt der INI neben dem Spiel einen Platzhalter-Sitzungsschlüssel hinzu; drücke erneut, um ihn zu entfernen. Siehe [Uplay einrichten](uplay-r2.md#a-game-that-never-asks-for-an-achievement). |
| **Dieses Spiel überwachen** | Fügt das Spiel dem Hintergrund-Tracker hinzu, damit Spielzeit und Live-Freischaltungen erfasst werden. |
| **Fortschrittsbenachrichtigungen aktivieren** | Schaltet die Fortschrittsbenachrichtigungen für ein Spiel wieder ein, das du stummgeschaltet hattest. |
| **Testbenachrichtigung senden** | Sendet eine Benachrichtigung mit dem Namen und dem Artwork dieses Spiels, über den Weg, den sie tatsächlich nehmen würde. |

> [!IMPORTANT]
> Eine Abweichung ist nicht immer die Schuld des Emulators: Wurde er absichtlich für die ID auf dem Datenträger eingerichtet,
> lass ihn in Ruhe. **AppID manuell festlegen** (Rechtsklick) behebt eine Abweichung beim Ordnernamen dauerhaft, statt
> die Datei jedes Mal zu korrigieren. Siehe [Goldberg / GBE einrichten](emulator-setup.md#set-appid-manually).

## Häufige Zustände und was zu tun ist {#common-states-and-what-to-do}

| Das Fenster sagt | Was es meist bedeutet |
|---|---|
| *Es wurde keine Erfolgsliste gefunden* | Das Spiel hat keine Erfolge, oder seine Quelle ist abgeschaltet. Prüfe **Einstellungen → Quellen**. |
| *Dieses Spiel braucht einen Steam-Emulator, und es ist keiner eingerichtet* | Nutze **Emulator-Fix anwenden** im Rechtsklickmenü. Siehe [Goldberg / GBE einrichten](emulator-setup.md). |
| *Die Emulator-Datei, die sie liest, fehlt* | **Emulator-Datei installieren** bringt die passende Laufzeit hinein. |
| *Die Erfolgsliste passt nicht zu dem, wonach das Spiel suchen wird* | **Erfolgsdaten neu schreiben**. Das ist das übliche Ergebnis eines Repack-Updates. |
| *Es wurde noch kein Erfolgsfortschritt gefunden* | Normal bei einem Spiel, das du seit der Einrichtung nicht gespielt hast. Starte es und schalte etwas frei. |
| *AW Next überwacht dieses Spiel nicht, während es läuft* | **Dieses Spiel überwachen** fügt es dem Tracker hinzu. |
| *Die letzte Benachrichtigung konnte nicht gesendet werden* | Sende eine Testbenachrichtigung, dann siehe [Benachrichtigungen](notifications.md#if-a-test-or-unlock-does-not-appear). |
| *Windows hat die letzte Benachrichtigung während des Spiels verborgen* | Sie ging direkt ins Info-Center, weil das Spiel im Vollbild lief oder »Nicht stören« an war. Aktiviere [Prioritätsbenachrichtigungen](notifications.md#priority-windows-notifications) oder nutze Automatisch oder In-Game-Overlay. |
| *Funktioniert - Windows-Rückfallebene aktiv* | Kein Fehler. Die automatische Zustellung hat für dieses Spiel eine Windows-Benachrichtigung gewählt; siehe [wie Automatisch entscheidet](notifications.md#how-automatic-decides). |
| *Das Spiel hat nie einen Erfolg angefordert* | Es liest seine leere Ubisoft-Sitzung als abgemeldet. **Erfolge offline aktivieren** hebt das auf; nichts wird irgendwohin gesendet. Starte danach das Spiel einmal. |
| *Erfolge offline sind an, starte das Spiel einmal* | Die Einstellung ist geschrieben, und es wurde noch nichts beurteilt. Die Schaltfläche daneben heißt jetzt **Erfolge offline abschalten**. |
| *Wird von ALI213, OnlineFix, GBE Fork… bedient* | Der Emulator, der dieses Spiel tatsächlich liest, benannt nach seinen eigenen Dateien. Einem so bedienten Ubisoft-Spiel wird keine Uplay-Reparatur angeboten: Seine Uplay-Schicht ist ungenutzt, nicht defekt. Das umfasst Releases, die Valves `steam_api64.dll` behalten: einen RUNE-Build, der von `Steam\steamclient64.dll` läuft, oder ein VOICES38-Release, das seinen eigenen umbenannten GBE Fork lädt (`steam_api64.v38`); installiere den Emulator nie über Letzteres. Die Ubisoft-Builds von online-fix werden erkannt, und eine Erfolgskorrektur warnt dort, dass Online-Spiel aufhören kann. |
| *Nur einige Symbole fehlen* | **Erfolgsdaten neu schreiben** lädt die fehlenden Symbole herunter. |
| *Über eine Stunde gespielt und kein einziger Erfolg erfasst* | Der Crack, der das Spiel bedient, meldet höchstwahrscheinlich nie Erfolge. Nutze **Zum unterstützten Emulator wechseln**, wenn angeboten; prüfe sonst, ob das Spiel aus seinem eigenen Ordner startet. |
| *Spiel-ID-Datei*, mit einer Steam-Verknüpfung zu diesem Spiel | Steam startet eine Nicht-Steam-Verknüpfung ohne `steam_appid.txt` daneben, daher speichert der Emulator unter einer anderen ID. **Erfolgsdaten neu schreiben** schreibt die Datei dorthin. |

---

**Weiter:** [Fehlerbehebung](troubleshooting.md) - für Probleme, die Game Health nicht von allein löst.

<div align="center">

[← Dokumentation](README.md) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
