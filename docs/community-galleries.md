# The community galleries

Two galleries, one service, one set of rules.

| | | |
|---|---|---|
| [Preset gallery](gallery/) | `.awpreset` | the notification popup: its layout, type, colours, motion and sound |
| [Theme gallery](gallery/themes/) | `.awtheme` | the rest of the app: window, title bar, library, achievement lists, settings surface and overlay |

Downloading from either is one step: take the file, then **Settings -> Presets -> Import** or
**Settings -> Theme -> Import**. This page is the other side of it - how to add one, what is checked,
and what a card is allowed to say.

## Sending one

The flow is the same for both, and nothing leaves your browser until you press **Publish**.

1. **Export it.** Settings, Presets, Export for a preset; Settings, Theme, Export for a theme. The
   file already carries the name, the description, the version, the tags and the AW Next version it
   needs, because the app wrote them there.
2. **Choose the file** in the *Send yours* panel on the gallery page, or drop it on the panel, which
   is the same thing. Choosing sends nothing: the file waits while you fill in the rest, and the
   panel names what it is holding so you can tell.
3. **Check what the card should say.** Four boxes, and all four are filled in from the package as
   soon as you choose it: a **name**, a one-line **description**, **tags** and a **credit**. The
   credit is the author the application recorded when you exported, so it is the name you actually
   go by rather than one retyped into a web form; it is empty only if you chose not to be credited.
   Tags are entered one at a time - type a word, press Enter, and it becomes a chip you can click to
   take off again.

   **The name is the one box that has to end up filled in.** It is the heading of the card and the
   address the file is published under, and a name chosen for somebody rather than by them is what a
   moderator ends up rewriting. Publish stays inert until there is one. The other three may be left
   empty, and an empty box simply means the card carries nothing there.
4. **Press Publish.** It takes a few seconds, because the picture is really rendered rather than
   guessed at. Then it waits: nothing appears in a gallery before a maintainer has approved it.

Everything in those boxes is a **suggestion**. It wins over what the package says only where it is
actually filled in, it is cleaned exactly as a manifest is, and a maintainer sees all four beside the
rendered picture before anything is published. None of it decides a file name or an address on its
own: the address is built from the name by the service, which strips it to lower-case letters, digits
and dashes and refuses anything else.

Reading the boxes back out of the file happens in your browser and nowhere else - the page opens the
package for its `manifest.json` and nothing more. The file itself still only leaves when you press
Publish.

| | Preset | Theme |
|---|---|---|
| Package | 4 MB at most | 8 MB at most |
| Rate | five submissions an hour from one address, presets and themes together | |

## The picture is not yours to send

You cannot attach a screenshot to either gallery, and there is nothing to resize.

For a **preset**, the popup is rendered from the package: the same document the app runs in its
sandboxed notification window, drawn once in a browser with no network and no scripting of its own,
at the size the app shows it.

For a **theme**, there is nothing to photograph at all - a theme is colours and numbers - so the
server draws a fixed sample of the AW Next interface with your theme and photographs that. It is the
same sample Settings shows you before an import, at the same size, so the two always agree. One
picture carries the title bar, the profile row, the library, the recently-unlocked list and the
settings surface, which is how a single card can stand for every screen a theme touches.

The sample sits on a fixed backdrop rather than on a blank page. That is not decoration: a theme may
be see-through, and a see-through theme over nothing photographs as a washed-out design nobody would
install. The backdrop is the same four gradients every time, so two renders of one file are still
the same picture.

Because the sample text is a constant in the app's own source, a card cannot carry a library, an
account, a path or a game of yours, and cannot flatter a submission by showing a version of it you
did not send.

## What travels in a file

An **`.awpreset`** holds the preset's document and stylesheet, its images, its fonts, its sound and
the designer settings behind it. Nothing about your machine.

An **`.awtheme`** holds colours, gradients, fits, effect settings and any background image you
picked, and nothing else: no stylesheet, no markup and no script anywhere in it. An image travels as
bytes under a name built from the layer it belongs to, never as a path out of your pictures folder.
The whole list is in [the `.awtheme` format](awtheme-format.md).

