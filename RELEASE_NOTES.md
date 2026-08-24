# Achievement Watcher Next 3.10.0

A big release: portable themes and a real website with two community galleries, an optional Steam
account connection, per-game notification appearance, and a long list of fixes gathered along the way.

## Highlights

- **Themes are now one portable file**, shared through a new
  [community theme gallery](https://shirowwww.github.io/Achievement-Watcher-Next/gallery/themes/).
  Export packs the colours, gradients, effects and any background image into a single `.awtheme`;
  Import previews it before installing anything, and nothing it carries can run code or reach the
  network.
- **A real website**, not just a documentation folder:
  <https://shirowwww.github.io/Achievement-Watcher-Next/> now has a home page, the
  [preset gallery](https://shirowwww.github.io/Achievement-Watcher-Next/gallery/) and the theme
  gallery above, and live notification previews. The home page and both galleries are translated into
  six languages besides English; the guides themselves stay English.
- **An optional Steam account connection.** AW Next never sees your password - the sign-in page is
  Valve's own. Connecting reads achievements from a private profile, marks games shared through
  Steam Family, and can hide games no longer in your library, never a game installed here or shared
  with you.
- **Each game can carry its own notification appearance** - preset, position, sound and scale -
  instead of only the global setting, with the same previews as the main notification settings.
- **Artwork the game already has on disk is used before the network** (issue #38), and Steam artwork
  behind a hashed CDN path now resolves too, instead of leaving a blank tile.
- **The preset designer got easier to search and more to build with**: a filter, group jump chips,
  undo/redo on whole designs, a background picture of your own, an outline and a pulsing glow, six
  new starting presets, and a Steam Achievement Notifier `.san` importer.
- **The library gained six reusable views** - landscape and portrait cards, compact variants, list
  and details - and a game confirmed bought on an official store now carries its own small badge.
- **Screenshot souvenirs handle Windows HDR automatically**, tone-mapping to a normal PNG instead of
  a washed-out capture.
- Korean, Traditional Chinese, Dutch, Swedish, Danish, Norwegian, Finnish, Greek, Indonesian and
  Vietnamese join the bundled interface languages, bringing them to 28, and RPCS3 trophies now raise
  live notifications like the other console emulators.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3100---2026-08-23)
for the complete list, including the many smaller fixes gathered since 3.9.2.

## Install

Download `Achievement.Watcher.Setup.3.10.0.exe` from the
[v3.10.0 release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.10.0), or let
the app update itself.

The `.blockmap` and `latest.yml` assets are used by automatic updates.

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3100---2026-08-23) ·
[Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) ·
[Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
