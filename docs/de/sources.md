---
title: "Kompatible Quellen"
description: "Alle Spielquellen, die Achievement Watcher Next liest - Steam, GOG, Epic, Ubisoft, EA, Xbox PC, Emulatoren und RetroAchievements - und was jede davon braucht."
---

# Kompatible Quellen

Eine **Quelle** ist ein Ort, aus dem AW Next Erfolge liest: die lokalen Daten eines Launchers, eine Steam-kompatible
Spielstanddatei oder die Trophäendatei eines Konsolen-Emulators. Jede Quelle hat in **Einstellungen →
Quellen** ihren eigenen Schalter.

AW Next liest Steam, GOG Galaxy, Ubisoft Connect, Epic Games, Xbox PC, das lokale Erfolgsprotokoll von EA Desktop,
RetroAchievements, Konsolen-Emulatoren und die Spielstanddateien von Steam-Emulatoren wie Goldberg, GBE
Fork, CODEX, RUNE und CPY. Es braucht keinen Steam-Web-API-Schlüssel und kein Konto.

<div align="center">
<picture><source srcset="../assets/shot/sources-panel-800.webp 800w, ../assets/shot/sources-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/sources-panel.png" width="720" height="529" alt="Einstellungen - Spielquellen"></picture><br>
<sub>Jede Quelle hat einen eigenen Schalter; das Schild kennzeichnet die offiziellen Desktop-Bibliotheken</sub>
</div>

Aktualisiere nach dem Aktivieren einer Quelle die Bibliothek. Es werden nur auf diesem PC erkannte Bibliotheken angezeigt.

## Offizielle Plattformbibliotheken {#official-platform-libraries}

Diese lesen die lokalen Daten des Launchers selbst und tragen in den Einstellungen ein Schild.

| Quelle | Was AW Next liest | Was nötig ist |
|---|---|---|
| **Steam** | Lokalen Appcache-Zustand, Daten des öffentlichen Profils, Erfolgsschemata und Produktmetadaten | Steam installiert; ein Konto zu verbinden ist optional |
| **GOG Galaxy** | Die lokalen Datenbanken des Galaxy-Clients, dazu kompatible ältere Spielstände und UniverseLAN | GOG Galaxy installiert oder ein Spiel, das UniverseLAN nutzt |
| **Ubisoft Connect** | Native lokale Daten und ältere Uplay-Formate | Ubisoft Connect installiert |
| **Epic Games** | Lokale Installationen, dazu die Spiele, die das Konto besitzt, und ihren offiziellen Erfolgsstand, sobald verbunden | Der Epic-Games-Launcher für lokale Installationen; eine Kontoverbindung für den Rest |
| **Xbox PC** | Lokale Installationen aus Game Pass und Microsoft Store, dazu die Spiele, die das Konto besitzt, und ihren Stand im Xbox Network | Die Xbox-App für lokale Installationen; eine Kontoverbindung für den Rest |

**Steam**, **Epic Games** und **Xbox PC** haben je drei Einstellungen: **Keine**, **Installiert** (Spiele auf
diesem PC) oder **Im Besitz** (die ganze Bibliothek, die das Konto besitzt). **Im Besitz** listet auch Spiele, die hier nicht
installiert sind, und braucht die Kontoverbindung weiter unten. **GOG Galaxy** bietet **Keine**, **Installiert**
oder **Gespielt**: Galaxy behält die Spieldaten eines Spiels nach der Deinstallation, und **Gespielt** listet
diese Spiele weiterhin.

**Steam-Bibliotheken** unter der Steam-Kontokarte listet jeden Steam-Bibliotheksordner auf diesem PC. Schaltest du
einen ab, verschwinden seine Spiele aus der Liste, auch aus Alle Spiele, zum Beispiel bei einem Laufwerk, das du als
Speicher angeschlossen lässt. Sie kommen zurück, wenn du ihn wieder einschaltest.

