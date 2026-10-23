# The community galleries

Two galleries, one service, one set of rules.

| | | |
|---|---|---|
| [Preset gallery](gallery/) | `.awpreset` | The notification popup: layout, type, colours, motion and sound |
| [Theme gallery](gallery/themes/) | `.awtheme` | The rest of the app: window, title bar, library, achievement lists, settings and overlay |

To download from either, take the file, then use **Settings → Notification presets → Import** or
**Settings → Appearance → Import**. This page covers the other side: how to add one, what is checked,
and what a card may say.

## Sending one

The flow is the same for both, and nothing leaves your browser until you press **Publish**.

1. **Export it.** Use Settings → Notification presets → Export for a preset, or Settings → Appearance →
   Export for a theme. The file already carries the name, description, version, tags and the AW Next
   version it needs.
2. **Choose the file** in the *Send yours* panel on the gallery page, or drop it on the panel. Choosing
   sends nothing: the file waits while you fill in the rest, and the panel names what it holds.
3. **Check what the card should say.** Four boxes are filled in from the package as soon as you choose
   it: a **name**, a one-line **description**, **tags** and a **credit**. The credit is the author the
   app recorded when you exported, so it is the name you go by, and it is empty only if you chose not
   to be credited. Type a tag and press Enter to make it a chip; click a chip to remove it.

   **The name is the one box that must be filled in.** It heads the card and gives the address the
   file is published under, and a name picked for someone else is what a moderator ends up rewriting.
   Publish stays inert until there is one. The other three may stay empty, and the card then carries
   nothing there.
4. **Press Publish.** It takes a few seconds, because the picture is rendered, not guessed. Then it
   waits: nothing appears in a gallery before a maintainer approves it.

Everything in those boxes is a **suggestion**. It overrides the package only where it is filled in, it
is cleaned exactly as a manifest is, and a maintainer sees all four beside the rendered picture before
anything is published. None of it decides a file name or an address: the service builds the address from
the name, keeps lower-case letters, digits and dashes, and refuses anything else.

Your browser reads the boxes out of the package (its `manifest.json` and nothing more). The file itself
leaves only when you press Publish.

| | Preset | Theme |
|---|---|---|
| Package | 4 MB at most | 8 MB at most |
| Rate | Five submissions an hour from one address, presets and themes together | |

## The picture is not yours to send

You cannot attach a screenshot to either gallery. The service renders the picture from your package.

For a **preset**, it draws the popup from the package, in the same sandboxed document the app uses,
once in a browser with no network and no scripting of its own, at the size the app shows it.

A **theme** is colours and numbers, so the server draws a fixed sample of the AW Next interface with
your theme (title bar, profile row, library, recently unlocked list, settings surface) and photographs
that. It is the sample Settings shows before an import, at the same size. It sits on the same four
backdrop gradients every time, so a see-through theme does not render as a washed-out design and two
renders of one file match.

The sample text is a constant in the app's source, so a card cannot carry a library, account, path or
game of yours, or show a version of the submission you did not send.

## What travels in a file

An **`.awpreset`** holds the preset's document and stylesheet, its images, fonts and sound, and the
designer settings behind it. Nothing about your machine.

An **`.awtheme`** holds colours, gradients, fits, effect settings and any background image you picked,
and nothing else: no stylesheet, markup or script. An image travels as bytes under a name built from
its layer, never as a path out of your pictures folder. The full list is in
[the `.awtheme` format](awtheme-format.md).

A **user stylesheet theme cannot be exported.** A `.css` you dropped into
`%APPDATA%\Achievement Watcher Next\themes` is not an `.awtheme`, and Export refuses it. Share the
`.css` itself.

## Backgrounds and other assets

Everything inside a package is redistributed to everyone who downloads it, so it must be yours to
redistribute:

- Your own artwork, or something under a licence that allows it. A wallpaper you found is usually
  neither, and neither is a font you bought.
- Nothing with a logo, a watermark or baked-in text. A theme is a look, not a placement.
- Nothing that would not pass as a desktop background at work.

A theme made of colours alone is welcome and the easiest kind to accept.

## Credit and licence

The name on a card is whatever the **Credit** box ends up saying. It starts as the author the app
recorded when you exported, so it is usually right. Change it if you go by something else, or empty it
and the card carries no name. A maintainer can add a link to your profile when approving it.

**Everything listed in either gallery is published under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).** By submitting you agree to that, confirm
it is your own work and that everything inside it is yours to give.

## What is checked

A submission has to pass two layers.

**The app's own reader.** `app/util/presetPackage.js` and `app/util/themePackage.js`, the modules that
run on Import, validate the package: the manifest, the format version, the minimum app version, every
path inside it, the file types, the sizes and the entry point. The gallery service uses those files
verbatim, so a rule added there applies here on the next build, and nothing can be listed that the app
would refuse.

**The gallery's own limits**, which a private import does not need:

| | |
|---|---|
| File name | Lower-case letters, digits and dashes, 2 to 48 characters, built by the service from the name |
| Package | 4 MB for a preset, 8 MB for a theme |
| Picture | Rendered by the service, and refused if it comes out outside the size a listing serves |
| Name | Unique in its gallery, since two entries with one name collide on import |

Nothing in a package is executed while it is checked, and the website never renders one: a card shows a
picture the service produced. A preset runs only in the app, in the same sandboxed notification window
a bundled preset uses, and a theme cannot run anything anywhere.

## What gets refused

- Someone else's work, unless they said yes and you credit them.
- Assets you cannot redistribute.
- A popup posing as something else: a system dialog, an advert, an address to visit.
- An advert, logo or call to action baked into a background image.
- A palette that makes text unreadable.
- A near-duplicate of something already listed.

A refusal keeps the checksum and deletes the bytes, so sending the same file again is recognised
instead of queued twice.

## Updating or removing yours

Send the newer file the same way, with the version inside the package raised, and say in the
description that it replaces an earlier card so a maintainer can take that one down. To have an entry
removed, [open an issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues/new/choose) and
say which card it is.

## When the panel is not there

No gallery server is answering, and the page lists a copy published beside it. Everything already in a
gallery can still be downloaded. Only sending something new has to wait, so try again later.

The project runs the service that makes the panel appear, and it is not part of this repository, so
there is nothing to install for it.

## Themes from Steam Achievement Notifier

They are not listed here and will not be.

SAN themes are `.san` files people pass to each other directly. The SAN repository has no themes
folder, wiki list or feed, so a build has nothing to point at. The files belong to the people who made
them and are not licensed for redistribution, and the SAN repository carries no licence at all. Copying
either here would republish other people's work without permission.

AW Next reads yours instead. **Settings → Notification presets → Import SAN theme** reads a `.san`
file, or the `usertheme.json` of a theme already unpacked, and **Import from SAN on this PC** reads
SAN's own settings. Either way the theme becomes an AW Next preset, drawn with SAN's own engine
at SAN's size, and exports as an `.awpreset` like any other. What comes across is in
[Presets](presets.md#import-a-theme-from-steam-achievement-notifier).

If you imported one of yours, export it and submit that. It is then your preset, credited to you.

- [Steam Achievement Notifier](https://github.com/SteamAchievementNotifier/SteamAchievementNotifier)

---

**Next:** [Presets and the Preset Designer](presets.md): what a preset is, and how to make one.

<div align="center">

[← Documentation](README.md) · [Preset gallery](gallery/) · [Theme gallery](gallery/themes/) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
