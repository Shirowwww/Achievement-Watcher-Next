---
title: "Goldberg-Uplay-Einrichtung, R1 und R2"
description: "Erfolge für kompatible Ubisoft-Spiele mit den Uplay-Loadern R1 und R2 einrichten und sicher reparieren."
---

# Goldberg-Uplay-Einrichtung (R1 und R2)

AW Next hat eine eigene Reparatur für Ubisoft-Spiele, die über den Goldberg-Uplay-Emulator laufen. Es
berührt nie offizielle Ubisoft-Connect-Installationen: Ein Spiel wird erst ausgewählt, wenn AW Next den genauen
Loader und die Generation, die es nutzt, belegt hat.

Ein Ubisoft-Spiel lädt nur die Loader-Generation, gegen die seine ausführbare Datei gelinkt wurde: etwa ab 2019
ist es **R2**, alles davor ist **R1**. AW Next erkennt und repariert, was zutrifft, denn
die falsche Generation würde eine DLL ablegen, die das Spiel nie öffnet. Ein Ubisoft-Spiel mit zwei Produkt-IDs (ein
Basisspiel und seine Complete Edition) funktioniert in beiden Fällen: Ein Spielstand unter einer der beiden IDs wird gelesen, und eine bloße
Zielkennung darin wird mit der Steam-Erfolgsliste abgeglichen.

> [!WARNING]
> Die Reparatur verändert Spieldateien. Nutze sie nur mit Spielen, die du besitzt.

## Ein Spiel reparieren {#repair-a-game}

Aus **Game Health**:

1. Füge die Bibliothek des Spiels unter **Einstellungen → Ordner** hinzu und scanne sie.
2. Öffne das **Game Health**-Fenster des Spiels und sieh dir **Uplay-R1/R2-Einrichtung diagnostizieren** an.
3. Führe **Ubisoft-Erfolgskorrektur anwenden** aus und starte das Spiel einmal.

Aus **Einstellungen → Emulatoren → Ubisoft / Uplay R1/R2**:

<div align="center">
<picture><source srcset="../assets/shot/uplay-r2-panel-800.webp 800w, ../assets/shot/uplay-r2-panel.webp 928w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/uplay-r2-panel.png" width="720" height="536" alt="Einstellungen - Ubisoft / Uplay R2"></picture><br>
<sub>Das integrierte Reparaturpaket wird geprüft, bevor ein Spiel angefasst wird</sub>
</div>

- **Neu erkannte Spiele automatisch reparieren**: der Schalter, der auch unter Steam / GBE Fork steht, gilt
  auch für Ubisoft-Spiele. Standardmäßig aus.
- **Erkannte Uplay-R1/R2-Spiele reparieren**: repariert jede erkannte Installation in einem bestätigten Stapel.
- **DLLs importieren oder ersetzen** / **Integrierte DLLs wiederherstellen**: nutze einen eigenen Loader-Build oder kehre zu
  dem zurück, den AW Next mitliefert. Eine manuell gewählte DLL braucht keinen bekannten SHA-256-Fingerabdruck, muss aber ein
  gültiger, erfolgsfähiger Uplay-Loader mit stimmigem Namen und stimmiger Architektur sein.

Die integrierten DLLs liegen in `app/resources/uplayR2/` (R2) und `app/resources/uplayR1/` (R1). AW Next
prüft ihre Hashes, ihre PE-Architektur und ihre Erfolgsfähigkeit, bevor eine Reparatur sie nutzen darf, und
hält daneben ein Wiederherstellungsarchiv bereit.

