# The preset gallery

The [preset gallery](gallery/) lists notification presets made by people using AW Next. Each one is
a single `.awpreset`: download it, import it in **Settings -> Presets**, and it is yours.

This page is the other side of that: how to add one.

## One file

Open the gallery page, drop your `.awpreset` on the **Send yours** panel at the bottom, and that is
the whole submission. There is no form: the name, the description, the version, the tags and the
AW Next version it needs are read out of the package, the picture of the popup is drawn from the
preset itself, and the name it is published under is chosen for you.

1. **Export the preset.** Settings, Presets, Export. One file, and nothing to fill in there.
2. **Drop it on the panel.** Beside the file button there are three optional boxes: a description,
   some tags, and the name you want to be credited under. Leave them empty and whatever the package
   carries is used instead. It then takes a few seconds, because the popup is really rendered rather
   than guessed at, and it waits: nothing appears in the gallery before a maintainer has approved it.

At most 4 MB per package, and five submissions an hour from one address.

## When the panel is not there

That means no gallery server is answering and the page is showing the listing committed in this
repository. The original route still works, and always will:

```text
docs/gallery/community/neon-rail.awpreset    the file Settings -> Presets -> Export writes
docs/gallery/community/neon-rail.png         a picture of the popup (webp and jpg work too)
```

Two files, named the same, in one pull request - the picture at most 500 KB and at least 320x90, a
transparent PNG being what looks best since the gallery draws its own backdrop behind it. The file
name is what the download link uses: lower case letters, digits and dashes. You can do it entirely
in the browser with
[Add file -> Upload files](https://github.com/Shirowwww/Achievement-Watcher-Next/upload/main/docs/gallery/community),
and the listing is rebuilt automatically once it is merged.

Running the service that makes the panel appear is [Gallery server](gallery-server.md).

## Credit and licence

The name on a card is the one you typed in the **Credit** box when you sent it. Leave it empty and
the card carries whatever the package says, or nothing at all; a maintainer can add a link to your
profile when approving it.

Through a pull request the credit falls back to whoever committed the file, so opening it is enough.
To use a different name there, add a link, or write your own one-line summary, add a third file
beside the other two:

```json
{
  "by": "Your name",
  "summary": "One line for the card.",
  "link": "https://github.com/you"
}
```

Every field is optional, and those three are the only ones there are.

**Presets listed in the gallery are published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).**
Submitting one means you are happy with that. It has to be your own work, and anything inside it - a
font, a sound, a picture - has to be yours to redistribute.

## What is checked

Two layers, and a submission has to pass both.

**The app's own reader.** `app/util/presetPackage.js`, the module that runs on Import, validates the
package: the manifest, the format version, the minimum app version, every path inside it, the file
types, the sizes, the entry point. A rule added there applies here on the next build, and a package
accepted here cannot be refused by the app for a structural reason.

**The gallery's own limits**, which a private import does not need:

| | |
| --- | --- |
| File name | lower case letters, digits and dashes, 2 to 48 characters |
| Package | 4 MB (the app allows far more, but a listed preset should be light) |
| Picture | 500 KB, between 320x90 and 2400x1600, and really a PNG, WebP or JPEG |
| Preset name | unique in the gallery, since two presets of one name collide on import |

Nothing in a package is executed, unpacked or rendered while it is being checked, and the website
never renders one either: a card shows the picture you submitted. The preset itself only runs in the
app, in the same sandboxed notification window a bundled preset uses.

The pull request check prints the file list inside your package and its HTML and CSS in full, so the
submission can be read without anybody unzipping it.

## Not accepted

- Someone else's design, unless they said yes and you credit them.
- Assets you cannot redistribute.
- A popup pretending to be something else: a system dialog, an advert, an address to visit.
- A picture that is not the package rendering.

## Updating or removing yours

Open a pull request against your own files. Raise the version inside the package when the look
changes. To remove it, delete both files: the listing is rebuilt from what is there.

If you need an entry taken down and cannot open a pull request,
[open an issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues/new/choose) and say
which file it is.

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

[← Documentation](README.md) · [Preset gallery](gallery/) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
