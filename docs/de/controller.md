---
title: "Controller-Anleitung"
description: "Achievement Watcher Next und sein Overlay im Spiel mit einem Xbox-, PlayStation- oder Switch-Controller bedienen und eine Freischaltung über die Vibration spüren."
---

# Controller-Anleitung (Gamepad)

Ein Gamepad kann zwei getrennte Bereiche steuern: das Hauptfenster und das Overlay im Spiel. Beides wird unter
**Einstellungen → Controller** eingerichtet.

<div align="center">
<picture><source srcset="../assets/shot/controller-panel-800.webp 800w, ../assets/shot/controller-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/controller-panel.png" width="720" height="529" alt="Einstellungen - Controller"></picture><br>
<sub>Navigation im Overlay und in der App, Layout und Tastenbelegung pro Tastenkürzel</sub>
</div>

## Die beiden Schalter {#the-two-switches}

| Einstellung | Standard | Was sie umfasst |
|---|---|---|
| **App mit Controller steuern** | An | Das Hauptfenster von AW Next: Bibliothek, Spieldetails, Einstellungen und Suchen. |
| **In-Game-Overlay mit einem Controller steuern** | Aus | Das Overlay im Spiel, vom Hintergrund-Tracker gesteuert, während du spielst. |

Die App-Navigation ist gewöhnliche Fenstereingabe und kostet nichts, daher ist sie standardmäßig an. Die Overlay-Steuerung lädt
den nativen Controller-Stack im Hintergrund-Tracker und muss deshalb aktiv eingeschaltet werden.

## Tastenkürzel auf einen Blick {#shortcuts-at-a-glance}

Die Tastennamen folgen dem Xbox-Vokabular; die App zeigt sie im gewählten Layout an.

<div align="center">
<img src="../assets/img/controller-map.svg" width="700" height="422" alt="Ein Gamepad mit den Standard-Tastenkürzeln: LT öffnet Game Health, RT startet das Spiel, LB und RB wechseln den Einstellungs-Tab, das Steuerkreuz bewegt den Fokus, A bestätigt, B bricht ab, X sucht, Y und Start öffnen die Einstellungen, dazu die drei Overlay-Kombinationen" loading="lazy">
</div>

| Tastenkürzel | Standard | Wo |
|---|---|---|
| Overlay öffnen / schließen | **Back + Start + LB** | Im Spiel |
| Overlay-Navigation umschalten | **LB + X** | Overlay geöffnet |
| Overlay bewegen und scrollen | **LB + RB** (gehalten) | Overlay geöffnet |
| Bestätigen | **A** | App + Overlay |
| Zurück / abbrechen | **B** | App + Overlay |
| Suchfeld fokussieren | **X** | App + Overlay |
| Einstellungen / Overlay-Optionen öffnen | **Y** | App + Overlay |
| Einstellungen öffnen | **Start** | App |
| Das ausgewählte Spiel starten | **RT** | App, Bibliothek |
| Game Health für das ausgewählte Spiel öffnen | **LT** | App, Bibliothek |
| Vorheriger / nächster Einstellungs-Tab | **LB** / **RB** | App, Einstellungen geöffnet |
| Seite scrollen | **LB** / **RB** | App, Einstellungen geschlossen |

Das Umschalten des Overlays nutzt drei Tasten, damit es nicht versehentlich mitten im Spiel auslöst. Jedes Overlay-Tastenkürzel
ist konfigurierbar und nimmt ein bis drei Tasten.

In der Bibliothek bewegt der Stick zwischen den Kacheln, und **A** öffnet das Spiel, wie ein Klick. Die beiden
auf eine Kachel gezeichneten Bedienelemente liegen auf den Triggern: **RT** startet das ausgewählte Spiel und **LT** öffnet
sein Game-Health-Fenster. Beide tun nichts, solange keine Bibliothekskachel ausgewählt ist.

## Optionen {#options}

- **Controller-Layout**: das Vokabular für Hinweise und Tastennamen. **Auto** folgt dem angeschlossenen Pad,
  wenn es sich erkennen lässt; die anderen sind **Xbox**, **PlayStation** und **Switch**.
- **Controller-Backend**: **Auto** wählt das beste verfügbare Eingabe-Backend, **XInput** ist das kompatibelste,
  und **GameInput** passt zu neueren Windows-Builds.
- **Belegungen**: ein bis drei Tasten pro Tastenkürzel. Tastenkürzel dürfen sich eine Taste teilen (die Standardwerte tun das:
  **LB + X** und **LB + RB** nutzen beide LB), und die Eingabeschicht sorgt dafür, dass das Halten einer Kombination die andere
  nicht auslöst. Eine in einer Belegung wiederholte Taste zählt einmal. Das Umschalten des Overlays akzeptiert außerdem
  die Taste **Guide**; die beiden Overlay-Modi nicht, weil die Gamepad-API des Browsers, die sie liest,
  sie nicht zuverlässig meldet.
