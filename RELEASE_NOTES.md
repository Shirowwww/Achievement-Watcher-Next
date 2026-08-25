# Achievement Watcher Next 3.10.1

Every theme can be edited and saved as your own, the app says what it is doing while it updates
itself, and the websocket broadcast listens on the local machine again.

## Highlights

- **The websocket broadcast is back on `127.0.0.1`.** The Settings row is labelled
  "Websocket @localhost:8082" and the guides promised the local machine, but the listener was given
  no host at all - which in Node means every interface. Anything on the same network that Windows
  Firewall let through could read the feed, unauthenticated, and it carries game and achievement
  names. If you deliberately served it to another machine, that now needs an explicit host.
- **Every theme is editable.** Selecting any theme - a built-in palette, one you saved, one somebody
  sent you - opens the editor on its colours. **Save theme** beside the name field keeps it: the same
  name updates that theme, a new one creates a second and leaves the first alone. An imported theme
  also survives a restart now; the settings validator did not know about imported themes and reset
  the choice to Steam Blue on every start.
- **Updating no longer looks like a crash.** A chip beside the Watchdog indicator shows the download
  percentage - with a Cancel while the file is downloading - then that the update is ready, then that
  it is installing. The installer runs with its own progress window instead of nothing at all.
- **Smart Find reads your launchers.** It now also offers the folder the Epic manifests, the GOG
  Galaxy and Ubisoft Connect registry entries and the Xbox games pointer already name, so a library
  called `D:\Epic Games` is found without scanning. Nothing is added without your approval.
- **Emulator data folders are resolved instead of assumed.** RPCS3 follows `vfs.yml`, a portable
  install and `RPCS3_CONFIG_DIR`; ShadPS4 is recognised from the emulator, its `user` folder or
  `game_data`; Xenia follows `storage_root` / `content_root`.
- **HDR souvenirs no longer blow out**, and are written about 1.6x faster. The dot beside a game's
  name now reports its health rather than whether one file is on disk.
- **Translation fixes across nineteen languages**, and the site is fully translated into nine -
  Italian, Polish and Japanese joining the six it already had.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3101---2026-08-25)
for the complete list.

## Install

Download `Achievement.Watcher.Setup.3.10.1.exe` from the
[v3.10.1 release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.10.1), or let
the app update itself.

The `.blockmap` and `latest.yml` assets are used by automatic updates.

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3101---2026-08-25) ·
[Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) ·
[Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
