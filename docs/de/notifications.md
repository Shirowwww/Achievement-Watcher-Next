---
title: "Erfolgsbenachrichtigungen und Popups"
description: "Overlay-Popups oder Windows-Benachrichtigungen: Zustellmodi, Automatisch, Töne, Position, Trophäenmodus, OBS, Screenshot-Erinnerungen und Videoclips."
---

# Erfolgsbenachrichtigungen und Popups

AW Next meldet eine Freischaltung mit einer nativen Windows-Benachrichtigung (Toast), einem Overlay-Popup im Spiel oder
beidem. Wähle den Modus unter **Einstellungen → Benachrichtigung**.

Unter Linux ist die Benachrichtigung die des Desktops (GNOME oder KDE), und das Overlay funktioniert genauso.
»Nicht stören« und der Schalter Prioritätsbenachrichtigungen werden unter [Unterstützte Desktops](linux.md#supported-desktops) behandelt.

<div align="center">
<picture><source srcset="../assets/shot/notifications-panel-800.webp 800w, ../assets/shot/notifications-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/notifications-panel.png" width="720" height="529" alt="Einstellungen - Benachrichtigung"></picture><br>
<sub>Ein Zustellmodus, ein Preset - Automatisch erledigt den Rest</sub>
</div>

## Einen Zustellmodus wählen {#choose-a-delivery-mode}

| Modus | Verhalten |
|---|---|
| **Automatisch** (Standard) | Das Overlay im Spiel, wenn es gezeigt werden kann, sonst eine Windows-Benachrichtigung. |
| **In-Game-Overlay** | Immer das gestaltete Popup über dem laufenden Spiel, auch im exklusiven Vollbild, wo es eventuell nicht sichtbar ist. Kann das Overlay überhaupt nicht angezeigt werden, kommt diese Benachrichtigung als Windows-Benachrichtigung. |
| **Windows-Benachrichtigung** | Immer die Windows-Systembenachrichtigung. Erfolgs- und Fortschrittsbenachrichtigungen nutzen das Erfolgssymbol; Spielzeitbenachrichtigungen können Spiel-Artwork und einen Fortschrittsbalken enthalten. |
| **Beide** | Dasselbe Ereignis auf beiden Wegen. |

AW Next sendet Windows-Benachrichtigungen selbst und startet kein anderes Programm, auch kein PowerShell, sodass sie
sofort erscheinen. Eine eigene App-ID in `options.ini` (`[notification_advanced] appID`) läuft weiterhin
über den früheren PowerShell-Weg.

Das Bibliotheksfenster kann in jedem Modus geschlossen bleiben: Der Hintergrund-Tracker übernimmt die Zustellung.

<div align="center">
<picture><source srcset="../assets/shot/notification-popup.webp 594w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/notification-popup.png" width="440" height="126" alt="Ein Freischaltungs-Popup" loading="lazy" decoding="async"></picture><br>
<sub>Das Overlay-Popup, gezeichnet vom gewählten Preset mit dem Artwork des Spiels</sub>
</div>

Unabhängig vom Modus sendet **Websocket @localhost:8082** jedes Benachrichtigungsereignis als JSON über einen
lokalen Websocket, für Stream-Overlays und andere Werkzeuge. Er ist standardmäßig an, lauscht nur auf `127.0.0.1`
und zeigt selbst nichts an. Schalte ihn aus, wenn du ihn nicht nutzt. Dieselbe Adresse liefert ein fertiges
Stream-Overlay: siehe [Freischaltungen im Stream zeigen (OBS)](#show-unlocks-on-stream-obs).

> [!TIP]
> Nutze die Testschaltflächen nach einem Moduswechsel. Ein erfolgreicher Test bestätigt den Anzeigeweg; eine echte
> Freischaltung hängt weiterhin davon ab, dass die Spielquelle richtig überwacht wird.

### Wie Automatisch entscheidet {#how-automatic-decides}

Jede Benachrichtigung wird einmal geleitet, anhand dessen, was AW Next in diesem Moment beobachten kann:

| Situation | Was passiert |
|---|---|
| Nichts verdeckt den Bildschirm | In-Game-Overlay. |
| Das Spiel läuft im **Vollbild** (Direct3D mit den Vollbildoptimierungen von Windows, die die meisten Spiele bekommen) | Windows-Benachrichtigung, über dem Spiel gezeigt, ohne ihm den Fokus zu nehmen: eine Prioritätsbenachrichtigung, wenn diese aktiv sind, sonst eine Erinnerung, die AW Next nach der üblichen Benachrichtigungsdauer schließt. Spiele im randlosen Fenster oder im Fenstermodus behalten das Overlay. |
| Das Spiel belegt den Bildschirm im **klassischen exklusiven Modus** (ältere Spiele, viele OpenGL-Spiele oder deaktivierte Vollbildoptimierungen) | Auf diesem Bildschirm wird nichts von einer anderen App gezeichnet. Die Benachrichtigung geht ins Info-Center; Ton und Controller-Vibration laufen weiterhin. Der randlose Modus im Spiel bringt sie zurück auf den Bildschirm. |
| Die App kann das Popup nicht anzeigen (kein brauchbares Preset, Renderer nicht verfügbar) | Eine Windows-Benachrichtigung. |
| Das Overlay lässt sich nicht anzeigen | Zehn Minuten lang Windows-Benachrichtigungen, dann wird das Overlay erneut versucht. |
| Das Overlay wurde angefordert, hat sich aber nie zurückgemeldet | Keine zweite Benachrichtigung, um ein Duplikat zu vermeiden. Die nächste Freischaltung nutzt eine Windows-Benachrichtigung. |

AW Next merkt sich, welcher Weg zuletzt pro Spiel zugestellt hat, und nutzt das nur als Tiebreaker, wenn
Windows nicht sagen kann, ob ein Spiel im exklusiven Vollbild läuft. Ein Ausweichen geschieht nur nach einem eindeutigen
Fehlschlag, sodass dieselbe Freischaltung nie zweimal gemeldet wird. AW Next injiziert nichts in Spiele und erzwingt keine
Änderungen des Anzeigemodus.

### Wo der aktuelle Zustand angezeigt wird {#where-the-current-state-is-shown}

Das **Game Health**-Fenster eines Spiels hat eine Zeile Benachrichtigungen, die den Weg nennt, der die letzte
Benachrichtigung zugestellt hat, und warum, zum Beispiel *Funktioniert - Windows-Ausweichweg aktiv* (Modus Einfach). Gab es noch keine
Benachrichtigung, zeigt sie den eingestellten Modus. Hat Windows eine Benachrichtigung im Info-Center behalten,
weil das Spiel im Vollbild lief oder »Nicht stören« an war, sagt die Zeile das. Siehe
[Game Health](game-health.md).

## Windows-Prioritätsbenachrichtigungen {#priority-windows-notifications}

Vollbildspiele und andere automatische Windows-Regeln können **Nicht stören** einschalten, wodurch
gewöhnliche Toasts ins Info-Center wandern, ohne angezeigt zu werden. **Einstellungen → Benachrichtigung → Prioritäts-
benachrichtigungen** markiert Erfolgsfreischaltungen als wichtig. Windows fragt einmal, ob AW Next sie senden
darf; die Antwort änderst du in den Windows-Benachrichtigungseinstellungen.

Die Funktion ist standardmäßig aus und betrifft nur Freischaltungen von Erfolgen und Abschlüssen, nie Fortschritt oder Spielzeit.
Der Toast nutzt das Szenario `urgent`, das Windows 11 (Build 22546) oder neuer braucht; unter Windows 10
bewirkt die Einstellung nichts. Siehe [die Dokumentation von Microsoft zu App-Benachrichtigungen](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/app-notifications-content).

## Spiele, die Steam startet {#games-steam-runs}

Steam zeigt für die Spiele, die es startet, sein eigenes Pop-up, daher bleibt AW Next für sie standardmäßig still. Aktiviere
**Einstellungen → Benachrichtigung → Spiele des Steam-Clients**, um auch die Benachrichtigung von AW Next zu bekommen, mit Ton,
Overlay, Seltenheit und Screenshot-Erinnerung. Das umfasst Spiele im Besitz und Spiele, die über SteamTools,
LuaTools oder GreenLuma hinzugefügt wurden: AW Next folgt der Statistikdatei, die Steam in `appcache\stats` neu schreibt. Um nur
die Benachrichtigung von AW Next zu behalten, schalte **Steam → Einstellungen → Benachrichtigungen → Ich schalte einen Erfolg frei** aus.

## Wie das Popup aussieht {#how-the-popup-looks}

Das Aussehen des Popups im Spiel ist ein **Preset**: Zehn werden mit der App geliefert, du kannst eigene gestalten, und ein
Preset lässt sich als eine einzige `.awpreset`-Datei teilen. Siehe [Presets und der Preset-Designer](presets.md).
**Deckkraft** (30 % bis 100 %) in denselben Einstellungen legt fest, wie durchsichtig das Popup ist.

## Töne, Lautstärke und Dauer {#sounds-volume-and-duration}

- Importiere `.wav`-, `.mp3`-, `.ogg`-, `.flac`-, `.m4a`- oder `.aac`-Dateien in den Benachrichtigungseinstellungen.
- **Zufällig** in der Tonliste spielt bei jeder Benachrichtigung eine andere deiner Dateien ab, ebenso bei jeder
  Vorschau und jedem Test.
- **Ton für seltene Erfolge** und **Ton für 100 % Abschluss** (Modus Erweitert) geben diesen Popups einen eigenen
  Ton, für das Overlay und die Windows-Benachrichtigungen. Beide stehen zu Beginn auf »Wie Freischaltungen«; »Kein« macht
  diese Art von Popup stumm. Ein Ton, der für ein Spiel in dessen eigenem Fenster gewählt wurde, gilt weiterhin vor allem anderen.
- **Ton für Fortschritt** (Modus Erweitert) tut dasselbe für Fortschritts-Popups. Er gilt vor dem eigenen Ton
  eines Spiels, außer bei einem Spiel, das auf keinen Ton gestellt ist. Um die Fortschritts-Popups eines Spiels stummzuschalten, klicke es mit der rechten Maustaste an und
  schalte seinen Fortschritt stumm.
- **Emulatoren** (Modus Erweitert) gibt jeder Konsole ein eigenes Preset und einen eigenen Ton: Xenia, RPCS3, shadPS4 und
  Kyty sind aufgeführt. Rekompilierte Xbox-360-Spiele folgen der Wahl von Xenia, PS4-Portierungen der von shadPS4, und
  **Wie Haupt-Preset** behält die Haupteinstellungen.
- Die Overlay-Lautstärke reicht von 0 % bis 200 %; über 100 % verstärkt das Overlay den Ton. Die Wiedergabe von Windows-
  Benachrichtigungen ist durch den Audiopfad des Systems begrenzt.
- Die Dauer folgt dem Preset oder nutzt eine feste Obergrenze.
- Spielzeitbenachrichtigungen sind stumm.

Ein geteiltes Preset kann einen eigenen Ton mitbringen, der den hier gewählten ersetzt. Siehe
[Ein Preset teilen](presets.md#share-a-preset).

## Position und Größe {#position-and-scale}

Wähle in den Benachrichtigungseinstellungen eine Ecke, einen Rand oder eine zentrierte Position. Positionen werden
auf den ganzen Bildschirm bezogen, ein unterer Anker sitzt also am unteren Rand, nicht über der Taskleiste, und die
Karte berührt die gewählten Ränder, egal wie viel Platz für Schatten oder Leuchten ihr Preset um sie lässt. AW
misst jedes Preset einmal pro Position, im Hintergrund nach seinem ersten Popup, sodass dieses erste Popup
noch am alten Ort erscheint. Ein Preset, dessen Karte der Länge seines Textes folgt (PS5 Steam, Slim),
wird bei jedem Popup gemessen, was es etwa eine halbe Sekunde zurückhält.

**Neu positionieren** verschiebt die eigene Position, die genau so verwendet wird, wie du sie hinterlassen hast; eine auf einem inzwischen
nicht mehr vorhandenen Monitor gespeicherte wird wieder ins Bild geholt. Bei mehreren Bildschirmen erscheint das Popup auf dem Bildschirm des Spiels,
das du spielst, nicht auf dem unter der Maus, und eine eigene Position behält ihren Platz relativ zu diesem
Bildschirm. Windows-Benachrichtigungen erscheinen immer auf dem Hauptbildschirm.

Die Einstellung Größe skaliert das ganze Popup, ohne sein Layout zu ändern, und **Neu positionieren** zeigt
es in dieser Größe als Vorschau.

### Fortschritts-Popups {#progress-popups}

Zähler-Erfolge (50 Gegner besiegen, 100 km zurücklegen) können bei jedem Schritt ein Fortschritts-Popup auslösen. Im
Modus Erweitert geben **Fortschrittsposition** und **Fortschrittsgröße** diesen Popups einen eigenen Platz und eine eigene
Größe. **Wie Freischaltungen**, die Voreinstellung, folgt der eigenen Position eines Spiels, wenn es eine hat; jede andere
Wahl gilt für die Fortschritts-Popups aller Spiele. Das Fadenkreuz neben **Fortschrittsposition** setzt
einen eigenen Anker nur für den Fortschritt. Diese Einstellungen verschieben nur das Popup im Spiel.

**Fortschrittsetappen** in den gemeinsamen Benachrichtigungseinstellungen zeigt eine Fortschrittsbenachrichtigung nur, wenn
ein Zähler weitere 10, 25 oder 50 % seines Ziels überschreitet. Das gilt für das Popup und die Windows-
Benachrichtigung. Die Freischaltung selbst wird immer gezeigt.

Die Overlay-Liste hat eigene Tastenkürzel (siehe die
[Overlay-Anleitung](overlay.md#keyboard-shortcuts-overlay-open)) und optional Gamepad-Steuerung (siehe die
[Controller-Anleitung](controller.md)).

## Verhalten pro Spiel {#per-game-behavior}

Öffne das Werkzeugfenster eines Spiels und wähle **Benachrichtigung**, um diesem Spiel ein eigenes Popup-Preset,
eine eigene Position, einen eigenen Ton oder eine eigene Größe zu geben. Jedes Feld erbt die globale Einstellung, und nur die Werte, die du änderst,
werden gespeichert; beim Ton gibt es außerdem Stille und Zufall. Das Fadenkreuz neben Position zieht eine Vorschau dorthin,
wo das Popup dieses Spiels erscheinen soll. Die fünf Testschaltflächen zeigen eine Vorschau dieses Spiels und seines Artworks, ohne
den Erfolgsfortschritt zu verändern. Ein entferntes Preset oder ein entfernter Ton fällt auf den globalen Wert zurück, und das Umbenennen
eines eigenen Presets behält seine Spielzuordnungen.

Klicke ein Spiel mit der rechten Maustaste an, um seine Fortschrittsbenachrichtigungen stummzuschalten, während Freischaltungs- und Abschluss-
benachrichtigungen bleiben.

Ein Erfolg mit einer globalen Freischaltungsquote an oder unter der Seltenheitsgrenze druckt seinen Prozentwert und bekommt
das Seltenheits-Styling des Presets: **Gold** bei 5 % oder weniger, **Silber** bis 10 %, **Bronze** bis 15 %. Verschiebe
diese Grenzen mit **Einstellungen → Allgemein → Seltenheitsschwellen** auf Benutzerdefiniert (Modus Erweitert).

### Trophäenmodus {#trophy-mode}

**Einstellungen → Allgemein → Seltenheitsanzeige** wechselt zum **Trophäenmodus**: Jeder Erfolg wird nach
seiner globalen Freischaltungsquote eingestuft (Gold unter 20 %, Silber unter 50 %, Bronze sonst oder wenn die Quote
unbekannt ist), im Spielfenster, im Overlay, bei den Profiltrophäen und in der Benachrichtigung. Die **Seltenheits-
schwellen** verschieben die Grenzen. Alle drei Stufen nutzen das Seltenheits-Styling des Presets (`state-rare` plus
`tier-gold`, `tier-silver` oder `tier-bronze`); Platin bleibt der eigene Abschlusszustand. Die App
gibt einem Preset seine Stufe in `rarityTier` (mit `rarityMode` und dem lokalisierten `rarityGrade`); ein Preset
ohne dieses Feld fällt auf den Prozentwert zurück.

Ist ein PlayStation-Konto verbunden (**Einstellungen → Quellen**), nutzt ein Spiel, das auch für
PlayStation erschienen ist, seine echte Trophäenliste, egal woher seine Erfolge kommen: Jeder Erfolg übernimmt
Stufe und DLC-Gruppe der Trophäe mit demselben Namen oder derselben Beschreibung. Das echte Platin erscheint in jedem
Seltenheitsmodus (Spielseite, Statistik, 100-%-Popup) mit Name, Beschreibung und Symbol und zählt, sobald diese
Trophäe erreicht ist, auch wenn noch DLC-Trophäen offen sind. PlayStation-Emulatoren behalten ihre eigenen Trophäen. AW
findet die Liste über den Originalnamen des Spiels, das Umbenennen eines Spiels ändert also nichts.

Jede Quelle löst das 100-%-Popup aus, auch die Live-Quellen (Xenia, rekompilierte Portierungen, GOG Galaxy,
Ubisoft Connect, Xbox PC). Hat das Spiel ein Platin, erscheint der damit verknüpfte Erfolg als
Platin.

<div align="center">
<picture><source srcset="../assets/shot/trophy-profile.webp 640w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/trophy-profile.png" width="440" height="148" alt="Die Profilkopfzeile mit den Anzahlen von Platin-, Gold-, Silber-, Bronze- und gewöhnlichen Trophäen" loading="lazy" decoding="async"></picture><br>
<sub>Das Profil zählt jede Freischaltung nach Stufe, mit Platin für abgeschlossene Spiele</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/trophy-game-panel.webp 800w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/trophy-game-panel.png" width="560" height="672" alt="Eine Spielseite, auf der jeder Erfolg als Gold, Silber oder Bronze eingestuft ist" loading="lazy" decoding="async"></picture><br>
<sub>Auf der Seite eines Spiels trägt jeder Erfolg seine Stufe und den Anteil der Spieler, die ihn haben</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/notification-popup-trophy.webp 594w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/notification-popup-trophy.png" width="440" height="126" alt="Ein Freischaltungs-Popup im Gold-Stil" loading="lazy" decoding="async"></picture><br>
<sub>Eine Gold-Freischaltung im Preset AW Next</sub>
</div>

## Freischaltungen im Stream zeigen (OBS) {#show-unlocks-on-stream-obs}

Das Popup als Fenster aufzunehmen funktioniert nicht: Das Popup-Fenster lebt nur wenige Sekunden, OBS erwischt es also nie.
Nutze eine **Browser**-Quelle, die OBS für den gesamten Stream geladen hält.

1. **Einstellungen -> Benachrichtigung -> OBS-Browserquelle.** **Vorschau** öffnet die Seite in deinem Browser
   mit einer Beispiel-Freischaltung alle zehn Sekunden, die schnellste Prüfung, ob die Kette funktioniert. **Link kopieren**
   kopiert die Adresse.
2. In OBS: **+ -> Browser**, füge die Adresse bei **URL** ein.
3. Setze eine beliebige **Breite** und **Höhe**. Die Karte skaliert, um das Feld zu füllen.

Die Quelle zeigt dasselbe Preset, Artwork und Seltenheits-Styling wie das Popup im Spiel und folgt dem
Preset, das du in den Einstellungen wählst. Die Testschaltflächen unter **Einstellungen -> Benachrichtigung** feuern ebenfalls dorthin,
unabhängig vom Zustellmodus.

> [!TIP]
> **Eine größere Quelle ergibt eine schärfere Karte.** Die Karte wird in der Größe der Quelle gesetzt, nicht gestreckt.
> Gib der Quelle etwa das Doppelte des eigenen Feldes des Presets und platziere sie in deiner Szene in halber Größe:
> `http://127.0.0.1:8082/obs/_config` nennt beide Werte. Nur das Erfolgssymbol bleibt weich,
> da Steam es in 64x64 veröffentlicht.

### Optionen {#options}

Hänge sie an die Adresse an, `?first=x&then=y`:

| Option | Wirkung |
|---|---|
| `?test=1` | Wiederholt alle zehn Sekunden eine Beispiel-Freischaltung, um die Quelle zu positionieren. Danach entfernen. |
| `?scale=2` | Legt die Karte auf diesen Zoom fest, statt sie an die Quelle anzupassen. `?scale=app` folgt der in den Einstellungen gesetzten Größe. |
| `?duration=8000` | Hält jede Karte so viele Millisekunden statt der eingestellten Dauer. |
| `?sound=1` | Spielt den Benachrichtigungston über die Browserquelle ab, sodass er den Stream erreicht, ohne den Desktop-Ton aufzunehmen. Standardmäßig aus, da die App ihn schon über deine Lautsprecher abspielt. Hake **Audio über OBS steuern** an der Quelle an, um ihn in den Mix zu nehmen. |
| `/obs/preset/Xbox/` | Nutzt ein benanntes Preset für den Stream, egal was am Desktop eingestellt ist. Jeder Name eines installierten Presets funktioniert, auch deine eigenen. |

### Hinweise {#notes}

- Die Seite ist zwischen Freischaltungen absichtlich leer: Es wird nichts gezeichnet, sie kostet also keine CPU, bis ein
  Erfolg erscheint.
- Sie ist rein lokal. Die Seite und der Feed lauschen auf `127.0.0.1`, sodass nichts anderes in deinem Netzwerk
  sie erreichen kann.
- Erfolgssymbole werden von diesem Rechner geliefert, wenn die Quellen ihr Artwork lokal halten
  (Goldberg, Emulatoren, das Artwork deiner eigenen Bibliothek), und nur für Bilder, die eine Benachrichtigung angekündigt hat.
- Eine einzige Kopie von AW Next bedient die Adresse: die, die zuerst gestartet wurde. Eine zweite Instanz oder etwas anderes
  auf Port 8082 lässt die Quelle ohne Gegenstelle zurück. Schließe die zusätzliche Kopie, und die Quelle
  verbindet sich binnen weniger Sekunden neu.
- Bleibt die Quelle bei einer echten Freischaltung leer, prüfe, ob die Testschaltflächen funktionieren, und dann, ob die Zeile
  **Websocket** an ist.

## Erfolge auf den Bibliotheksseiten von Steam {#achievements-on-steams-library-pages}

Steam zeigt auf der Seite einer Nicht-Steam-Verknüpfung keine Erfolge. Ein Steam-Plugin (Millennium auf dem
Desktop, Decky im Spielmodus) kann AW Next über denselben lokalen Feed nach den Erfolgen dieser Verknüpfung fragen,
`ws://127.0.0.1:8082`, und sie selbst zeichnen. AW Next antwortet für jeweils ein Spiel: Das Plugin muss es
benennen, und die Antwort enthält weder Ordner noch Konto noch Quellennamen.

Das eigene Millennium-Plugin von AW Next, im Ordner `millennium/` des Repositorys, tut das für jede
Verknüpfung, die AW Next erkennt: Die Seite des Spiels zeigt dann den eigenen Bereich Erfolge von Steam, den Zähler in der
Spielleiste, die vollständige Liste und den Reiter »Deine Sachen« in Big Picture. Eine Verknüpfung wird am besten erkannt, wenn sie
dieselbe exe startet wie die **Ausführbare Datei** des Spiels in AW Next. Die README behandelt die Installation, was man
prüfen sollte, wenn eine Seite leer bleibt, und wie es neben Steam Cartridges, NativeGameLink und Game
Data Linker sitzt. Die Playnite-Erweiterung in `playnite/` fragt auf dieselbe Weise, für jedes Spiel in einer Playnite-
Bibliothek, und ihre README behandelt die Installation und die Bereiche, die ein Theme platzieren kann. Die Anfrage unten ist
für alle gedacht, die ein weiteres Plugin schreiben.

Das Plugin sendet:

```json
{ "cmd": "bridge-game", "id": "r1", "exe": "D:\\Games\\Pinyon Shift\\pinyon_shift.exe", "launchOptions": "", "steamAppId": 0, "name": "Forza Horizon" }
```

Jedes Feld außer `cmd` ist optional, und jedes zusätzliche hilft. AW Next probiert sie in dieser Reihenfolge: die
exe, die die Bibliothek für ein Spiel gefunden hat, ein Spielordner oder eine ROM in den Startoptionen (eine Emulator-
Verknüpfung), eine Steam-AppID, ein Launcher im Spielordner, der Dateiname der exe, dann der genaue Titel.
Passt ein Schritt auf mehr als ein Spiel, antwortet AW Next »nicht gefunden«.

Die Antwort:

```json
{ "cmd": "bridge-game", "id": "r1", "bridge": 1, "found": true,
  "game": { "id": "x360-4D5309C9", "name": "Forza Horizon", "total": 50, "unlocked": 12,
    "achievements": [{ "id": "1", "name": "...", "description": "...", "icon": "https://...", "iconLocked": "https://...",
      "hidden": false, "rarity": 12.5, "unlocked": true, "unlockedAt": 1790000000 }] } }
```

- `unlockedAt` ist in Unix-Sekunden. `rarity` und `progress` (`{ "current": 6, "max": 50 }` bei einem
  gesperrten, teilweise erledigten Erfolg) sind nur vorhanden, wenn AW Next sie kennt.
- Ein auf diesem PC gespeichertes Symbol kommt als Adresse `http://127.0.0.1:8082/bridge/icon/...`.
- Die Liste ist die Bibliothek, wie der letzte Scan sie gesehen hat, plus die seitdem gemeldeten Freischaltungen. Freischaltungen
  kommen weiterhin über den Feed: Trägt eine die `id` des Spiels in `appID`, frage erneut, um die Seite zu aktualisieren.
- Das Plugin verbindet sich von den eigenen Seiten von Steam (`https://steamloopback.host`) oder von einem nativen Prozess;
  Websites werden abgelehnt. Ist ein Websocket-Passwort gesetzt, braucht es dasselbe Passwort.
- Es sollte sich nicht als `?client=decky` verbinden: Dieser Name sagt AW Next, dass Steam seine eigenen
  Benachrichtigungen zeigt, und AW Next hält sein eigenes Popup dann aus.

## Screenshot-Erinnerungen {#screenshot-souvenirs}

**Screenshot beim Freischalten** speichert ein Bild des Bildschirms einen Moment, nachdem ein Erfolg erscheint, sobald das
Popup fertig eingeblendet ist, sodass die Benachrichtigung im Bild ist. Die Dateien landen in
`<folder>\<game>\<achievement> - <date>.png`, das Datum in der Ortszeit des PCs. **Ordner öffnen** in derselben Zeile öffnet ihn und legt ihn
bei Bedarf zuerst an. Der Ordner ist standardmäßig `Pictures\Achievement Watcher Next` und lässt sich ändern.

Erfolge, die in derselben Sekunde freigeschaltet werden, behalten jeder ihre eigene Datei, und ein Spiel, dessen Titel Windows
als Ordnernamen ablehnt, bekommt trotzdem seine Screenshots. Bei mehreren Monitoren nimmt die Erinnerung
den Monitor auf, auf dem das Spiel läuft, wie die Videoclips; ohne sichtbares Spielfenster nimmt sie den Monitor
des vordersten Fensters, dann den primären.

### Spielen mit aktiviertem Windows-HDR {#playing-with-windows-hdr-on}

**HDR-Screenshots** steht standardmäßig auf **Automatisch**. Zum Aufnahmezeitpunkt prüft AW Next, ob HDR auf der Anzeige
aktiv ist, die das Spiel zeigt. Wenn ja, nimmt ein einmaliger Helfer über Windows
Graphics Capture ein FP16-Bild auf, bildet dessen Lichter per Tone-Mapping auf ein SDR/sRGB-PNG ab und beendet sich dann. Bei ausgeschaltetem HDR nutzen
**Automatisch** und **Aus** die Standardaufnahme. Jeder Fehler des Helfers (fehlende Windows-Unterstützung, eine
blockierte Aufnahme, ein Timeout) fällt ebenfalls auf den Standard-Screenshot zurück, sodass weder die Erinnerung noch die
Benachrichtigung verloren gehen.

## Videoclips {#video-clips}

**Videoclip beim Freischalten** funktioniert wie das Trophäenvideo einer Konsole. Solange ein von AW Next verfolgtes Spiel läuft,
werden die letzten Sekunden des Spiels im Speicher gehalten, bereits vom Videoencoder der Grafikkarte komprimiert.
Erscheint ein Erfolg, wird die Spanne um ihn herum als MP4 in
`<folder>\<game>\<achievement> - <date>.mp4` gespeichert, mit dem Popup in der Mitte. Der Ordner ist
`Videos\Achievement Watcher Next`, sofern du keinen anderen wählst. Erfolge, die kurz nacheinander freigeschaltet werden,
teilen sich einen Clip.

| Einstellung | Auswahl | Standard |
|---|---|---|
| Clip-Länge | 10 bis 30 Sekunden, eine Hälfte vor der Freischaltung und eine danach | 20 s |
| Format | H.264, HEVC oder AV1, als MP4 gespeichert | H.264 |
| Auflösung | Bildschirm, 2160p, 1440p, 1080p oder 720p, nie über dem Bildschirm | 1080p |
| Bildrate | 30 FPS, 60 FPS oder Unbegrenzt, was deinem Bildschirm folgt (120, 144, 240 Hz) | 30 FPS |
| Qualität | Niedrig, Mittel oder Hoch | Mittel |
| Ton | Nur Spiel oder der gesamte PC | Nur Spiel |

<div align="center">
<picture><source srcset="../assets/shot/video-clip-panel-800.webp 800w, ../assets/shot/video-clip-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/video-clip-panel.png" width="720" height="529" alt="Einstellungen, Benachrichtigung: der Abschnitt Videoclip mit seinem Ein-/Aus-Schalter" loading="lazy" decoding="async"></picture><br>
<sub>Der Abschnitt Videoclip steht unten im Tab Benachrichtigung und ist aus, bis du ihn einschaltest</sub>
</div>

Die Zeile unter der Tabelle schätzt die Größe eines Clips für deinen Bildschirm. Sie ist eine Obergrenze: Der Encoder
läuft mit konstanter Bitrate, und eine ruhige Szene wird kleiner.

- **Kosten.** Solange kein Spiel läuft, läuft nichts. Aufnahme, Skalierung und Kodierung bleiben auf der GPU, auf einem
  Encoderblock, der vom Block getrennt ist, der das Spiel rendert. Der Recorder nutzt weit unter 1 % der CPU
  und etwa 70 bis 110 MB Speicher plus einen Clip. Es wird nichts auf die Festplatte geschrieben, bevor ein Erfolg
  freigeschaltet wird.
- **Format.** H.264 läuft überall, auch auf Discord und Handys. HEVC und AV1 ergeben kleinere Dateien.
  AV1 braucht eine GeForce RTX 40, Radeon RX 7000, Intel Arc oder neuer; ohne das gewählte Format wird der Clip
  in H.264 aufgenommen. Eine Karte ohne Hardware-H.264-Encoder nutzt den Software-Encoder von Windows, auf dem
  Prozessor, mit höchstens 1080p und 30 FPS.
- **Bildrate.** **Unbegrenzt** nimmt mit der Bildwiederholrate des Monitors auf, der das Spiel zeigt, und
  folgt ihr bei Änderungen. Lehnt der Encoder eine Rate ab, geht der Recorder auf 60, dann auf 30
  FPS zurück und protokolliert das. Die Größenschätzung geht bei Unbegrenzt vom Doppelten der Bitrate bei 30 FPS aus.
- **Wenn der Recorder nicht mehr antwortet.** AW Next startet ihn nach einer Wartezeit neu, die sich jedes Mal verdoppelt, und
  gibt bei einem Spiel nach fünf fehlgeschlagenen Neustarts auf. Ein Clip, dessen Schreiben auf halbem Weg scheitert, wird behalten, wenn das Geschriebene
  abspielbar ist, sonst entfernt. Ein Clip, der von einem abgestürzten PC halb geschrieben zurückblieb, wird beim
  nächsten Aufnehmen eines Spiels aufgeräumt.
- **HDR.** Bei aktiviertem Windows-HDR werden Clips wie HDR-Screenshots per Tone-Mapping umgesetzt; **HDR-Screenshots** auf
  **Aus** gilt auch für Clips.
- **Ton.** **Nur Spiel** lässt Sprachchat und Musik weg. Lässt sich der Ton des Spiels nicht allein aufnehmen,
  wird der gesamte PC aufgenommen.
- **Was aufgenommen wird.** Der Monitor, der das Spiel zeigt, samt Benachrichtigungen. Ein sehr altes Spiel im exklusiven Vollbild
  nimmt unter Umständen schwarze Bilder auf.

## Wenn ein Test oder eine Freischaltung nicht erscheint {#if-a-test-or-unlock-does-not-appear}

1. Prüfe, ob Benachrichtigungen aktiviert sind, und lies die Zeile Benachrichtigungen im
   **[Game Health](game-health.md)**-Fenster des Spiels.
2. Prüfe, ob der Hintergrund-Tracker läuft.
3. Wähle für Overlays ein gültiges Preset und teste erneut außerhalb eines Spiels im exklusiven Vollbild.
   **Automatisch** deckt beide Fälle bereits ab.
4. Verbirgt ein Vollbildspiel oder »Nicht stören« die Windows-Benachrichtigungen, aktiviere **Prioritäts-
   benachrichtigungen** und bestätige die einmalige Anfrage von Windows.
5. Prüfe die Windows-Benachrichtigungseinstellungen für AW Next.
6. Öffne **Einstellungen → Erweitert → Diagnose** und sieh dir die Protokolle an.

Besteht das Problem weiter, geht es weiter mit [Fehlerbehebung](troubleshooting.md#notifications-do-not-appear).

---

**Weiter:** [Presets und der Preset-Designer](presets.md) - das Aussehen des Popups und wie du dein
eigenes machst.

<div align="center">

[← Dokumentation](README.md) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
