---
title: "Dokumentation"
description: "Anleitungen zum Installieren, Einrichten und Reparieren von Achievement Watcher Next: Quellen, Benachrichtigungen, Presets, Overlay und Fehlerbehebung."
permalink: /de/README.html
---

<div align="center">

# AW-Next-Dokumentation

Anleitungen für Einrichtung, tägliche Nutzung und Wartung.

[Startseite](../index.html) · [Download](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest) · [Preset-Galerie](../gallery/) · [Design-Galerie](../gallery/themes/) · [Änderungsprotokoll](../changelog.md) · [Sicherheit](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md) · [Problem melden](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) · [Discord](https://discord.gg/DjTMrDsXTh)

<picture><source srcset="../assets/shot/home-800.webp 800w, ../assets/shot/home.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/home.png" width="800" height="492" alt="Die Bibliothek von AW Next"></picture>

</div>

## Hier beginnen {#start-here}

Lies der Reihe nach oder springe zu dem, was du brauchst. Jede Seite endet mit einem Link zur nächsten.

| # | Anleitung | Was sie behandelt |
|---|-----------|-------------------|
| 1 | [Erste Schritte](getting-started.md) | Installation, erster Start, Einfach und Erweitert, Spiele finden, Updates |
| 2 | [Kompatible Quellen](sources.md) | Jede Quelle, die AW Next liest, und was jede braucht |
| 3 | [Benachrichtigungen](notifications.md) | Zustellmodi, Automatisch, Töne, Position, Screenshots |
| 4 | [Presets und der Preset-Designer](presets.md) | Das Aussehen des Popups, eigene gestalten, `.awpreset`-Dateien teilen |
| 5 | [Overlay](overlay.md) | Die Erfolgsliste im Spiel: Suche, Filter, Seltenheit |
| 6 | [Controller](controller.md) | App und Overlay mit einem Gamepad bedienen |
| 7 | [Game Health](game-health.md) | Der Bericht pro Spiel und seine geführten Reparaturen |
| 8 | [Fehlerbehebung](troubleshooting.md) | Probleme mit Erkennung, Fortschritt, Benachrichtigungen und Spielzeit |

## Wenn du es brauchst {#when-you-need-it}

| Anleitung | Was sie behandelt |
|---|---|
| [FAQ](faq.md) | Kurze Antworten auf die üblichen Fragen |
| [Linux und das Steam Deck](linux.md) | Das AppImage und seine Updates, Desktops, das Overlay-Tastenkürzel, Steam, Proton und Launcher |
| [Erweiterte Werkzeuge](advanced.md) | Wartung, Caches leeren, Zurücksetzen, manuelle Spiele, Diagnose |
| [Goldberg- / GBE-Einrichtung](emulator-setup.md) | Ein emuliertes Steam-Spiel diagnostizieren oder reparieren |
| [Uplay einrichten, R1 und R2](uplay-r2.md) | Das Ubisoft-Gegenstück |
| [Vergleich](comparison.md) | Wie sich AW Next von Achievement Watcher 2.x und Achievements unterscheidet |
| [Community-Galerien](community-galleries.md) | Presets und Designs von anderen und das Einschicken deiner eigenen |

**Einstellungen → Hilfe** ist die schnellste Referenz, solange die App offen ist. Sie passt sich deiner Einrichtung an (Overlay-
Hotkey, Controller-Belegung, Benachrichtigungsmodus, Design, aktivierte Quellen) und filtert ihre Themen, während du
tippst.

## Entwicklerreferenz {#developer-reference}

Für Mitwirkende und alle, die AW Next aus dem Quellcode bauen.

| Thema | Referenz |
|---|---|
| Mitwirken, Branches, Tests, Commit-Stil | [CONTRIBUTING.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) |
| Entwicklungsumgebung, Ausführen, Paketieren | [BUILD.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) |
| Grenzen zwischen App, Renderer und Watchdog; der Parser-Vertrag | [Architecture](../architecture.md) |
| Goldberg- / GBE-Dateiformate, Erkennung, Reparatur-Invarianten | [Goldberg- / GBE-Referenz](../goldberg-gbe.md) |
| Wie Uplay-R1/R2-Spiele erkannt, repariert und gelesen werden | [Uplay-R1/R2-Referenz](../uplay-reference.md) |
| Versionierung, Veröffentlichung, CI, Validierung der automatischen Updates | [Release-Ablauf](../RELEASE_WORKFLOW.md) |
| Der Installer, der Deinstaller und der Updater | [Installer, Deinstaller und Updates](../INSTALLER_AND_UPDATES.md) |
| Übersetzung, Intl-Formatierung, Link-Weiterleitung, der Locale-Linter | [Lokalisierung](../localization.md) |
| Locale-Dateien und Schlüsselparität | [app/locale/README.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/locale/README.md) |
| Die portable Design-Datei und ihre Versionierung | [.awtheme-Format](../awtheme-format.md) |

## Wo deine Daten liegen {#where-your-data-lives}

Alles, was AW Next schreibt, liegt unter **`%APPDATA%\Achievement Watcher Next`** (`~/.config/Achievement
Watcher Next` unter Linux, gleicher Aufbau). Die Pfade unten sind relativ dazu. Ein Upgrade behält alles, und
der erste Start importiert einen älteren Achievement-Watcher-Ordner, ohne ihn zu verändern.

| Was | Wo |
|---|---|
| Einstellungen, Indizes und Datenbanken | `cfg\` (`options.ini` ist die Einstellungsdatei) |
| Protokolle | `logs\` |
| Presets, die du erstellt oder importiert hast | `presets\Users Presets\` |
| Bilder, die ein Preset als Hintergrund nutzt | `presets\images\` |
| Töne, die du hinzugefügt hast | `sounds\` |
| Designs, die du gespeichert oder importiert hast | `theme-packs\` |
| Bilder, die das Design Benutzerdefiniert nutzt | `theme-images\` |
| Ein Stylesheet-Design, das du abgelegt hast | `themes\` |
| Erfolgssicherungen und die vor einer GBE-Reparatur angelegten | `backups\achievements\`, `backups\gbe\` |
| Cover und Spielsymbole | `covers\`, `gameIcons\` |
| Screenshots | `Pictures\Achievement Watcher Next` (oder der von dir gewählte Ordner) |
| Angemeldete Konten | `steam_session.enc`, `epic_tokens.enc`, `cfg\xbox-auth.json`, `cfg\psn-auth.json` |
| **Erneut abrufbar:** Schemata, Symbole und Seltenheit von einer Plattform | `steam_cache\`, `uplay_cache\` |
| **Erneut abrufbar:** heruntergeladene Werkzeuge und Ergebnisse von Ordnerscans | `cache\` (außer `cache\uplayR2`, das eine von dir gelieferte DLL enthält) |
| GBE-Fork-Spielstände (vom Emulator geschrieben) | `%APPDATA%\GSE Saves` |
| Klassische Goldberg-Spielstände (ebenso) | `%APPDATA%\Goldberg SteamEmu Saves` |

**Einstellungen → Erweitert → Caches leeren** leert die beiden erneut abrufbaren Zeilen und sonst nichts. Nichts
unter `cfg\`, `presets\`, `theme-packs\`, `theme-images\`, `themes\`, `sounds\`, `covers\`,
`gameIcons\` oder `backups\` wird neu erzeugt, kopiere diese also vor einer Neuinstallation.

Starte vor dem Melden eines Problems **Einstellungen → Erweitert → Diagnose**, reproduziere es einmal und entferne dann
private Daten aus den Protokollen, die du anhängst.

### Was diesen PC verlässt {#what-leaves-this-pc}

AW Next hat keine Analyse, keine Telemetrie und kein eigenes Konto. Es sendet nur die Abfragen, die es braucht,
und speichert jede Antwort zwischen, damit die Bibliothek offline weiterfunktioniert.

| Es fragt nach | Bei | Mit |
|---|---|---|
| Erfolgslisten, Symbole, globale Seltenheit | Den öffentlichen Endpunkten von Steam, der SteamCommunity-Seite, SteamHunters, Exophase | Der AppID eines Spiels und der Oberflächensprache |
| Cover und Logos | Dem Steam-CDN, SteamDB, SteamGridDB | Der AppID oder dem Titel eines Spiels |
| Update-Prüfungen und Downloads | Dem GitHub-Release-Feed | Nichts außer der Anfrage |
| Reparaturwerkzeuge, wenn du eine Reparatur ausführst | Den Projekten GBE Fork, Steamless, API-bypass und CrakFiles | Nichts außer der Anfrage |
| Deine Bibliothek und Freischaltungen, **nur wenn du ein Konto verbindest** | Steam, Epic, Xbox Network oder PlayStation Network | Dem Sitzungs-Token des Kontos; bei Steam-Freischaltungen der öffentlichen Steam ID |
| Deine RetroAchievements-Bibliothek und Freischaltungen, **nur wenn du die Kontokarte ausfüllst** | retroachievements.org | Deinem Benutzernamen und Web-API-Schlüssel, verschlüsselt auf diesem PC gespeichert |
| Community-Presets und -Designs, **nur wenn du die Galerie öffnest oder dorthin veröffentlichst** | Dem Galerie-Dienst, `aw-gallery.shirow.dedyn.io` | Der Listing-Anfrage; einer Datei nur, wenn du Veröffentlichen drückst |

Trägt die ausführbare Datei eines Spiels ein echtes 256-px-Symbol, liest AW Next es aus der Datei und nutzt es als
Logo, ohne das Netzwerk zu fragen.

Diese Website setzt keine Cookies, betreibt keine Analyse und lädt ihre Schriften und Skripte von ihrem eigenen Host.
Die Galerieseiten holen ihr Listing vom oben genannten Galerie-Dienst und weichen auf die daneben
veröffentlichte Kopie aus, wenn er nicht erreichbar ist.

Sonst wird nichts hochgeladen: weder deine Bibliothek noch Spielzeit, Ordner oder Screenshots. Der optionale
Broadcast `Websocket @localhost:8082` lauscht nur auf `127.0.0.1`, sodass nur Programme auf diesem PC ihn
lesen können. Das Einzige, was du bewusst sendest, ist ein Preset oder Design, das du in einer Galerie veröffentlichst (siehe
[Die Community-Galerien](community-galleries.md)).
