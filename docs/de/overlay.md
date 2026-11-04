---
title: "Erfolgsliste im Spiel (Overlay)"
description: "Die mit Strg+Umschalt+K geöffnete Erfolgsliste im Spiel: Suche, Filter, Seltenheit, versteckte Beschreibungen und Anpassung."
---

# Erfolgsliste im Spiel (Overlay)

Das Overlay im Spiel (standardmäßig `Strg+Umschalt+K`, solange ein unterstütztes Spiel läuft) zeigt die Erfolgsliste
des laufenden Spiels, ohne es zu verlassen: Namen, Beschreibungen, Sperrzustand, Freischaltungsdaten und
Fortschritt. Ziehe es an seiner Kopfzeile; es bleibt über dem Spiel. Unter Linux gibt ein Spiel, das nativ
unter Wayland läuft, den Hotkey nicht weiter: Binde stattdessen `~/.local/bin/achievement-watcher --toggle-overlay`
an eine Taste, wie [Overlay-Tastenkürzel](linux.md#overlay-shortcut) zeigt.

<div align="center">
<picture><source srcset="../assets/shot/overlay.webp 569w" sizes="(max-width: 700px) 100vw, 360px"><img src="../screenshot/overlay.png" width="360" height="633" alt="Erfolgsliste des Overlays im Spiel"></picture><br>
<sub>Spalten für Status, Seltenheit und Datum, mit Suche und Filtern</sub>
</div>

## Wie öffne ich die Erfolgsliste in einem Spiel? {#how-do-i-open-the-achievement-list-in-a-game}

Drücke `Strg+Umschalt+K`, während ein unterstütztes Spiel läuft. Das ist der Standard-Hotkey. Das Overlay listet jeden
Erfolg dieses Spiels mit Status, Freischaltungsdatum, Seltenheit und Fortschritt auf, und du kannst darin suchen.
Drücke den Hotkey erneut, um es zu schließen. Auf einem Controller ist die Voreinstellung **Back + Start + LB**.

Unter Linux mit Wayland gibt ein Spiel, das als natives Wayland-Fenster läuft, die Taste nie an AW Next weiter.
Binde stattdessen `~/.local/bin/achievement-watcher --toggle-overlay` in den Tastatureinstellungen deines Desktops
an eine Taste. Siehe [Overlay-Tastenkürzel](linux.md#overlay-shortcut).

## Ist das Overlay dasselbe wie das Freischaltungs-Popup? {#is-the-overlay-the-same-as-the-unlock-popup}

Nein. Das Popup ist eine einmalige Benachrichtigung, die erscheint, wenn etwas freigeschaltet wird, gestaltet von einem Preset (siehe
[Benachrichtigungen](notifications.md)). Das Overlay ist die vollständige Liste eines Spiels, von dir geöffnet, und
bleibt, bis du es schließt.

## Was es zeigt {#what-it-shows}

- Eine Statistikleiste mit `freigeschaltet / gesamt` und dem Abschlussprozentsatz.
- Eine Zeile pro Erfolg mit einer farbigen Statuspille (`Freigeschaltet` / `Gesperrt`), dem Freischaltungsdatum für
  erreichte Erfolge und einem Fortschrittsbalken mit einer Beschriftung `aktuell / max` für Fortschrittserfolge.
- Ein Seltenheits-Abzeichen (`★ 12.3%`) für jeden Erfolg mit bekannter Freischaltungsquote. Gewöhnliche Erfolge nutzen
  ein dunkelgraues Abzeichen; seltene nutzen Gold, Silber und Bronze mit einem weichen Schein, standardmäßig bei 5 %, 10 % und 15 %.
  **Einstellungen → Allgemein → Seltenheitsanzeige** ändert die Stufen oder wechselt zu Trophäenstufen.

## Versteckte Erfolge {#hidden-achievements}

Das Overlay verrät einen versteckten Erfolg nicht, den du noch nicht freigeschaltet hast: Wie im Hauptfenster lautet seine
Beschreibung *Versteckt - zum Anzeigen klicken*. Klicke darauf oder drücke auf einem Controller **A**, um
diese eine Beschreibung aufzudecken. Die Suche ignoriert Beschreibungen, die noch verborgen sind.

<div align="center">
<picture><source srcset="../assets/shot/overlay-hidden-800.webp 800w, ../assets/shot/overlay-hidden.webp 1162w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/overlay-hidden.png" width="560" height="482" alt="Die Overlay-Liste doppelt: versteckte Beschreibungen verborgen, dann eine aufgedeckt" loading="lazy" decoding="async"></picture><br>
<sub>Vor und nach einem Klick auf »We've all been there before...«: Nur diese Beschreibung wird aufgedeckt</sub>
</div>

## Suche und Filter {#search-and-filters}

- Das Suchfeld filtert die Zeilen schon beim Tippen nach Erfolgsname und Beschreibung.
- Die Pillen über der Liste wechseln zwischen **Alle**, **Freigeschaltet**, **Gesperrt** und **In Arbeit**.
- Ein Klick auf die Spaltenüberschrift **Seltenheit**, **Datum** oder **Status** sortiert aufsteigend, dann absteigend
  und dann zurück zur natürlichen Reihenfolge. Es wird immer nur nach einer Spalte sortiert.
- `/` fokussiert das Suchfeld. `Esc` leert es oder schließt das Optionsfenster, falls es offen ist.

## Controller (Gamepad) {#controller-gamepad}

Aktiviere **In-Game-Overlay mit einem Controller steuern** unter **Einstellungen → Controller**, um das
Overlay mit einem Gamepad zu bedienen. Mit der Standardbelegung:

- **Back + Start + LB** öffnet oder schließt das Overlay.
- **LB + X** schaltet den Navigationsmodus um: Ein Fokusring zeigt, wo du bist, und ein kleines **UI**-Abzeichen
  erscheint in der Kopfzeile des Overlays.
- Im Navigationsmodus bewegt das Steuerkreuz oder der linke Stick den Fokus, **A** bestätigt, **B** bricht ab, **X**
  fokussiert die Suche und **Y** öffnet das Optionsfenster.
- Hältst du **LB + RB**, bewegt der linke Stick das Overlay und der rechte
  Stick scrollt die Liste.

Jedes Tastenkürzel ist konfigurierbar, die Tastennamen folgen dem gewählten Layout, und die Hinweisleiste des Overlays
zeigt deine eigene Belegung. Die [Controller-Anleitung](controller.md) behandelt die Einstellungen, die unterstützten Pads
und den Windows-Vorbehalt, dass das Spiel deine Tastendrücke weiterhin sieht.

## Anpassung {#customization}

Die Schaltfläche **⚙** in der Kopfzeile des Overlays öffnet die Optionen:

- **Akzent**: fünf Farbvorlagen, ein freier Farbwähler oder **App-Design verwenden**, um dem Design des Hauptfensters
  zu folgen (genutzt für Fortschritt, aktive Filter, Fokusringe und das Leuchten freigeschalteter Zeilen).
- **Dichte**: Zeilenabstand Kompakt, Gemütlich oder Geräumig.
- **Symbolgröße**: Klein, Mittel oder Groß.
- **Zoom**: 80 % bis 125 % der Fenstergröße.
- **Deckkraft**: 40 % bis 100 % des Hintergrunds des Fensters.
- **Ein-/Ausblenden** für die Statistikleiste, Fortschrittsbalken, Seltenheits-Abzeichen und Beschreibungen.

Änderungen gelten sofort und werden lokal gespeichert. **Zurücksetzen** stellt das ursprüngliche Aussehen wieder her. Die
Optionen lassen sich per Tastatur bedienen: Die Menüs für Zoom und Deckkraft zeigen einen Fokusring, Schalter werden mit
Tab und Leertaste umgeschaltet, und Animationen folgen der Systemeinstellung für reduzierte Bewegung.

## Tastenkürzel (Overlay geöffnet) {#keyboard-shortcuts-overlay-open}

- `Strg+Alt+Umschalt+Pfeiltasten` - das Overlay-Fenster verschieben.
- `Strg+Alt+Umschalt+1` … `5` - an eine voreingestellte Position einrasten.
- `Strg+Alt+Umschalt+C` - Durchklicken umschalten.

## Hinweise {#notes}

- Das Overlay folgt der in der App gewählten Oberflächensprache.
- Nach dem ersten Öffnen wird das Overlay-Fenster 5 Minuten lang verborgen gehalten und wiederverwendet, sodass erneutes Umschalten
  nahezu sofort geht. Solange es verborgen ist, pausiert es die Controller-Abfrage, und nach 5 Minuten
  Inaktivität wird das Fenster freigegeben, um Speicher zu sparen.
- Zeileninhalte werden vor dem Rendern maskiert; Erfolgsdaten werden nur angezeigt, nie ausgeführt.
- Die Overlay-Liste ist getrennt von den Presets der einmaligen Overlay-*Benachrichtigung* (Einstellungen →
  Benachrichtigung), in denen das Aussehen des Popups eingestellt wird.

---

**Weiter:** [Controller-Anleitung](controller.md) - das Overlay und die App mit einem Gamepad bedienen.

<div align="center">

[← Dokumentation](README.md) · [Anleitung zu Benachrichtigungen](notifications.md) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
