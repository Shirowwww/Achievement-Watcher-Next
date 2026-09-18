# Achievement Watcher Next 3.10.9 (hotfix)

3.10.8 fixed one cause of duplicate tiles for a game with several bundled crack launchers, but not
every case. This closes the remaining one.

## Fixed

- **The duplicate-tile fix in 3.10.8 did not cover every case.** A folder added directly as a watched
  location (rather than one found by walking a library root) was never checked against the games
  already known before its own subfolders were scanned, so an alternate crack-launcher subfolder
  inside it - the case 3.10.8 aimed at - could still surface as its own unidentified install.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3109---2026-09-18)
for details.

## Install

Download `Achievement.Watcher.Setup.3.10.9.exe` from the
[v3.10.9 release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.10.9), or let
the app update itself. `Achievement.Watcher.Portable.3.10.9.zip` is the same build with no installer:
extract it anywhere and it keeps its settings, caches and logs in a `data` folder beside the
executable.

The `.blockmap` and `latest.yml` assets are used by automatic updates.

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3109---2026-09-18) ·
[Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) ·
[Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
