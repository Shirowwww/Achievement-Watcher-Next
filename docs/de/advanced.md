---
title: "Erweiterte Werkzeuge"
description: "Die Wartungswerkzeuge unter Einstellungen, Erweitert: Caches leeren, Diagnose, Profilsicherung, manuelle AppIDs und Zurücksetzen."
---

# Erweiterte Werkzeuge

Diese Werkzeuge liegen unter **Einstellungen → Erweitert** oder im Rechtsklickmenü eines Spiels. Der Tab Erweitert
gibt es nur, solange die Oberfläche im Modus **Erweitert** ist: Stelle den Regler **Oberfläche** oben
in den Einstellungen um, wenn du ihn nicht siehst. Beim Zurückwechseln geht nichts verloren.

<div align="center">
<picture><source srcset="../assets/shot/advanced-panel-800.webp 800w, ../assets/shot/advanced-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/advanced-panel.png" width="720" height="529" alt="Einstellungen - Erweitert, Einrichtung und Wartung"></picture><br>
<sub>Einrichtung &amp; Wartung; die übrigen Abschnitte klappen darunter zusammen</sub>
</div>

## Einrichtung und Wartung {#setup-and-maintenance}

| Werkzeug | Was es tut |
|---|---|
| **Alle erkannten Spiele reparieren** | Führt die passende Reparatur (Steam/GBE Fork oder Ubisoft/Uplay R2) für jedes kompatible erkannte Spiel mit bekanntem Installationsordner aus. Das baut Spiele neu auf, die bereits eine Einrichtung haben. |
| **Hardwarebeschleunigung deaktivieren** | Schaltet die GPU-Beschleunigung ab, wenn das Fenster oder das Overlay sich seltsam verhält. Braucht einen Neustart. |
| **Caches leeren** | Löscht nur erneut herunterladbare Caches: Update-Dateien, den Schema- und Symbol-Cache von Steam/Ubisoft und heruntergeladene Emulator-Korrekturwerkzeuge. Einstellungen, Spielstände, Sicherungen und von Hand abgelegte Dateien werden nie angefasst. |
| **Erfolgslisten erneut prüfen** | Fragt Steam nach Erfolgen, die ein Spiel-Update hinzugefügt hat. Das läuft alle 3 Tage; die Schaltfläche erzwingt es jetzt. |
| **Automatische Aktualisierungen der Erfolgsdaten** | Standardmäßig an. Aus stoppt diese erneute Prüfung und die Reparatur leerer Beschreibungen, für alle, die `steam_cache` von Hand pflegen. **Erfolgslisten erneut prüfen** funktioniert auch bei ausgeschaltetem Schalter weiter. |

Quellenspezifische Reparatureinstellungen liegen unter **Einstellungen → Emulatoren**. **Ubisoft / Uplay R2** enthält seinen
Paketzustand, die Bedienelemente zum Importieren und Wiederherstellen von DLLs und die gezielte Stapelreparatur; Loader- und INI-Details bleiben
automatisch.

**Caches leeren** ist das Erste, was man versuchen sollte, wenn ein Update immer wieder an derselben heruntergeladenen Datei scheitert.

## Diagnose {#diagnostics}

<div align="center">
<picture><source srcset="../assets/shot/diagnostics-panel-800.webp 800w, ../assets/shot/diagnostics-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/diagnostics-panel.png" width="720" height="529" alt="Einstellungen - Erweitert, Diagnose" loading="lazy" decoding="async"></picture><br>
<sub>Versionen und ein Klick zu den Ordnern für Protokolle und Daten</sub>
</div>

