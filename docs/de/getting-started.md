---
title: "Erste Schritte"
description: "Achievement Watcher Next installieren, die Einrichtung beim ersten Start durchgehen, zwischen Einfach und Erweitert wählen, Spiele finden und die App aktuell halten."
---

# Erste Schritte

AW Next ist eine Desktop-App für Windows und Linux. Die Releases bringen ihre eigene Laufzeitumgebung mit, Node.js wird also nur zum Bauen aus dem Quellcode gebraucht. Unter Linux installierst du das AppImage so, wie [Linux und das Steam Deck](linux.md) es beschreibt, und kommst dann hierher zurück: Alles Folgende gilt auch dort, mit `~/.config/Achievement Watcher Next` statt `%APPDATA%\Achievement Watcher Next`.

## Installation {#install}

| Schritt | Windows 10 und 11 | Linux (x64, Beta) |
|---|---|---|
| **Herunterladen** | Vom [neuesten Release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest): `Achievement.Watcher.Setup.<version>.exe`, oder `Achievement.Watcher.Portable.<version>.zip`, wenn die Daten neben der App bleiben sollen | Vom selben Release: `Achievement.Watcher.<version>.AppImage` |
| **Starten** | Installer ausführen, einen Ordner wählen und AW Next dann im Startmenü öffnen | `chmod +x`, dann ausführen. Es braucht FUSE 2: `libfuse2t64` unter Ubuntu 24.04 |
| **Daten** | `%APPDATA%\Achievement Watcher Next` (die portable Version legt einen Ordner `data` neben die ausführbare Datei) | `~/.config/Achievement Watcher Next` |

