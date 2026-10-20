# Architecture

AW Next is an Electron application for Windows with a separate background monitor; a Linux port is in progress (see [Windows and Linux](#windows-and-linux)). This page describes the boundaries that matter when changing the project.

## Runtime overview

```text
Electron main process
├── creates the tray, windows and IPC handlers
├── owns updates, browser-backed lookups and native app integration
├── starts the renderer library UI
└── starts the Watchdog with ELECTRON_RUN_AS_NODE
    ├── watches processes and achievement files
    ├── tracks playtime
    └── dispatches desktop notifications and overlay events
```

Electron's bundled Node runtime runs both processes. The installed app does not ship a second Node or NW.js executable.

## Windows and Linux

AW Next ships for Windows (installer and portable ZIP) and for Linux (an x64 AppImage). Linux code
never changes what Windows does: it sits behind `process.platform` or behind the host layer below.
On Linux AW Next is a native app. It never starts Wine; Windows games running under Wine or Proton
are found through their files inside each prefix and through `/proc`.

### Hosts

A host is a place where Windows-style user folders live. On Windows there is one, this machine, read
exactly as before. On Linux there is a native host on the XDG folders, where Linux builds of the
emulators write, plus one host per Wine, Proton, Lutris, Heroic and Bottles prefix and user
(`app/util/winHosts.js`, prefixes found by `winePrefixes.js`). Every source reads through them, so
the same parser serves both systems:

| Need | Call |
|---|---|
| The hosts, from the app (Windows registry wired in) | `appHosts()` in `app/util/appHosts.js` |
| One root per host | `hostPath(host, 'APPDATA', ...)`, or `hostPaths('APPDATA', ...)` for all of them |
| A launcher installed once, in whichever host holds it | `firstExisting(hostPaths(...))` |
| The hosts a game folder belongs to (its prefix, else all) | `hostsFor(gameDir)` |
| The host to write a game's files into | `hostFor(gameDir, found)` |
| Documents | `documentsFolders()`, or `documentsFor(gameDir)` for one game |
| Registry | `host.regValue(hive, key, name)`, `host.regSubkeys`, `host.regValueNames` (a prefix's `user.reg` and `system.reg`, `app/util/wineRegistry.js`) |
| A Windows path read from the registry or a config file | `host.localPath(winPath)` |
| A path a Windows program will read (the Uplay R2 redirection) | `host.windowsPath(localPath)` |

Off Windows, `app/util/reg.js` reads nothing, refuses writes and never spawns `reg.exe`. Path
comparisons go through `winHosts.pathKey()`, because Windows filesystems ignore case and Linux ones
do not: a folder name must be spelled the same way in the app and in the Watchdog.

### What differs per system

| Concern | Windows | Linux |
|---|---|---|
| Running processes | Win32 process APIs through koffi, `win-tasklist` as a fallback (`watchdog/util/processSnapshot.js`) | `/proc`, a Wine game named by the `.exe` in its command line (`watchdog/util/procSnapshot.js`) |
| Steam client | registry and install folder | `registry.vdf`, app manifests and `steam.pid` of the native, Flatpak or Snap client (`app/util/steamLinux.js`) |
| Other launchers | their registry and config files | the same files inside each prefix, plus Heroic, legendary, Lutris and Bottles (`app/util/linuxLaunchers.js`) |
| Starting a game | the executable or its store URL | the launcher that owns it (`steam://`, `lutris:`, `heroic://`) through `xdg-open`, never Wine (`app/util/linuxGameLaunch.js`) |
| Playtime store | `HKCU\Software\Achievement Watcher Next\Playtime` | `cfg/playtime.json` (`app/util/playtimeFile.js`) |
| Toast | the Watchdog builds the toast XML with powertoast and asks the app, which posts it with an Electron `Notification` (`toastXml`) under its own AppUserModelID; another app id (a user override, the Xbox fallback) still goes through powertoast's PowerShell script (`watchdog/util/powertoast.js`) | the Watchdog asks the app, which shows an Electron `Notification` through the freedesktop service (`app/electron/desktopNotification.js`); skipped when no notification daemon answers |
| Popups and overlay over games | always-on-top windows | the app runs through XWayland under Wayland (`app/util/linuxSession.js`); popups and the overlay never take focus (unless "focus overlay" is set); `--toggle-overlay` toggles it from a desktop shortcut. In Steam's Game Mode (gamescope) they carry `GAMESCOPE_EXTERNAL_OVERLAY`, drawn from the screen's top-left corner, and every notification goes to them since no system notification shows there (`app/util/gamescope.js`) |
| Notification sound | a PowerShell `MediaPlayer` | `pw-play`, then `paplay` |
| Screenshots and clips | the Windows capture helper | Electron or the Screenshot portal; clips from `gpu-screen-recorder` or an opt-in software recorder (`app/electron/souvenirLinux.js`, `clipRecorder.js`) |
| Controller rumble | XInput | kernel force feedback on `/dev/input/event*` (`watchdog/util/evdevRumble.js`) |
| Controller in the overlay | XInput or GameInput through koffi; the overlay reads the pad with the Gamepad API | the pad's event device through koffi (`watchdog/console/controller/evdev-controller-backend.js`); the Watchdog sends the pad's state to the overlay, which is override-redirect so the game keeps the focus |
| Watchdog presence pipe | named pipe | Unix socket in `XDG_RUNTIME_DIR` (`app/util/watchdogPipe.js`) |
| Start with the session | `Run` registry value | XDG autostart entry (`app/util/linuxAutostart.js`); where a gamescope session is installed (Steam Deck, SteamOS), a systemd user unit instead, and AW started without a display takes the Steam client's (`app/util/linuxSession.js`) |
| `achievement-watcher://` links | registered at startup (`setAsDefaultProtocolClient`) | a desktop entry AW writes itself (`app/util/linuxDesktopEntry.js`) |
| Tray | notification area | StatusNotifierItem; without a host the window minimizes instead (`app/util/linuxTrayHost.js`) |
| Stored secrets key | DPAPI through `safeStorage` | the desktop keyring through `safeStorage`, with a one-time warning when none answers |
| Updates | NSIS installer, Authenticode-pinned (`latest.yml`) | the AppImage replaced in place, checked by SHA-512 (`latest-linux.yml`) |
| User data | `%APPDATA%\Achievement Watcher Next` | `~/.config/Achievement Watcher Next` |

## Main directories

| Path | Responsibility |
|---|---|
| `app/electron/` | Main process, window lifecycle, IPC, update flow and browser-backed services |
| `app/app.js` | Renderer entry point and game-library interactions |
| `app/parser/` | Platform parsers, discovery, schema lookup and emulator tools |
| `app/ui/` | Settings, game view, sorting and renderer-side UI behavior |
| `app/locale/` | UI language files and DOM text binding |
| `app/view/` | HTML views for the application and overlay |
| `app/presets/` | Bundled notification preset assets |
| `watchdog/` | Background monitoring, notifications and playtime |
| `test/` | App, parser, discovery and locale tests |
| `watchdog/test/` | Background-monitor and notification tests |

## Data flow

1. Enabled source parsers scan launcher data, configured folders and known save locations.
2. `app/parser/achievements.js` normalizes results into the library's shared game shape.
3. Platform-aware IDs prevent unrelated stores from sharing the same cache key.
4. Metadata and artwork are resolved from local caches first where possible, then from configured online fallbacks.
5. The Watchdog establishes a baseline for each active source and watches for later changes.
6. A new unlock is normalized, de-duplicated and sent to the notification transports one planner
   selects for it (`watchdog/notification/transportPolicy.js`).

Startup must not replay existing unlocks as new events. Watchers should baseline current state before emitting notifications.

### What a scan is allowed to cost

The library paints from `cache/library_snapshot` before discovery starts, so nothing below is on the path
to the first frame. What the scan itself may spend is bounded by three rules:

- **Read a folder once per pass.** `app/util/dirCache.js` memoizes directory listings for the length of one
  discovery, because the emulator walk, the nested-appid search and the executable search all cross
  the same trees. The memo is only open during discovery; a repair must always see the real folder.
- **Do not re-walk an install folder that has not changed.** `app/util/exeCandidateCache.js` remembers the
  executable candidates of a game folder, keyed by that folder's own timestamps and stored under
  `cache/discovery/`. Install trees are far larger than anything else a scan reads, and the answer only
  changes when the game does.
- **Do not scan at all while a game is running.** The background pass loads the achievement engine
  into the tray process and walks the library, which is worth nothing to a user who is playing: it
  holds until the game exits and then runs, rather than waiting out the rest of its own cadence. A
  ceiling on held passes keeps a background process mistaken for a game from suspending it silently.
- **Prove the disk is unchanged before walking it again.** The background new-install poll compares
  the timestamps of the folders the last discovery read (`app/util/dirFingerprint.js`) and skips the pass
  when none moved. That cannot see database or registry sources, so a full pass still runs on a
  slower cadence.

Per-game metadata is loaded through a small worker pool, never a whole-library `Promise.all`, and a host
that has proven itself unreachable is not asked again for the rest of the scan
(`app/util/networkCircuit.js`) - including through the browser fallback, which is the most expensive
path there is.

## Parser expectations

Parsers normally expose a `scan` function and an `initDebug` hook. Their results are normalized by the aggregator rather than rendered directly.

When adding a source:

- keep the source's native identity instead of forcing every item into a Steam AppID;
- distinguish installed state from leftover achievement data;
- return partial data when safe instead of blacklisting a game after one transient failure;
- cache network results with a bounded lifetime;
- make missing optional files a normal empty state;
- keep watcher and parser rules aligned so the library and live notifications observe the same files.

### Wiring a save-file emulator

An emulator that writes one save folder per Steam appid under a user profile (the Goldberg family)
is read twice: by the app for the library, and by the Watchdog for live notifications. Each side
has its own list, so a new one touches both:

1. **The reader.** Put the format in a small module of its own in `app/parser/` that requires
   nothing from the rest of the app, so the Watchdog can load it too. List it in `asarUnpack` in
   `app/electron-builder.yml`; `test/core/sharedAppModules.test.js` fails otherwise.
2. **Library roots.** Add the folder to `addHostRoots` in `app/parser/saveRoots.js`, as
   `envPath('APPDATA', '<Folder>')`: it is then probed on every host, this machine on Windows and
   every Wine prefix on Linux.
3. **Library label and file.** `steam.scan()` in `app/parser/steam.js` names the source from the
   folder path; a folder it does not recognise shows as `Steam-emulator`.
   `getAchievementsFromFile()` in the same file lists the save file names it reads and turns each
   format into the shared `{ Achieved, UnlockTime }` entries.
4. **Watchdog roots.** Add an entry to `builtinRoots(host)` in `watchdog/monitor.js`:
   `{ dir: at('APPDATA', '<Folder>'), options: { recursive, filter, file } }`. `filter` is a
   regular expression the changed path must match (usually the numeric appid folder), and `file`
   lists the file names that count; the appid then comes from the folder name. `statsSibling` reads
   `achievements.ini` when only `stats.ini` changed, and `disableCheckIfProcessIsRunning` notifies
   even when the game's process is not seen.
5. **Watchdog reader.** `parse()` in `watchdog/monitor.js` picks the reader by file name; add the
   new name there too.
6. **Tests.** One test of the reader that runs on both systems, a Watchdog test that the root is
   built for every host, and a Linux test that finds a save inside a fake Wine prefix
   (`withWinePrefix`, see [test/README.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/test/README.md#windows-and-linux)).

A source with its own identity (a store, a console emulator) is a parser of its own registered in
`app/parser/achievements.js` and a watcher of its own in `watchdog/console/` or `watchdog.js`;
the existing ones (`xlln.js`, `rpcs3.js`, `shadps4.js` and their watchers) are the models.

Current integrations include Steam (legit client and emulator saves), Goldberg/GBE-compatible saves, Goldberg SocialClub, Uplay R2, GOG, Epic, Ubisoft, EA Desktop, Xbox PC, RetroAchievements, GreenLuma, LumaPlay, SmartSteamEmu, RPCS3, ShadPS4, KytyPS5, Xenia, Xbox 360 recompilations, PC ports of PS4 games (PS4 Recomp: the dump's trophy set, the port's `trophies.log` and `last_run.log`, or its own `trophies.tsv` and `unlocked.txt`), XLiveLessNess (Games for Windows LIVE) and FINAL FANTASY VII (2013). Some platforms have both a legacy mapped-save parser and a newer official/local parser.

## Important components

| File | Role |
|---|---|
| `app/parser/achievements.js` | Aggregation, folder discovery and background emulator setup orchestration |
| `app/parser/installState.js` | Evidence-based installed-state decisions |
| `app/parser/gameIndex.js` | Persistent game identity and install metadata |
| `app/parser/steam.js` | Steam schema, metadata and compatible-save parsing |
| `app/parser/steamAppInfo.js` | Steam's local `appcache/appinfo.vdf`: per-appid name and type, read offline and keyless |
| `app/parser/goldberg.js` | Goldberg/GBE detection, diagnosis, repair and backup |
| `app/parser/uplayR2.js` | Ubisoft-to-Steam mapping and Uplay R2 schema setup |
| `app/parser/saveRoots.js` | Known achievement-data and game-library folder names, probed per drive and profile |
| `app/parser/launcherLibraries.js` | Library roots read from launcher configuration already on disk (Epic manifests, GOG/Ubisoft registry, `.GamingRoot`) |
| `app/parser/rpcs3Layout.js` | RPCS3 configuration root and `vfs.yml` `dev_hdd0` resolution |
| `app/parser/xlln.js` | XLiveLessNess installs: discovery, per-profile unlock records and the schema read from the game's own executable (`xllnSpa.js` parses its SPAFILE resource) |
| `app/parser/x360Recomp.js` | Recompiled Xbox 360 games: the ReXGlue `.toml`, `.tsv`, `SaveData\Achievements.json` and Unleashed `ACH-DATA` unlock lists; schema from the game's `default.xex`, dbox.tools as a fallback |
| `app/parser/x360Ports.js` | Known recompilation ports by executable: title id, save layout and folder, so a game is listed (unlock source pending) before its first unlock; `renut.cfg` |
| `app/parser/reblueBonus.js` | re:Blue's own achievements (ids from 0x10001): their texts, and their pictures read from the records `reblue.exe` embeds them under |
| `app/parser/x360Launcher.js` | A literal `--user_data_root` in a `.bat`/`.cmd`/`.ps1` launcher beside a port, read without running it |
| `app/parser/xex.js` | Xbox 360 executables: title id, AES and basic/LZX unpacking (`app/util/lzx.js`) with each compressed block's SHA-1 checked, and the SPA resource inside, extracted in a time-limited worker (`xexWorker.js`: a thread, or a child process from the renderer) |
| `app/parser/ff7.js` | FINAL FANTASY VII (2013): the 8-byte `achievement.dat` bitfield, paired with Steam api-names |
| `app/parser/retroAchievements.js` | RetroAchievements Web API: account, library import and the `steam_cache/retroachievements` cache, shared with `watchdog/console/retroAchievementsWatch.js`, which polls recent unlocks every 8 s while a known emulator runs and every 5 min otherwise |
| `app/electron/init.js` | Main lifecycle, updater, browser helpers and overlay window |
| `app/util/updateStatus.js` | Updater state machine shared by the main process, the title bar and Settings |
| `watchdog/watchdog.js` | Background entry point and service coordination |
| `watchdog/monitor.js` | Process and filesystem monitoring |
| `watchdog/notification/toaster.js` | Notification delivery: one plan per event, single owner of the fallback |
| `watchdog/notification/transportPolicy.js` | Which transport delivers a notification, from observable signals |
| `watchdog/playtime/monitor.js` | Process-based playtime sessions |
| `app/util/gameHealth.js` | Per-game health derivation: state, explanation, checks and repairs |
| `app/util/interfaceMode.js` | Simple / Advanced policy: which tabs, rows and health checks each mode shows |

## Local data

Packaged user data is stored below `%APPDATA%\Achievement Watcher Next` (`~/.config/Achievement Watcher Next` on Linux). AW Next owns a folder neither predecessor's uninstaller touches, and imports forward along the chain `Achievement Watcher` (1.6.8) → `Achievement Watcher 3.0` → `Achievement Watcher Next` on first launch, newest source first. Each hop is one-way and non-destructive: it never deletes a source, never overwrites a file already present in the destination, and stops as soon as the destination holds AW configuration (`app/util/migrateUserData.js`):

| Directory | Contents |
|---|---|
| `cfg/` | Settings, game index, executable mappings and exclusions |
| `logs/` | Main, renderer, parser and Watchdog diagnostics |
| `cache/` and `steam_cache/` | Downloaded tools, metadata and artwork caches |
| `Media/` | Legacy seed for custom Windows toast sounds (old registry entries point here; kept for upgrades) |
| `sounds/`, `presets/` | Imported notification sounds and generated user presets |

Settings are stored in `cfg/options.ini`. Sensitive fields are encrypted before the file is written,
with the key itself held under Windows DPAPI through Electron's `safeStorage` rather than compiled
into the app (`app/util/appSecret.js`). Epic account tokens use a separate encrypted cache.

## UI and localization

The renderer is a long-lived HTML/JavaScript application. Some locale bindings still depend on DOM order, so changing settings markup can shift text onto the wrong control even when the JSON keys are correct. Update the view, `app/locale/loader.js` and every locale together, then run the full app suite.

The settings panel has two display modes, Simple and Advanced, stored as `[general] interfaceMode`
and decided by `app/util/interfaceMode.js`. The module is pure: it owns the list of Advanced-only
tabs, the `data-advanced` attribute that marks individual rows inside the tabs Simple keeps, and the
Game Health checks Simple leaves out. `app/ui/settings.js` applies it by toggling the `mode-hidden`
class - **never by removing markup**, because the positional locale bindings above would break.

The mode is a display setting: no parser, watcher or stored value changes with it, and an unset or
unrecognized value resolves to Advanced so an upgrade never hides a feature someone already used.
When adding a settings tab, put its `data-view` in one of the two lists in `interfaceMode.js`;
`test/ui/interfaceMode.test.js` fails on a tab that belongs to neither.

The Sources tab is the exception to the static rules. `hiddenOptionalSources()` decides per row from
live state: a niche source (`OPTIONAL_SOURCES`) is folded away only while it is still enabled *and*
no game in the library carries one of its `source` values. Switching it off or owning a game it
detected brings the row back, so Simple can never hide the only control that would explain a missing
game. Those rows therefore carry no `data-advanced` marker - adding one would defeat the rule.

English is the reference locale. `app/locale/uiLanguages.js` only exposes languages that have a bundled JSON file, and the loader falls back to English at runtime.

## Packaging boundaries

`app/electron-builder.yml` packages the desktop app and copies the Watchdog beside it. Notification presets, sounds and shared Steam-schema mapper modules are unpacked from ASAR because overlay windows and the external Watchdog load them from disk.

A module the Watchdog loads from the app (the host layer, the Linux Steam reader, the presence pipe
name, the playtime store) must be listed in `asarUnpack` too. On Linux, `app/build/afterPack.js`
removes the Windows helpers and other platforms' binaries from the AppImage and keeps `7za`
executable.

`npm run build` and `npm run build:linux` prune Watchdog development dependencies before packaging. Restore them after a build before returning to development. See [BUILD.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) and the [release workflow](RELEASE_WORKFLOW.md).

## Change checklist

When changing a parser or watcher, verify:

- discovery and installed-state behavior;
- initial baseline versus a real new unlock;
- duplicate suppression;
- cache identity and platform namespacing;
- missing/offline data behavior;
- logs and user-facing diagnostics;
- both app and Watchdog tests when the boundary crosses processes;
- Windows unchanged, and the Linux side through every host (a Wine prefix as well as the native
  folders) when the change reads profile folders, the registry, processes or notifications.

---

**Next:** [Build guide](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) - running from source, packaging and the native-module
gotchas · [Contributing](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) · [Release workflow](RELEASE_WORKFLOW.md).

<div align="center">

[← Documentation](README.md) · [Build guide](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>