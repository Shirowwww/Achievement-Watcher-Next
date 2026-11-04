---
title: "Erfolgs-Tracker für Linux und Steam Deck"
description: "Das AppImage installieren und aktuell halten, das Overlay unter GNOME oder KDE an eine Taste binden und Spiele über Steam, Proton, Lutris, Heroic oder Bottles starten."
---

# Erfolgs-Tracker für Linux und Steam Deck

AW Next läuft unter Linux (x64) als native App, nie über Wine. Es verfolgt Spiele, die über Steam
und Proton, Wine, Lutris, Heroic oder Bottles laufen, native Linux-Spiele und die unterstützten Emulatoren, mit
derselben Bibliothek, denselben Popups, demselben Overlay und derselben Spielzeit wie unter Windows.

Der Linux-Build ist eine **Beta**. Er wurde unter GNOME und KDE Plasma getestet, in Wine- und Proton-Präfixen und
mit Testspielen, aber nicht auf vielen echten Rechnern: einem echten Steam Deck, echten Gamepads, jedem Launcher und
jedem Scene-Release. Funktioniert etwas nicht, hilft ein
[Issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) mit deiner Distribution, deinem Desktop
und den Protokollen am meisten.

## Installation {#install}

1. Öffne das [neueste Release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest)
   und lade `Achievement.Watcher.<version>.AppImage` herunter.
2. Lege sie in einen eigenen Ordner, etwa `~/Applications`, und mache sie ausführbar: im Dateimanager
   **Eigenschaften → Datei als Programm ausführen erlauben**, oder in einem Terminal:

   ```bash
   chmod +x Achievement.Watcher.*.AppImage
   ```

3. Starte sie und folge der Einrichtung beim ersten Start wie unter Windows (siehe [Erste Schritte](getting-started.md)).

Ein AppImage braucht FUSE 2, das manche Distributionen, darunter Ubuntu 24.04, nicht mehr standardmäßig
installieren. Startet die Datei nicht, installiere es: `libfuse2t64` unter Ubuntu 24.04 und neuer, `libfuse2` unter
älterem Ubuntu und Debian, `fuse-libs` unter Fedora, `fuse2` unter Arch.

Beim ersten Start trägt sich AW Next ins Anwendungsmenü ein. **Einstellungen → Allgemein → Beim Start
ausführen** startet es bei jeder Anmeldung versteckt im Infobereich. Einstellungen, Caches, Spielzeit und Protokolle liegen in
`~/.config/Achievement Watcher Next`.

## Updates {#updates}

Das AppImage aktualisiert sich selbst aus denselben GitHub-Releases wie die Windows-App. Eine neue Version wird
durch eine Desktop-Benachrichtigung und den Chip in der Titelleiste angekündigt, und es fragt vor dem Herunterladen nach. Danach
prüft es die Datei gegen den mit dem Release veröffentlichten SHA-512-Wert (`latest-linux.yml`), ersetzt
das alte AppImage und startet neu. Läuft ein Spiel, wartet das Update, bis es geschlossen wird. Deine Daten bleiben
dort, wo sie waren.

Die neue Datei trägt die neue Version im Namen. Der Eintrag **Beim Start ausführen** und der
Befehl `~/.local/bin/achievement-watcher` folgen ihr. Ein selbst erstellter Launcher, der die AppImage-Datei
nennt, zeigt weiterhin auf den alten Namen, richte ihn also stattdessen auf diesen Befehl.

## Unterstützte Desktops {#supported-desktops}

AW Next wird getestet unter GNOME und KDE Plasma, unter Wayland und X11 (Ubuntu 24.04 mit GNOME 46 und
Plasma 5.27), sowie unter Fedora 44 mit GNOME 50, Plasma 6.7, Hyprland 0.56 und COSMIC 1.0 in einer virtuellen
Maschine. Andere Desktops funktionieren vielleicht, wurden aber nicht ausprobiert.

- **Wayland.** AW Next startet sich beim Start einmal über XWayland neu, damit seine Popups und das Overlay
  über den Spielen bleiben können, die unter Wine und Proton als X11-Fenster laufen. Hyprland und COSMIC starten XWayland
  standardmäßig. Ohne es (`xwayland.enabled = false` unter Hyprland) bleibt AW Next eine native Wayland-App:
  Bibliothek, Infobereich und Benachrichtigungen funktionieren, aber der Compositor platziert die Popups und das Overlay wie
  jedes Fenster, und ein Popup nimmt dem Spiel die Tastatur ab, solange es angezeigt wird.