> [!WARNING]
> Der Installer ist mit dem selbstsignierten Zertifikat des Projekts (`CN=Shirow`) signiert, deshalb
> kann Windows SmartScreen trotzdem eine Bestätigung verlangen. Siehe
> [Warnung von Virenscanner oder SmartScreen](troubleshooting.md#antivirus-or-smartscreen-warning). Updates
> in der App installieren nur ein Release, das mit diesem Zertifikat signiert ist, festgelegt über den Fingerabdruck.

## Erster Start {#first-launch}

<div align="center">
<picture><source srcset="../assets/shot/onboarding-dialog-800.webp 800w, ../assets/shot/onboarding-dialog.webp 1280w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/onboarding-dialog.png" width="720" height="475" alt="Einrichtung beim ersten Start: Auswahl von Sprache und der Oberfläche Einfach oder Erweitert"></picture><br>
<sub>Sechs Schritte: Grundlagen, Profil, Spiele, Quellen, Aussehen und Hinweise, dazu eine Zusammenfassung zum Schluss</sub>
</div>

Die Einrichtung beim ersten Start fragt die Entscheidungen ab, mit denen sich die Bibliothek füllt:

- **Grundlagen**: die Sprache (Oberfläche und, wo eine Quelle es anbietet, die Metadaten der Spiele) und die Oberfläche,
  Einfach oder Erweitert (siehe unten). Keine von beiden ist vorausgewählt.
- **Profil**: der Name in der Kopfzeile, ein optionaler lokaler Avatar und dein Haupt-Steam-Konto.
- **Spiele**: was auf diesem PC gefunden wurde, mit Anzahlen. Füge nur dann einen Ordner hinzu, wenn etwas fehlt.
- **Quellen**: optionale Anmeldungen (Steam, Epic, Xbox, PlayStation, RetroAchievements), die deine echte
  Bibliothek und Freischaltungen von einem anderen PC einlesen. Du kannst sie überspringen und dich später unter **Einstellungen →
  Quellen** verbinden. Jeder Quellenschalter liegt unter **Quellen feinjustieren**, eingeklappt, weil die Standardwerte
  alles lesen, was installiert ist.
- **Aussehen und Hinweise**: das Design und die Art, wie Freischaltungen angezeigt werden, mit einer Schaltfläche **Benachrichtigung testen**.
  Die Voreinstellung, **Automatisch**, braucht keine Entscheidung.
- **Fertig**: eine Zusammenfassung mit einer Schaltfläche **Ändern** für jede Auswahl und Hinweisen auf Sammlungen, den Trophäenmodus,
  Videoclips und das Overlay.

<div align="center">
<picture><source srcset="../assets/shot/onboarding-ready-dialog-800.webp 800w, ../assets/shot/onboarding-ready-dialog.webp 1280w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/onboarding-ready-dialog.png" width="720" height="475" alt="Der letzte Schritt der Einrichtung beim ersten Start, mit der Zusammenfassung und den Karten »Gut zu wissen«" loading="lazy" decoding="async"></picture><br>
<sub>Der letzte Schritt: jede Auswahl mit ihrer Schaltfläche Ändern, dann eine Karte für jede Funktion, die man kennen sollte</sub>
</div>

**Einrichtung überspringen** behält deine Antworten, lässt den Rest unverändert und startet den ersten Scan. **Einstellungen →
Allgemein** öffnet die Einrichtung erneut.

## Einfach und Erweitert {#simple-and-advanced}

Wähle eine der beiden in der Einrichtung beim ersten Start und wechsle jederzeit mit dem Regler **Oberfläche** oben in den
**Einstellungen**.

<div align="center">
<picture><source srcset="../assets/shot/settings-panel-800.webp 800w, ../assets/shot/settings-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/settings-panel.png" width="720" height="529" alt="Die Einstellungen von AW Next" loading="lazy" decoding="async"></picture><br>
<sub>Der Regler Oberfläche sitzt neben dem Titel des Fensters; das Suchfeld filtert alle Tabs gleichzeitig</sub>
</div>

- **Einfach** zeigt die Tabs für den Alltag: Allgemein, Darstellung, Controller, Benachrichtigung, Benachrichtigungs-Presets,
  Quellen, Ordner und Hilfe.
- **Erweitert** fügt die Tabs **Steam / GBE Fork**, **Ubisoft / Uplay R1/R2** und **Erweitert** hinzu, dazu die
  tieferen Optionen innerhalb der anderen Tabs.

**Einfach blendet Bedienelemente aus und schaltet nie etwas ab.** Verfolgung, Scan und Benachrichtigungen verhalten sich
gleich, und jeder Wert, den du gesetzt hast, ist beim Zurückwechseln noch da. Game Health folgt demselben Gedanken:
Einfach sagt *Erfolgsdaten gefunden* oder *Wird beim Spielstart erkannt*, Erweitert nennt genaue Anzahlen, Dateien und
Prozessnamen. Eine bestehende Installation wird auf **Erweitert** aktualisiert, damit nichts verschwindet, was du benutzt hast.

Das Suchfeld oben in den **Einstellungen** filtert alle Tabs gleichzeitig und zählt die Treffer pro Tab.
Es durchsucht Beschriftungen, Beschreibungen, Optionswerte und interne Namen, sodass `hideZero` dieselbe Zeile in
jeder Sprache findet. `Strg+F` springt hinein und `Esc` leert es.

## Die Bibliothek {#the-library}

Unter **Einstellungen → Quellen** kennzeichnet das Schild die offiziellen Desktop-Bibliotheken. Aktiviere eine Zeile und aktualisiere;
nur auf diesem PC erkannte Bibliotheken erscheinen. Siehe [Kompatible Quellen](sources.md).

Die Auswahl zwischen der Bibliothekssuche und der Schaltfläche `+` wechselt zwischen sechs Ansichten: große Karten,
Cover im Hochformat, deren zwei kompakte Varianten, eine Liste und eine Detailtabelle mit Spielzeit und letzter
Sitzung. Die Wahl wird gespeichert, und jede Ansicht hat dieselben Karten, Filter und dasselbe Kontextmenü.

<div align="center">
<picture><source srcset="../assets/shot/library-views-800.webp 800w, ../assets/shot/library-views.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/library-views.png" width="800" height="492" alt="Die Ansicht Details der Bibliothek mit letztem Erfolg, letzter Sitzung und Spielzeit" loading="lazy" decoding="async"></picture><br>
<sub>Die Ansicht Details: letzter Erfolg, letzte Sitzung und Spielzeit jedes Spiels auf einen Blick</sub>
</div>

**Einstellungen → Darstellung → Bibliothekskacheln** legt die Kachelgröße und den Abstand zwischen den Kacheln fest (bis 0) und
blendet Spielname, Fortschrittsbalken, Plattformsymbol, Statuspunkt und die beiden Schaltflächen ein oder aus, für alle Ansichten
gleichzeitig. Ein Spiel, das Steam ohne Erfolge führt, zeigt statt eines Balkens sein Artwork; **Balken bei Spielen
ohne Erfolge** bringt den Balken zurück.

Mit einem Rechtsklick auf ein Spiel benennst du es um, bearbeitest seine Spielzeit oder fügst es einer Sammlung hinzu. Ein von dir vergebener Name übersteht
neue Scans und Wiederherstellungen, während Cover und Zuordnung den ursprünglichen Titel behalten. Steam-Spiele können ihren
Titel in der Sprache deiner Erfolge übernehmen (**Einstellungen → Allgemein**).

### Sammlungen {#collections}

Sammlungen sind deine eigenen Spielegruppen. Rechtsklick auf ein Spiel, **Sammlungen** wählen und eine ankreuzen oder
eine neue anlegen. Die Sammlungs-Schaltfläche neben dem Schalter für installierte Spiele filtert die Bibliothek auf eine
Sammlung, und die Zahlen im Profil folgen.

<div align="center">
<img src="../assets/shot/collections-flow.webp" width="800" height="493" alt="Anlegen einer Sammlung Favoriten, Hinzufügen eines Spiels über sein Rechtsklickmenü und anschließendes Auswählen im Filtermenü, sodass Bibliothek und Profilsummen auf ihre Spiele schrumpfen" loading="lazy"><br>
<sub>Sammlung anlegen, Spiele über ihr Rechtsklickmenü hinzufügen, dann die Bibliothek danach filtern</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/collections-panel-800.webp 800w, ../assets/shot/collections-panel.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/collections-panel.png" width="800" height="289" alt="Die auf eine Sammlung Favoriten gefilterte Bibliothek, wobei die Zahlen im Profil nur ihre Spiele zählen" loading="lazy" decoding="async"></picture><br>
<sub>Ansicht einer einzelnen Sammlung: Die Schaltfläche übernimmt ihr Symbol und ihre Farbe, und die Summen zählen nur ihre Spiele</sub>
</div>

Eine Sammlung hat einen Namen, eine Farbe und ein Symbol oder ein eigenes Bild. **Sammlung bearbeiten…** im
Menü der Schaltfläche öffnet den Editor, in dem du sie auch löschst; ihre Spiele bleiben in der Bibliothek.

<div align="center">
<picture><source srcset="../assets/shot/collection-editor.webp 550w" sizes="(max-width: 700px) 100vw, 360px"><img src="../screenshot/collection-editor.png" width="360" height="337" alt="Der Sammlungs-Editor mit Name, Farbe, Symbol und Bild" loading="lazy" decoding="async"></picture><br>
<sub>Der Sammlungs-Editor</sub>
</div>

### Bibliotheksstatistik {#library-stats}

Die runde Schaltfläche neben der Abschlussquote in der Profilkopfzeile öffnet die **Bibliotheksstatistik**: den gesamten
Abschluss, die Anzahl freigeschalteter und gesperrter Erfolge, den Durchschnitt pro Spiel, durchschnittliche und erfasste Spielzeit, Trophäenzahlen
und eine Zeile pro Plattform. **Nur installierte Spiele anzeigen** begrenzt die Summen auf diesen PC. Der Pfeil
neben der Schaltfläche klappt die Profilkopfzeile auf eine Zeile zusammen, was der Bibliothek mehr Platz gibt (**Einstellungen
→ Darstellung → Profil** bietet dieselbe Auswahl).

<div align="center">
<picture><source srcset="../assets/shot/stats-overview-800.webp 800w, ../assets/shot/stats-overview.webp 1228w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/stats-overview.png" width="800" height="514" alt="Das Fenster Bibliotheksstatistik: Gesamtabschluss, Anzahl freigeschalteter und gesperrter Erfolge, Durchschnitt pro Spiel und Spielzeit" loading="lazy" decoding="async"></picture><br>
<sub>Die Übersicht: Abschluss, Anzahlen, Durchschnitt pro Spiel und Spielzeit</sub>
</div>

**Trophäen** zählt für jedes abgeschlossene Spiel eine Platin-Trophäe (bei einem PlayStation-Spiel, sobald seine Platin-Trophäe
erreicht ist) und stuft jeden anderen freigeschalteten Erfolg nach Seltenheit ein, mit den Schwellenwerten unter dem Balken (sie
folgen der Seltenheitseinstellung unter [Benachrichtigungen](notifications.md#trophy-mode)). **Platin-Spiele** listet
auf, was du abgeschlossen hast und wann, **Seltenste Erfolge** die schwersten, die du besitzt, und **Alle Erfolge**
öffnet die vollständige Liste.

<div align="center">
<picture><source srcset="../assets/shot/stats-trophies-800.webp 800w, ../assets/shot/stats-trophies.webp 1228w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/stats-trophies.png" width="800" height="514" alt="Die Trophäenzahlen, die Platin-Spiele, die seltensten Erfolge und die Tabelle pro Plattform" loading="lazy" decoding="async"></picture><br>
<sub>Trophäen, Platin-Spiele, seltenste Freischaltungen und die Summen pro Plattform</sub>
</div>

## Designs {#themes}

**Einstellungen → Darstellung** färbt die ganze App und das Overlay im Spiel um. Dreizehn Paletten sind eingebaut,
und jede lässt sich bearbeiten: Wähle ein Design, und der Editor öffnet sich bei seinen Farben, eine Zeile pro Ebene (Fenster-
hintergrund, obere Leiste, Bibliotheksbereich, Karten und Zeilen, Einstellungsfenster, Text, gedämpfter Text, Rahmen, Akzent).
Jede Ebene nimmt eine Farbe mit Deckkraft und optional einen Verlauf, und die fünf Flächenebenen können
außerdem ein Hintergrundbild mit Anpassung und entweder einem Farbschleier oder einer Unschärfe erhalten.

Das Bearbeiten zeigt eine Live-Vorschau und schreibt nichts. **Design speichern** macht daraus ein eigenes Design: Behalte den Namen, um
dieses Design zu ersetzen, oder gib einen anderen ein, um ein zweites zu bekommen. **Benutzerdefiniert…** ist der Arbeitsplatz, immer
bearbeitbar und nie von einem Speichern aus ihm heraus überschrieben. **Alles zurücksetzen** stellt das Design wieder her, das du
gerade bearbeitest: Ein eingebautes bekommt seine eigene Palette zurück, ein gespeichertes oder importiertes Design bekommt, was auf dem Datenträger liegt, und
Benutzerdefiniert kehrt zur Standardpalette zurück.

**Designdateien** verwandeln ein Design in eine einzige portable Datei. **Design exportieren…** schreibt eine `.awtheme` mit der
Palette, den Verläufen, Effekten und Bildern, die du benutzt hast, und nichts über deinen Rechner (ein Bild reist als
Bytes, nie als Pfad). Das Exportieren eines eingebauten Designs wird abgelehnt, bis du es unter eigenem Namen gespeichert hast, da
die Datei sich sonst anderswo als »Nord« installieren und das dort vorhandene Nord überdecken würde. **Design
importieren…** zeigt zuerst die App mit diesem Design gezeichnet, mit Name, Autor, Version und Bildanzahl, und
installiert erst nach deiner Bestätigung. **Design löschen** entfernt ein importiertes Design samt seinen Bildern.

Eine `.awtheme` enthält nur Farben, Zahlen und Bilder, kann also nichts ausführen und das Netzwerk nicht erreichen
(siehe [die Formatreferenz](../awtheme-format.md)). Designs, die andere gemacht haben, findest du in der
[Design-Galerie](../gallery/themes/), und deines einzuschicken braucht nur [eine Datei](community-galleries.md). Eine einfache
Datei `*.css` in `%APPDATA%\Achievement Watcher Next\themes` erscheint weiterhin in der Auswahl, lässt sich
aber nicht exportieren.

## Hilfe und Tipps {#help-and-tips}

**Einstellungen → Hilfe** ist eine lebendige Referenz, gegliedert danach, wie eine Frage entsteht: **Erste Schritte**,
**Etwas funktioniert nicht**, **Emulierte Spiele** und **Anpassen**. Sie zeigt deinen echten Hotkey, die Controller-
Belegung und Zuweisungen, dein Design und deinen Benachrichtigungsmodus und aktualisiert sich, wenn du Einstellungen änderst. Ihre Suche
ignoriert Groß- und Kleinschreibung sowie Akzente, und jedes Thema ist in beiden Oberflächenmodi verfügbar.

## Spiele und Spielstände finden {#find-games-and-saves}

Öffne **Einstellungen → Ordner** und wähle einen Pfad:

- **Intelligente Suche** legt alles, was sie findet, zur Freigabe vor, bevor etwas hinzugefügt wird. Sie erkennt Bibliotheksordner
  am Namen (»Games«, »Jeux«, »Repacks« und ihre Entsprechungen in gut zwanzig Sprachen, dazu
  »Emulators« und »Emulation«) auf jedem Laufwerk, und sie liest, was die Launcher aufgezeichnet haben: Epic-
  Manifeste, Registry-Einträge von GOG Galaxy und Ubisoft Connect und den Verweis, den Windows für das
  Laufwerk anlegt, das du für Xbox-Spiele gewählt hast. So wird eine nach einem Shop benannte Bibliothek (`D:\Epic Games`,
  `D:\XboxGames`) ohne Scan gefunden. Spiele, die einem Launcher gehören, behalten ihre eigene Quelle. Die Intelligente Suche fügt
  alles andere im selben Ordner hinzu, meist dort, wo ein Repack oder ein Goldberg-Build landet.
- **Ordner hinzufügen** überwacht einen Ort, den du auswählst.
- **Konfigurationen generieren** startet einen gründlicheren Scan und kann aktivierte Optionen zur Emulator-Einrichtung anwenden.

Wird ein Ordner abgelehnt, wähle das Verzeichnis, das die Spielstandordner, AppID-Ordner,
`steam_settings` oder die Emulator-Konfiguration direkt enthält. [Fehlerbehebung](troubleshooting.md#a-game-is-missing)
nennt die ersten Prüfungen. Passt ein Ordnername auf mehrere Steam-Releases und die Zuordnung ist falsch,
klicke mit der rechten Maustaste auf das Spiel und wähle **AppID manuell festlegen...** (siehe
[Die AppID eines Spiels von Hand festlegen](advanced.md#set-a-games-appid-by-hand)).

Erfolgslisten brauchen keinen Steam-Web-API-Schlüssel: Sie kommen von öffentlichen Endpunkten und werden pro
Sprache zwischengespeichert, sodass die Bibliothek danach offline funktioniert ([wie](sources.md#steam-metadata-without-an-api-key)).

## Benachrichtigungen {#notifications}

**Einstellungen → Benachrichtigung** legt den Zustellmodus fest: **Automatisch** (die Voreinstellung: das Overlay im Spiel, wenn
es gezeigt werden kann, eine Windows- oder Desktop-Benachrichtigung, wenn nicht, und nie dieselbe Freischaltung zweimal),
**In-Game-Overlay**, **Windows-Benachrichtigung** oder **Beide**. Wenn Windows »Nicht stören« die
Benachrichtigungen beim Spielen verbirgt, aktiviere **Prioritätsbenachrichtigungen** und bestätige die einmalige Anfrage. Testschaltflächen
lassen dich alles ausprobieren, bevor du ein Spiel startest. Siehe [Benachrichtigungen](notifications.md) und
[worauf Automatisch achtet](notifications.md#how-automatic-decides).

## Ein Spiel prüfen {#check-on-a-game}

Die Schaltfläche **Werkzeuge** einer Spielkachel öffnet das Fenster **Game Health**: ob AW Next das Spiel sehen,
seine Erfolge lesen und seine Freischaltungen melden kann, und welche Reparaturen passen. Es ist das Erste, was man vor
einer Fehlermeldung öffnen sollte (siehe [Game Health](game-health.md)). Um ein Spiel noch einmal von null zu spielen, nutze
[Erfolge zurücksetzen](advanced.md#reset-a-games-achievements), das vorher alles sichert.

## Infobereich und Autostart {#tray-and-startup}

Wenn du das Hauptfenster schließt, bleibt AW Next im Infobereich, wo der Hintergrund-Tracker weiter Dateien und Prozesse
für Spielzeit und Freischaltungen überwacht. Ohne offenes Fenster gibt er seinen Speicher an Windows zurück,
und der regelmäßige Bibliotheksscan wartet, solange ein Spiel läuft. **Einstellungen → Erweitert → Automatische Aktualisierungen der Erfolgsdaten**
schaltet diesen Scan für alle ab, die `steam_cache` von Hand pflegen. Ob AW Next
mit Windows startet und in den Infobereich schließt, steht unter **Einstellungen → Allgemein**. Zum vollständigen Beenden nutze das
Menü des Infobereichs.

## Updates und vorhandene Daten {#updates-and-existing-data}

Installierte Releases fragen den GitHub-Release-Feed des Projekts ab, nie während eines Spiels. Eine neue Version wird
durch eine Desktop-Benachrichtigung und einen Chip in der Titelleiste angekündigt (das Symbol im Infobereich zeigt außerdem einen blauen Punkt), und
nichts nimmt einem Spiel oder einer anderen App den Fokus. Der Hinweis bleibt, bis du ihn schließt, und kommt
nach einem Spiel wieder.

Klicke auf die Benachrichtigung oder den Chip, um das Update-Fenster zu öffnen. Es zeigt die Versionshinweise jeder
Version, die du übersprungen hast, und die Download-Größe, mit **Jetzt aktualisieren**, **Später** und **Diese Version überspringen**.
Nichts wird heruntergeladen, bevor du dich entscheidest. Nach **Jetzt aktualisieren** begleitet dasselbe Fenster den Download, den
du abbrechen oder in den Hintergrund schicken kannst. Der Chip in der Titelleiste zeigt den Zustand und holt das Fenster zurück.
Ist der Download fertig, zeigt der Installer seine eigene Fortschrittskarte, und AW Next startet neu. Läuft ein Spiel,
wartet die Installation, bis es geschlossen ist, oder du installierst trotzdem aus dem Fenster heraus. **Einstellungen →
Nach Updates suchen** öffnet das Fenster sofort. Updates laden nur herunter, was sich geändert hat, und weichen bei einem Fehler von selbst auf den
vollständigen Installer aus. Das Linux-AppImage aktualisiert sich aus denselben Releases (siehe
[Linux-Updates](linux.md#updates)).

Eine neuere Version, die über eine ältere installiert wird, behält deine Daten in `%APPDATA%\Achievement Watcher Next`:
Einstellungen, überwachte Ordner, Caches, Spielzeit, Protokolle, Benachrichtigungsdateien und lokale Kontodaten. Beim
ersten Start nach dem Upgrade importiert AW Next eine frühere Installation:

| Du kommst von | Importiert aus | Was passiert |
|---|---|---|
| Achievement Watcher 3.x | `%APPDATA%\Achievement Watcher 3.0` | Einstellungen, Presets, Designs, Cover, Caches, Sicherungen und Protokolle werden übernommen |
| Achievement Watcher 1.6.8 | `%APPDATA%\Achievement Watcher` | Dasselbe, für alle, die 3.x übersprungen haben |
| Einem frischen Rechner | nichts | AW Next startet mit den Standardwerten |

Der Import läuft einmal, kopiert kleine Dateien, legt für die großen, einmal beschriebenen Dateien Hardlinks an und **löscht oder
verändert den gelesenen Ordner nie**. Spielzeitzähler aus der Registry kommen ebenfalls mit, und
Screenshots wandern nach `Pictures\Achievement Watcher Next`, außer du hast einen eigenen Ordner gewählt.

Die Deinstallation bietet eine einzige Option, standardmäßig aus: **Auch Einstellungen, Cache und gespeicherte Daten löschen** (oder
`--delete-app-data` bei einer stillen Deinstallation), die den Datenordner und die Spielzeit in der Registry entfernt.
Scheitert ein Update immer wieder an derselben heruntergeladenen Datei, löscht **Einstellungen → Erweitert → Caches leeren**
nur erneut herunterladbare Caches (Update-Dateien, Steam- und Ubisoft-Schemata und -Symbole, Werkzeuge der Emulator-Korrektur).
Einstellungen, Spielstände und Sicherungen bleiben.

---

**Weiter:** [Kompatible Quellen](sources.md): was AW Next lesen kann und was jede Quelle braucht.

*Spring direkt weiter, wenn du weißt, was du suchst: [Benachrichtigungen](notifications.md) ·
[Game Health](game-health.md) · [Goldberg / GBE einrichten](emulator-setup.md) ·
[Fehlerbehebung](troubleshooting.md)*

<div align="center">

[← Dokumentation](README.md) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
