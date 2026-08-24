# Presets and the Preset Designer

A **preset** is the look of the in-game overlay popup: its layout, colours, motion and the way it
paints a rare unlock or a 100% completion. Pick one under **Settings → Notification → Preset**,
design your own in **Settings → Presets**, or import one somebody shared with you.

> [!NOTE]
> Presets style the **in-game overlay**. With **Notification type** set to *Windows notification*,
> nothing a preset describes is ever drawn, and the Presets tab is not shown at all.

## The bundled presets

AW Next ships nine. They are not variations on one card: each has its own composition, type, motion
and colour, and each was designed to be recognisable at a glance while a game is on screen behind it.

| Preset | What it is |
| --- | --- |
| **AW Next** | The signature, and the default. The app's own palette, an accent rail down the left edge, a ringed icon and the game's name above the achievement. |
| **Steam** | The dark navy plate with the Steam mark behind the text, square corners, sliding up out of the bottom edge. |
| **Epic Games** | Flat, neutral and square-shouldered, with the widest gutters in the set and a single rule down the left edge. |
| **PlayStation** | The console's own type and long grey-to-black panel, with the PlayStation mark pulsing inside a ring on the right. |
| **Xbox** | A dark pill with a green arc that sweeps once around the circular icon and settles into a steady ring. |
| **Cover** | The game's own artwork as the background, drifting slowly, with a scrim under the text and the largest type in the set. |
| **Glass** | Genuinely translucent and deliberately quiet: no accent bar, no colour until a rare or 100% unlock brings one. |
| **Arcade** | Phosphor green on black, monospaced and uppercase, with scanlines and a hard offset edge. A rare unlock switches to amber. |
| **Slim** | The low one, on true black - the same width as the rest but half the height, built to disappear on an OLED panel. |

Every preset is the same width, so switching preset never moves the popup sideways.

### The four states every preset draws

| State | What it looks like |
| --- | --- |
| **Normal** | The preset's own accent. |
| **Rare** | Gold below 3%, silver below 6%, bronze up to 10%, plus the unlock rate printed on the card, a stronger glow and an added edge. |
| **100% completion** | A cold, brighter treatment with a doubled rim - different from a rare unlock, not merely another colour. |
| **Progress** | A real progress bar with a `current/max - %` label. |

**There is one preset setting, not three.** A rare unlock and a 100% completion are states the preset
you picked paints itself, so there is nothing to configure for them and no way for the two to
disagree. The per-emulator overrides (Xenia, RPCS3, ShadPS4) remain, under **Advanced**.

