# The source marks

The eight marks on the **Sources** section of the home page. They are drawn as CSS masks in the
accent colour, never as the logos in their own colours - see `.source-mark` in
`assets/css/site.css` for why - so **only the alpha channel of each file is ever used**. A file here
may be any colour; what matters is its shape.

## Where they come from

| File | Source |
|---|---|
| `steam.svg` | `app/Source/steam.svg`, the mark lifted out of the roundel it ships in |
| `gog.svg` | `app/Source/gog.svg`, unchanged |
| `epic.png` | generated from `app/Source/epic.svg` - see below |
| `ubisoft.svg` | `app/Source/ubisoft.svg`, unchanged |
| `ea.svg` | `app/Source/ea.svg`, unchanged |
| `xbox.svg` | `app/Source/xbox.svg`, unchanged |
| `saves.svg` | ours: a folder holding a save |
| `emulators.svg` | ours: a controller |

The six brand marks are the ones the **application itself** uses for the source badge on a library
tile, so the site and the app identify a platform with the same artwork. Take a corrected logo
upstream in `app/Source/` first and copy it here after, rather than the other way round.

Two of the eight are deliberately not logos. "Steam compatible saves" is Goldberg, GBE Fork,
GreenLuma and the rest - a family of readers, not a storefront - and "Emulators" is RPCS3, ShadPS4
and Xenia, three programs where any one mark would stand in wrongly for the other two.

## Why Epic is the one raster file

Epic's mark is a two-tone lockup: a dark shield with the wordmark reversed out of it in white. As a
mask, which reads alpha, both halves are opaque and the tile shows a plain filled shield. The PNG is
that lockup with the wordmark turned back into a hole - each pixel's alpha taken against its own
lightness, so the shield is opaque and the white wordmark is not. It is generated from the shipped
SVG rather than redrawn, at 512px, and it is the only file here that is not vector.

## Trademarks

Every brand mark belongs to its owner and is used here **only to identify a platform AW Next can
read achievements from**, which is what the footer of every page says: the project is not affiliated
with Valve, Sony, Microsoft, GOG, Epic Games, Electronic Arts or Ubisoft. None of them is used as a
logo of this project, and none of them appears on anything that could be taken for their own site.