> [!NOTE]
> Steam-Freischaltungen werden aus den Statistiken gelesen, die Steam auf diesem PC führt. Ein privates Profil oder private **Spiel-
> details** funktionieren für jedes hier gespielte Spiel, auch für Spiele, die über SteamTools, LuaTools oder
> GreenLuma hinzugefügt wurden, und eine Karte aktualisiert sich in dem Moment, in dem Steam eine Freischaltung festhält. Ein öffentliches Profil ergänzt nur deinen
> Namen und Avatar. Spiele, die nur auf einem anderen PC gespielt wurden, brauchen die Kontoverbindung weiter unten. Diese Freischaltungen
> lösen eine AW-Next-Benachrichtigung aus, sobald **Spiele des Steam-Clients** unter Benachrichtigung aktiviert ist (siehe
> [Benachrichtigungen](notifications.md#games-steam-runs)).

> [!NOTE]
> **EA Desktop** ist anders: Es liest das lokale Erfolgsprotokoll von EA Desktop für Spiele außerhalb der von EA
> verwalteten Ordner und importiert nicht deine reguläre EA-Bibliothek.

### Verbundene Konten {#connected-accounts}

Steam, Epic, Xbox PC und PlayStation lassen sich jeweils in den Einstellungen verbinden, um zu lesen, was die lokalen Dateien
nicht enthalten. Jedes Token wird verschlüsselt, bevor es auf diesem PC gespeichert wird, und alles andere funktioniert
ohne Konto.

| Konto | Was die Verbindung hinzufügt |
|---|---|
| **Steam** | Zwei Schalter, standardmäßig aus und sichtbar, solange die Quelle Steam auf **Im Besitz** steht: **Spiele hinzufügen, die du besitzt** und **Spiele hinzufügen, die per Steam-Familienfreigabe mit dir geteilt werden**. Damit kann ein privates Profil oder eines, das den Großteil seiner Bibliothek nie hier installiert hat, die richtigen Spiele listen. Jeder macht den ersten Scan spürbar länger, weil jedes hinzugefügte Spiel seine Erfolge und sein Artwork einmal auflöst. Ein Spiel, das lokal nichts zu lesen hat, wird dann aus deinem Steam-Profil gelesen, dessen Spieldetails dafür öffentlich sein müssen; die Antwort wird sechs Stunden zwischengespeichert. **Spiele ausblenden, die nicht mehr in deiner Steam-Bibliothek sind** entfernt die Überbleibsel, aber nie ein hier installiertes oder per Steam-Familienfreigabe geteiltes Spiel. Du meldest dich auf der Seite von Valve selbst an. |
| **Epic Games** | Deine freigeschalteten Erfolge und mit **Im Besitz** die ganze Bibliothek: jedes Spiel mit vollständiger Liste, Freischaltungsstand und Seltenheit. Bei einigen Spielen im Besitz gibt es Erfolge, die die Shop-Daten von Epic nie auflisten (Shadow of the Tomb Raider, Civilization VI). Sie werden trotzdem aufgeführt, aus den games-infos-datas von Nemirtingas, aber ohne Freischaltungsstand, den Epic auch bei angemeldetem Konto nicht herausgibt. Namen, Beschreibungen und Seltenheit eines installierten Spiels funktionieren ohne Konto. |
| **Xbox PC** | Freischaltungsstand und Seltenheit aus dem Xbox Network für deine Bibliothek, lokal zwischengespeichert. Mit **Im Besitz** bringt es auch Spiele, die das Konto nur anderswo gespielt hat. |
| **PlayStation** | Deine PlayStation-Spiele und Trophäen, mit Sonys eigener Quote für jede Trophäe, alle drei Tage im Hintergrund aktualisiert. Ein Spiel, das du nicht besitzt, lässt sich per Name aus Sonys Katalog hinzufügen und auf dieselbe Weise entfernen. Ein Spiel aus einer anderen Quelle, das auch für PlayStation erschienen ist, zeigt das echte Platin seiner Liste und im Trophäenmodus seine echten Stufen und DLC-Gruppen (siehe [Benachrichtigungen](notifications.md#trophy-mode)). Du meldest dich auf der Seite von Sony selbst an. |

Eine Kachel trägt ein kleines Abzeichen für das, was die Verbindung festgestellt hat: in diesem Shop gekauft, per
Steam-Familienfreigabe geteilt oder nicht mehr in deiner Bibliothek.

## Steam-kompatible Spielstände {#steam-compatible-saves}

AW Next liest die Erfolgs- und Statistikdateien, die Steam-Emulatoren schreiben (`achievements.json`,
`achievements.ini`, `achievements.bin`, `stats.ini` und kompatible Aufbauten), an den Orten, die diese
Werkzeuge nutzen. Das umfasst **Goldberg** und **GBE Fork** (die AW Next auch installieren und reparieren kann),
**GreenLuma**, **LumaPlay**, **SmartSteamEmu**, **CreamAPI**, die **Nemirtingas**-Emulatoren und Scene-
Releases mit kompatiblem Aufbau. Für ein Spiel, dessen Dateien woanders liegen, füge den Ordner unter
**Einstellungen → Ordner** hinzu.

<div align="center">
<picture><source srcset="../assets/shot/folders-panel-800.webp 800w, ../assets/shot/folders-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/folders-panel.png" width="720" height="529" alt="Einstellungen - Ordner" loading="lazy" decoding="async"></picture><br>
<sub>Die Ordner, die AW Next selbst prüft, und die, die du hinzufügst - Spielstände einzelner Spiele oder ganze Bibliotheken</sub>
</div>

Ein portables CODEX-, RUNE- oder CPY-Release schreibt normalerweise nach `%PUBLIC%\Documents\Steam\<SOURCE>\<appid>`,
aber eine portable Kopie hält diese Struktur im Spielordner, wo sie niemand sucht. Es genügt, den
Ordner des Spiels selbst unter **Einstellungen → Ordner** hinzuzufügen: Seine `steam_emu.ini` (oder `cpy.ini`) nennt die
AppID, und die Spielstandstruktur wird daneben gesucht, bevor der gemeinsame Ort drankommt. Ein Spiel ohne Spielstand
wird trotzdem hinzugefügt, mit 0 %.

Ein Release ohne Emulator-Konfiguration oder mit gelöschter ini funktioniert ebenfalls: Die Spielstandstruktur wird direkt gelesen,
denn `Steam\RUNE\<appid>` trägt die AppID im Ordnernamen. Dieselben Aufbauten werden eine Ebene
unterhalb des hinzugefügten Ordners geprüft, du kannst AW also auf eine ganze Spielebibliothek richten.

Lässt sich ein Ordner nicht verwenden, sagt AW, warum: Er enthält ein Spiel, aber keine lesbare Freischaltungsdatei, er enthält
nichts, was mit Erfolgen zu tun hat, oder es ist ein Release der **EA app**. Releases der EA app halten Erfolge im
EA-Konto, nicht auf der Festplatte, sie werden also über die EA-Quelle gelesen, und kein hinzugefügter Ordner kann sie
erscheinen lassen. Die Meldung nennt auch, wie viele Aufbauten geprüft wurden, woran man »nichts gefunden« von »nicht
angesehen« unterscheidet.

Drei Fälle werden eigens behandelt:

- **Goldberg SocialClub**: die Variante für Rockstar und Social Club, mit eigenem Schalter.
- **RUNE Ubisoft Connect**: Der Ubisoft-Emulator von RUNE legt `achievements.cfg`-Dateien unter
  `Documents\RUNE\Ubisoft Connect\achievements` ab. Sie werden ohne Hinzufügen eines Ordners gefunden (einen
  Ordner `RUNE\Ubisoft Connect` unter **Einstellungen → Ordner** hinzuzufügen funktioniert ebenfalls) und folgen dem Schalter des Ubisoft-
  Connect-Emulators. Namen und Symbole kommen aus der Liste von Ubisoft Connect für das Spiel; ohne sie
  erscheinen nur Erfolgsnummern.
- **Uplay R2**: das Ubisoft-Gegenstück zum Goldberg-Weg, für kompatible Titel. Es hat keinen eigenen
  Schalter: Spielstände laufen über die Steam-Emulator-Quelle, und seine Reparatur- und Loader-Werkzeuge liegen unter
  **Einstellungen → Emulatoren → Ubisoft / Uplay R1/R2**. Siehe [Uplay R2 einrichten](uplay-r2.md).

Zeigt ein Spiel, das eines davon nutzt, keine Erfolge, nennt sein **Game Health**-Fenster das fehlende Teil.
Siehe [Game Health](game-health.md) und [Goldberg / GBE einrichten](emulator-setup.md).

## Konsolen-Emulatoren {#console-emulators}

| Emulator | Konsole | Trophäen- / Erfolgsdatei |
|---|---|---|
| **RPCS3** | PlayStation 3 | `TROPUSR.DAT` neben der Trophäenliste |
| **ShadPS4** | PlayStation 4 | `TROP*.XML`, die die Liste und den erreichten Stand enthält |
| **KytyPS5** | PlayStation 5 | `_Trophies\<title>\trophies_*.json` neben dem Emulator; die Liste stammt aus dem Paket `sce_sys\trophy2` des Spiels |
| **Xenia** | Xbox 360 | `.gpd`, die ebenfalls beides enthält |

Jeder wird live überwacht, eine Freischaltung löst also eine Benachrichtigung wie jede andere aus. RPCS3, ShadPS4 und Xenia können
ihre Daten vom Standardpfad wegverlegen, und AW Next liest die Einstellungen, die auch der Emulator liest:

- **RPCS3**: Der Trophäenordner folgt `vfs.yml` (auch einer zu `$(EmulatorDir)` relativen Umleitung), einem
  Ordner `portable` neben der ausführbaren Datei und `RPCS3_CONFIG_DIR`.
- **ShadPS4**: wird erkannt, ob du auf den Emulator, seinen Ordner `user`, `game_data` selbst oder
  (seit 0.19) seinen Ordner `trophy` oder `home\<user>\trophy` zeigst. Seine Konfiguration wird an einem der beiden Orte gelesen,
  an denen shadPS4 sie abgelegt hat.
- **Xenia**: folgt `storage_root` und `content_root` in seiner Konfiguration.
- **KytyPS5**: wird erkannt, ob du auf den Emulator, seinen Ordner `_Trophies` oder den Ordner eines einzelnen
  Spiels zeigst. Spiele werden in den Spieleordnern des KytyPS5-Launchers (`Kyty.ini`) und neben dem
  Emulator gesucht, entpackt oder als `.zar`-Archiv. Die Trophäenliste steckt im Spiel selbst, daher bleibt ein Spiel,
  das nach dem ersten Sehen durch AW Next gelöscht wurde, als nicht installiert gelistet, aus der damals aufbewahrten Kopie seiner Liste und seines Artworks.
  Ein Launcher-Spiel wird vor seiner ersten Trophäe gelistet. Nur der aktive Benutzer zählt: der, der
  für das Spiel im Launcher gesetzt ist, sonst der globale Benutzer des Emulators. Ohne Benutzereinstellung werden die Trophäen
  aller Benutzer hinzugefügt.

Eine verschobene virtuelle RPCS3-Festplatte oder ein ShadPS4-Datenordner lässt sich also direkt unter **Einstellungen → Ordner**
hinzufügen, ohne dass eine ausführbare Emulator-Datei in der Nähe sein muss.

## RetroAchievements {#retroachievements}

Spiele, die in einem beliebigen Emulator gespielt werden, der an RetroAchievements meldet, kommen aus deinem Konto, nicht aus einer
Datei. Schalte die Quelle **RetroAchievements** ein und fülle die Kontokarte darunter aus: deinen Benutzernamen
und den **Web-API-Schlüssel** von retroachievements.org/settings. Der Schlüssel wird verschlüsselt, bevor er auf
diesem PC gespeichert wird.

<div align="center">
<picture><source srcset="../assets/shot/retroachievements-panel-800.webp 800w, ../assets/shot/retroachievements-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/retroachievements-panel.png" width="720" height="529" alt="Einstellungen, Quellen: der Schalter RetroAchievements über den Kontokarten" loading="lazy" decoding="async"></picture><br>
<sub>Der Schalter RetroAchievements, mit den Kontokarten für Epic und Steam darunter</sub>
</div>

**Bibliothek importieren** fügt jedes Spiel hinzu, das du gespielt hast, mit Erfolgen, Freischaltungsdaten, Punkten und Seltenheit.
Ein zweiter Import holt nur die Spiele, deren Fortschritt sich bewegt hat, und ein erstmals gespieltes Spiel wird
von allein hinzugefügt. Neue Freischaltungen werden binnen Sekunden gemeldet, solange ein Emulator läuft, der an
RetroAchievements meldet (RetroArch, DuckStation, PCSX2, PPSSPP, Dolphin, BizHawk, Project64 oder jeder
andere RA-integrierte Build, erkannt am Namen oder an der RetroAchievements-dll daneben), und sonst binnen weniger
Minuten.

AW Next liest Freischaltungen von retroachievements.org, RetroAchievements muss im Emulator also eingeschaltet bleiben:
Schaltest du es dort ab, werden keine Freischaltungen mehr gesendet. Um nur die Benachrichtigung von AW Next zu sehen, blende das eigene
Pop-up des Emulators aus. In RetroArch ist das **Settings → Achievements → Visibility → Unlock
Notifications**. RetroBat schreibt `retroarch.cfg` bei jedem Start neu, schließe also RetroBat und füge diese Zeile
in `RetroBat\emulationstation\.emulationstation\es_settings.cfg` ein:

```xml
<string name="global.retroarch.cheevos_visibility_unlock" value="false" />
```

Nutze `cheevos_visibility_mastery` auf dieselbe Weise für das Pop-up zur Meisterschaft.

## Weitere Quellen {#other-sources}

| Quelle | Was es ist |
|---|---|
| **Für PC rekompilierte Xbox-360-Spiele** | ReXGlue-Portierungen und ähnliche halten ihre Erfolgsliste in einem Ordner `achievements` (`.toml`, `.tsv`) oder in `SaveData\Achievements.json`, im Spielordner oder in `Documents\<game>`. Die Liste stammt aus der `default.xex` des Spiels, in allen Sprachen, die es mitbringt, wobei geheime Erfolge geheim bleiben. [dbox.tools](https://dbox.tools) ergänzt DLC-Erfolge und Exophase den Spieleranteil pro Erfolg. Eine Liste in `Documents` wird von allein gefunden; für eine im Spielordner füge diesen Ordner unter **Einstellungen → Ordner** hinzu oder nutze die **Intelligente Suche**. Freischaltungen werden live gemeldet, die Spielzeit wird erfasst, und Erfolge zurücksetzen funktioniert. Mehr als sechzig bekannte Portierungen (Sonic Unleashed, Sonic the Hedgehog bis Marathon Recompiled, Blue Dragon re:Blue, Lost Odyssey, Perfect Dark Zero, Fable II, Gears of War 2, Forza Motorsport 4, GoldenEye 007, Skate 2 und andere) werden schon vor ihrem ersten Erfolg anhand ihrer ausführbaren Datei gelistet. Eine Portierung, die eine Liste pro Profil führt, zählt als ein Spiel. Die Quelle folgt dem Schalter von Xenia. |
| **Für PC portierte PS4-Spiele** | Bloodborne, die Uncharted-Sammlung (ein Eintrag pro Spiel), God of War III Remastered, MediEvil und weitere Portierungen auf Basis des `run.py`-Runners. Auch Portierungen ohne ihn (Dragon's Crown Pro, inFAMOUS Second Son und First Light, The Last Guardian, Gravity Rush 2, Killzone Shadow Fall, Driveclub, Unicorn Overlord, Fist of the North Star: Lost Paradise, UFC 3, PROTOTYPE und PROTOTYPE 2 mit je einem Eintrag, die UFC-Spiele von PORTHEON), Portierungen auf der Laufzeit von BilalReloaded wie seine Portierung der Nathan Drake Collection und Portierungen, die ihre eigene Liste schreiben, etwa Crash Team Racing Nitro-Fueled. Füge den Ordner der Portierung unter **Einstellungen → Ordner** hinzu. Trophäenliste, Stufen und Symbole stammen aus dem Original-Dump des Spiels, auf den der Launcher der Portierung zeigt (`sce_sys\trophy`, auch mit verschlüsselter `npbind.dat`), oder aus der eigenen `user\trophies\<title id>\trophies.tsv` der Portierung. Freischaltungen stammen aus jener der Dateien `trophies.log`, `last_run.log`, `analysis\<name>-user\trophy\trophyNN.txt`, `progress_user<N>.txt`, `<title id>-user<N>.bin`, `trophies.dat` oder `unlocked.txt`, die die Portierung schreibt, mit allen zusammengeführten Profilen, und werden live gemeldet. Die Seltenheit kommt aus den PS4-Listen von Exophase. Ihr Schalter heißt **PS4 Recomp**. |
| **Games for Windows LIVE** | XLiveLessNess-Installationen. Die Freischaltungseinträge jedes Profils werden gelesen, und die Liste, ihre Texte und Symbole stammen aus der ausführbaren Datei des Spiels selbst, es wird also nichts heruntergeladen. DLC-Erfolge stammen aus der `spa.bin` jedes Inhaltspakets im Ordner `dlc\<title id>` von XLiveLessNess. Wird live überwacht. |
| **Dead Space 2 MarkerPatch, Alice: Madness Returns MadnessPatch** | Eine Steam-Kopie mit installierter Mod wird von allein gefunden. Füge bei jeder anderen Kopie den Spielordner unter **Einstellungen → Ordner** hinzu (ein Ordner darin, etwa `Binaries\Win32`, gilt als Spielordner) oder lass die **Intelligente Suche** deine Bibliotheken durchsuchen. Die Liste wird aus den eigenen Texten und Bildern der Mod gebaut, und die Freischaltungen, die sie speichert, werden live gemeldet. Jede hat einen eigenen Schalter, und es wird nichts gelesen, solange `AchievementSupport` der Mod aus ist. |
| **PC-Portierungen** | *The Legend of Zelda: Link's Awakening DX HD* (LADXHD Updated). Füge den Spielordner unter **Einstellungen → Ordner** hinzu. Die 110 Erfolge, ihre Texte in den Sprachen des Spiels und ihre Bilder stammen aus der Installation. Freischaltungen werden aus `%LOCALAPPDATA%\Zelda_LA\achievements` gelesen (neben dem Spiel, wenn es eine `portable.txt` hat). Die Datei enthält keine Daten, eine Freischaltung wird also auf den Zeitpunkt datiert, zu dem sie gesehen wurde. |
| **Rekompilierte PC-Portierungen** | *Twilight Princess* (Dusklight), *Super Mario 64* (Ghostship), *Diddy Kong Racing* (DKR-R), *Super Mario Bros. Remastered* und *Super Mario Sunshine* mit der Mod Super Mario Eclipse (SMS Launcher). Diese Portierungen bauen ihre Erfolgsliste ins Spiel ein, daher bringt AW Next jede Liste mit, auf Englisch, aus dem Quellcode der Portierung entnommen. Die Erfolgsbilder stammen aus dem eigenen Ordner von SMS Launcher oder werden einmalig aus den Repositories von Ghostship und Super Mario Bros. Remastered geholt; Dusklight und DKR-R zeichnen ihre im Code, ihre Erfolge zeigen also das Symbol des Spiels. Eine Portierung wird anhand ihrer Freischaltungsdatei unter `%APPDATA%` (`TwilitRealm\Dusklight`, `DKRPort`, `SMB1R`, `sms-launcher`), anhand der vom Quiver Launcher installierten Spiele oder anhand ihres Ordners unter **Einstellungen → Ordner** gefunden. Ghostship legt seine Spielstände neben das Spiel, braucht also eines der letzten beiden. Eine portable Installation (`portable.txt` oder `data_location.json` von Dusklight) wird dort gelesen, wo sie schreibt. DKR-R und SMS Launcher behalten das Datum jeder Freischaltung; bei den anderen wird eine Freischaltung auf den Zeitpunkt datiert, zu dem sie gesehen wurde. Unter Linux werden die nativen Builds aus `~/.local/share` und `~/.config` gelesen und die Windows-Builds aus ihrem Wine- oder Proton-Präfix. Sie teilen sich den Schalter für PC-Portierungen. |
| **FINAL FANTASY VII (2013)** | Diese Neuauflage stammt aus der Zeit vor den Steamworks-Erfolgen und hält ihre 36 Freischaltungen in einem 8-Byte-Bitfeld neben ihren Spielständen, das in Documents gefunden wird, ohne dass der Ordner hinzugefügt werden muss. |
| **Gesehene Erfolge merken** | Hält ein Spiel gelistet, nachdem sein Spielstand verschwunden ist, mit den Freischaltungen, die der Hintergrund-Tracker gesehen hat. |
| **Manuell hinzugefügte Spiele** | Ein Spiel, hinzugefügt aus einem Titel und einer ausführbaren Datei, mit optionaler Plattform und Steam-AppID. Siehe [Erweiterte Werkzeuge](advanced.md#add-a-game-manually). |

## Steam-Metadaten ohne API-Schlüssel {#steam-metadata-without-an-api-key}

AW Next nutzt dafür keinen Steam-Web-API-Schlüssel und kein verbundenes Steam-Konto. Die Liste jedes Spiels stammt aus
einer Kette ohne Schlüssel: zuerst der offizielle Endpunkt `GetGameAchievements` (versteckte Beschreibungen, Symbole, globale
Seltenheit und die Erfolgssätze von Steam), dann die Erfolgsseite der SteamCommunity (dasselbe Schema, in
deiner Sprache), dann SteamHunters und erst als letzter Ausweg ein Browser-Scrape.

Wie auf Steam zählt ein vom Entwickler archivierter Erfolg nur, wenn du ihn erreicht hast. Andernfalls bleibt er
aus der Liste, dem Prozentwert und der Platin-Benachrichtigung heraus.

Die Ergebnisse werden pro Sprache in `%APPDATA%\Achievement Watcher Next\steam_cache\schema` zwischengespeichert, sodass lokale
Quellen und bereits gesehene Spiele offline funktionieren.

Steam kündigt nie an, dass ein Update Erfolge hinzugefügt hat, deshalb prüft sich eine zwischengespeicherte Liste alle 3
Tage selbst erneut und übernimmt neue, ohne welche zu entfernen. Um sofort zu prüfen, nutze **Einstellungen → Erweitert →
Erfolgslisten erneut prüfen**. **Automatische Aktualisierungen der Erfolgsdaten** am selben Ort schaltet die
regelmäßige Prüfung für alle ab, die `steam_cache` von Hand pflegen. Die Schaltfläche funktioniert weiterhin.

DLC- und Update-Erfolge tragen den Namen ihrer Gruppe (zum Beispiel *Hearts of Stone*) unter dem
Titel, entnommen derselben Abfrage.

## Quellen, die du nicht siehst {#sources-you-do-not-see}

Im Modus **Einfach** klappt die Liste der Quellen sechs Nischenzeilen weg: GreenLuma, LumaPlay, die beiden
Nemirtingas-Emulatoren (die Spielstand-Leser für GOG und Epic), Goldberg SocialClub und den Import des
Benachrichtigungs-Caches. Eine Zeile klappt nur weg, solange sie aktiviert ist und kein Spiel deiner Bibliothek aus ihr stammt. Schalte eine ab
oder besitze ein Spiel, das sie erkannt hat, und die Zeile kehrt zurück, sodass der Oberflächenmodus nie das Bedienelement verbirgt, das
ein fehlendes Spiel erklären würde. **Erweitert** listet immer jede Quelle.

---

**Weiter:** [Benachrichtigungen](notifications.md), um zu wählen, wie Freischaltungen angezeigt werden.

*Einrichtung je Quelle: [Goldberg / GBE](emulator-setup.md) · [Uplay R2](uplay-r2.md) ·
[Game Health](game-health.md)*

<div align="center">

[← Dokumentation](README.md) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
