# The `.awtheme` format

An application theme travels as one file. `.awtheme` is a zip with a fixed layout, written and read
by [`app/util/themePackage.js`](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/util/themePackage.js),
which is the only code that ever unpacks one.

This page is the format itself. How to send one to the gallery is [The community galleries](community-galleries.md);
what the themes are and how the editor works is [Advanced](advanced.md).

## What is in the file

```text
manifest.json     format metadata, and what the theme says about itself
theme.json        the theme: nine layers of colour, gradient, fit and effect
assets/           optional layer images, one flat folder, referenced by bare name
```

That is the whole layout. There is deliberately nothing else in it.

### What it cannot contain

A theme is **data**: colours, numbers, and pictures. The format has no place for a stylesheet, no
place for markup and no place for a script, and the reader refuses any entry that is not one of the
three things above. So an imported theme has nothing it could run, no URL it could fetch and no way
to reach the network. AW Next builds the stylesheet itself from the values in `theme.json`, exactly
as it does for any theme you edit in Settings.

This is also why a **user stylesheet theme cannot be exported**. Any `*.css` you drop into
`%APPDATA%\Achievement Watcher Next\themes` still works and still appears in the picker, but Export
refuses it: putting somebody else's stylesheet into a file made to be passed around is exactly what
this format is designed not to become. Share the `.css` itself if you want to pass one on.

## manifest.json

```json
{
  "format": "aw-theme",
  "formatVersion": 1,
  "name": "Slate Mint",
  "description": "A cool slate window with a mint accent.",
  "author": "",
  "version": "1.0.0",
  "tags": ["dark", "green"],
  "createdAt": "2026-08-22T18:04:11.913Z",
  "app": { "createdWith": "3.9.2", "minVersion": "" },
  "base": "",
  "assets": ["bg.jpg"]
}
```

| Field | Meaning |
|---|---|
| `format` | Always `aw-theme`. Anything else is not a theme package. |
| `formatVersion` | The layout version. A reader refuses a **higher** number outright rather than guessing. |
| `name` | The name the theme installs under, and the name the file is offered as. For a Custom theme it is the name you gave it in the editor; for an imported one it is the name it travelled with. Sanitised the same way a preset name is, so one string can be all three at once. |
| `description`, `author`, `version`, `tags` | What the theme says about itself. All optional, all clamped. |
| `createdAt` | When it was exported, ISO 8601. |
| `app.createdWith` | The AW Next version that wrote it. Descriptive only. |
| `app.minVersion` | The oldest AW Next that can use it, or empty for "any build that understands this format version". A semver value; an older app refuses the import and says which version it needs. |
| `base` | Which built-in palette it started from, or empty. Descriptive only. |
| `assets` | The images the package carries. Checked against `assets/`; a name listed but absent is an error. |

Unknown fields are ignored, so a later format version can add listing metadata without breaking an
older reader on anything but `formatVersion`.

## theme.json

The same nine-layer model the Custom theme editor writes:

```json
{
  "bg":       { "color": "#151b1f", "gradient": { "enabled": true, "from": "#1b242a", "to": "#0e1215", "angle": 180 },
                "image": "bg.jpg", "fit": "cover",
                "effect": { "enabled": false, "type": "veil", "color": "#000000", "opacity": 40, "blur": 8, "blurImage": "" } },
  "header":   { "...": "same shape" },
  "panel":    { "...": "same shape" },
  "card":     { "...": "same shape" },
  "settings": { "...": "same shape" },
  "text":     { "color": "#e3ecef", "gradient": { "enabled": false } },
  "muted":    { "color": "#93a6ae", "gradient": { "enabled": false } },
  "border":   { "color": "#33434c", "gradient": { "enabled": false } },
  "accent":   { "color": "#4fd6a4", "gradient": { "enabled": false } }
}
```

- The five surface layers (`bg`, `header`, `panel`, `card`, `settings`) may carry an image, a fit
  (`cover`, `contain`, `repeat`, `fill`) and an effect (a coloured veil or a blur).
- The four remaining layers (`text`, `muted`, `border`, `accent`) are colours only.
- A colour is `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` or `rgb()`/`rgba()`. The alpha half is the
  opacity slider in the editor.
- `image` is the **bare name of a file in `assets/`**, never a path. A value with a separator in it,
  or naming a file the package does not carry, is refused.
- `effect.blurImage` is always empty in a package. It is a generated copy the importing machine
  makes for itself from the source image and the effect settings, both of which travel. Everything
  that draws a theme makes those copies the same way, through
  [`app/util/themeBlur.js`](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/util/themeBlur.js):
  the editor, an import, the preview shown before you apply one, and the picture the gallery
  publishes. A preview that skipped it would show a sharp wallpaper for a theme about to install
  heavily blurred.

