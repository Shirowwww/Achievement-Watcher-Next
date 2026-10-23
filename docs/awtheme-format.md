# The `.awtheme` format

An application theme travels as one file. `.awtheme` is a zip with a fixed layout, written and read
by [`app/util/themePackage.js`](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/util/themePackage.js),
the only code that unpacks one.

This page is the format itself. Sending a theme to the gallery is covered in [The community galleries](community-galleries.md);
what themes are and how the editor works is in [Advanced](advanced.md). A notification theme imported
from Steam Achievement Notifier is a preset (`.awpreset`), not an `.awtheme`.

## What is in the file

```text
manifest.json     format metadata, and what the theme says about itself
theme.json        the theme: nine layers of colour, gradient, fit and effect
assets/           optional layer images, one flat folder, referenced by bare name
```

Nothing else is allowed in the zip.

### What it cannot contain

A theme is data: colours, numbers and pictures. The format has no place for a stylesheet, markup or a
script, and the reader refuses any entry that is not one of the three above. An imported theme
therefore has nothing it could run, no URL it could fetch and no way to reach the network. AW Next
builds the stylesheet itself from the values in `theme.json`, as for any theme you edit in Settings.

For the same reason a user stylesheet theme cannot be exported. A `*.css` in
`%APPDATA%\Achievement Watcher Next\themes` still works and appears in the picker, but Export refuses
it. Share the `.css` itself instead.

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
| `formatVersion` | The layout version. A reader refuses a higher number outright instead of guessing. |
| `name` | The name the theme installs under and the file is offered as: the editor name for a Custom theme, the name it travelled with for an imported one. Sanitised like a preset name, so one string works as all three. |
| `description`, `author`, `version`, `tags` | What the theme says about itself. All optional, all clamped. |
| `createdAt` | When it was exported, ISO 8601. |
| `app.createdWith` | The AW Next version that wrote it. Descriptive only. |
| `app.minVersion` | The oldest AW Next that can use it, as semver, or empty for any build that understands this format version. An older app refuses the import and says which version it needs. |
| `base` | Which built-in palette it started from, or empty. Descriptive only. |
| `assets` | The images the package carries, checked against `assets/`. A name listed but absent is an error. |

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
- The other four layers (`text`, `muted`, `border`, `accent`) are colours only.
- A colour is `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` or `rgb()`/`rgba()`. The alpha half is the
  editor's opacity slider.
- `image` is the bare name of a file in `assets/`, never a path. A value with a separator, or naming a
  file the package does not carry, is refused.
- `effect.blurImage` is always empty in a package. The importing machine generates that copy from the
  source image and the effect settings, both of which travel. Everything that draws a theme makes
  those copies through
  [`app/util/themeBlur.js`](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/util/themeBlur.js):
  the editor, an import, the preview shown before you apply one, and the picture the gallery
  publishes. A preview that skipped it would show a sharp wallpaper for a theme about to install
  heavily blurred.

Every value is re-clamped through the editor's own ranges when the package is read, so a hand-edited
`theme.json` cannot widen a limit.

## The picture a theme is judged by

The preview in Settings before an import and the card in the [theme gallery](community-galleries.md)
draw the same fixed sample of the application with the theme applied, built by
[`app/util/themeMock.js`](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/util/themeMock.js)
from the sanitized theme model and nothing else. It shows the title bar, profile row, library,
recently-unlocked list and settings surface, so every layer appears at least once.

- The sample is identical on any machine, at the same size. The gallery can therefore cache a
  rendered picture by the checksum of its file, and the Settings preview and a gallery card are the
  same image at different scales.
- The window sits on a fixed scene (a few CSS gradients in that file; no artwork, no network),
  because a see-through theme over nothing would read as a washed-out design.
- The sample text is a constant, so a picture never carries a library, account, path or game from
  the machine that drew it.

## What never travels

Nothing about the machine that exported the theme:

- **Paths.** An image is stored under a name built from its layer (`bg.jpg`, `card-2.png`), never its
  name on disk, because a wallpaper path can carry an account name, a game name or a private folder.
- **Generated files.** Blur and veil copies are rebuilt on the importing machine.
- **Credit you did not type.** `author` is empty unless the theme carries one, and an imported theme
  keeps its credit through a re-export.

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
| Image types | PNG, JPEG, WebP, GIF, BMP, checked from the bytes, not the extension |

SVG is not allowed: it is a document with its own script and external-reference surface, and a theme
layer only needs a picture.

The gallery is stricter, because a file served to everybody from a page is not one somebody chose to
open: 8 MB per package there.

## How a package is validated

In order; the first failure stops everything:

1. The file exists, is a file, is not empty, and is under the package limit.
2. It parses as a zip with no more entries than the limit.
3. Every entry name is `manifest.json`, `theme.json`, or a single flat name under `assets/`. A name
   that does not clean up to exactly what the archive claimed is treated as a traversal attempt.
4. The declared sizes stay under the per-file and total limits, and the archive does not claim to
   unpack to hundreds of times its own weight.
5. `manifest.json` parses, says `aw-theme`, has a format version this build understands, has a usable
   name, and (if it states one) a `minVersion` this build satisfies.
6. Every asset's real type and size are read from its own bytes, and the size that came out of the
   archive is checked against the limit again: the header can lie, the data cannot.
7. `theme.json` parses and is re-clamped, with every `image` field checked against the assets that
   are really there.

Only then is anything written, into a staging folder that is moved into place in one rename, so a
failure anywhere leaves theme storage as it was.

## Where an imported theme lives

```text
%APPDATA%\Achievement Watcher Next\theme-packs\<name>\
  theme.json      the model, with image fields as bare names
  aw-theme.json   the manifest it arrived with, which is what a re-export reads
  assets\         the images that travelled
  derived\        blur and veil copies generated here, never packaged
```

An imported theme is selected as `pack:<name>` in `cfg/options.ini` and drawn by the same generator
as the Custom theme, so the window, the in-game overlay and the picker all see one shape and it
behaves like a built-in. Deleting it removes the whole folder, generated copies included.

## Versioning rules

`formatVersion` is one integer, bumped only when a package written today would be misread by an older
build. Adding a field an older reader ignores does not count; changing what an existing field means
does.

- A reader refuses a higher `formatVersion`, saying a newer AW Next made the file.
- A reader accepts every lower version it has supported. Fields added since are absent and take their
  defaults.
- `app.minVersion` covers behaviour, not layout: a theme that needs a layer or effect from a given
  release states it there, and an older app refuses the import and names the version.

Current version: 1.
