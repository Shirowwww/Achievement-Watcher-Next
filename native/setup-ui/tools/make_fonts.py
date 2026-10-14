"""Builds the subset fonts embedded in the setup window (assets/fonts/*.ttf).

Usage: python tools/make_fonts.py <OpenSans[wdth,wght].ttf> <app/resources/font>

The app's own Open Sans files are a Latin-only web subset, so the full family comes from
github.com/googlefonts/opensans (OFL). Every font is cut down to the scripts the installer's 27
languages use in Latin, Greek and Cyrillic; Thai, Japanese, Chinese and Korean are drawn by the
system fallback DirectWrite applies to any glyph a font lacks. Font Awesome keeps only the icons
src/icons.rs names.
"""

import os
import re
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets", "fonts")
TEXT_RANGES = [
    (0x0020, 0x024F),  # Basic Latin to Latin Extended-B
    (0x0300, 0x036F),  # combining marks (Vietnamese)
    (0x0370, 0x03FF),  # Greek
    (0x0400, 0x04FF),  # Cyrillic
    (0x1E00, 0x1EFF),  # Latin Extended Additional (Vietnamese)
    (0x2000, 0x206F),  # punctuation: dashes, quotes, ellipsis
    (0x20AC, 0x20AC),
    (0x2190, 0x2193),  # arrows
]


def text_unicodes() -> list[int]:
    return [c for start, end in TEXT_RANGES for c in range(start, end + 1)]


def icon_unicodes() -> list[int]:
    source = open(os.path.join(HERE, "..", "src", "icons.rs"), encoding="utf-8").read()
    return sorted({int(code, 16) for code in re.findall(r"'\\u\{([0-9a-fA-F]+)\}'", source)})


def save_subset(font: TTFont, unicodes: list[int], name: str) -> None:
    options = subset.Options()
    options.hinting = False
    options.desubroutinize = True
    options.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk"]
    options.name_IDs = ["*"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    font.flavor = None
    path = os.path.join(OUT, name)
    font.save(path)
    print(f"{name}: {os.path.getsize(path)} bytes")


def main(open_sans_variable: str, app_fonts: str) -> None:
    for weight, name in ((400, "OpenSans-Regular.ttf"), (700, "OpenSans-Bold.ttf")):
        static = instancer.instantiateVariableFont(
            TTFont(open_sans_variable), {"wght": weight, "wdth": 100}, updateFontNames=True
        )
        save_subset(static, text_unicodes(), name)
    save_subset(TTFont(os.path.join(app_fonts, "Raleway", "Raleway-Bold.ttf")), text_unicodes(), "Raleway-Bold.ttf")
    icons = TTFont(os.path.join(app_fonts, "fontawesome", "fa-solid-900.woff2"))
    save_subset(icons, icon_unicodes(), "FontAwesome-Solid.ttf")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