A **user stylesheet theme cannot be exported.** A `.css` you dropped into
`%APPDATA%\Achievement Watcher Next\themes` is not an `.awtheme`; Export refuses it and says so.
Share the `.css` itself.

## Backgrounds and other assets you may send

Anything inside a package is redistributed to everybody who downloads it, so it has to be yours to
redistribute:

- Your own artwork, or something under a licence that allows it. A wallpaper you found is usually
  neither, and neither is a font you bought.
- Nothing with a logo, a watermark or baked-in text: a theme is a look, not a placement.
- Nothing that would not pass as a desktop background at work.

A theme made of colours alone is welcome, and is the easiest kind to accept.

## Credit and licence

The name on a card is whatever the **Credit** box ends up saying. It starts as the author the
application recorded when you exported, so in the normal case it is already right; change it if you
go by something else, or empty it and the card simply carries no name. A maintainer can add a link
to your profile when approving it.

**Everything listed in either gallery is published under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).** Submitting means you are happy with
that, that it is your own work, and that everything inside it is yours to give.

## What is checked

Two layers, and a submission has to pass both.

**The app's own reader.** `app/util/presetPackage.js` and `app/util/themePackage.js` - the modules
that run on Import - validate the package: the manifest, the format version, the minimum app
version, every path inside it, the file types, the sizes, the entry point. The gallery service uses
those files verbatim, so a rule added there applies here on the next build, and nothing can be listed
that the app would refuse.

**The gallery's own limits**, which a private import does not need:

| | |
|---|---|
| File name | lower case letters, digits and dashes, 2 to 48 characters, built by the service from the name |
| Package | 4 MB for a preset, 8 MB for a theme |
| Picture | rendered by the service, and refused if it comes out outside the size a listing serves |
| Name | unique in its gallery, since two entries of one name collide on import |

Nothing in a package is executed while it is being checked, and the website never renders one
either: a card shows a picture the service produced. A preset only runs in the app, in the same
sandboxed notification window a bundled preset uses; a theme cannot run anything anywhere.

## What gets refused

- Someone else's work, unless they said yes and you credit them.
- Assets you cannot redistribute.
- A popup pretending to be something else: a system dialog, an advert, an address to visit.
- An advert, a logo or a call to action baked into a background image.
- A palette that makes text unreadable. A theme that cannot be used is not a theme.
- A near-duplicate of something already listed.

A refusal keeps the checksum and deletes the bytes, so sending the same file again is recognised
rather than queued a second time.

## Updating or removing yours

Send the newer file the same way, with the version inside the package raised, and say in the
description that it replaces an earlier card so a maintainer can take that one down. To have an
entry removed altogether,
[open an issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues/new/choose) and say
which card it is.

## When the panel is not there

That means no gallery server is answering, and the page is listing a copy published beside it.
Everything already in a gallery is still there to download; only sending something new has to wait,
so try again a little later.

The service that makes the panel appear is run by the project and is not part of this repository, so
there is nothing to install for it.

## Themes from Steam Achievement Notifier

They are not listed here, and will not be.

SAN themes are `.san` files people pass to each other directly. There is no themes folder in the SAN
repository, no wiki list and no feed, so there is nothing a build could point at; and the files
belong to the people who made them, who have not licensed them for redistribution. The SAN
repository itself carries no licence at all. Copying either into this gallery would be republishing
other people's work without permission.

What AW Next does instead is read yours. **Settings -> Presets -> Import SAN theme** converts a
`.san` file, or the `usertheme.json` of a theme already unpacked, into an ordinary AW Next preset:
editable in the designer, exportable as an `.awpreset` like any other. What converts and what does
not is in [Presets](presets.md#import-a-theme-from-steam-achievement-notifier).

Converted one of yours? Export it and submit that. It is then your preset, credited to you.

- [Steam Achievement Notifier](https://github.com/SteamAchievementNotifier/SteamAchievementNotifier)

---

**Next:** [Presets and the Preset Designer](presets.md) - what a preset is, and how to make one.

<div align="center">

[← Documentation](README.md) · [Preset gallery](gallery/) · [Theme gallery](gallery/themes/) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
