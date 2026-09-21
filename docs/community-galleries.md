# The community galleries

Two galleries, one service, one set of rules.

| | | |
|---|---|---|
| [Preset gallery](gallery/) | `.awpreset` | the notification popup: layout, type, colours, motion and sound |
| [Theme gallery](gallery/themes/) | `.awtheme` | the rest of the app: window, title bar, library, achievement lists, settings surface and overlay |

Download a file, then **Settings → Presets → Import** or **Settings → Theme → Import**. Everything
already listed stays there to download even when the send-in panel is not (see
[When the panel is not there](#when-the-panel-is-not-there)).

## Sending one

Nothing leaves your browser until you press **Publish**.

1. **Export it** - Settings, Presets, Export for a preset; Settings, Theme, Export for a theme. The
   file already carries the name, description, version, tags and required AW Next version.
2. **Choose the file** in the *Send yours* panel on the gallery page, or drop it there. Choosing sends
   nothing yet.
3. **Check the card.** Four boxes are filled in from the package as soon as you choose it: **name**,
   a one-line **description**, **tags** (typed one at a time, Enter to add a chip) and a **credit**
   (the author recorded when you exported, empty if you chose not to be credited). **Name** is the
   only box that must end up filled in - it is the card's heading and the address the file is
   published under, and Publish stays disabled until there is one.
4. **Press Publish.** It takes a few seconds, because the picture is rendered rather than guessed at,
   then it waits - nothing appears in a gallery before a maintainer approves it.

There is no screenshot to attach: for a **preset**, the popup is rendered from the package itself, at
the size the app shows it; for a **theme**, the server paints a fixed sample of the AW Next interface
with your theme and photographs that, on a fixed backdrop so a see-through theme still reads.

| | Preset | Theme |
|---|---|---|
| Package size | 4 MB at most | 8 MB at most |
| Rate limit | five submissions an hour from one address, presets and themes together | |

## What travels in a file

An **`.awpreset`** holds the preset's document, stylesheet, images, fonts, sound and designer
settings - nothing about your machine. An **`.awtheme`** holds colours, gradients, fit and effect
settings and any background image, and nothing else: no stylesheet, no markup, no script (full list:
[the `.awtheme` format](awtheme-format.md)). A user stylesheet theme (a `.css` dropped into
`%APPDATA%\Achievement Watcher Next\themes`) is not an `.awtheme` and cannot be exported - share the
`.css` file itself.

Anything you send is redistributed to everybody who downloads it, so it has to be yours to
redistribute: your own artwork, or something licensed for it, never a logo, watermark or baked-in
text. A theme made of colours alone is welcome and is the easiest kind to accept.

The name on a card is whatever the **Credit** box says. **Everything listed in either gallery is
published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)** - submitting means it is
your own work, or you have the right to give it.

## What is checked

**The app's own reader** - `app/util/presetPackage.js` and `app/util/themePackage.js`, the same
modules that run on Import - validates the manifest, format version, minimum app version, every path,
file types, sizes and entry point. The gallery service uses those files verbatim, so nothing can be
listed that the app would refuse.

**The gallery's own limits**, which a private import does not need:

| | |
|---|---|
| File name | lower case letters, digits and dashes, 2 to 48 characters, built from the name |
| Package | 4 MB for a preset, 8 MB for a theme |
| Picture | rendered by the service, refused if it comes out outside the size a listing serves |
| Name | unique in its gallery |

Nothing in a package is executed while it is checked, and the website never renders one either.

**Refused:** someone else's work without permission, assets you cannot redistribute, a popup
pretending to be a system dialog or an advert, a palette that makes text unreadable, or a
near-duplicate of something already listed. A refusal keeps the checksum and deletes the bytes, so
resending the same file is recognised rather than queued again.

## Updating or removing yours

Send the newer file with the version inside it raised, and say in the description that it replaces an
earlier card so a maintainer can take that one down. To remove an entry altogether,
[open an issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues/new/choose) and name which
card it is.

## When the panel is not there

No gallery server is answering, and the page is listing a copy published beside it - everything
already in a gallery is still there to download, only sending something new has to wait. The service
is run by the project and is not part of this repository.

## Themes from Steam Achievement Notifier

They are not listed here, and will not be: SAN themes are files people pass to each other directly,
with no themes folder, wiki list or feed to point at, and the SAN repository carries no licence.
**Settings → Presets → Import SAN theme** converts a `.san` file (or an unpacked `usertheme.json`)
into an ordinary AW Next preset instead - see
[Presets](presets.md#import-a-theme-from-steam-achievement-notifier) for what converts. Converted one
of yours? Export it and submit that - it is then your preset, credited to you.

- [Steam Achievement Notifier](https://github.com/SteamAchievementNotifier/SteamAchievementNotifier)

---

**Next:** [Presets and the Preset Designer](presets.md) - what a preset is, and how to make one.

<div align="center">

[← Documentation](README.md) · [Preset gallery](gallery/) · [Theme gallery](gallery/themes/) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
