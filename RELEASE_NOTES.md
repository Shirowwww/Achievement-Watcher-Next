# Achievement Watcher Next 3.12.6

Every game now has a page of its own, an unlocked achievement opens the screenshot and clip taken with it, and any repair Game Health made to a game can be undone.

## Highlights

- **A page for every game.** Clicking a game opens an overview with its trailers playing behind the title, Play and Achievements one click away, the store's description, screenshots, ratings, guides and your souvenirs, in your language where the store has it.
- **Screenshots and clips beside each achievement.** Right-click an unlocked achievement, or use the two buttons in the in-game overlay, to see the picture or play the clip taken when it unlocked.
- **Pin an achievement to the top of its list**, in the app and in the overlay, until it unlocks.
- **More recompiled ports, found on their own.** ReCasted (Ratchet & Clank, #182), Odin Sphere Leifthrasir, 13 Sentinels: Aegis Rim, Super Mario All-Stars, Road Rash 64, F-Zero X, Pikmin 1 and 2 and 25 more Xbox 360 ports. A port in one of your game libraries is picked up at every scan, before it has saved anything.
- **Undo the last repair.** Game Health puts back the files a repair changed and removes the ones it created, up to the last ten repairs per game.

## Also new

- **Library tiles lean toward the pointer** and the window takes on the hovered cover's colours. Settings > Appearance > Library tiles sets both.
- **The right executable, more often.** AW Next skips files that are not real programs and folders such as Crack, and **Find all** in Settings > Folders looks for every missing one.
- **Game Health reads ColdClient setups** and can start the game through the loader. It also spots the Epic emulator's sample AppId and leaves the Steam file of VOICES38 releases alone.
- **The Millennium plugin and the Playnite extension update themselves**, and Playnite themes such as Harmony or Selene can show AW Next's counts.
- **Clips up to 60 seconds**, with a slider for how much is kept before the unlock (#170).
- **Update notes in your language**, a finer overlay opacity, and a colour picker inside the overlay.
- **Hide to the tray when a game starts**, a new switch in Settings > General.
- **Fixes:** a community crack is applied only to the game it was made for, cracks that Unity games load from their Plugins folder are read there, games started from a Steam shortcut keep their play time, `.bat` and `.cmd` games start again, Dead Space 2 with MarkerPatch lists its achievements (#171), notification sounds play with the popup, and the Playnite window works in Fullscreen mode.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3126---2026-11-11) for the complete list.

## Install

| File | What it is |
|---|---|
| `Achievement.Watcher.Setup.3.12.6.exe` | The Windows installer. An installed copy also updates itself. |
| `Achievement.Watcher.Portable.3.12.6.zip` | The same build with no installer: extract it anywhere, it keeps its settings, caches and logs in a `data` folder beside the executable. |
| `Achievement.Watcher.3.12.6.AppImage` | Linux (beta): make it executable and run it as is, it updates itself. Needs FUSE 2 (`libfuse2t64` on Ubuntu 24.04). |
| `aw-next-millennium.zip` | The Steam plugin for Millennium: extract it into `<Steam>\millennium\plugins\`. |
| `AwNextAchievements_*.pext` | The Playnite extension: open it and Playnite installs it. |
| `.blockmap`, `latest.yml` and `latest-linux.yml` | Used by automatic updates, nothing to download by hand. |

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3126---2026-11-11) · [Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) · [Linux guide](https://shirowwww.github.io/Achievement-Watcher-Next/linux.html) · [Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
