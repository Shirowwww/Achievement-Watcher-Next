# Presets and the Preset Designer

A **preset** is the look of the in-game overlay popup: its layout, colours, motion and how it paints a
rare unlock or a 100% completion. Pick one under **Settings → Notification → Preset**, design your own
in **Settings → Presets**, or import one somebody shared with you.

> [!NOTE]
> Presets style the **in-game overlay** only. With **Notification type** set to *Windows
> notification*, nothing a preset describes is drawn, and the Presets tab is not shown at all.

## The bundled presets

| Preset | What it is |
| --- | --- |
| **AW Next** | The signature, default look: accent rail down the left edge, ringed icon, game name above the achievement. |
| **Steam** | Dark navy plate with the Steam mark behind the text, square corners, sliding up from the bottom. |
| **Epic Games** | Flat, neutral, square-shouldered, with a single rule down the left edge. |
| **PlayStation** | The console's own type on a long grey-to-black panel, PlayStation mark pulsing on the right. |
| **Xbox** | A dark pill with a green arc that sweeps once around the circular icon and settles into a ring. |
| **Cover** | The game's own artwork as a drifting background, with a scrim under the text. |
| **Glass** | Translucent and quiet: no accent bar, no colour until a rare or 100% unlock brings one. |
| **Arcade** | Phosphor green on black, monospaced, scanlines. A rare unlock switches to amber. |
| **Slim** | Half the height of the rest, on true black, built to disappear on an OLED panel. |

Every preset is the same width, so switching preset never moves the popup sideways. A rare unlock and
a 100% completion are states the preset itself paints - gold at 5% or less, silver up to 10%, bronze up
to 15% - so there is nothing extra to configure for them. Per-emulator overrides (Xenia, RPCS3,
ShadPS4) remain under **Advanced**.

A preset does not choose a sound - the one in the Notifications tab is used, unless a shared preset
brings its own (see [Share a preset](#share-a-preset)).

> [!NOTE]
> Presets shipped under earlier names still resolve, for example `Shirow`/`Default` to **AW Next** and
> `PS4`/`PS5 enhanced` to **PlayStation**. A preset of your own using one of those names is always used
> ahead of the replacement.

## Design your own

<div align="center">
<img src="screenshot/notification-preset.png" width="620" alt="The Preset Designer"><br>
<sub>Start from a complete design, then shape it under a live preview of the real popup</sub>
</div>

The designer (**Settings → Presets**) uses ordinary controls - no CSS, no JSON, no file to edit. The
preview is the notification itself: the same page, styles and engine the popup uses in a game. Switch
between **Card**, **Compare** (all four states at once) and **Screen** (a mock display at 720p-4K), and
preview **Normal**, **Rare**, **100%** and **Progress** individually.

Start from one of fourteen complete designs, hit **Surprise me** for a random one, or build from
scratch. Nine groups of controls cover layout, text, colours and background, icon, borders, shadow and
glow, motion, the rare/completion treatment, and sound; a filter box narrows them by name, and
**Undo/Redo** step through whole designs. **Show on screen** previews a real overlay popup without
saving; **Create preset** saves it.

Only presets the designer generated can be reopened, renamed or deleted afterwards - bundled and
hand-written presets are left alone. Generated presets live in
`%APPDATA%\Achievement Watcher Next\presets\Users Presets` and survive app updates.

## Import a theme from Steam Achievement Notifier

If you used **Steam Achievement Notifier**, its themes do not need to be rebuilt by hand. **Import SAN
theme**, in the **Presets** tab, reads a `.san` file (or an unpacked `usertheme.json`) and converts it
into an ordinary AW Next preset - it opens in **Edit a preset**, and exports as a normal `.awpreset`.

Colours, gradients, corner rounding, fonts, text and icon styling, glow, the rare/uncommon/scarce
colours, display time, travel direction, game name, rarity figure, background picture and sound all
come across. **SAN keeps four separate themes** (main, semi-rare, rare, 100%) while **AW Next paints
all four states from one preset**, so the import takes its rare and completion colours from SAN's
rarity glow settings - check them under **Rare & completion** afterward.

What does not convert - SAN's own logos and decorations, notification scale/position/volume (settings
of the app, not a preset), and anything a newer SAN version added - is listed by name after the
import, and written to the app log. The import is never all-or-nothing over something it cannot draw:
it converts what maps and tells you what it left behind. Nothing inside the file is run; only its
`usertheme.json` is read, and every path is checked against the package it came in. A failed import
leaves your existing presets untouched.

## Share a preset

**Export** and **Import**, in the **Presets** tab, move a preset between machines as one `.awpreset`
file - its style, images, fonts, designer settings and metadata. Only the preset travels: no path from
your machine, no account name, no other setting.

The [preset gallery](gallery/) collects what other people made - download one and import it, or add
yours. See [The community galleries](community-galleries.md) for what a submission needs and what is
checked.

**Export** writes the design currently in the controls, saved or not, under the name in the **Name**
field. **Import** asks for the file, checks it, and installs it under `presets\Users Presets`; if the
name is already taken you can **Keep both** or **Replace**.

### What is checked before anything is installed

A package is validated whole and refused entirely - never part-installed - when:

- it is not a preset package, or its manifest is missing or malformed;
- it needs a newer AW Next than the one running, or a newer package format;
- it carries a file the format does not describe - a program, a script, anything outside `preset/`
  and `sounds/`;
- any path inside it points outside its own folder.

Nothing inside a package is run, loaded or evaluated while it is checked or installed; it renders
later, in the same sandboxed notification window a bundled preset uses.

```text
manifest.json     name, description, author, version, tags, format version,
                  minimum AW Next version, and the designer settings
preset/           index.html, style.css, images and fonts (relative paths only)
sounds/           optional audio, added to your sound list on import
```

The manifest is kept beside the installed preset as `aw-package.json`, which is what lets the app
remove it again and carries the description and credit through to the next export. The `author` field
is only ever filled from the preset's own file, so nothing is credited to you unless you put it there.

---

**Next:** [Overlay](overlay.md) - the in-game achievement list, which is a separate thing from these
popups.

<div align="center">

[← Documentation](README.md) · [Notifications](notifications.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
