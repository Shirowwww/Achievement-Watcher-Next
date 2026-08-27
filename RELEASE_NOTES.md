# Achievement Watcher Next 3.10.1

Ubisoft games from before 2019 are supported at last, Games for Windows LIVE titles report their
achievements, the first scan after a launch is as fast as the ones after it, and the websocket
broadcast listens on the local machine again.

## Highlights

- **Many more Ubisoft games can be set up.** Titles from before 2019 call the older Uplay R1 API and
  can never load an R2 loader, so Assassin's Creed Origins, Odyssey, Unity, Rogue and Black Flag, the
  Far Cry and Watch Dogs entries of that era and the South Park games could not be repaired at all.
  AW Next now reads which generation a game asks for, ships the matching loader and watches its save
  folder. Titles whose achievement names carry no objective number - Brawlhalla, The Crew 2, ZOMBI,
  Champions of Anteria, Roller Champions and the Ubisoft-published indies - are matched by title
  against Ubisoft's own public achievement data instead of being refused outright.
- **Games for Windows LIVE games report their achievements.** A GFWL title running XLiveLessNess kept
  its unlocks in a profile AW Next could not read, so the whole era was invisible. Those profiles are
  now read, and the achievement list, its texts and its icons come out of the game's own executable,
  so nothing has to be downloaded. FINAL FANTASY VII (2013), which predates Steamworks achievements
  and keeps its 36 unlocks in a bitfield beside its saves, is read too.
- **The first scan after a launch is as fast as the ones after it.** Where a game's schema sits on
  disk and which AppID a title resolves to were remembered in memory only and paid for again on every
  start; both are now kept on disk. The Steam ownership call gives up after fifteen seconds rather
  than holding the library forever.
- **AW Next costs less while it sits in the tray.** Working sets are emptied on the way into idle, the
  overlay hotkey no longer keeps a PowerShell host alive for the session, and the background library
  scan holds while a game is running.
- **A connected Steam account stays connected.** The access token Steam hands out lasts a day, so
  Settings reported the account disconnected every morning and asked for the password again. A new
  token is now minted silently from the refresh token, with no window and no sign-in.
- **The websocket broadcast is back on `127.0.0.1`.** The Settings row is labelled
  `Websocket @localhost:8082` and the guides promised the local machine, but the listener was given
  no host at all - which in Node means every interface. Anything on the same network that Windows
  Firewall let through could read the feed, unauthenticated, and it carries game and achievement
  names. If you deliberately served it to another machine, that now needs an explicit host.
- **Every theme is editable.** Selecting any theme - a built-in palette, one you saved, one somebody
  sent you - opens the editor on its colours. **Save theme** beside the name field keeps it: the same
  name updates that theme, a new one creates a second and leaves the first alone. An imported theme
  also survives a restart now.
- **Updating no longer looks like a crash.** A chip beside the Watchdog indicator shows the download
  percentage - with a Cancel while the file is downloading - then that the update is ready, then that
  it is installing. The installer runs with its own progress window instead of nothing at all.
- **Smart Find reads your launchers**, and emulator data folders are resolved instead of assumed:
  RPCS3 follows `vfs.yml`, ShadPS4 its `user` folder, Xenia its `storage_root`. **HDR souvenirs no
  longer blow out**, and are written about 1.6x faster.
- **Translation fixes across nineteen languages**, and the site is fully translated into nine -
  Italian, Polish and Japanese joining the six it already had.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3101---2026-08-27)
for the complete list.

## Install

Download `Achievement.Watcher.Setup.3.10.1.exe` from the
[v3.10.1 release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.10.1), or let
the app update itself.

The `.blockmap` and `latest.yml` assets are used by automatic updates.

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3101---2026-08-27) ·
[Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) ·
[Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
