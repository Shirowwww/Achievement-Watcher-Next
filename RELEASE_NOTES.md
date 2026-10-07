# Achievement Watcher Next 3.11.1

Video clips of each unlock, notifications for the games Steam runs, quieter progress popups, and a round of fixes from your reports: EA covers, Steam games never played on this PC, Steam shortcuts, screenshots and antivirus detections.

## Highlights

- **Video clips of each unlock, like a console's trophy video.** Turn on Settings > Notification > Video clip on unlock and every achievement is saved as an MP4 with the unlock in the middle. Length, format (H.264, HEVC or AV1), resolution, frame rate, quality, sound and folder are yours to pick. The recording runs only while a game does, stays on the graphics card's video encoder, and tone-maps HDR games like HDR screenshots.
- **Notifications for games Steam runs (#91).** Owned games and games added through SteamTools, LuaTools or GreenLuma can now announce their unlocks through AW Next too, with Settings > Notification > Steam client games. Off by default, since Steam shows its own.
- **Progress popups out of the way of unlocks (#106).** Give the "+1" popups of counter achievements their own position and scale, or show them only every 10, 25 or 50% of the goal.
- **Your own background on a game's page.** Right-click a game, then Cover > Choose background image.
- **Patched and recompiled games are found on their own**, through Steam's install record and by Smart find, and Settings now accepts their folders.
- **EA app games get the right cover (#105).** They were looked up on Steam under EA's own number; they now borrow the cover of their Steam release.
- **Steam games never played on this PC no longer show 0% (#98)** with an account connected: their unlocks are read from your public Steam profile.
- **Fewer antivirus reactions.** Screenshots no longer compile a capture program into `%TEMP%`, and nothing compiles code through PowerShell any more. These are what Kaspersky, ESET and Rising reacted to.
- **Screenshot souvenirs work again with a space in the Windows user name (#107).**
- **More fixes:** a game started from a Steam shortcut keeps its unlocks, Little Nightmares III with OnlineFix's Friend's Pass reads Steam's unlocks, MadnessPatch notifies live in the installed app, and Game Health flags a crack that records nothing after an hour of play.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3111---2026-10-07) for the complete list.

## Install

| File | What it is |
|---|---|
| `Achievement.Watcher.Setup.3.11.1.exe` | The installer. An installed copy also updates itself. |
| `Achievement.Watcher.Portable.3.11.1.zip` | The same build with no installer: extract it anywhere, it keeps its settings, caches and logs in a `data` folder beside the executable. |
| `.blockmap` and `latest.yml` | Used by automatic updates, nothing to download by hand. |

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3111---2026-10-07) · [Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) · [Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