Die Karte Diagnose zeigt die Versionen von App, Electron, Node und Chrome und öffnet den Protokollordner,
den Datenordner oder eine Update-Prüfung. **Protokolle exportieren (.zip)** bündelt jede Protokolldatei in einem Archiv,
während die App läuft; sie von Hand zu kopieren ist unzuverlässig, weil die Prozesse, die sie schreiben, nie aufhören.
Dein Benutzername und jeder Schlüssel, jedes Token und Passwort werden im Archiv maskiert, nicht in den Protokollen auf dem Datenträger. Siehe
[Fehlerbehebung](troubleshooting.md#open-logs-and-local-data), was ein Fehlerbericht braucht.

## Profilsicherung {#profile-backup}

<div align="center">
<picture><source srcset="../assets/shot/profile-backup-panel-800.webp 800w, ../assets/shot/profile-backup-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/profile-backup-panel.png" width="720" height="529" alt="Einstellungen - Erweitert, Profilsicherung" loading="lazy" decoding="async"></picture><br>
<sub>Profil exportieren und Profil wiederherstellen, unter Einstellungen → Erweitert</sub>
</div>

**Profil exportieren…** speichert deine Einstellungen, Bibliotheksentscheidungen, Presets, Designs, Cover, eigene Hintergründe,
GBE-Wiederherstellungspunkte und Spielzeit in einer `.awbackup`-Datei, für eine Neuinstallation oder einen neuen PC. Anmeldungen,
Caches und Protokolle werden nie gespeichert, du meldest dich also danach erneut bei Epic, Steam, Xbox, PlayStation und
RetroAchievements an. **Profil wiederherstellen…** prüft zuerst die ganze Datei und wendet sie beim
nächsten Start an. Die Dateien, die sie ersetzt, bleiben erhalten, und eine fehlgeschlagene Wiederherstellung stellt alles zurück.

## Entfernte Spiele {#removed-games}

Ein mit **Aus AW Next entfernen** herausgenommenes Spiel steht unter **Einstellungen → Allgemein → Entfernte Spiele**
und kann einzeln oder alle auf einmal zurückgeholt werden. Nutze es für einen verirrten Ordner, den der Scan immer wieder
findet, der aber kein Spiel ist; um ein echtes Spiel aus dem Blick zu halten, ist **Aus der Ansicht ausblenden** leichter
(siehe [Ein Spiel ausblenden, entfernen oder löschen](#hide-remove-or-clear-a-game)).

## Die Erfolge eines Spiels zurücksetzen {#reset-a-games-achievements}

**Erfolge zurücksetzen** auf der Spielseite neben der Spielzeit oder im Rechtsklickmenü setzt
jeden Erfolg auf gesperrt zurück, damit du das Spiel noch einmal durchspielen kannst. AW Next meldet sie als
neu, wenn sie freigeschaltet werden.

<div align="center">
<picture><source srcset="../assets/shot/achievements-800.webp 800w, ../assets/shot/achievements.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/achievements.png" width="800" height="492" alt="Eine Spielseite mit Erfolge zurücksetzen" loading="lazy" decoding="async"></picture><br>
<sub>Zurücksetzen sitzt neben der Abschlusszahl auf der eigenen Seite des Spiels</sub>
</div>

Jede betroffene Datei wird zuerst gesichert nach
`%APPDATA%\Achievement Watcher Next\backups\achievements\<appid>\<date>\`, und die Bestätigung listet
die genauen Dateien auf, bevor etwas angefasst wird. Eine Datei, deren Sicherung scheitert, wird übersprungen, nicht geleert.

| Quelle | Was ein Zurücksetzen tut |
|---|---|
| Steam-Emulatoren (Goldberg / GBE und kompatible Aufbauten, darunter Goldberg SocialClub und Uplay R2) | Entfernt den Erfolgsspielstand. Der Emulator schreibt bei der nächsten Freischaltung einen neuen. |
| RPCS3 | Entfernt `TROPUSR.DAT`. Die Trophäenliste (`TROPCONF.SFM`) bleibt unberührt. |
| ShadPS4 | Sperrt die Trophäen in `TROP*.XML` neu, die auch die Trophäenliste enthält, die Datei wird also bearbeitet, nicht entfernt. |
| KytyPS5 | Entfernt die Freischaltungsdateien `trophies_*.json` des Spiels. Die Trophäenliste bleibt im eigenen Paket des Spiels. |
| Xenia | Löscht das Erreicht-Kennzeichen in der `.gpd`, die auch die Erfolgsliste enthält, die Datei wird also bearbeitet. |
| Steam, GOG Galaxy, Ubisoft Connect, EA, Epic, Xbox | **Nicht möglich.** Diese halten Freischaltungen in deinem Konto und synchronisieren sie neu; nur das Konto kann sie löschen. AW Next sagt das. |

Fortschrittszähler, die neben den Erfolgen gespeichert sind (`stats.ini`, `stats.bin`, …), werden ebenfalls zurückgesetzt und
gesichert: Bei einem Erfolg »1000 km zurücklegen« ist der Zähler der Fortschritt, und ihn voll zu lassen würde
den Erfolg sofort oder nie wieder auslösen.

**Eine Erfolgs-Sicherung wiederherstellen** im selben Rechtsklickmenü stellt ein ganzes Zurücksetzen wieder her. Aktualisiere danach die
Bibliothek, um die wiederhergestellten Freischaltungen zu lesen.

> [!NOTE]
> Ein Zurücksetzen löscht auch die eigene Aufzeichnung von AW Next darüber, was bereits freigeschaltet war, auch im laufenden
> Hintergrund-Tracker. Sonst würde ein erneut erreichter Erfolg nie wieder gemeldet.

## Einen einzelnen Erfolg erneut sperren {#re-lock-a-single-achievement}

Klicke auf der Spielseite mit der rechten Maustaste auf einen freigeschalteten Erfolg und wähle **Diesen Erfolg erneut sperren**, um
genau diesen noch einmal zu spielen. Nur dieser Erfolg wird wieder gesperrt: sein Kennzeichen, die Freischaltungszeit und der
Fortschritt im Spielstand des Emulators, sein Zähler, wenn der Spielstand einen damit verknüpft, und die eigene
Aufzeichnung von AW Next, sodass er als neu gemeldet wird, wenn du ihn erreichst. Die Bestätigung listet die Dateien auf, und jede Datei
wird zuerst gesichert, wie bei einem Zurücksetzen; **Eine Erfolgs-Sicherung wiederherstellen** stellt ihn wieder her.

Schließe zuerst das Spiel. Ein Emulator hält seine Freischaltungen im Speicher und schreibt sie beim Beenden des Spiels zurück,
was die Änderung rückgängig machen würde, daher lehnt AW Next ab, solange ein Spiel läuft.

Es funktioniert mit den Textspielständen der Steam-Emulatoren (Goldberg und GSE, CODEX, RUNE, OnlineFix, RLD!,
3DM, ALI213, TENOKE, Hoodlum, RAZOR1911, CreamAPI), UniverseLAN, Nemirtingas, Uplay R1 und R2,
GreenLuma und LumaPlay unter Windows sowie den Konsolenspielständen von RPCS3, ShadPS4, Xenia, KytyPS5, den Xbox-
360-Portierungen und XLLN. Spielstände von SmartSteamEmu (`stats.bin`) und SKIDROW (`achieve.dat`) werden nicht einzeln pro
Erfolg bearbeitet, da ihr Aufbau nicht dokumentiert ist; nutze dafür **Erfolge zurücksetzen**.

## Ein Spiel ausblenden, entfernen oder löschen {#hide-remove-or-clear-a-game}

Das Rechtsklickmenü eines Spiels bietet drei Wege, es verschwinden zu lassen, vom leichtesten zum stärksten:

| Eintrag | Was passiert | Wie man es rückgängig macht |
|---|---|---|
| **Aus der Ansicht ausblenden** | Das Spiel verlässt Alle Spiele, jede Sammlung und die Statistik, wird aber weiter verfolgt und meldet weiter. | Das Menü Sammlungen zeigt eine Ansicht **Ausgeblendet**, solange ein Spiel ausgeblendet ist; klicke dort mit der rechten Maustaste darauf und wähle **Wieder anzeigen**. |
| **Aus AW Next entfernen** | Der Scan überspringt das Spiel: Es verlässt die Bibliothek. Gedacht für Werkzeuge und andere Dinge, die keine Spiele sind. | **Einstellungen → Allgemein → Entfernte Spiele**. |
| **Daten dieses Spiels löschen...** | Alles, was AW Next über das Spiel hält, wird gelöscht: seine Erfolgsspielstände (zuvor gesichert, wie bei einem Zurücksetzen), Spielzeit, zwischengespeicherte Erfolgsliste und Symbole, Einstellungen pro Spiel und die Emulator-Konfiguration, die AW Next in seinen Ordner geschrieben hat. Die Bestätigung listet zuerst jeden Teil auf. | Nichts rückgängig zu machen: Der nächste Scan findet das Spiel wieder als neues. |

## Ein Spiel umbenennen {#renaming-a-game}

**Spieleinstellungen → Umbenennen…** im Rechtsklickmenü legt den Namen fest, unter dem ein Spiel angezeigt wird: auf seiner
Kachel und seinem Bildschirm, in Suche und Sortierung, in Benachrichtigungen und in den Ordnern, in denen Screenshots und Clips
gespeichert werden. Die Suche findet das Spiel weiterhin über seinen ursprünglichen Namen. Lasse das Feld leer oder wähle
**Ursprünglichen Namen wiederherstellen**, um zurückzugehen. Der Name wird pro Spiel in `cfg/gameTitles.json` gehalten, sodass er
neue Scans übersteht und Teil einer Profilsicherung ist. Cover-Abfragen und die Spielzuordnung nutzen den ursprünglichen
Namen.

**Einstellungen → Allgemein → Spieletitel in meiner Sprache**, standardmäßig an, zeigt Steam-Spiele unter dem
Titel, den Steam ihnen in deiner Erfolgssprache gibt (der eigenen Sprache des Spiels, wenn es eine hat).
Cover folgen derselben Sprache. Der lokale Katalog von Steam antwortet für Spiele, die dein Steam-Client kennt;
die übrigen werden einmal gebündelt abgefragt und nach einem Monat erneut geprüft. Ein Name, den du selbst vergibst, gilt
immer.

## Die Spielzeit eines Spiels bearbeiten {#editing-a-games-playtime}

**Erfolge und Spielzeit → Spielzeit bearbeiten…** im Rechtsklickmenü ersetzt die gesamte Spielzeit
eines Spiels, zum Beispiel eine von einem anderen Tracker übernommene oder eine, bei der Sitzungen fehlten. Tippe Stunden
(`12.5`) oder Stunden und Minuten (`12h30` oder `12:30`). Das Datum der letzten Sitzung bleibt erhalten, und AW Next
addiert spätere Sitzungen zur neuen Summe. Ein Spiel, das du auf Steam besitzt, fällt nie unter die Spielzeit, die Steam
meldet: Der nächste Scan hebt eine niedrigere Summe wieder auf die von Steam an.

## Eine andere Erfolgssprache für ein Spiel {#a-different-achievement-language-for-one-game}

**Spieleinstellungen → Sprache der Erfolge** im Rechtsklickmenü zeigt die Erfolge und Benachrichtigungen eines Spiels
in einer anderen Sprache als den Rest der Bibliothek. **Wie die App** kehrt zur globalen
Wahl zurück.

## Ein Spiel manuell hinzufügen {#add-a-game-manually}

Das `+` neben der Bibliothekssuche fügt ein Spiel aus einem Titel und einer ausführbaren Datei hinzu, mit optionaler Plattform
und Steam-AppID. Nutze es für ein Spiel, das keine Quelle erkennt: einen eigenständigen Build, eine portable
Installation oder einen Emulator, den du selbst startest.

Ein manuell hinzugefügtes Spiel:

- ist startbar und erfasst die Spielzeit wie jeder andere Eintrag;
- zeigt **Keine Erfolge**, wenn es keine hat, und bleibt aus den Abschlussstatistiken heraus, statt als
  0 % zu zählen;
- kann später ein Steam-Erfolgsschema übernehmen, indem du die AppID hinzufügst, ohne neu angelegt zu werden;
- behält geschützte Diagnosen pro Spiel, während zerstörerische Aktionen verborgen bleiben.

Manuell hinzugefügte Ordner tragen in der Liste Ordner ein kleines Symbol, um sie von den Orten zu unterscheiden, die die
Intelligente Suche entdeckt hat.

## Die AppID eines Spiels von Hand festlegen {#set-a-games-appid-by-hand}

Klicke mit der rechten Maustaste auf ein Spiel, dessen Ordnername auf mehrere Steam-Releases passt, sodass die automatische Zuordnung
die falsche gewählt hat, und wähle **AppID manuell festlegen...**. Die Wahl wird pro Installationsordner gemerkt und
in `steam_appid.txt` geschrieben; **Manuelle AppID entfernen** macht sie rückgängig. Auch die Reparatur **Spiel-ID-Datei
korrigieren** von Game Health fragt nach der AppID, ausgehend vom eigenen Vorschlag von AW Next.

## Einen Erfolg als freigeschaltet markieren {#mark-an-achievement-as-unlocked}

Ein Erfolg, den eine Quelle nicht sehen kann (erreicht, bevor du die Verfolgung eingerichtet hast, oder von einem
Emulator nie erfasst), kann in seinem Rechtsklickmenü mit **Als manuell freigeschaltet markieren** markiert werden. **Manuelle Freischaltung
aufheben** macht das rückgängig. Manuelle Freischaltungen bleiben über Scans hinweg erhalten und werden durch ein Zurücksetzen gelöscht.

## Schritte unter einem Erfolg {#steps-under-an-achievement}

Ein langer Erfolg lässt sich in Schritte aufteilen, die du selbst schreibst und abhakst. Fahre auf der Spielseite mit der Maus darüber
und öffne **Schritte**, oder klicke mit der rechten Maustaste darauf und wähle **Schritte hinzufügen**, tippe dann einen Schritt und drücke Enter.
Klicke auf ein Kästchen, um einen Schritt abzuhaken, doppelklicke auf seinen Text, um ihn umzubenennen, und nutze das Kreuz zum Entfernen.
Das Spiel meldet nie Schritte, sie füllen also nur den Balken des Erfolgs: Das Freischalten kommt weiterhin vom
Spiel, und sobald es geschieht, erscheint jeder Schritt als erledigt. Das Overlay im Spiel zeigt dieselben Schritte und
hakt sie mit der Maus oder einem Controller ab.

**Schritte** in der Kopfzeile des Spiels exportiert die Liste in eine Datei zum Teilen oder importiert eine. Eine Datei enthält
die Texte, nicht die Häkchen, und ihre Erfolge werden nach ID, dann nach Name zugeordnet; bereits vorhandene Schritte
behalten ihre Häkchen. Die Schritte liegen in `cfg/achievement-steps.json` und gehen in die Profilsicherung ein.

## Emulator- und Reparaturwerkzeuge {#emulator-and-repair-tools}

Diagnose und Reparatur für Goldberg- / GBE-Fork-Einrichtungen, der Installer der GBE-Laufzeit, Steamless und die
optionale Umgehung der API-Prüfung liegen unter **Einstellungen → Emulatoren** und im Untermenü **Emulator & Tools**
jedes Spiels. Ihre Anleitungen:

- [Goldberg- / GBE-Einrichtung](emulator-setup.md) - ein emuliertes Steam-Spiel diagnostizieren und reparieren
- [Uplay einrichten, R1 und R2](uplay-r2.md) - das Ubisoft-Gegenstück
- [Goldberg- / GBE-Referenz](../goldberg-gbe.md) - Dateiformate und Erkennungsregeln

**Emulator-Konfiguration von AW Next entfernen** im selben Menü macht nur den DLC-Abschnitt, die Schalter
und Identitätsschlüssel rückgängig, die AW Next in die `configs.user.ini` eines Spiels geschrieben hat, nie einen Wert, den du oder das Repack gesetzt hast,
und löscht die Datei nur, wenn nichts anderes mehr darin steht. Es zeigt zuerst genau, was es entfernen wird,
was die einzige Möglichkeit zur Wiederherstellung ist, falls du diese Datei nie gesichert hast.

**GOG-Erfolgskorrektur (UniverseLAN) anwenden...** erscheint bei einem GOG-Spiel, das eine Galaxy-dll mitbringt. Es
installiert den UniverseLAN-Build, der zum Galaxy-SDK dieses Spiels passt, behält die ursprüngliche dll als Sicherung und
überschreibt nie vorhandene UniverseLAN-Spielstände. Die Freischaltungen, die es unter `%LOCALAPPDATA%\UniverseLAN` schreibt,
werden wie alle anderen gelesen und gemeldet.

Hat eine Reparatur den unterstützten Emulator eingesetzt, stellt **Emulatorwechsel rückgängig machen** in
[Game Health](game-health.md#the-repairs) die eigenen Dateien des Cracks wieder her.

> [!WARNING]
> Reparaturen legen Sicherungen an, verändern aber trotzdem Spieldateien. Nutze sie nur mit Spielen, die du besitzt.

---

**Weiter:** [FAQ](faq.md) - kurze Antworten auf die Fragen, die am häufigsten aufkommen.

<div align="center">

[← Dokumentation](README.md) · [Fehlerbehebung](troubleshooting.md) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