A preset does not choose a sound - the one in the Notifications tab is used, so changing the look
never changes what you hear. A preset someone shares with you *can* bring its own sound; see
[Share a preset](#share-a-preset).

Presets named after a platform reference its visual language and carry its mark; the type, the
palettes and the state system are AW Next's own.

> [!NOTE]
> Presets shipped under earlier names still resolve. `Shirow`, `Default`, `Midnight` and `xqjan`
> become **AW Next**; `PS4` and `PS5 enhanced` become **PlayStation**; `Xbox 360` and `Xbox One`
> become **Xbox**; `Game Cover` and `Sunset` become **Cover**; `Clean`, `Modern` and `Smooth Pop`
> become **Glass**; `Neon Future` and `LAZ0RBOX` become **Arcade**. Among the community presets,
> `ArmsofGod`, `Epic Preset`, `TigerDX Award` and `mudoss` were renamed **Pantheon**, **Onyx**,
> **Hexagon** and **Outline**, and the Xbox Series rare/platinum variants fold back into
> **Xbox Series**. A preset of your own carrying one of those names is always used ahead of the
> replacement.

## Design your own

The designer has its own tab - **Settings → Presets**, listed under Notification and reachable from
the tools button beside the preset setting. Everything is set with ordinary controls: there is no
CSS, no JSON and no file to edit.

<div align="center">
<img src="screenshot/notification-preset.png" width="620" alt="The Preset Designer"><br>
<sub>Start from a complete design, then shape it under a live preview of the real popup, which stays on screen while the controls scroll</sub>
</div>

### Starting points

The first row holds fourteen complete designs - *Classic* (the look the old builder always produced),
*Aurora*, *Neon*, *Cover*, *Minimal*, *Console*, *Terminal*, *Slate*, *Paper* (the one light design),
*Ember*, *Frost*, *Poster*, *Pixel* and *Ribbon*. Each is an ordinary set of control values, so
picking one is the same as having moved every control by hand: keep it, or use it as a base.

| Action | What it does |
| --- | --- |
| **Surprise me** | Builds a design you have not tried. It picks a kind of card first - flat, gradient, neon, over artwork, glassy, terminal or light - and then rolls every control inside what that kind allows, so the result is a design rather than noise. One hue still drives the whole palette. |
| **Duplicate** | Keeps the current design, frees the name and lets go of the picker - so the next **Create preset** adds a preset instead of replacing the one it came from. |

Nothing is saved until you press **Create preset**.

### The preview

The preview is the notification itself, not an impression of it: the same page, styles and engine the
popup uses in a game.

| Control | What it shows |
| --- | --- |
| **Card** | The popup at its own size, for judging the design close up. The pixel size and preview zoom are printed under it. |
| **Compare** | All four notifications at once, two by two. Switching states shows what a rare unlock looks like; seeing them together shows whether it looks *different*. |
| **Screen** | The popup on a mock display at **720p**, **1080p**, **1440p** or **4K**, at its true relative size and in the corner notifications are set to appear. |
| **Normal / Rare / 100% / Progress** | The four notifications a preset has to look right in. In **Compare**, where all four are already on screen, the one you pick is drawn at full strength and the others sit back. |
| **Play** | Plays the whole thing once - entry, hold and exit - at the preset's own timings. |
| **Backdrop** | What the popup is judged against: transparency, a dark scene, a bright one, or artwork from your own library. A design that reads well on dark can vanish on a bright scene. |
| **Position / Scale** | Both mirror the settings of the same name in the Notification tab. Changing them here changes that setting. They appear in the **Screen** view only, which is the one view where they change the picture. A popup you placed by hand is drawn at the bottom centre and labelled, since only the app knows where you dragged it. |

The preview stays pinned to the top of the panel while the controls scroll under it, so a slider at
the bottom of the list still shows you what it is doing. It takes the height the popup actually
needs, which is why a short wide design leaves more room for the controls than a tall one does.

### Finding your way around

Nine groups and sixty-odd controls, so there is one way through them and one way back.

| | What it does |
| --- | --- |
| **The filter** | Type in the box above the groups and only the matching controls stay. It searches labels, the words inside dropdowns and the property's own name, so both `corner` and `radius` find the same slider, and a name read out of an `.awpreset` finds its control. A match behind **Advanced** opens it; a group with nothing in it folds away. **Esc** clears the box. |
| **Undo / redo** | The two arrows beside the filter, or **Ctrl+Z** and **Ctrl+Y** (**Ctrl+Shift+Z** works too). They step through whole designs, so one drag of a slider is one step rather than one per pixel. Loading a preset, picking a starting point or pressing Reset starts a fresh history - undo never carries you back into a different design. |

The nine group headings are the other way around: they are all on screen at once, and each opens on
a click. The everyday two - **Layout & size** and **Colours & background** - start open, and inside
most groups an **Advanced** disclosure holds the fine-tuning nobody sets twice.

Nothing the filter does moves a control: they are all still there, in the same order, hidden or
shown. Clearing the box brings the panel back exactly as it was.

### The controls

Each group opens with its everyday settings; the less common ones sit behind **Advanced** inside the
group. In **Simple** interface mode the Advanced halves are not shown at all.

| Group | What it covers |
| --- | --- |
| **Layout & size** | Icon on the left, right, above the text or not at all; text alignment; popup width, padding and spacing; and whether the **game's name** is printed above the achievement. |
| **Text** | Font, title size, description size, how many lines the description may wrap onto, what colours the title, and - under Advanced - title weight, uppercase, letter spacing, and two ways to stay readable over a picture: a text shadow and an outline drawn around every glyph. |
| **Colours & background** | A solid colour, a two-colour gradient with an angle, the **game's own artwork**, or **a picture of your own**, dimmed, blurred and framed behind the text. Plus text colour, accent and opacity. Under Advanced, a **texture** - grid, dots, hatching or speckle - drawn over whichever background you chose and under the text, at a strength you set; it is drawn rather than stored, so it costs the preset nothing to carry. A picture you pick is copied into the preset, so it travels with it when you share it. |
| **Icon** | Size, **shape** - a rounded square, a circle, a squircle, a hexagon or a diamond - and, under Advanced, a border and a glow in the accent colour. The corner rounding applies to the rounded square; the other shapes carry their own outline, so they are drawn without a border. |
| **Border & corners** | Corner radius, which edge carries the accent bar (or a full outline, or none) and its thickness; under Advanced, a border of your own colour. |
| **Shadow & glow** | How deep the drop shadow is, how much the popup glows in its accent colour, and whether that glow **pulses** or **breathes** while the popup is on screen. |
| **Motion & timing** | Which edge the popup enters from and leaves to (or fade, or zoom), how long it stays on screen, and - under Advanced - how far it travels, entry and exit speed, the entry curve (smooth, linear, back, gentle, snap or elastic) and an **exit curve** of its own, which defaults to the one every preset always left on. |
| **Rare & completion** | The colour and glow for a rare unlock and for 100% completion, a **state tint** that washes the whole card in that colour rather than only its accents, whether the progress bar shows, whether a **rarity badge** prints the unlock rate, and - under Advanced - the progress bar thickness and the silver and bronze tiers. |
| **Sound** | A sound this preset plays instead of the one in the Notifications tab. Leave it on **App setting** for no opinion. |

| Action | What it does |
| --- | --- |
| **Show on screen** | Renders the design as a real overlay popup, at full size, in the configured position and in the state the preview is showing - **without saving it**. |
| **Create preset** | Saves it and selects it as the active preset. |
| **Update preset** | The same button, once the name matches a preset the designer made - it replaces that preset instead of adding another. |
| **Edit a preset** | Loads one of your generated presets back into the controls. Every value returns exactly as saved. |
| **Reset** | Returns the controls to the default design. Nothing on disk changes. |
| **Rename** | Appears once a generated preset is loaded. Type the new name in the name field and press it: the preset is renamed on disk, and whichever notification settings pointed at it follow. |
| **Delete** | Appears once a generated preset is loaded, and removes it after a confirmation. |
| **Export** / **Import** | Move a preset between machines - see below. |

Only presets this designer generated can be re-opened or deleted: it stores its settings in an
`aw-preset.json` beside the generated files, and that file is what makes a preset editable. Bundled
presets and hand-written ones are never touched.

> [!NOTE]
> A preset you already made keeps its own files exactly as they were generated. Opening it in the
> designer and saving is what applies today's defaults to it - among them a rare unlock and a 100%
> completion repainting the whole popup, where before only the progress bar changed colour.

> [!NOTE]
> Presets you create are stored in `%APPDATA%\Achievement Watcher Next\presets\Users Presets`, not in
> the installation folder. They survive app updates.

## Import a theme from Steam Achievement Notifier

If you used **Steam Achievement Notifier**, the themes you made there do not have to be rebuilt by
hand. **Import SAN theme**, in the **Presets** tab, reads a `.san` file and turns it into an AW Next
preset.

It is a conversion, not a compatibility mode. What lands on disk is an ordinary generated preset:
it opens in **Edit a preset**, every control shows the value it was converted to, and it exports as
an `.awpreset` like anything else. AW Next never reads the SAN file again.

Both shapes work: the `.san` file SAN exports, and the `usertheme.json` inside a theme SAN has
already unpacked (in `%APPDATA%\steamachievementnotifier\userthemes\...`), in which case the
pictures and sounds beside it come across too.

### What comes across

Colours and the gradient, corner rounding, opacity, font size and the description size beside it,
text colour and a separate title colour, the outline, the glow with its colour and its animation,
the rare/uncommon/scarce colours, the text shadow and text outline, the icon size, its rounding, its
border and its glow, the display time, the direction the popup travels, the game name and the rarity
figure, the background picture, and the sound. A font the theme named is matched to the closest of
the five families AW Next uses.

A theme set to play a **random sound from a folder** brings that folder's audio into your sound list
too. Choosing at random is a setting of the Notifications tab rather than something a preset decides,
so the preset itself keeps no opinion, but the sounds are there to point it at.

### What does not, and why

An import is never refused over something AW Next cannot draw. It converts what maps and then tells
you, by name, what it left behind:

| | |
| --- | --- |
| **Not drawn by an AW Next popup** | SAN's own logos, decorations, masks, hidden-achievement icons, percentage badges, icon-border artwork and the second set of options for its screenshot overlay. AW Next's popup is a card, not a composition of layers. |
| **A setting of the app, not of a preset** | Notification scale, position and volume. They exist here, in the **Notification** tab, and they stay where you set them rather than being changed by an import. |
| **Not recognised** | Anything a newer SAN added that this version has not been taught. It is listed rather than dropped in silence. |

Two things keep that list about features rather than about identifiers. A property you never turned
on is not listed at all, and a feature is named **once**: a theme using SAN's percentage badge sets
six keys for it, and hearing "percentbadge" is the whole of what was lost.

Everything the report says is also written to the app log, so it is still there after the dialog is
gone.

One difference is worth knowing before you look at the result. **SAN keeps four separate themes** -
main, semi-rare, rare and 100% - and a `.san` file carries only one of them. **AW Next paints all
four states from a single preset**, so the imported preset brings its own rare and completion
colours (from SAN's rarity glow colours where the theme set them). Check them under **Rare &
completion**.

### What is checked before anything is installed

The same rules as an `.awpreset`, and for the same reason: a theme file comes from somebody else's
machine. Nothing inside one is ever run, required or evaluated - only its `usertheme.json` is read.
Every path is checked against the package it came in, so a theme cannot point outside itself; the
absolute paths SAN writes are read as filenames only, never opened. Only pictures and audio are
taken out, by file type and under a size limit, and anything else is refused and listed in the
report. An import that fails at any point leaves every preset you already have untouched.

## Share a preset

**Export** and **Import** sit in the **Presets** tab and move a preset between machines as one
`.awpreset` file - the style, every image and font it uses, its designer settings and its metadata.

The [preset gallery](gallery/) is where those files are collected: browse what other people made,
download one and import it, or add yours. What a submission has to be, and what is checked before it
is listed, is in [The community galleries](community-galleries.md).

**Export** writes what the card is showing, under the name in the **Name** field - the design in the
controls, saved or not, so a preset in progress can be shared without creating it first. The one
exception is an imported preset selected in **Edit a preset**: its look lives in files the controls
cannot describe, so that one is exported from disk as it is.

Only the preset travels: no path from your machine, no account name, and no setting of yours.

**Import** asks for the file, checks it, and installs it under `presets\Users Presets`. If that name
is already taken - by one of your presets *or* by a bundled one, which an import would otherwise hide
behind a copy - you are asked whether to **Keep both** (the import lands under `Name (2)`) or to
**Replace**. Nothing is written until you answer.

An imported preset appears in **Edit a preset**, is selected straight away, and can be exported again
or deleted from there. A preset the designer made comes back complete, so you can keep editing it. A
hand-written preset gets its look from files the controls cannot reproduce, so the controls are left
alone and the name field stays empty.

### What is checked before anything is installed

A package is validated whole and refused entirely - never part-installed - when:

- it is not a preset package, or its manifest is missing or malformed;
- it needs a newer AW Next than the one running, or a newer package format;
- it carries a file the format does not describe - a program, a script, or anything outside
  `preset/` and `sounds/`;
- any path inside it points outside its own folder.

Nothing inside a package is ever run, loaded or evaluated while it is being checked or installed. The
preset's own page renders later, in the same sandboxed notification window that renders a bundled
preset. An import that fails for any reason leaves every preset you already have untouched.

### What a package contains

```text
manifest.json     name, description, author, version, tags, format version,
                  minimum AW Next version, and the designer settings
preset/           index.html, style.css, images and fonts (relative paths only)
sounds/           optional audio, added to your sound list on import
```

The manifest is kept beside the installed preset as `aw-package.json`. That is what tells the app the
preset is one it installed and may remove again, and it carries the description and credit through to
the next export.

A sound you imported yourself travels with the preset. A bundled sound does not - the manifest names
it, since every install already has it. Importing never changes which sound you have selected, and
never overwrites one you already have: a different file of the same name arrives as `name (2)`.

The `author` field is optional and is only ever filled from the preset's own file, so nothing is
credited to you unless you put it there.

---

**Next:** [Overlay](overlay.md) - the in-game achievement list, which is a separate thing from these
popups.

<div align="center">

[← Documentation](README.md) · [Notifications](notifications.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>