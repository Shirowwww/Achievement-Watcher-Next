---
title: "So schneidet AW Next im Vergleich ab"
description: "Wie sich Achievement Watcher Next von Achievement Watcher 2.x und von der App Achievements unterscheidet, Funktion für Funktion."
---

# So schneidet AW Next im Vergleich ab

Achievement Watcher Next ist eine Alternative zu und der Nachfolger von Xan105s Achievement Watcher. Es
läuft unter Windows und Linux, liest Spielstände von Steam, GOG, Epic, Ubisoft, Xbox PC und Steam-Emulatoren, repariert eine
Goldberg- oder GBE-Fork-Einrichtung aus der App heraus und wählt seinen Benachrichtigungsweg selbst. Achievements von
PSerban93 ist der andere aktiv entwickelte Windows-Tracker, und Sentinel gibt es nur für Linux.

AW Next führt [Xan105s ursprünglichen Achievement Watcher](https://github.com/xan105/Achievement-Watcher)
und [darktakayanagis 2.x-Zweig](https://github.com/darktakayanagi/Achievement-Watcher) fort. Diese Seite stellt es
neben diese Linie, neben [Achievements](https://github.com/PSerban93/Achievements), den anderen
aktiv entwickelten Windows-Tracker, und neben [Sentinel](https://github.com/RemakeCode/sentinel), einen
reinen Linux-Beobachter für emulierte Steam-Spielstände.

Alle vier lesen Erfolge gut, die nützliche Frage ist also, welche Extras zu deiner Spielweise passen. Die Tabellen
zeigen, was jedes Projekt kann und was nicht.

Teile von AW Next sind aus Achievements unter dessen MIT-Lizenz abgeleitet, wo eine Zeile also beide
Projekte markiert, begann die Umsetzung teils bei JokerVerse. Siehe
[NOTICE](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/NOTICE).

| | **AW Next** | [Achievements](https://github.com/PSerban93/Achievements) | [AW 2.x](https://github.com/darktakayanagi/Achievement-Watcher) | [Sentinel](https://github.com/RemakeCode/sentinel) |
|---|:---:|:---:|:---:|:---:|
| Plattform | Windows und Linux | Nur Windows | Nur Windows | Nur Linux |
| Lizenz | LGPL-3.0 | MIT | LGPL-3.0 | MIT |
| Desktop-Laufzeit | Electron 44 | Electron 44 | Electron 12 | Go mit GTK 4 und WebKitGTK 6 |
| Entwicklung | Aktiv | Aktiv (letzter Push am 22. Oktober 2026) | Archiviert am 13. Oktober 2026, schreibgeschützt | Aktiv (v2.1.1, 11. Oktober 2026) |

## Woher die Erfolge kommen {#where-the-achievements-come-from}

| Quelle | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Offizielle lokale Bibliotheken | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC · unter Linux: Steam, Heroic, Lutris und Bottles | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC | ⚠️ Steam · GOG · Epic · Uplay (älter) | ❌ |
| Optionale Kontoverbindung | ✅ Steam (Spiele im Besitz, per Familie geteilte Spiele, Freischaltungen von deinen anderen PCs) · Epic · Xbox (Windows) · PlayStation · RetroAchievements | ✅ Epic · GOG · Xbox · RetroAchievements | ❌ | ❌ |
| Spielstände von Steam-Emulatoren | ✅ Goldberg · GBE · GreenLuma · CreamAPI · SSE · Nemirtingas · Aufbauten von CODEX/RUNE/EMPRESS/Online-Fix/Tenoke, auch unter Linux (Wine-Präfixe, und nativ für Goldberg und GBE) | ✅ Vergleichbare Abdeckung | ✅ Steam-Emulatoren | ⚠️ Goldberg/GSE · CODEX · RUNE, in Wine/Proton-Präfixen |
| Portable Releases ohne Konfiguration | ✅ Spielstandstruktur wird selbst gelesen | ⚠️ Manuelle Eingabe | ❌ | ⚠️ Von Hand hinzugefügte Präfixe |
| Goldberg Uplay R2 (Ubisoft) | ✅ Loader-Versions-bewusst | ❌ | ❌ | ✅ |
| Goldberg SocialClub (Rockstar / GTA) | ✅ | ❌ | ❌ | ❌ |
| Konsolen-Emulatoren | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ⚠️ Nur RPCS3 | ❌ |
| Für PC rekompilierte Xbox-360-Spiele (ReXGlue und ähnliche) | ✅ Liste, Symbole, DLC und Live-Freischaltungen, mehr als 60 bekannte Portierungen, Linux-Builds | ✅ | ❌ | ❌ |
| Für PC portierte PS4-Spiele | ✅ run.py, native und Einzel-Exe-Portierungen, PROTOTYPE, PORTHEON (UFC) | ✅ | ❌ | ❌ |
| Games for Windows LIVE | ✅ XLiveLessNess, Schema, DLC und Symbole werden aus dem Spiel gelesen | ✅ XLiveLessNess | ❌ | ❌ |
| RetroAchievements | ✅ Gespielte Spiele importiert, Spiele auf dem Datenträger über RetroArch-Verlauf oder Playlists gefunden, Live-Freischaltungen mit jedem Emulator | ✅ | ❌ | ❌ |
| Nischen-Patches | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ❌ | ❌ |
| Ordnererkennung | ✅ Auto-Konfiguration und Intelligente Suche | ✅ Auto-Konfiguration | ✅ Intelligente Suche | ⚠️ Scannt die hinzugefügten Präfixe erneut |
| Eigene Ordner und manuelle Spiele | ✅ Pro Spiel oder ganze Bibliothek | ✅ Pro Spiel | ⚠️ Manuelle Konfiguration | ⚠️ Präfix- und Emulatorpfade |

AW Next und Achievements lesen jetzt ziemlich dieselben Quellen. AW Next reicht weiter in emulierte PC-
Aufbauten und ist der einzige der vier, der Uplay-R2- und SocialClub-Spielstände reparieren kann.

## Wenn ein Spiel nichts meldet {#when-a-game-does-not-report}

Jeder Tracker kann dir sagen, dass ein Spiel bei 0 % hängt. AW Next versucht es auch zu reparieren.

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Zustandsbericht pro Spiel mit geführten Reparaturen | ✅ | ❌ | ❌ | ❌ |
| Emulator-Laufzeit installieren und reparieren | ✅ Goldberg / GBE, Schemata inklusive | ⚠️ Schema-Erzeugung | ❌ Manuell | ⚠️ Einrichtung nach bestem Bemühen mit dem Goldberg-Fork |
| Sicherung und Wiederherstellung vor jeder Änderung | ✅ Dazu Steamless und optionale Umgehung der API-Prüfung | ❌ | ❌ | ❌ |
| Erfolge eines Spiels zurücksetzen oder wiederherstellen | ✅ | ❌ | ❌ | ❌ |
| Manuelle Freischaltung | ✅ | ❌ | ❌ | ❌ |
| Die AppID eines Spiels von Hand festlegen | ✅ | ❌ | ❌ | ❌ |
| Quellenüberschreibung pro Spiel | ✅ Auto / Steam / Ubisoft | ❌ | ❌ | ⚠️ Eine Datenquelle für die ganze Bibliothek |
| Schwarze Liste und Offline-Nachtragen von Namen | ✅ | ⚠️ Schwarze Liste | ❌ | ❌ |

## Benachrichtigungen {#notifications}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Wege | ✅ Nativer Toast + Overlay im Spiel + OBS-Browserquelle + Steam-Toast im Spielmodus (Decky-Plugin) | ✅ Nativer Toast + animiertes Overlay | ⚠️ Toast · Chromium · WebSocket · GNTP | ⚠️ Desktop-Benachrichtigung + Decky-Plugin im Spielmodus |
| Wählt seinen Weg selbst | ✅ Modus Automatisch, je nach Zustand des Spiels | ❌ Feste Wahl | ❌ Feste Wahl | ❌ |
| Preset-Designer, ohne Code | ✅ 14 Startvorlagen, Live-Vorschau, 10 mitgelieferte Presets einschließlich Steam Original | ⚠️ Eingebaute Presets und Designs, eigene als HTML/CSS geschrieben | ❌ | ❌ |
| Teilbare Presets | ✅ `.awpreset` + Community-Galerie | ❌ | ❌ | ❌ |
| Gestaltung für Seltenheit, Platin und Abschluss | ✅ Seltenheit in 3 Stufen, Abschlussbalken | ✅ Seltenheit | ❌ | ❌ |
| Presets pro Emulator | ✅ Xenia · RPCS3 · ShadPS4 | ✅ | ❌ | ❌ |
| Töne | ✅ Zufallsauswahl, FLAC/M4A/AAC | ✅ | ⚠️ Eigene Datei | ✅ Eigene Töne |
| Screenshots | ✅ HDR-fähige Aufnahme unter Windows (BT.2408 per Tone-Mapping), auch unter Linux mit X11 und Wayland | ✅ HDR-Aufnahme | ✅ | ❌ |
| Videoclips einer Freischaltung | ✅ 10-30 s, 30/60 FPS, H.264 · HEVC · AV1, HDR per Tone-Mapping; unter Linux gpu-screen-recorder oder der eingebaute WebM-Recorder | ✅ 10-30 s, 30/60 FPS | ⚠️ Über OBS | ❌ |
| Spielzeit- und Fortschrittsbenachrichtigungen | ✅ Fortschritt pro Spiel stummschalten | ✅ Fortschritt pro Spiel stummschalten | ✅ Spielzeit | ✅ Fortschritt, mehrstufig |
| Eigenes Benachrichtigungsaussehen pro Spiel | ✅ Jedes Spiel kann Preset, Position, Ton und Größe überschreiben | ❌ | ❌ | ❌ |

## Die App selbst {#the-app-itself}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Suche in Bibliothek, Spielen und Erfolgen | ✅ | ✅ | ✅ | ⚠️ Sortierung der Bibliothek |
| Filter für installierte Spiele und Spielaktionen | ✅ Filter · deinstallieren · wiederherstellen | ⚠️ Plattformfilter | ❌ | ❌ |
| Vollständige Controller-Navigation | ✅ App + Overlay, unter Windows und Linux | ✅ App + Overlay | ❌ Geplant | ⚠️ Über das Decky-Plugin |
| Steam Deck | ⚠️ Decky-Plugin, noch nicht auf einem echten Deck bestätigt | ❌ | ❌ | ✅ Decky-Plugin in Gamescope |
| Designs | ✅ Eingebaute + Editor Benutzerdefiniert + teilbare `.awtheme` + Galerie | ✅ Eingebaute + Design-Dateien von Benutzern | ❌ | ❌ |
| Oberflächensprachen | ✅ 28 mitgeliefert | ✅ Etwa 30 mitgeliefert | ✅ 18 | ❌ |
| Hintergrundprozess | ✅ Ein Dienst im Infobereich | ✅ App im Infobereich | ⚠️ Separater Watchdog | ✅ App im Infobereich |
| Zusätzliche Laufzeit-Downloads | ✅ Keine Browser-Laufzeit; der GBE-Fork wird nur geholt, wenn du ihn installierst oder reparierst | ⚠️ Playwright-Chromium | ✅ Keine | ⚠️ GTK 4 und WebKitGTK 6 aus dem System |
| Zugang per Tastatur und Screenreader | ✅ Einstellungen, Dialoge und Overlay per Tab erreichbar, Fokus kehrt beim Schließen eines Dialogs zurück | ⚠️ Tastenkürzel und Controller-Belegung | ❌ | ❌ |
| Installer, Deinstaller und Update-Fenster | ✅ Eigener Installer und Deinstaller, Update-Fenster mit Versionshinweisen und Fortschritt | ❌ | ❌ | ⚠️ Distributionspakete und Flatpak |
| Dokumentation | ✅ Anleitungen, Formatspezifikationen und Galerien | ⚠️ README | ⚠️ README | ⚠️ README und eine Goldberg-Anleitung |

## Linux und das Steam Deck {#linux-and-the-steam-deck}

AW Next gibt es auch als native Linux-App (x64-AppImage, nie über Wine). Es verfolgt Spiele, die
über Steam und Proton, Wine, Lutris, Heroic und Bottles laufen, und native Linux-Spiele, mit denselben
Popups, demselben Overlay und derselben Spielzeit wie unter Windows. Die Unterstützung für das Steam Deck ist neu: Benachrichtigungen im Spielmodus laufen
über das Decky-Plugin im Repository, und weder das Plugin noch das Popup im Spielmodus wurden
auf einem echten Deck bestätigt.

<sub>✅ = unterstützt und dokumentiert · ⚠️ = teilweise, manuell oder ein anderer Arbeitsablauf · ❌ = nicht verfügbar oder
im aktuellen öffentlichen Zweig nicht dokumentiert. Die Spalten der Mitbewerber wurden am 22. Oktober 2026 mit ihren öffentlichen
READMEs, GitHub-Metadaten und Paketmanifesten verglichen. Die Spalte AW Next spiegelt Version
3.12.2 und die unveröffentlichten Änderungen vom Oktober 2026. Ein ❌ in einer anderen Spalte bedeutet meist undokumentiert
statt unmöglich, und alle diese Projekte entwickeln sich schnell.</sub>

## Hydra und Steam Achievement Manager {#hydra-and-steam-achievement-manager}

Zwei weitere Werkzeuge tauchen in denselben Suchen auf, und sie erledigen eine andere Aufgabe.

- [Hydra](https://hydralauncher.gg/) beschreibt sich als Spiele-Launcher, mit dem man Spiele herunterladen
  und Erfolge verfolgen kann. AW Next lädt keine Spiele herunter.
- [Steam Achievement Manager](https://github.com/gibbed/SteamAchievementManager) beschreibt sich als
  schlanke, portable Anwendung zur Verwaltung von Erfolgen und Statistiken auf Steam. Sie braucht den
  Steam-Client, ein Steam-Konto und Netzwerkzugriff. AW Next zeigt und verfolgt Erfolge und braucht kein
  Steam-Konto.

Keines von beiden steht in den Tabellen oben, die die Tracker vergleichen, die lokale und Emulator-Spielstände lesen.

## Kurz gesagt {#in-short}

**AW Next** passt zu einer Bibliothek, die unter Windows und Linux weiterfunktionieren muss: offizielle Launcher und
emulierte Spielstände nebeneinander, ein Zustandsbericht, der eine Goldberg- oder GBE-Einrichtung repariert, statt sie nur
zu melden, Benachrichtigungen, die ihren Weg selbst wählen, und Presets und Designs, die du gestalten und
teilen kannst.

**Achievements** hat unter Windows eine breite Quellenliste, darunter RetroAchievements, rekompilierte Portierungen und
Nischen-Patches, mit starker Auto-Konfiguration, einem animierten Overlay und Videoclips einer Freischaltung.

**Achievement Watcher 2.x** ist die historische Basis, mit breiter Emulator-Kompatibilität und älteren
Benachrichtigungswegen auf Electron 12. Sein Repository wurde am 13. Oktober 2026 archiviert und wird nicht
mehr gepflegt.

**Sentinel** ist eine schlanke Linux-Option für Goldberg-, CODEX- und RUNE-Spielstände, mit einem gut integrierten
Steam-Deck-Plugin.

---

<div align="center">

[← Dokumentation](README.md) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