- **Infobereich.** KDE und COSMIC zeigen das Symbol im Infobereich unverändert. GNOME braucht die AppIndicator-Erweiterung, die
  Ubuntu eingeschaltet mitliefert. Hyprland braucht eine Leiste mit Infobereich, etwa Waybar mit ihrem Modul `tray`.
  Ohne Infobereich minimiert das Schließen des Fensters AW Next, statt es zu verbergen; Hyprland kennt keine minimierten
  Fenster, dort wird es verborgen, und ein erneutes Starten von AW Next holt das Fenster zurück.
- **Benachrichtigungen** sind die des Desktops. »Nicht stören« verbirgt sie, außer **Einstellungen → Benachrichtigung →
  Prioritätsbenachrichtigungen** ist an, dann erscheinen Freischaltungen unter GNOME und KDE trotzdem. Hyprland hat keine
  eigenen: Lasse einen Benachrichtigungsdienst wie mako, dunst oder SwayNC laufen. mako zeichnet unter einem Vollbild-
  spiel, sofern seine Konfiguration nicht `layer=overlay` setzt, und behält jede Benachrichtigung, bis du klickst, sofern
  sie nicht `default-timeout` (in Millisekunden) setzt. COSMIC hält seine Benachrichtigungen zurück, solange ein Spiel im Vollbild
  läuft. Das eigene Popup von AW Next erscheint in beiden Fällen über dem Spiel.
- Optionen, die es nur unter Windows gibt, sind in den Einstellungen entsprechend gekennzeichnet.

## Screenshots und Clips {#screenshots-and-clips}

Screenshots und Clips jeder Freischaltung funktionieren unter X11 und unter Wayland. Clips werden von
gpu-screen-recorder mit der Grafikkarte aufgenommen, wenn er installiert ist. Wählst du in den Einstellungen den Software-Recorder von
AW Next, speichert er stattdessen WebM-Dateien und zeigt, was das gekostet hat.

Unter Wayland lässt der erste Screenshot den Desktop fragen, ob Apps Screenshots machen dürfen (GNOME 47
und neuer, KDE Plasma 6, COSMIC und Hyprland). AW Next wartet einige Sekunden auf die Antwort, überspringt dann
diesen Screenshot und die von Freischaltungen, die kommen, während die Frage offen ist. Klicke auf **Erlauben**, denn Enter
wählt unter GNOME und Hyprland **Ablehnen**, und die nächsten Screenshots entstehen kommentarlos. Lehnst du ab,
macht AW Next keine Screenshots und fragt nicht erneut. Um beim nächsten Screenshot erneut gefragt zu werden,
führe aus:

```bash
flatpak permission-remove screenshot screenshot
```

Der Software-Recorder nimmt den Bildschirm über den Bildschirmfreigabe-Dialog des Desktops auf, der bei jedem
Spielstart wiederkommt und unter COSMIC und Hyprland das Spiel aus dem Vollbild holt.
gpu-screen-recorder fragt nur einmal.

## Overlay-Tastenkürzel {#overlay-shortcut}

`Strg+Umschalt+K` öffnet das Overlay, während ein Wine- oder Proton-Spiel den Fokus hat. Unter Wayland kann AW Next
keine Taste sehen, die gedrückt wird, während ein **natives Wayland-Fenster** den Fokus hat, etwa ein Linux-Spiel im Wayland-Modus oder
Proton mit seinem Wayland-Treiber. Für diese Spiele gibt es keinen Hotkey im Spiel.

Ein Tastenkürzel aus den Tastatureinstellungen deines Desktops hängt davon nicht ab. Lass es diesen Befehl ausführen,
wobei du `you` durch deinen Benutzernamen ersetzt (GNOME expandiert `~` nicht, schreibe also den vollständigen Pfad):

```bash
/home/you/.local/bin/achievement-watcher --toggle-overlay
```

Er öffnet oder schließt das Overlay der bereits laufenden Kopie und startet nichts anderes. Der Befehl existiert
ab dem ersten Start des AppImage, und AW Next erneuert ihn bei jedem Start, sodass er Updates folgt.

- **GNOME:** **Einstellungen → Tastatur → Tastenkürzel anzeigen und anpassen → Eigene Tastenkürzel → Tastenkürzel hinzufügen**.
  Vergib einen Namen, füge den Befehl ein und drücke dann die gewünschten Tasten.