- **Overlay beim Öffnen fokussieren**: gibt dem Overlay den Tastaturfokus, was viele Spiele pausiert, die den Fokus
  verlieren. Standardmäßig aus.
- **Escape-Taste an das Spiel senden, wenn per Controller geöffnet wird**: sendet einen Druck auf die Escape-Taste an das fokussierte
  Spiel kurz bevor das Overlay sich öffnet, sodass viele Spiele pausieren oder ihr Menü öffnen. Das geschieht nur bei per Controller ausgelöstem Öffnen,
  während ein Spiel läuft, nie beim Tastatur-Hotkey. Standardmäßig aus.

## App-Fenster {#app-window}

Ist die App-Navigation an, zeigt ein Druck auf eine beliebige Gamepad-Taste im Hauptfenster einen Fokusring. Das
Steuerkreuz oder der linke Stick bewegt sich zwischen den Bedienelementen, und die obigen Tastenkürzel gelten. Zwei Details:

- **B** verlässt zuerst ein fokussiertes Textfeld und geht dann zurück oder bricht ab, sodass du das Suchfeld
  ohne Maus verlassen kannst.
- **LB** / **RB** wechseln den Einstellungs-Tab, solange die Einstellungen geöffnet sind, und scrollen die Seite, wenn sie geschlossen sind.

Mausbewegung oder ein Tastendruck gibt die Steuerung an Maus und Tastatur zurück.

## Overlay im Spiel {#in-game-overlay}

**Back + Start + LB** öffnet oder schließt das Overlay über dem laufenden Spiel. **LB + X** schaltet dann
den Navigationsmodus um: Das Steuerkreuz oder der linke Stick bewegt den Fokusring, **A** bestätigt, **B** bricht ab, **X**
fokussiert die Suche und **Y** öffnet das Optionsfenster. Hältst du **LB + RB**, bewegt der linke Stick das Overlay und der
rechte Stick scrollt die Liste.

Ein kleines **UI**-Abzeichen erscheint in der Kopfzeile, solange die Navigation aktiv ist, und die Hinweisleiste zeigt deine eigene
Belegung und dein Layout. Der Rest des Overlays steht in der [Overlay-Anleitung](overlay.md).

> [!IMPORTANT]
> Windows erlaubt einer Drittanbieter-App nicht, einen Controller exklusiv zu übernehmen, sodass das Spiel Tasteneingaben weiterhin
> empfangen kann, während das Overlay geöffnet ist. Damit das Spiel pausiert, aktiviere **Overlay beim Öffnen
> fokussieren** (die meisten Spiele pausieren, wenn sie den Fokus verlieren) oder **Escape-Taste an das Spiel senden, wenn per Controller
> geöffnet wird**.

## Unterstützte Pads {#supported-pads}

Xbox-Controller, PlayStation DualShock 4 / DualSense und Switch-Pro-Controller werden unterstützt. Xbox-Pads
laufen über XInput; PlayStation- und Switch-Pads werden über rohes HID gelesen und brauchen daher keinen Hersteller-
Treiber.

## Wenn ein Controller nicht erkannt wird {#when-a-controller-is-not-detected}

1. Prüfe, ob der richtige Schalter an ist: App-Navigation und Overlay-Steuerung sind getrennt.
2. Probiere das Backend **XInput** ausdrücklich; **Auto** kann GameInput wählen, wenn ein bestimmtes Pad in einem Build
   nicht aufgelistet wird.
3. Prüfe das Pad im Windows-Fenster für Gamecontroller (`joy.cpl`). Sieht Windows es nicht, kann AW Next
   es auch nicht sehen.
4. Füge für einen Fehlerbericht `debugLogging = true` im Abschnitt `[controller]` von
   `%APPDATA%\Achievement Watcher Next\cfg\options.ini` hinzu und starte neu. Der Hintergrund-Tracker protokolliert dann
   Diagnosen auf Tastenebene. Es gibt keinen Schalter in der Oberfläche, weil die Ausgabe ausführlich ist; schalte es
   danach wieder aus.

---

**Weiter:** [Game Health](game-health.md) - das Fenster pro Spiel, das sagt, warum ein Spiel verfolgt wird oder
nicht.

<div align="center">

[← Dokumentation](README.md) · [Overlay-Anleitung](overlay.md) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>

## Unter Linux {#on-linux}

Unter Linux liest AW Next Gamepads über die Eingabegeräte des Kernels, und die obigen Tastenkürzel funktionieren genauso.
Solange Steam Input läuft, liest es nur die virtuellen Pads von Steam, damit ein Druck nicht doppelt gezählt wird. Das
Steam Deck und das Decky-Plugin werden in [Linux und das Steam Deck](linux.md#steam-deck) behandelt.
