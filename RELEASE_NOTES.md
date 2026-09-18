# Achievement Watcher Next 3.10.8 (hotfix)

A quick follow-up to 3.10.7, fixing one bug it shipped with.

## Fixed

- **A game with several bundled crack launchers no longer shows duplicate tiles.** A folder detected
  as "emulator saving inside the game folder" was recorded with the wrong path separator, so it
  never matched the game it already belonged to. An alternate launcher folder some repacks ship
  alongside the main one (an Epic or Online Fix variant, for example) was then scanned as its own
  unidentified install and added a second and third card for the same game.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3108---2026-09-18)
for details, and the [3.10.7 notes](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.10.7)
for everything that release added.

## Install

Download `Achievement.Watcher.Setup.3.10.8.exe` from the
[v3.10.8 release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.10.8), or let
the app update itself. `Achievement.Watcher.Portable.3.10.8.zip` is the same build with no installer:
extract it anywhere and it keeps its settings, caches and logs in a `data` folder beside the
executable.

The `.blockmap` and `latest.yml` assets are used by automatic updates.

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3108---2026-09-18) ·
[Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) ·
[Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