- **KDE Plasma 6:** **Systemeinstellungen → Tastatur → Kurzbefehle → Neu hinzufügen → Befehl oder Skript**, füge
  den Befehl ein und lege dann den Kurzbefehl fest.
- **KDE Plasma 5:** **Systemeinstellungen → Kurzbefehle → Eigene Kurzbefehle → Bearbeiten → Neu → Globaler Kurzbefehl →
  Befehl/URL**. Lege die Tasten unter **Auslöser** und den Befehl unter **Aktion** fest.
- **Hyprland** 0.55 und neuer, in `~/.config/hypr/hyprland.lua`:

  ```lua
  hl.bind("CTRL + SHIFT + K", hl.dsp.exec_cmd("/home/you/.local/bin/achievement-watcher --toggle-overlay"))
  ```

  In einer älteren `hyprland.conf` lautet dieselbe Zeile
  `bind = CTRL SHIFT, K, exec, /home/you/.local/bin/achievement-watcher --toggle-overlay`.
  Hyprland nimmt die Tasten vor jedem Fenster, sodass ein Druck das Overlay genau einmal öffnet oder schließt,
  egal bei welchem Spiel.
- **COSMIC:** **Einstellungen → Eingabegeräte → Tastatur → Tastenkürzel → Eigene Tastenkürzel → Tastenkürzel
  hinzufügen**. Fülle **Name des Tastenkürzels** und **Befehl** aus und tippe dann die Tasten. Es funktioniert auch bei einem nativen
  Wayland-Spiel. Die Einstellung **Globale Tastenkürzel in X11-Anwendungen** von COSMIC hilft nicht: AW Next
  sieht die Tasten dort trotzdem nicht.

Unter Hyprland und COSMIC erscheint das Overlay über einem Vollbildspiel, Wine oder nativ unter Wayland. Ist
**Overlay beim Öffnen fokussieren** an (siehe die [Controller-Anleitung](controller.md)), holen beide das Spiel
aus dem Vollbild, um es zu zeigen. Unter Hyprland hält diese Fensterregel das Spiel im Vollbild und das Overlay
darüber:

```lua
hl.window_rule({ name = "aw-next-overlay", match = { title = "Achievements Overlay" }, float = true, pin = true })
```

Ein Controller funktioniert ebenfalls. AW Next liest Gamepads direkt, daher öffnen und steuern die Controller-Tastenkürzel der
[Controller-Anleitung](controller.md) das Overlay, ohne dem Spiel etwas wegzunehmen.
Solange Steam Input läuft, liest AW Next nur die virtuellen Pads von Steam, damit ein Druck nicht doppelt gezählt wird.

## Schlüsselbund-Abfrage {#keyring-prompt}

Die wenigen Geheimnisse, die AW Next hält (Anmelde-Token für Steam, Epic, Xbox und PlayStation, der RetroAchievements-
Schlüssel, ein Steam-Passwort für Emulatoren), werden mit einem Schlüssel verschlüsselt, den der Schlüsselbund deines Desktops hält: GNOME Keyring
oder KDE Wallet. Hyprland hat keinen eigenen und nutzt den installierten, der startet, wenn AW Next ihn zum ersten Mal
anfragt.

Bei **automatischer Anmeldung** ist der Schlüsselbund beim Sitzungsstart nicht entsperrt. Braucht AW Next ihn zum ersten Mal,
bittet der Desktop dich, ihn zu entsperren oder einen anzulegen, falls keiner existiert; KDE öffnet den KDE-
Wallet-Assistenten. Beantworte die Abfrage, und AW Next macht weiter. Brichst du ab, funktioniert AW Next weiter, sagt einmal, dass
deine Verbindungen nicht geschützt sind, und der Desktop fragt beim nächsten Start erneut. Die Abfrage blockiert die App nie:
Verfolgung und Benachrichtigungen laufen, solange sie offen ist.

## Steam und Proton {#steam-and-proton}

AW Next findet den Steam-Client, egal ob er aus deiner Distribution (`steam-installer`, `steam`),
von Flathub oder als Snap kommt, samt seinen Bibliotheksordnern auf anderen Laufwerken und dem Proton-Präfix jedes Spiels.
Bei zwei installierten Steam-Clients folgt es dem, der zuletzt gestartet wurde.

