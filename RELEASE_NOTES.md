# Achievement Watcher Next 3.12.8

Perfect games get a platinum look, the platinum can come with the base game as on PlayStation, clips can film the game alone, and nightly builds are one setting away.

## Highlights

- **Games at 100% stand out.** Their library tile wears a platinum halo, bar and trophy. By default the platinum now arrives once every base-game achievement is earned, DLC aside; **Settings > Notifications > Platinum requires** brings back the whole list.
- **Clips can film the game alone (#190)**, without the desktop or other windows, judder less while the GPU is busy, and can be saved one per achievement (#215).
- **Nightly builds.** **Settings > General > Update channel > Nightly** gets each change as soon as it lands. Going back to **Stable** offers the latest release at once.
- **Reset several games at once (#192)** with Ctrl+click or Shift+click in the library, then a right-click.
- **The rarity an achievement had when you earned it (#208)** shows under today's share of players.
- **Game Health does more**: a "Playtime only" state (#197), a warning when the watched executable is not the one you chose (#193), missing stat definitions (#194), and a step that completes the emulator settings without touching the rest (#196).

## Also new

- **New games and ports**: inFAMOUS Second Son and First Light (#188), Dead Nation (#188), Ratchet & Clank: A Crack in Time and Into the Nexus (#210), Bully with xowny's Achievements mod, RUNE's Epic emulator releases (#214), and Razor1911's GTA IV, which Game Health can switch to the Goldberg emulator.
- **The Playnite extension works while AW Next is closed** (extension 1.2.0), from the last scan.
- **Every change AW Next makes in a game folder can be undone**, and a failed fix puts the folder back (#195).
- **Lighter in the background**: the window reuses the library, the scanner and the Steam connection stop when idle, and the Watchdog costs less while a game runs.
- **Fixes:** your controller is left alone when navigation by controller is off (#217), no CPU core stays busy after a SteamDB lookup (#191), a broken unlock date no longer breaks a tile (#212), the Ubisoft fix leaves Watch_Dogs alone (#213), emulated Steam games stay with official Steam games off (#211), the 100% popup takes its screenshot (#204), EA games cracked with anadius' emulator show their achievements without setup, Uncharted 1 and 3 count their trophies again, and a Proton game run for the first time records its achievements on Linux.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3128---2026-11-22) for the complete list.

## Install

| File | What it is |
|---|---|
| `Achievement.Watcher.Setup.3.12.8.exe` | The Windows installer. An installed copy also updates itself. |
| `Achievement.Watcher.Portable.3.12.8.zip` | The same build with no installer: extract it anywhere, it keeps its settings, caches and logs in a `data` folder beside the executable. |
| `Achievement.Watcher.3.12.8.AppImage` | Linux (beta): make it executable and run it as is, it updates itself. Needs FUSE 2 (`libfuse2t64` on Ubuntu 24.04). |
| `aw-next-millennium.zip` | The Steam plugin for Millennium: extract it into `<Steam>\millennium\plugins\`. |
| `AwNextAchievements_*.pext` | The Playnite extension: open it and Playnite installs it. |
| `.blockmap`, `latest.yml` and `latest-linux.yml` | Used by automatic updates, nothing to download by hand. |

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3128---2026-11-22) · [Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) · [Linux guide](https://shirowwww.github.io/Achievement-Watcher-Next/linux.html) · [Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