Every value is re-clamped through the editor's own ranges when the package is read, so a hand-edited
`theme.json` cannot widen a limit.

## The picture a theme is judged by

A theme is data, so there is nothing to photograph. Everything that has to show one - the preview in
Settings before an import, and the card in the
[theme gallery](community-galleries.md) - draws the same fixed sample of the application with the
theme applied, built by
[`app/util/themeMock.js`](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/util/themeMock.js)
from the sanitized theme model and nothing else. One picture therefore carries the title bar, the
profile row, the library, the recently-unlocked list and the settings surface: every layer the
format has appears at least once.

Two details are worth knowing, because they are what make the picture a promise rather than a
flattering portrait:

- **It is the same sample every time**, at the same size, whichever machine draws it. That is what
  lets the gallery cache a rendered picture by the checksum of the file it came from, and what makes
  what Settings shows and what a card shows the same image at different scales.
- **The window sits on a fixed scene**, not on a blank page. A theme may be see-through - the
  opacity slider is on every layer - and a see-through theme photographed over nothing reads as a
  washed-out design nobody would install, because the picture would be showing what is behind the
  window, and behind the window there was nothing. The scene is a handful of CSS gradients defined
  in that same file: no artwork, no network, and identical between two renders.

The sample text is a constant in the source, so a picture can never carry a library, an account, a
path or a game from the machine that drew it.

## What never travels

Nothing about the machine that exported the theme:

- **No paths.** An image is copied into the package under a name built from the layer it belongs to
  (`bg.jpg`, `card-2.png`), never under the name it had on disk. A wallpaper path can carry an
  account name, a game name or a folder somebody would rather not share.
- **No generated files.** Blur and veil copies are rebuilt on the importing machine.
- **No credit you did not type.** `author` is empty unless the theme carries one, and a theme that
  was imported keeps whatever credit came with it through a re-export.

## Limits

Refused before anything is written, by the same reader in the app, in the gallery tooling and on the
gallery server.

| | |
|---|---|
| Package | 64 MB |
| Any one file inside | 24 MB |
| Everything unpacked | 48 MB |
| Entries in the zip | 32 |
| Images | 10 |
| Expansion ratio | 200x, so a zip built to be unpacked rather than read is refused |
| Image size | 12000 px per side, 40 megapixels |
| Image types | PNG, JPEG, WebP, GIF, BMP - **checked from the bytes, not the extension** |

No SVG: an SVG is a document with its own script and external-reference surface, and a theme layer
only ever needs a picture.

The gallery is stricter still, because a file served to everybody from a page is not the same as one
somebody chose to open: 8 MB per package there.

## How a package is validated

In order, and the first failure stops everything:

1. The file exists, is a file, is not empty, and is under the package limit.
2. It parses as a zip with no more entries than the limit.
3. Every entry name is `manifest.json`, `theme.json`, or a single flat name under `assets/`. A name
   that does not clean up to exactly what the archive claimed is treated as a traversal attempt.
4. The declared sizes stay under the per-file and total limits, and the archive does not claim to
   unpack to hundreds of times its own weight.
5. `manifest.json` parses, says `aw-theme`, has a format version this build understands, has a
   usable name, and (if it states one) a `minVersion` this build satisfies.
6. Every asset's real type and size are read **from its own bytes**, and the size that came out of
   the archive is checked against the limit again - the header can lie, the data cannot.
7. `theme.json` parses and is re-clamped, with every `image` field checked against the assets that
   are really there.

Only then is anything written, and even then into a staging folder that is moved into place in one
rename, so a failure anywhere leaves theme storage exactly as it was.

## Where an imported theme lives

```text
%APPDATA%\Achievement Watcher Next\theme-packs\<name>\
  theme.json      the model, with image fields as bare names
  aw-theme.json   the manifest it arrived with, which is what a re-export reads
  assets\         the images that travelled
  derived\        blur and veil copies generated here, never packaged
```

An imported theme is selected as `pack:<name>` in `cfg/options.ini` and is drawn by exactly the same
generator as the Custom theme, which is why it behaves like a built-in everywhere else: the window,
the in-game overlay and the picker all see one shape. Deleting it removes the whole folder,
generated copies included.

## Versioning rules

`formatVersion` is a single integer, and it is bumped **only when a package written today would be
misread by an older build**. Adding a field an older reader ignores is not that; changing what an
existing field means is.

- A reader refuses a **higher** `formatVersion` outright, with a message saying the file was made by
  a newer version of AW Next. It never guesses at a layout it does not know.
- A reader accepts every **lower** version it has ever supported. Fields added since are simply
  absent and fall back to their defaults.
- `app.minVersion` is the other half of this, and it is about behaviour rather than layout: a theme
  that needs a layer or an effect that only exists from a given release states it there, and an
  older app refuses the import and names the version instead of installing something it would draw
  wrongly.

Current version: **1**.