Dieselbe Reparaturtransaktion läuft aus dem Kontextmenü, Game Health, der automatischen Reparatur, Alle reparieren und der
Stapel-Schaltfläche. Sie sichert jede geänderte DLL, jedes Schema und jede INI unter `<game>\.aw-backups\<timestamp>\`
und stellt sie automatisch wieder her, wenn die Validierung danach scheitert. Eine identische Reparatur zu wiederholen
bewirkt nichts.

## Ein nicht zugeordnetes Spiel mit seinem Steam-Release verknüpfen {#linking-an-unmapped-game-to-its-steam-release}

AW Next ordnet die meisten Ubisoft-Spiele selbst ihrem Steam-Release zu, um Steam-Erfolgsnamen in die
Ubisoft-Ziel-IDs umzusetzen, die der Loader erwartet. Gelingt das nicht, wähle das Release selbst
mit **Spiel identifizieren (Steam-AppID)** im Rechtsklickmenü des Spiels. Eine Zuordnung, die sich nicht
bestätigen lässt, wird abgelehnt, weil eine falsche die Erfolgsliste eines anderen Spiels in den Ordner
dieses Spiels schreiben würde.

Die Erfolgsseite des Spiels einmal in Ubisoft Connect zu öffnen, kann AW Next helfen, einen Titel zu erkennen, der das
braucht, etwa Brawlhalla oder The Crew 2. Die Wahl, die du bestätigst, wird für genau diesen
Installationsordner gemerkt. Die automatische Zuordnung (die eingebaute Tabelle, der Live-Ubisoft-Katalog und die
Regel zum Titelabgleich) ist in der [Uplay-R1/R2-Referenz](../uplay-reference.md) beschrieben.

## Ein Spiel, das nie einen Erfolg anfordert {#a-game-that-never-asks-for-an-achievement}

Manche Ubisoft-Titel fragen den Loader zuerst nach der Ubisoft-Sitzung, und der Loader antwortet aus einem
leeren Schlüssel. Diese Spiele lesen den leeren Schlüssel als abgemeldet und rufen die Erfolgs-API nie auf. Die Einrichtung
sieht richtig aus, und nichts wird erfasst. Avatar: Frontiers of Pandora verhält sich so.

Beweist das Diagnoseprotokoll von Game Health dies, bietet es bei der Prüfung Emulator-Einrichtung **Erfolge offline aktivieren** an.
Es fügt neben dem Spiel einen Platzhalter-Sitzungsschlüssel hinzu: keine echte Ubisoft-
Sitzung, kein Konto beteiligt, nichts wird irgendwohin gesendet, nur genug, um diese eine Prüfung zu bestehen. Er wird nie
automatisch hinzugefügt, weil ein nicht legitimes Token manche Spiele kaputt machen kann.

**Starte das Spiel nach dem Einschalten einmal.** Bis dahin lautet die Zeile *Erfolge offline sind an,
starte das Spiel einmal*. Die Schaltfläche daneben heißt dann **Erfolge offline abschalten** und nimmt
den Schlüssel wieder heraus.

Das gilt nur für R2-Loader; die INI von R1 enthält einen anderen Schlüssel. Die [Goldberg- / GBE-Anleitung](emulator-setup.md)
behandelt das Steam-Gegenstück dieser Reparatur.

## Erfolge bleiben bei 0 % {#achievements-remain-at-0}

- Führe **Uplay-R1/R2-Einrichtung diagnostizieren** nach einem Spiel-Update erneut aus, da Updates oft das Schema entfernen
  oder die Zahl der Freischaltungen zurücksetzen.
- Lies `upc_r2.log` (oder `upc_r1.log`) neben der Loader-DLL: Es hält jede Zielnummer fest, die das
  Spiel anfordert. Lass **Diagnoseprotokoll** an, unter **Einstellungen → Emulatoren → Ubisoft / Uplay R1/R2**.
  Game Health braucht es, um ein Spiel, das nie angefragt hat, von einem zu unterscheiden, das ein Ziel anfordert, das das Schema
  nicht enthält. Es ist standardmäßig an, und AW Next kürzt das Protokoll, sobald es 25 MB überschreitet.
- Sieh in `%APPDATA%\Achievement Watcher Next\logs\parser.log` nach.

## Hinweis zum Virenscanner {#antivirus-note}

Entfernt ein Virenscanner eine lose Loader-DLL oder stellt er das Wiederherstellungsarchiv zwischendurch unter Quarantäne, meldet Game
Health ein Virenscanner-Problem und bietet an, den Ordner zuzulassen und die Dateien zurückzulegen. Du musst
nicht selbst nach einem Ersatz suchen.

Identität, Ziel-IDs und das Loader-Protokoll werden in der [Uplay-R1/R2-Referenz](../uplay-reference.md) behandelt.

<div align="center">

[← Dokumentation](README.md) · [Fehlerbehebung](troubleshooting.md) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
