# The theme gallery

The [theme gallery](gallery/themes/) lists application themes made by people using AW Next. Each one
is a single `.awtheme`: download it, import it in **Settings -> Theme**, and it is yours.

This page is the other side of that: how to add one.

## One file

Open the theme gallery page, drop your `.awtheme` on the **Send yours** panel, and that is the whole
submission. There is no form: the name, the description, the version, the tags, the palette and the
AW Next version it needs are read out of the package, the picture is rendered from the theme itself,
and the name it is published under is chosen for you.

1. **Export the theme.** Settings, Theme, Export. One file, and nothing to fill in there.
2. **Drop it on the panel.** Beside the file button there are three optional boxes: a description,
   some tags, and the name you want to be credited under. Leave them empty and whatever the package
   carries is used instead. It then takes a few seconds, because the app is really drawn with your
   theme and photographed rather than guessed at, and it waits: nothing appears in the gallery
   before a maintainer has approved it.

At most 8 MB per package, and five submissions an hour from one address.

## The picture is not yours to send

You cannot attach a screenshot, and there is nothing to resize. The server draws a fixed sample of
the AW Next interface with your theme - the same one Settings shows you before an import - and
photographs it at the size the gallery serves. That means a card cannot flatter a theme, cannot show
a version of it you did not send, and cannot carry anything but your theme: the sample text is a
constant in the app's own source, so no library, no account and no game of yours is in the picture.

## What travels, and what does not

Colours, gradients, fits, effect settings, and any background image you picked. Nothing else: see
[the format](awtheme-format.md) for the whole list, but the short version is that an `.awtheme` has
no stylesheet, no markup and no script anywhere in it, and that an image travels as bytes under a
name built from the layer it belongs to rather than as a path out of your pictures folder.

A **user stylesheet theme cannot be exported.** If your theme is a `.css` you dropped into
`%APPDATA%\Achievement Watcher 3.0\themes`, Export refuses it and says so. Share the `.css` itself.

## Backgrounds you may send

A background image is redistributed to everybody who downloads the theme, so it has to be yours to
redistribute:

- Your own artwork, or something under a licence that allows it. A wallpaper you found is usually
  neither.
- Nothing with a logo, a watermark or baked-in text: a theme is a look, not a placement.
- Nothing that would not pass as a desktop background at work.

A theme made of colours alone is welcome and is the easiest kind to accept.

## When the panel is not there

That means no gallery server is answering, and the page is listing a copy published beside it.
Everything already in the gallery is still there to download; only sending something new has to wait,
so try again a little later.

The service that makes the panel appear is run by the project and is not part of this repository, so
there is nothing to install for it.

## Credit and licence

The name on a card is the one you typed in the **Credit** box when you sent it. Leave it empty and
the card carries whatever the package says, or nothing at all; a maintainer can add a link to your
profile when approving it.

To use a different name, add a link, or write your own one-line summary, fill in the boxes beside
the file button when you send it.

Listed themes are published under **CC BY 4.0**. Sending one means you are happy with that, and that
everything inside it is yours to give.

## What gets refused

The reader that validates a submission is the same one the app imports with, so nothing is listed
that the app would refuse. On top of that a maintainer will decline:

- an advert, a logo or a call to action baked into a background image;
- an image that is not the submitter's to redistribute;
- a palette that makes text unreadable - a theme that cannot be used is not a theme;
- a near-duplicate of one already listed.

A refusal keeps the checksum and deletes the bytes, so sending the same file again is recognised
rather than queued a second time.
