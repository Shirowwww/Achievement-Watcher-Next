# Achievement Watcher Next 3.12.0

AW Next on Linux and the Steam Deck as a beta, a new installer and update window, a Steam Original preset, half the disk space on Windows and a round of fixes.

## Highlights

- **Linux (beta).** A native AppImage, never run through Wine. It follows the games you play through Steam and Proton, Wine, Lutris, Heroic or Bottles, and native Linux games, reads every achievement source inside the game's prefix and shows unlocks in the in-game overlay or as desktop notifications, with playtime, souvenirs and gamepad control of the overlay. It was tested on GNOME and KDE Plasma and in Wine and Proton prefixes, but not yet on many real machines: please report what you find. See the [Linux guide](https://shirowwww.github.io/Achievement-Watcher-Next/linux.html).
- **Steam Deck (beta, not yet checked on a real Deck).** In Game Mode, AW Next draws each unlock over the game, and the Decky plugin in `decky/` can send them to Steam's own notifications instead.
- **A new installer and uninstaller.** One window in AW Next's own look, in your language, with real progress. The uninstaller asks once whether to delete your data and shows how much that frees.
- **A real update window.** A new version comes with its release notes and download size, and the download can be followed, cancelled or left running in the background.
- **A Steam Original preset**, a copy of the popup the current Steam client draws. The earlier Steam preset is now called Steam Modern.
- **Finished games stay in the library.** "Show installed games only" is off until you turn it on, so an uninstalled game is still listed from its emulator saves. RetroAchievements games whose ROM RetroArch knows now count as installed.
- **About half the disk space.** The installed files take about 210 MB instead of 420 MB, installs and updates are faster, and the data folder is leaner.
- **Fixes:** RUNE and CODEX releases that have not saved yet, TENOKE, Catherine and UniverseLAN sources, ShadPS4 0.19 and later, KytyPS5 `.zar` archives, Xenia without `portable.txt`, Xbox games merged into the wrong Steam game, keyboard access across Settings and the overlay, and more.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3120---2026-10-15) for the complete list.

## Install

| File | What it is |
|---|---|
| `Achievement.Watcher.Setup.3.12.0.exe` | The Windows installer. An installed copy also updates itself. |
| `Achievement.Watcher.Portable.3.12.0.zip` | The same build with no installer: extract it anywhere, it keeps its settings, caches and logs in a `data` folder beside the executable. |
| `Achievement.Watcher.3.12.0.AppImage` | Linux (beta): make it executable and run it as is, it updates itself. Needs FUSE 2 (`libfuse2t64` on Ubuntu 24.04). |
| `.blockmap`, `latest.yml` and `latest-linux.yml` | Used by automatic updates, nothing to download by hand. |

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3120---2026-10-15) · [Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) · [Linux guide](https://shirowwww.github.io/Achievement-Watcher-Next/linux.html) · [Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
