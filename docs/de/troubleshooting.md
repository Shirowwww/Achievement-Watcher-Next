---
title: "Fehlerbehebung"
description: "Lösungen bei fehlenden Spielen, falschem Fortschritt, nicht erscheinenden Benachrichtigungen, Spielzeit und Warnungen von Virenscanner oder SmartScreen."
---

# Fehlerbehebung

## Hier beginnen {#start-here}

Betrifft das Problem **ein einzelnes Spiel**, öffne zuerst das **[Game Health](game-health.md)**-Fenster dieses Spiels.
Es sagt, ob AW Next das Spiel sehen, seine Erfolge lesen und seine Freischaltungen melden kann, und
bietet nur die Reparaturen an, die zutreffen. Die meisten Probleme mit einem einzelnen Spiel sind damit erledigt.

Nutze den Rest dieser Seite für Probleme, die die ganze App betreffen. **Einstellungen → Hilfe** hat eine kurze
Fassung der ersten Prüfungen unter *Etwas funktioniert nicht* (Game Health und Fehlerbehebung), und ihre Zeile
*Deine aktuelle Einrichtung* zeigt dein Design, deinen Benachrichtigungsmodus, den Controller, den Overlay-Hotkey und wie viele
Quellen aktiviert sind. Für eine Frage, bevor du sicher bist, dass es ein Fehler ist, frage auf dem
[Discord-Server](https://discord.gg/DjTMrDsXTh). Gib in einem Fehlerbericht die App-Version, die Windows-
Version, die betroffene Quelle, die genauen Schritte und die relevanten Protokolle an.

## Unter Linux {#on-linux}

Die Linux-App hat Probleme, die diese Seite nicht abdeckt. Das AppImage startet ohne FUSE 2 nicht
(`libfuse2t64` unter Ubuntu 24.04). Der Schlüsselbund fragt nur bei automatischer Anmeldung nach seinem Passwort. Das
Overlay-Tastenkürzel unter Wayland bindest du in den Tastatureinstellungen deines Desktops. Jedes hat seine Lösung
in [Linux und das Steam Deck](linux.md#install). Der Rest dieser Seite beschreibt Windows; unter Linux
liegen die Protokolle in `~/.config/Achievement Watcher Next/logs`.

## Protokolle und lokale Daten öffnen {#open-logs-and-local-data}

<div align="center">
<picture><source srcset="../assets/shot/diagnostics-panel-800.webp 800w, ../assets/shot/diagnostics-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/diagnostics-panel.png" width="720" height="529" alt="Einstellungen - Erweitert, Diagnose"></picture><br>
<sub>App- und Laufzeitversionen und schneller Zugriff auf Protokolle, Daten und Update-Prüfungen</sub>
</div>

Der Tab **Erweitert** gibt es nur im Modus Erweitert. Siehst du ihn nicht, stelle den Regler **Oberfläche**
oben in den **Einstellungen** von Einfach auf Erweitert; beim Zurückwechseln geht nichts verloren (siehe
[getting-started.md](getting-started.md#simple-and-advanced)).

**Einstellungen → Erweitert → Diagnose** öffnet den Protokoll- oder Datenordner. Der Standardpfad der Protokolle lautet:

```text
%APPDATA%\Achievement Watcher Next\logs
```

Die nützlichsten Dateien sind meist `Achievement Watcher.log`, `renderer.log`, `parser.log` und die
Watchdog-Protokolle der betroffenen Quelle. Ein Fehler, der Scan, Oberfläche und Benachrichtigungen berührt, braucht
mehrere davon, nutze also **Protokolle exportieren (.zip)** auf derselben Karte, statt Dateien von Hand zu kopieren:
Die Prozesse, die die Protokolle schreiben, hören nie auf, sodass eine manuelle Kopie eine halb geschriebene Zeile erwischen kann. Der
Export funktioniert bei laufender App und fügt eine `about.txt` mit den Versionen von App, Electron, Node und Chrome hinzu.

Das Archiv ist für ein öffentliches Issue gedacht, daher sind seine Kopien maskiert: Dein Windows-Benutzername in jedem
Pfad wird zu `[username]`, und Schlüssel, Token und Passwörter werden zu `[redacted]`, `[token]` oder
`[apikey]`. Die Protokolle auf deinem Datenträger bleiben unverändert, und eine Datei, die sich nicht maskieren lässt, wird weggelassen.
Das Maskieren arbeitet mit bekannten Mustern, lies die Dateien also, bevor du sie postest; ein nach dir benannter Spielordner
zum Beispiel bleibt, wie er ist.

Protokolle werden fortgeschrieben, nie gekürzt, sodass ein Absturz den nächsten Start überdauert. Jeder Lauf beginnt mit einer
Markierung, gefolgt von einem Block `[diag]` mit dem, was ein Fehlerbericht braucht: Versionen, Installations- und Datenpfade,
wie die App gestartet wurde, Sprache und Design und die Geometrie jedes Displays:

```text
===== session 2026-08-11T00:53:31.890Z pid=19276 =====
[diag] app: Achievement Watcher 3.10.0 (packaged)
[diag] runtime: electron 43.4.0 · chrome 150.0.7871.224 · node 24.18.1 · v8 15.0
[diag] display: 3056414223 1080x1920 @1x work=1080x1872 rotation=270
[diag] display: 3933707034 (primary) 2048x1152 @1.25x work=2048x1104 rotation=0
```

Füge diesen Block in ein Issue ein. Probleme mit Fenstergröße und -platzierung sind fast immer Anzeigeskalierung
oder mehrere Monitore, und die folgenden Zeilen `[MainWindow]` halten die Grenzen und das Display des Fensters
jedes Mal fest, wenn es gezeigt, verschoben, in der Größe geändert oder geschlossen wird.

Jede Protokolldatei wird ab 2 MB nach `<name>.log.1` rotiert, sodass eine ältere Generation erhalten bleibt.

## Ein Spiel fehlt {#a-game-is-missing}

1. Öffne **Einstellungen → Quellen** und prüfe, dass die betreffende Integration aktiviert ist.
2. Öffne **Einstellungen → Ordner**, starte **Intelligente Suche** und nutze dann **Konfigurationen generieren** für einen vollständigen Scan.
3. Füge die Spielebibliothek oder das Stammverzeichnis der Spielstände von Hand hinzu, wenn sie einen eigenen Ort nutzt.
4. Schalte **Nur installierte Spiele anzeigen** aus, um zu sehen, ob das Spiel bekannt ist, aber nicht mehr als
   installiert gilt.
5. Starte bei Emulator-Spielständen das Spiel einmal, damit es einen Laufzeitordner anlegt.

Bleiben nur alte Spielstandreste übrig und die Spieldateien sind weg, verbirgt der Filter für installierte Spiele
den Eintrag.

Ein Spiel, dessen Metadaten nicht abgerufen werden konnten, bleibt in der Liste: Was auf dem Datenträger liegt, entscheidet, dass ein Spiel
existiert, und die Online-Abfrage schmückt es nur aus. Der Eintrag zeigt den lokal bekannten Namen und
wird bei einem späteren Scan ergänzt.

## Erfolge bleiben gesperrt oder zeigen 0 % {#achievements-stay-locked-or-show-0}

Keine Freischaltungsdatei der Laufzeit bedeutet 0 %, auch bei vollständiger Erfolgsliste.

Öffne das **[Game Health](game-health.md)**-Fenster des Spiels: Es nennt das fehlende Teil und bietet die
Reparatur an, sei es das Neuschreiben der Erfolgsdaten, das Wiederherstellen der Emulator-Datei oder das Korrigieren einer
`steam_appid.txt`, die ein anderes Spiel nennt. Zum Prüfen von Hand:

- prüfe, ob die erkannte AppID oder Plattform-ID zum richtigen Spiel gehört;
- prüfe, ob ein eigener Speicherpfad gesetzt ist;
- repariere ein nicht passendes `steam_settings`-Schema erst, nachdem du den Bericht angesehen hast;
- hast du auf einem anderen PC gespielt, verbinde dieses Steam-Konto: Ein Spiel, das lokal nichts zu lesen hat, wird
  dann aus deinem Steam-Profil gelesen, dessen Spieldetails öffentlich sein müssen. Die Antwort wird sechs
  Stunden zwischengespeichert (siehe [Verbundene Konten](sources.md#connected-accounts)).

Spielstände von Steam-Emulatoren können für dasselbe Spiel auf `%APPDATA%\GSE Saves` und
`%APPDATA%\Goldberg SteamEmu Saves` verteilt sein. AW Next liest, was die Freischaltungen enthält, du musst
das also nicht von Hand beheben.

Ein Spiel ohne Erfolgssatz hat statt 0 % keinen Fortschrittsbalken (oder **Keine Erfolge**, wenn du
diesen Balken unter **Einstellungen → Darstellung → Bibliothekskacheln** wieder eingeschaltet hast) und bleibt aus den
Abschlussstatistiken heraus.

**Es funktioniert über die Schaltfläche Spielen von AW Next, aber nicht über eine Steam-Verknüpfung.** Ein gecracktes Spiel, das Steam
als Nicht-Steam-Spiel hinzugefügt wurde, startet mit einer eigenen Spiel-ID, und GBE Fork liest diese ID vor seiner
`steam_appid.txt`, sodass die Freischaltungen unter der Nummer der Verknüpfung gespeichert werden und die Karte des Spiels nie erreichen. Steam
übergibt die echte ID, wenn eine `steam_appid.txt` im Startordner der Verknüpfung liegt (Ausführen
in); eine allein neben der ausführbaren Datei wird nicht gelesen. Game Health markiert eine Verknüpfung, deren Startordner
sie nicht hat, und seine Reparatur schreibt die Datei dorthin.

**Ein Scene-Crack bedient das Spiel, und nichts wird je erfasst.** Manche Cracks melden nie Erfolge.
Nach einer Stunde Spielzeit ohne Erfassung sagt Game Health das und bietet, wenn dieser Crack die Steam-Bibliotheksdatei
des Spiels ist, an, den unterstützten Emulator darüber zu installieren und das später rückgängig zu machen.

**Halo: Campaign Evolved und The Crew Motorfest erfassen offline nichts.** Die Server des Publishers
vergeben ihre Erfolge, daher kann kein Crack und kein Emulator sie erfassen. Ihr Game-Health-Fenster sagt das.

Siehe [Goldberg- und GBE-Fork-Einrichtung](emulator-setup.md#common-problems) oder [Goldberg-Uplay-R2-Einrichtung](uplay-r2.md#achievements-remain-at-0) für quellenspezifische Schritte.

## Das falsche Spiel wurde zugeordnet {#the-wrong-game-was-matched}

Passt der Ordnername eines Spiels auf mehrere Steam-Releases und die automatische Zuordnung hat das falsche
gewählt, klicke es mit der rechten Maustaste an und wähle **AppID manuell festlegen...**. Die eingegebene AppID wird in
`steam_appid.txt` geschrieben und für diesen Installationsordner gemerkt, sodass spätere Reparaturen sie nutzen; **Manuelle AppID entfernen**
im selben Menü macht das rückgängig. Auch die Reparatur **Spiel-ID-Datei korrigieren** von Game Health fragt
nach der AppID. Details: [Die AppID eines Spiels von Hand festlegen](advanced.md#set-a-games-appid-by-hand).

Eine Abweichung ist nicht immer die Schuld des Emulators. Wurde er absichtlich für die ID auf dem Datenträger eingerichtet, lass
ihn in Ruhe.

## Namen, Beschreibungen oder Artwork fehlen {#names-descriptions-or-artwork-are-missing}

- Aktualisiere online, damit die App ihre Metadatenquellen erneut versuchen kann.
- Prüfe die Plattformzuordnung des Spiels; eine falsche Steam-AppID kann überzeugende, aber nicht
  zugehörige Metadaten liefern.
- Bei Goldberg/GBE kann ein gültiges lokales Schema fehlenden Text teilweise offline ergänzen.
- Nutze die Cover-Aktionen des Spiels, um es erneut zu versuchen oder lokales Artwork zu wählen, wenn automatische Quellen scheitern.

Eine Karte, die nur mit ihrer nackten Steam-AppID betitelt ist, bedeutet, dass die Namensabfrage leer zurückkam, während das Artwork,
das allein von der AppID kommt, aufgelöst wurde. Der nächste Scan ersetzt die Nummer, sobald die Abfrage
gelingt.

DLC- und Update-Erfolge zeigen ihre zugehörige Gruppe unter dem Titel (zum Beispiel ein Etikett »Hearts of
Stone«), aus den eigenen Erfolgssätzen von Steam oder, bei einem Spiel ohne diese, von SteamHunters.

Beschreibungen versteckter Erfolge bleiben versteckt, wenn jede verfügbare Quelle sie auslässt.

## Ein Spiel-Update hat Erfolge hinzugefügt, die nicht erscheinen {#a-game-update-added-achievements-that-arent-showing-up}

Ein zwischengespeichertes Schema prüft sich alle 3 Tage selbst erneut bei Steam, da Steam neue
Erfolge nie ankündigt. Um sie sofort zu übernehmen, nutze **Einstellungen → Erweitert → Erfolgslisten erneut prüfen**, was
auch bei ausgeschalteten **Automatischen Aktualisierungen der Erfolgsdaten** funktioniert. Dieser Schalter, ebenfalls unter Einstellungen →
Erweitert, stoppt nur die regelmäßige Prüfung und die Reparatur leerer Beschreibungen. Keine der Prüfungen entfernt
vorhandene Erfolge oder Freischaltungen. Schalte ihn nur aus, wenn du `steam_cache` von Hand pflegst.

## Ein Update hängt an derselben Datei {#an-update-is-stuck-on-the-same-file}

Heruntergeladene Update-Dateien bleiben zwischen den Läufen erhalten. Scheitert ein Download immer wieder an derselben Datei, nutze
**Einstellungen → Erweitert → Caches leeren** und suche erneut nach Updates. Nur erneut herunterladbare Caches werden
gelöscht; Einstellungen, Spieldaten und Protokolle bleiben.

Updates laden normalerweise nur den geänderten Teil des Installers herunter und weichen bei einem Fehler von selbst auf den vollständigen
Installer aus.

AW Next kündigt eine neue Version mit einer Windows-Benachrichtigung und einem Chip in der Titelleiste an, und ein Klick auf
eines von beiden öffnet das Update-Fenster, das die Versionshinweise jeder übersprungenen Version auflistet. Der
Hinweis bleibt, bis du ihn schließt, und kommt nach einem Spiel zurück, nie währenddessen. Das Symbol im Infobereich trägt in der
Zwischenzeit einen blauen Punkt. **Einstellungen → Nach Updates suchen** öffnet das Fenster sofort.

**Update abgelehnt.** Jedes Update wird vor der Installation gegen das festgelegte Signaturzertifikat des Projekts geprüft,
nicht gegen irgendeine Signatur und nicht gegen den daneben veröffentlichten SHA-512, da beide aus
demselben Release stammen. Eine Ablehnung bedeutet fast immer, dass die heruntergeladene Datei manipuliert oder beschädigt wurde:
leere die Caches wie oben und lade erneut von der
[offiziellen Releases-Seite](https://github.com/Shirowwww/Achievement-Watcher-Next/releases) herunter.

## Benachrichtigungen erscheinen nicht {#notifications-do-not-appear}

1. Prüfe, ob der Hintergrund-Tracker läuft.
2. Öffne das Spiel und lies die Zeile Benachrichtigungen seines **Game Health**-Fensters: Sie nennt den Weg,
   der die letzte Benachrichtigung für dieses Spiel zugestellt hat, und warum.
3. Nutze die Tests für normal, selten und Overlay unter **Einstellungen → Benachrichtigung**.
4. Prüfe Zustellmodus und gewähltes Preset. Bei **Automatisch** ist ein fehlendes Overlay-Popup oft
   der gewollte Ausweichweg: siehe [Benachrichtigungen](notifications.md#how-automatic-decides).
5. Prüfe die Windows-Benachrichtigungsberechtigungen für AW Next.
6. Tritt das Problem nur beim Spielen oder im Vollbild auf, aktiviere **Prioritätsbenachrichtigungen** unter
   **Einstellungen → Benachrichtigung** und bestätige die Windows-Berechtigungsabfrage.
7. Teste das Overlay außerhalb des exklusiven Vollbilds.
8. Sieh dir die Protokolle direkt nach einem fehlgeschlagenen Test oder einer Freischaltung an.

Aktualisiert sich die Bibliothek, aber keine Benachrichtigung erscheint, liegt das Problem am Benachrichtigungsweg. Bleibt auch die
Bibliothek unverändert, diagnostiziere zuerst die Quelle oder den Spielstandpfad.

## Die OBS-Browserquelle bleibt leer {#the-obs-browser-source-stays-empty}

1. Drücke **Vorschau** unter **Einstellungen → Benachrichtigung → OBS-Browserquelle** oder öffne
   `http://127.0.0.1:8082/obs/?test=1`. Eine Beispielkarte alle zehn Sekunden bedeutet, dass die Seite und der Feed
   funktionieren und das Problem in den Einstellungen der Quelle in OBS liegt.
2. Gar nichts, nicht einmal eine leere Seite: Eine andere Kopie von AW Next oder ein anderes Programm belegt Port
   8082. Nur die zuerst gestartete Kopie bedient die Adresse.
3. Eine leere Seite ist zwischen Freischaltungen normal. Nutze `?test=1`, um sie zeichnen zu sehen.
4. Prüfe, ob **Websocket @localhost:8082** unter **Einstellungen → Benachrichtigung → Transport** an ist: Die
   Quelle liest diesen Feed.
5. Die Karte füllt die jeweilige Größe der Quelle. Wirkt sie weich, gib der Quelle mehr Pixel und
   platziere sie kleiner in der Szene.

Siehe [Freischaltungen im Stream zeigen (OBS)](notifications.md#show-unlocks-on-stream-obs) für die vollständige Einrichtung.

## Ein Spiel startet nicht über die Schaltfläche Spielen {#a-game-will-not-start-from-the-play-button}

Manche Spiele brauchen Administratorrechte, weil ihr Manifest oder Launcher sie verlangt. Windows
weigert sich, diese so zu starten, wie AW Next ein Spiel normalerweise startet, und meldet `EACCES`.

AW Next versucht es dann erneut über die Windows-Shell, die die gewöhnliche UAC-Abfrage zeigt, sodass das Spiel
startet, sobald du bestätigst. Wird auch das abgelehnt, bietet AW Next an, es als Administrator zu wiederholen. Nur das
Spiel wird erhöht, da ein erhöhtes AW Next Dateien anlegen würde, die dein normales Konto nicht neu schreiben kann.
Das Schließen der UAC-Abfrage gilt als Entscheidung, nicht als Fehler.

## Die Spielzeit wird nicht erfasst {#playtime-is-not-tracked}

AW Next folgt der konfigurierten Programmdatei des Spiels und der Lebensdauer ihres Prozesses. Startet stattdessen ein Launcher, ein Helfer oder eine
anders benannte Programmdatei:

- klicke das Spiel mit der rechten Maustaste an und öffne seine Konfiguration;
- wähle die Programmdatei, die beim Spielen aktiv bleibt;
- meide Launcher- und Absturzbehandlungs-Prozesse;
- starte das Spiel nach dem Speichern neu.

Ein Java-Spiel, das über `javaw.exe` startet und dessen eigener Launcher sich beendet, wird automatisch über diesen
Java-Prozess verfolgt.

Um eine bereits falsche Summe zu korrigieren, nutze **Erfolge und Spielzeit → Spielzeit bearbeiten…** (siehe
[Die Spielzeit eines Spiels bearbeiten](advanced.md#editing-a-games-playtime)).

## PlayStation-Trophäen werden nicht importiert {#playstation-trophies-do-not-import}

- *Die PlayStation-Sitzung ist abgelaufen*: Verbinde das Konto unter **Einstellungen → Quellen** erneut.
- *PlayStation bittet, langsamer vorzugehen* oder *Von PlayStation pausiert*: Sony begrenzt die Anfragerate. Importiere
  in einigen Minuten erneut, und es macht dort weiter, wo es aufgehört hat.
- *Noch keine Trophäenliste in diesem Konto*: Das Konto hat keine Trophäenliste zum Importieren.

## Ein Nemirtingas-Epic-Spiel erfasst nichts {#a-nemirtingas-epic-game-records-nothing}

Enthält ein Spielordner den Emulator (seine `EOSSDK`-Bibliothek mit einer
`nepice_settings\NemirtingasEpicEmu.json` daneben), zeigt der Tab **Game Health** des Spiels eine Zeile
**Epic-Emulator**:

- **SavePath muss `"appdata"` sein.** Der Emulator schreibt Erfolge nur mit diesem Wert nach
  `%APPDATA%\NemirtingasEpicEmu`, wo AW Next sie liest; jeder andere Wert hält sie
  im Spielordner. Die Zeile warnt, wenn etwas anderes gesetzt ist.
- **Manche Spiele brauchen die Epic-Startargumente.** Manche EOS-Spiele melden sich am Emulator an und speichern daher einen
  Erfolg nur, wenn ein Launcher `-epicapp=...` und die übrigen übergibt. Solange der Emulator nichts
  gespeichert hat, bietet die Zeile **Epic-Startargumente hinzufügen** an, das sie aus der `AppId` der Konfiguration
  in die Starteinstellungen des Spiels schreibt. Eine `.bat`, die sie übergibt, funktioniert ebenfalls.
- Stürzt das Spiel beim Start mit dem Emulator ab, schalte dessen Overlay-Plugin aus
  (`"Plugins": { "Overlay": { "Enabled": false } }`); die Zeile erinnert dich daran, solange es an ist.

## Ubisoft oder Uplay R2 nutzt die falsche Aktion {#ubisoft-or-uplay-r2-uses-the-wrong-action}

Ubisoft-Spiele sollten Ubisoft-Metadaten und die Uplay-R2-Reparatur bekommen, nicht die Steam-GBE-Aktion. Starte einen
neuen Ordnerscan und prüfe das Quellensymbol. Wird das Spiel weiter falsch erkannt, füge einem Bericht `parser.log`,
die angezeigte Quelle und IDs sowie den Verzeichnisnamen des Spiels bei.

## Warnung von Virenscanner oder SmartScreen {#antivirus-or-smartscreen-warning}

Verpackte Releases sind mit dem eigenen Zertifikat des Projekts signiert, festgelegt über seinen genauen Fingerabdruck, nicht
von einer öffentlich vertrauenswürdigen Stelle ausgestellt, daher kann Windows SmartScreen trotzdem warnen. Du musst das Zertifikat nie
installieren. Vor der Installation eines Updates prüft AW Next, dass es signiert ist, dass der
Unterzeichner `CN=Shirow` ist, dass der Fingerabdruck zu einem der beiden festgelegten der App passt und dass die
Datei nach der Signierung nicht verändert wurde. Der mit einem Release veröffentlichte SHA-512 kann diese Prüfung nicht ersetzen,
da beide gemeinsam ersetzt würden. Optionale Emulator-DLLs können außerdem heuristische Erkennungen auslösen.
Lade nur von der
[offiziellen Releases-Seite](https://github.com/Shirowwww/Achievement-Watcher-Next/releases) herunter und vergleiche
den Installer zur zweiten Kontrolle mit dem SHA-512 in der passenden `latest.yml`.

Schalte den systemweiten Schutz nicht ab. Melde eine in Quarantäne verschobene Datei aus dem offiziellen Release dem
Hersteller des Virenscanners als Fehlalarm.

### Ein Release selbst prüfen {#checking-a-release-yourself}

Jeder veröffentlichte Installer lässt sich bei VirusTotal über seinen SHA-256 nachschlagen:

```powershell
Get-FileHash "Achievement.Watcher.Setup.3.12.7.exe" -Algorithm SHA256
```

Öffne `https://www.virustotal.com/gui/file/<the hash it prints>`. Ist die Datei die veröffentlichte,
liegt der Bericht bereits vor. Für das aktuelle Release ist das
[der Installer 3.12.7](https://www.virustotal.com/gui/file/183be0f0780edcf4377607a357313125d53b9091f50c7114e3bee3998b5a4d96)
(`183be0f0780edcf4377607a357313125d53b9091f50c7114e3bee3998b5a4d96`).

Das Ergebnis listet, was jede Engine meint. Eine Handvoll heuristischer Erkennungen bei einem Build, der
Emulator-Dateien mitbringt, ist der unten beschriebene Fehlalarm. Wichtig ist, dass der Hash zu der Datei passt,
die die Releases-Seite veröffentlicht hat.

### Die Emulator-Dateien werden markiert {#the-emulator-files-are-flagged}

Das ist die Erkennung, auf die Leute tatsächlich stoßen, und sie ist ein Fehlalarm. Erfolge für ein
Spiel aufzuzeichnen, ohne dass ein Store-Client läuft, heißt, eine Ersatzbibliothek daneben zu legen: den Steam-Emulator (GBE
Fork) oder einen Ubisoft-Loader. Erkennungs-Engines achten genau darauf, sie markieren also, was die Datei
*tut*, nicht, was sie enthält. Windows Defender stellt jede Kopie, die er sieht, auf einmal unter Quarantäne: im Spiel-
ordner, mit AW Next installiert und in dessen Cache.

**Wann es auslöst.** In dem Moment, in dem eine Datei geschrieben wird, und nur dann:

| Was du getan hast | Was geschrieben wird |
|---|---|
| Eine Reparatur ausgeführt, aus dem Menü eines Spiels oder aus den Einstellungen | der Emulator oder Loader, in den Ordner dieses Spiels |
| **Einstellungen → Emulatoren → Ubisoft / Uplay R1/R2** geöffnet | die mitgelieferten Loader, in den eigenen Cache von AW Next |
| **Neu erkannte Spiele automatisch reparieren** aktiviert | dasselbe, während eines Scans, für jedes Spiel, das es braucht |

Das Starten von AW Next schreibt nichts davon. Die automatische Reparatur ist aus, solange du sie nicht einschaltest, und sie warnt
dich vorher, mit der Möglichkeit, zuerst eine Defender-Ausnahme hinzuzufügen. War sie bereits an, erscheint dieselbe
Warnung einmal vor dem ersten Schreiben, mit der Ausnahme und dem Aus-Schalter im Dialog.
Solange das Fenster im Infobereich verborgen ist, wird nichts geschrieben.

**Was AW Next dagegen tut.** Eine Quarantäne wird als Virenscanner-Problem gemeldet, mit einer Schaltfläche, um
den Ordner in Windows Defender zuzulassen, und einer weiteren, um die entfernten Dateien zurückzulegen. **Einstellungen →
Emulatoren → Ubisoft / Uplay R1/R2 → Integrierte DLLs wiederherstellen** stellt sie jederzeit wieder her.

**Was zu tun ist.** Lasse die Datei zu, die dein Virenscanner genannt hat, oder schließe
`%APPDATA%\Achievement Watcher Next\cache` aus. Das schützt die eigenen Kopien von AW Next; die Kopie in einem Spiel-
ordner kann weiterhin markiert werden, schließe diesen Ordner also auch aus, wenn es immer wieder passiert. Den Fehlalarm
deinem Hersteller zu melden, behebt ihn für alle.

Windows Defender nennt das GBE-Fork-Archiv `Trojan:Win32/Suschil!rfn`, während AW Next es in
seinen Cache herunterlädt. Es ist derselbe Fehlalarm: Lasse es zu oder schließe den Cache-Ordner aus und führe die
Korrektur erneut aus.

**Vorher prüfen.** Beide stammen von Dritten und sind Open Source: Der Steam-Emulator kommt aus den offiziellen
[GSE-Fork-Releases](https://github.com/Detanup01/gbe_fork), und die Ubisoft-Loader liegen in
`app/resources/uplayR1/` und `app/resources/uplayR2/` im Repository. AW Next prüft die mitgelieferten
gegen bekannte SHA-256-Werte, ihre PE-Architektur und ihre Erfolgsfähigkeit, bevor eine
Reparatur sie nutzt, und lehnt eine Datei ab, die durchfällt.

### Ein Virenscanner reagiert, während AW Next läuft {#an-antivirus-reacts-while-aw-next-runs}

Verhaltens-Engines (System Watcher von Kaspersky, Advanced Threat Defense von Bitdefender) beurteilen, was ein
Programm tut, nicht, was es enthält. AW Next startet kein PowerShell für Windows-Benachrichtigungen, Toast-
Töne oder die Signaturprüfung von Updates und kompiliert keinen Code nach `%TEMP%`: Screenshots nutzen den
nativen Helfer, der mit der App kommt, und die Benachrichtigungsprüfung ruft Windows direkt auf.

Reagiert dein Virenscanner trotzdem, notiere den genauen Namen der Erkennung und melde die genannte Datei als Fehl-
alarm. Bei Kaspersky ist das [opentip.kaspersky.com](https://opentip.kaspersky.com): Suche die Datei
über ihren Hash und dann **Submit to reanalyze**.

## Das Fenster öffnet sich nicht {#the-window-does-not-open}

- Nutze das Symbol im Infobereich, falls die App versteckt gestartet wurde.
- Beende einen hängenden AW-Next-Prozess und starte ihn erneut.
- Entferne `ELECTRON_RUN_AS_NODE` aus der Umgebung, falls es für die Entwicklung gesetzt war; es lässt
  Electron als reines Node starten.
- Sieh in `renderer.log` und im Hauptprotokoll der App nach dem ersten Fehler.
- Probiere **Einstellungen → Allgemein → Hardwarebeschleunigung deaktivieren**, wenn die Oberfläche lange genug sichtbar bleibt, um
  sie zu ändern.

## Mit einem frischen Profil beginnen {#start-with-a-fresh-profile}

Nutze dies nur, nachdem du Daten gesichert hast, die du behalten willst:

1. Beende AW Next vollständig über den Infobereich.
2. Benenne `%APPDATA%\Achievement Watcher Next` in `Achievement Watcher Next.backup` um.
3. Starte die App und reproduziere das Problem mit dem neuen Profil.

Verschwindet das Problem, stelle nur die Daten wieder her, die du brauchst, oder füge die relevanten Konfigurationsdateien dem
Bericht bei. Umbenennen hält einen Rückweg offen; Löschen nicht.

## Das Problem melden {#report-the-problem}

Durchsuche zuerst die [bestehenden Issues](https://github.com/Shirowwww/Achievement-Watcher-Next/issues). Passt
keines, eröffne einen Fehler mit der Vorlage des Repositorys und füge Protokolle bei, nachdem du alles entfernt hast, was du
nicht öffentlich teilen willst.

---

**Siehe auch:** [FAQ](faq.md) für kurze Antworten · [Erweiterte Werkzeuge](advanced.md) für Wartung,
Cache-Leerung und Zurücksetzen · [Game Health](game-health.md) für Probleme mit einzelnen Spielen.

Der Weg für Benutzer endet hier. Danach wird die Dokumentation technisch:
die [Goldberg/GBE-Referenz](../goldberg-gbe.md) für Dateiformate und Erkennungsregeln und
[Architecture](../architecture.md) für die Grenzen zwischen App / Renderer / Watchdog.

<div align="center">

[← Dokumentation](README.md) · [Erste Schritte](getting-started.md) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
