# Achievement Watcher Next 3.12.5

Your achievements inside Steam and Playnite, recompiled PC ports and PS3Recomp games as new sources, trophies read straight from a jailbroken PS3 or PS4, and steps you can tick off under a long achievement.

## Steam and Playnite

- **A Millennium plugin for the Steam library.** A non-Steam shortcut AW Next recognises gets Steam's own Achievements section, play bar counter, full list and Big Picture tab, updated as unlocks come in. Download `aw-next-millennium.zip` below.
- **A Playnite extension.** Right-click a game in Playnite and open AW Next achievements, or use a theme that places AW Next's panels in the game's details. Download the `.pext` below.

## New sources

- **Recompiled PC ports:** Dusklight (Twilight Princess), Ghostship (Super Mario 64), DKR-R (Diddy Kong Racing), Super Mario Bros. Remastered and SMS Launcher (Super Mario Sunshine and Super Mario Eclipse), on Windows and Linux.
- **PS3Recomp ports** show their trophies, with PlayStation's own rarity.
- **Trophies from a PS3 or PS4 over FTP**, for a jailbroken console when signing in to PSN is not an option. Nothing is written to the console.

## Also new

- **Steps under an achievement.** Split a long achievement into steps you write yourself and tick off, in the app and in the in-game overlay, and share the list as a file.
- **Several achievements at once.** Ctrl+click or Shift+click achievements, then unlock, clear or re-lock them together.
- **Ignore a Game Health warning** for one game and one finding.
- **Locked achievements are greyed out** for every source with a single picture per achievement, and an achievement with no picture shows the game's icon.
- **Fixes:** counter achievements unlock under GBE Fork, a scan no longer swaps a cracked Ubisoft game's own loader, Game Health leaves Denuvo games' Steam dll alone, one game without its list no longer rescans the whole library, Steam unlocks notify on a PC whose clock is off, and games tied in a sort line up by name.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3125---2026-11-03) for the complete list.

## Install

| File | What it is |
|---|---|
| `Achievement.Watcher.Setup.3.12.5.exe` | The Windows installer. An installed copy also updates itself. |
| `Achievement.Watcher.Portable.3.12.5.zip` | The same build with no installer: extract it anywhere, it keeps its settings, caches and logs in a `data` folder beside the executable. |
| `Achievement.Watcher.3.12.5.AppImage` | Linux (beta): make it executable and run it as is, it updates itself. Needs FUSE 2 (`libfuse2t64` on Ubuntu 24.04). |
| `aw-next-millennium.zip` | The Steam plugin for Millennium: extract it into `<Steam>\millennium\plugins\`. |
| `AwNextAchievements_*.pext` | The Playnite extension: open it and Playnite installs it. |
| `.blockmap`, `latest.yml` and `latest-linux.yml` | Used by automatic updates, nothing to download by hand. |

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3125---2026-11-03) · [Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) · [Linux guide](https://shirowwww.github.io/Achievement-Watcher-Next/linux.html) · [Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