Freischaltungen von Spielen, die Steam selbst startet, werden wie unter Windows aus den eigenen Dateien von Steam gelesen. AW Next zeigt sie
erst als Popup, wenn **Einstellungen → Benachrichtigung → Spiele des Steam-Clients** an ist, da Steam für
sie ein eigenes Popup zeigt.

## Wine, Lutris, Heroic und Bottles {#wine-lutris-heroic-and-bottles}

Jede Quelle wird innerhalb des Präfixes des Spiels gelesen, samt seiner Windows-Registry: ein Spiel mit einem Steam-
Emulator (Goldberg, GBE Fork und die anderen unter [Kompatible Quellen](sources.md)), ein Ubisoft- oder GOG-
Spielstand und so weiter. Die **Intelligente Suche** durchsucht deinen Home-Ordner, deine anderen Laufwerke und jedes Präfix, das sie kennt.

- **Lutris** und **Bottles**: Die Spiele und Programme, die sie installiert haben, werden mit ihrem Präfix aufgelistet.
- **Heroic**: Über Heroic installierte Epic-Spiele werden als Epic-Spiele erkannt.
- **Reines Wine**: das Standardpräfix `~/.wine` und jeder Präfixordner, den du hinzufügst.
- **Native Linux-Spiele** mit Goldberg oder GBE Fork (`libsteam_api.so`) werden aus ihren Linux-
  Spielstandordnern gelesen.

**Spielen** startet ein Spiel über den Launcher, zu dem es gehört (Steam, Lutris, Heroic), und die Spielzeit wird
am Prozess des Spiels gezählt. Die Emulator-Reparaturen von [Game Health](game-health.md) funktionieren aus dem
AppImage heraus und schreiben im Präfix des Spiels, wie immer mit einer Sicherung.

## Emulatoren {#emulators}

RPCS3, shadPS4, RetroArch und Xenia werden in ihren Linux-Ordnern gefunden; RPCS3 und shadPS4 auch, wenn sie
von Flathub kommen. RetroAchievements-Freischaltungen werden bei jedem Emulator gemeldet, sobald die Quelle
verbunden ist.

## Steam Deck {#steam-deck}

Die Unterstützung für das Steam Deck ist neu und **wurde nicht auf einem echten Deck geprüft**. Das soll sie leisten:

- Im **Desktop-Modus** ist AW Next dasselbe AppImage wie auf jedem Linux-Desktop. Das erste Fenster passt auf den
  1280x800-Bildschirm des Decks, und Spiele auf der microSD-Karte werden gefunden.
- Mit **Beim Start ausführen** läuft AW Next auch im **Spielmodus**: Es startet als Hintergrunddienst,
  sobald Steam läuft.
- Der Spielmodus zeigt keine Desktop-Benachrichtigungen, daher zeichnet AW Next jede Freischaltung als eigenes Popup über dem
  Spiel, von der oberen linken Ecke aus. Das Leistungs-Overlay von SteamOS kann dieses Popup verdecken.
- Das **Decky-Plugin** im Ordner `decky/` des Repositorys schickt jede Freischaltung an die eigenen Benachrichtigungen von Steam,
  die der Spielmodus immer zeichnet. Solange es lauscht, hält AW Next sein eigenes Popup aus, sodass
  du eine Benachrichtigung siehst. Ohne das Plugin ist das Popup der Ausweichweg. Vorerst installierst du es von
  Hand: Baue es (`npm install`, dann `npm run build`) und kopiere es nach
  `~/homebrew/plugins/achievement-watcher/`, wie seine
  [README](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/decky/README.md) erklärt.
  Es braucht ein laufendes AW Next mit eingeschaltetem Websocket-Feed, was der Standard ist.

Das Popup wurde in einer auf einem PC nachgestellten Spielmodus-Sitzung geprüft, und das Decky-Plugin hat nur Unit-
Tests. Probierst du eines von beiden auf einem echten Deck, hilft ein
[Issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) mit dem, was du gesehen hast.

## Ein Problem melden {#reporting-a-problem}

Gib deine Distribution, deinen Desktop (GNOME oder KDE, Wayland oder X11), wie das Spiel läuft (Steam mit Proton,
Lutris, Heroic, Bottles, Wine) und die Dateien in `~/.config/Achievement Watcher Next/logs` an.

---

**Weiter:** [Fehlerbehebung](troubleshooting.md), bei Problemen mit Erkennung, Fortschritt, Benachrichtigungen und Spielzeit.

<div align="center">

[← Dokumentation](README.md) · [Erste Schritte](getting-started.md) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
