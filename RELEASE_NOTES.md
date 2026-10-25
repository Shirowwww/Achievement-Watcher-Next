# Achievement Watcher Next 3.12.3

A full-screen editor for your notification presets, a way to re-lock a single achievement, and a round of fixes for repacks, older games, Game Health and imported SAN themes.

## Highlights

- **A full-screen editor for your presets.** "Editor" in the preset designer opens every setting around a large preview: move or resize the card's parts, add text, pictures and shapes, give each line of the card its own colour, font and size, and stack everything in any order. On a customised bundled preset you can now move or remove the Epic, PlayStation, Xbox and Steam logos, and add the accent bar.
- **Re-lock a single achievement.** Right-click an unlocked achievement: the emulator's save is backed up and edited so the game can unlock it again. Works with most emulator saves, from Goldberg and GSE to CODEX, RUNE, OnlineFix, TENOKE, RPCS3, ShadPS4 and Xenia.
- **Denuvo repacks start again after the Ubisoft fix.** Their Uplay settings are carried over instead of being replaced (Assassin's Creed Odyssey hung at launch).
- **Older games survive the emulator switch.** Games from before mid-2016 get their list of Steam interfaces, or the switch is refused with an explanation.
- **Reset achievements resets everything**, including RAZOR1911, CreamAPI, XLLN, GreenLuma and the Goldberg and GSE progress counters.
- **Imported SAN themes look as they did in SAN**, down to the text size, the screen margins and the 100% popup.
- **Game Health reads more setups right**: games run by the Steam client and games an online fix runs as Spacewar.
- **Smaller things:** an empty library can detect your games, the stats panel animates its figures, no more empty "Epic Games Store" windows in Alt+Tab, and Hyprland and COSMIC behave on Linux.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3123---2026-10-25) for the complete list.

## Install

| File | What it is |
|---|---|
| `Achievement.Watcher.Setup.3.12.3.exe` | The Windows installer. An installed copy also updates itself. |
| `Achievement.Watcher.Portable.3.12.3.zip` | The same build with no installer: extract it anywhere, it keeps its settings, caches and logs in a `data` folder beside the executable. |
| `Achievement.Watcher.3.12.3.AppImage` | Linux (beta): make it executable and run it as is, it updates itself. Needs FUSE 2 (`libfuse2t64` on Ubuntu 24.04). |
| `.blockmap`, `latest.yml` and `latest-linux.yml` | Used by automatic updates, nothing to download by hand. |

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3123---2026-10-25) · [Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) · [Linux guide](https://shirowwww.github.io/Achievement-Watcher-Next/linux.html) · [Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
