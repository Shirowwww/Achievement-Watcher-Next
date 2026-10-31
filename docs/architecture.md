# Architecture

AW Next is an Electron application for Windows and Linux (beta) with a separate background monitor.
This page describes the boundaries that matter when changing the project.

## Runtime overview

```text
Electron main process
├── creates the tray, windows and IPC handlers
├── owns updates, browser-backed lookups and native app integration
├── starts the renderer library UI
│   └── starts the scan host with ELECTRON_RUN_AS_NODE
│       └── discovers games and loads their achievements, off the window's thread
└── starts the Watchdog with ELECTRON_RUN_AS_NODE
    ├── watches processes and achievement files
    ├── tracks playtime
    └── dispatches desktop notifications and overlay events
```

Electron's bundled Node runs every process. The installed app ships no second Node or NW.js
executable.

### The scan host

A library scan reads thousands of folders and files synchronously, so it does not run in the window
that shows the library: `app/util/scanHost.js` forks `app/parser/scanWorker.js`, which loads
`parser/achievements.js` and answers `makeList`, `reloadGames`, the discovery checks, the launch-executable
reconcile and the folder walks behind the library's health dots. Games stream back to the window one
by one. Before discovery walks, the folders the previous scan read are listed in parallel
(`dirCache.prefetch`), since one synchronous listing at a time was most of a scan's time. The parsers there reach main-process handlers
through `app/util/ipcInvoke.js`, which relays through the window; scan-time events (an emulator set
up, a blocked download, the automatic-repair notice) are answered by the handlers registered on the
window's own `achievements.js`. The main process uses the same client for its background repair
pass while the window is closed, and stops that host after a minute of quiet. If the host cannot
start or dies, every call runs in the calling process instead, as before the host existed.

A process started this way has no `electron` module and no `@electron/remote`: code under
`app/parser` finds the app data folder through `app/util/userDataPath.js` and reaches the main
process only through `ipcInvoke.js`.

## Windows and Linux

AW Next ships for Windows (installer and portable ZIP) and Linux (an x64 AppImage). Linux code never
changes what Windows does: it sits behind `process.platform` or the host layer below. On Linux AW Next
is a native app and never starts Wine; Windows games under Wine or Proton are found through their
files inside each prefix and through `/proc`.

### Hosts

A host is a place where Windows-style user folders live. Windows has one, this machine. Linux has a
native host on the XDG folders, where Linux builds of the emulators write, plus one host per Wine,
Proton, Lutris, Heroic and Bottles prefix and user (`app/util/winHosts.js`, prefixes found by
`winePrefixes.js`). Every source reads through them, so one parser serves both systems:

| Need | Call |
|---|---|
| The hosts, from the app (Windows registry wired in) | `appHosts()` in `app/util/appHosts.js` |
| One root per host | `hostPath(host, 'APPDATA', ...)`, or `hostPaths('APPDATA', ...)` for all |
| A launcher installed once, in whichever host holds it | `firstExisting(hostPaths(...))` |
| The hosts a game folder belongs to (its prefix, else all) | `hostsFor(gameDir)` |
| The host to write a game's files into | `hostFor(gameDir, found)` |
| Documents | `documentsFolders()`, or `documentsFor(gameDir)` for one game |
| Registry | `host.regValue(hive, key, name)`, `host.regSubkeys`, `host.regValueNames` (a prefix's `user.reg` and `system.reg`, `app/util/wineRegistry.js`) |
| A Windows path read from the registry or a config file | `host.localPath(winPath)` |
| A path a Windows program will read (the Uplay R2 redirection) | `host.windowsPath(localPath)` |

Off Windows, `app/util/reg.js` reads nothing, refuses writes and never spawns `reg.exe`. Compare paths
with `winHosts.pathKey()`: Windows filesystems ignore case and Linux ones do not, so a folder name
must be spelled the same way in the app and the Watchdog.

### What differs per system

| Concern | Windows | Linux |
|---|---|---|
| Running processes | Win32 APIs through koffi, `win-tasklist` as fallback (`watchdog/util/processSnapshot.js`) | `/proc`; a Wine game is named by the `.exe` in its command line (`watchdog/util/procSnapshot.js`) |
| Steam client | registry and install folder | `registry.vdf`, app manifests and `steam.pid` of the native, Flatpak or Snap client (`app/util/steamLinux.js`) |
| Other launchers | their registry and config files | the same files inside each prefix, plus Heroic, legendary, Lutris and Bottles (`app/util/linuxLaunchers.js`) |
| Starting a game | the executable or its store URL | the owning launcher (`steam://`, `lutris:`, `heroic://`) through `xdg-open`, never Wine (`app/util/linuxGameLaunch.js`) |
| Playtime store | `HKCU\Software\Achievement Watcher Next\Playtime` | `cfg/playtime.json` (`app/util/playtimeFile.js`) |
| Toast | the Watchdog builds the toast XML with powertoast; the app posts it as an Electron `Notification` (`toastXml`) under its own AppUserModelID, without PowerShell. Another app id (a user override, the Xbox fallback) still uses powertoast's PowerShell script (`watchdog/util/powertoast.js`) | the app shows an Electron `Notification` through the freedesktop service (`app/electron/desktopNotification.js`); skipped when no notification daemon answers |
| Popups and overlay over games | always-on-top windows | the app runs through XWayland under Wayland (`app/util/linuxSession.js`); they never take focus (unless "focus overlay" is set); `--toggle-overlay` toggles the overlay from a desktop shortcut. In Game Mode (gamescope) they carry `GAMESCOPE_EXTERNAL_OVERLAY` and every notification goes to them, since no system notification shows there (`app/util/gamescope.js`) |
| Notification sound | the Watchdog asks the app over IPC, which plays the file (`watchdog/util/soundPlayer.js`) | `pw-play`, then `paplay` |
| Screenshots and clips | the Windows capture helper | Electron or the Screenshot portal; clips from `gpu-screen-recorder` or an opt-in software recorder (`app/electron/souvenirLinux.js`, `clipRecorder.js`) |
| Controller rumble | XInput | kernel force feedback on `/dev/input/event*` (`watchdog/util/evdevRumble.js`) |
| Controller in the overlay | XInput or GameInput through koffi; the overlay reads the pad with the Gamepad API | the pad's event device through koffi (`watchdog/console/controller/evdev-controller-backend.js`), sent to the overlay by the Watchdog; the overlay is override-redirect so the game keeps the focus |
| Watchdog presence pipe | named pipe | Unix socket in `XDG_RUNTIME_DIR` (`app/util/watchdogPipe.js`) |
| Start with the session | `Run` registry value | XDG autostart entry (`app/util/linuxAutostart.js`); a systemd user unit where a gamescope session is installed (Steam Deck, SteamOS); AW started without a display takes the Steam client's (`app/util/linuxSession.js`) |
| `achievement-watcher://` links | registered at startup (`setAsDefaultProtocolClient`) | a desktop entry AW writes (`app/util/linuxDesktopEntry.js`) |
| Tray | notification area | StatusNotifierItem; without a host the window minimizes (`app/util/linuxTrayHost.js`) |
| Stored secrets key | DPAPI through `safeStorage` | the desktop keyring through `safeStorage`, with a one-time warning when none answers |
| Updates | NSIS installer, Authenticode-pinned (`latest.yml`) | the AppImage replaced in place, checked by SHA-512 (`latest-linux.yml`) |
| User data | `%APPDATA%\Achievement Watcher Next` | `~/.config/Achievement Watcher Next` |

## Main directories

| Path | Responsibility |
|---|---|
| `app/electron/` | Main process, window lifecycle, IPC, update flow and browser-backed services |
| `app/app.js` | Renderer entry point and game-library interactions |
| `app/parser/` | Platform parsers, discovery, schema lookup and emulator tools |
| `app/ui/` | Settings, game view, sorting and renderer-side UI |
| `app/locale/` | UI language files and DOM text binding |
| `app/view/`, `app/presets/` | HTML views (application and overlay), bundled notification presets |
| `watchdog/` | Background monitoring, notifications and playtime |
| `native/` | Rust helpers: the installer window (`setup-ui/`) and the HDR screenshot tool (`hdr-screenshot/`) |
| `test/`, `watchdog/test/` | App, parser, discovery and locale tests; Watchdog and notification tests |

## Data flow

1. Enabled source parsers scan launcher data, configured folders and known save locations.
2. `app/parser/achievements.js` normalizes results into the library's shared game shape.
3. Platform-aware IDs keep unrelated stores from sharing a cache key.
4. Metadata and artwork come from local caches first, then from online fallbacks.
5. The Watchdog takes a baseline for each active source and watches for later changes.
6. A new unlock is normalized, de-duplicated and sent to the transports one planner selects
   (`watchdog/notification/transportPolicy.js`).

Startup must not replay existing unlocks as new events: watchers baseline current state before they
emit notifications.

### What a scan may cost

The library paints from `cache/library_snapshot` before discovery starts, so the scan is not on the
path to the first frame. Four rules bound its cost:

- **Read a folder once per pass.** `app/util/dirCache.js` memoizes directory listings for one
  discovery. The memo is closed afterward, so a repair always sees the real folder.
- **Skip an unchanged install folder.** `app/util/exeCandidateCache.js` remembers a game folder's
  executable candidates, keyed by its timestamps, under `cache/discovery/`.
- **Do not scan while a game runs.** The background pass holds until the game exits. A ceiling on held
  passes keeps a background process mistaken for a game from suspending it silently.
- **Prove the disk is unchanged before walking it again.** The new-install poll compares the
  timestamps of the folders the last discovery read (`app/util/dirFingerprint.js`) and skips the pass
  when none moved. Database and registry sources are invisible to it, so a full pass still runs on a
  slower cadence.
- **Retry one game, not the library.** A game whose description never arrived is stored with the
  discovery record it was found from. When the stored library is reused, only those games load
  again, in the scan host (`reloadGames`), instead of a full scan on every opening.

Per-game metadata loads through a small worker pool, never a whole-library `Promise.all`. A host
proven unreachable is not asked again for the rest of the scan (`app/util/networkCircuit.js`), the
browser fallback included.

## Parser expectations

Parsers normally expose a `scan` function and an `initDebug` hook. The aggregator normalizes their
results; they render nothing.

When adding a source:

- keep the source's native identity instead of forcing every item into a Steam AppID;
- distinguish installed state from leftover achievement data;
- return partial data when safe instead of blacklisting a game after one transient failure;
- cache network results with a bounded lifetime;
- make missing optional files a normal empty state;
- keep watcher and parser rules aligned so the library and live notifications observe the same files.

### Wiring a save-file emulator

An emulator that writes one save folder per Steam appid under a user profile (the Goldberg family) is
read twice: by the app for the library and by the Watchdog for live notifications. Each side has its
own list, so a new one touches both:

1. **The reader.** A small module of its own in `app/parser/` that requires nothing from the rest of
   the app, so the Watchdog can load it. List it in `asarUnpack` in `app/electron-builder.yml`;
   `test/core/sharedAppModules.test.js` fails otherwise.
2. **Library roots.** Add the folder to `addHostRoots` in `app/parser/saveRoots.js` as
   `envPath('APPDATA', '<Folder>')`. It is then probed on every host.
3. **Library label and file.** `steam.scan()` in `app/parser/steam.js` names the source from the
   folder path (an unrecognised folder shows as `Steam-emulator`). `getAchievementsFromFile()` in the
   same file lists the save file names it reads and turns each format into shared
   `{ Achieved, UnlockTime }` entries.
4. **Watchdog roots.** Add an entry to `builtinRoots(host)` in `watchdog/monitor.js`:
   `{ dir: at('APPDATA', '<Folder>'), options: { recursive, filter, file } }`. `filter` is a regular
   expression the changed path must match (usually the numeric appid folder), `file` lists the file
   names that count, and the appid comes from the folder name. `statsSibling` reads `achievements.ini`
   when only `stats.ini` changed; `disableCheckIfProcessIsRunning` notifies even when the game's
   process is not seen.
5. **Watchdog reader.** `parse()` in `watchdog/monitor.js` picks the reader by file name; add the new
   name there.
6. **Tests.** A reader test that runs on both systems, a Watchdog test that the root is built for
   every host, and a Linux test that finds a save inside a fake Wine prefix (`withWinePrefix`, see
   [test/README.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/test/README.md#windows-and-linux)).

A source with its own identity (a store, a console emulator) is a parser of its own registered in
`app/parser/achievements.js`, with a watcher in `watchdog/console/` or `watchdog.js`. `xlln.js`,
`rpcs3.js`, `shadps4.js` and their watchers are the models.

Current integrations: Steam (client and emulator saves), Goldberg/GBE-compatible saves, Goldberg
SocialClub, Uplay R2, GOG, Epic, Ubisoft, EA Desktop, Xbox PC, RetroAchievements, PlayStation Network
(the signed-in account's trophy lists), GreenLuma, LumaPlay, SmartSteamEmu, RPCS3, ShadPS4, KytyPS5,
Xenia, Xbox 360 recompilations, PC ports of PS4 games (`ps4Recomp*.js`), XLiveLessNess (Games for
Windows LIVE) and FINAL FANTASY VII (2013). Some platforms have both a legacy mapped-save parser and
a newer official or local one.

## Important components

| File | Role |
|---|---|
| `app/parser/achievements.js` | Aggregation, folder discovery and background emulator setup |
| `app/parser/installState.js` | Evidence-based installed-state decisions |
| `app/parser/gameIndex.js` | Persistent game identity and install metadata |
| `app/parser/steam.js` | Steam schema, metadata and compatible-save parsing |
| `app/parser/steamAppInfo.js` | Steam's local `appcache/appinfo.vdf`: per-appid name and type, read offline and keyless |
| `app/parser/goldberg.js` | Goldberg/GBE detection, diagnosis, repair and backup |
| `app/parser/uplayR2.js` | Ubisoft-to-Steam mapping and Uplay R2 schema setup |
| `app/parser/saveRoots.js` | Known achievement-data and library folder names, probed per drive and profile |
| `app/parser/launcherLibraries.js` | Library roots read from launcher configuration on disk (Epic manifests, GOG/Ubisoft registry, `.GamingRoot`) |
| `app/parser/rpcs3Layout.js` | RPCS3 configuration root and `vfs.yml` `dev_hdd0` resolution |
| `app/parser/xlln.js` | XLiveLessNess installs: discovery, per-profile unlocks, and the schema read from the game's executable (`xllnSpa.js` parses its SPAFILE resource) |
| `app/parser/x360Recomp.js` | Recompiled Xbox 360 games: ReXGlue `.toml`, `.tsv`, `SaveData\Achievements.json` and Unleashed `ACH-DATA` unlock lists; schema from the game's `default.xex`, dbox.tools as fallback |
| `app/parser/x360Ports.js`, `x360Launcher.js`, `reblueBonus.js` | Known ports by executable (listed before the first unlock; `renut.cfg`), a literal `--user_data_root` read from a `.bat`/`.cmd`/`.ps1` launcher, re:Blue's own achievements |
| `app/parser/xex.js` | Xbox 360 executables: title id, AES and LZX unpacking (`app/util/lzx.js`) and the SPA resource, extracted in a time-limited worker (`xexWorker.js`) |
| `app/parser/ff7.js` | FINAL FANTASY VII (2013): the 8-byte `achievement.dat` bitfield, paired with Steam api-names |
| `app/parser/retroAchievements.js` | RetroAchievements Web API: account, library import and the `steam_cache/retroachievements` cache, shared with `watchdog/console/retroAchievementsWatch.js` (recent unlocks every 8 s while a known emulator runs, every 5 min otherwise) |
| `app/parser/psnLibrary.js` | PlayStation Network: every trophy list of the signed-in account, imported into `steam_cache/psn/<NPWR id>`; never merged by name with a PC game |
| `app/parser/psnCatalog.js` | Every PlayStation trophy list, not only the account's, taken from public trophy hunters' profiles and refreshed every three days |
| `app/util/psnAuth.js` | PSN sign-in: only the access and refresh tokens are kept, encrypted; the NPSSO cookie is traded once and never written |
| `app/util/sanEngine/` | Draws a theme imported from Steam Achievement Notifier with SAN's own cards, fonts and sounds; `sanTheme.js` and `sanImport.js` read the `.san` file; origin in `SOURCES.md` there |
| `app/electron/init.js` | Main lifecycle, updater, browser helpers and overlay window |
| `app/util/updateStatus.js` | Updater state shared by the main process, the title bar and Settings |
| `watchdog/watchdog.js` | Background entry point and service coordination |
| `watchdog/monitor.js` | Process and filesystem monitoring |
| `watchdog/notification/toaster.js` | Notification delivery: one plan per event, single owner of the fallback |
| `watchdog/notification/transportPolicy.js` | Which transport delivers a notification, from observable signals |
| `watchdog/playtime/monitor.js` | Process-based playtime sessions |
| `app/util/gameHealth.js` | Per-game health: state, explanation, checks and repairs |
| `app/util/interfaceMode.js` | Simple / Advanced policy: which tabs, rows and health checks each mode shows |

## Local data

Packaged user data is below `%APPDATA%\Achievement Watcher Next` (`~/.config/Achievement Watcher Next`
on Linux), a folder no predecessor's uninstaller touches. On first launch AW Next imports forward
along the chain `Achievement Watcher` (1.6.8) → `Achievement Watcher 3.0` → `Achievement Watcher Next`,
newest source first. Each hop is one-way and non-destructive: it never deletes a source or overwrites
an existing file, and it stops once the destination holds AW configuration
(`app/util/migrateUserData.js`).

| Directory | Contents |
|---|---|
| `cfg/` | Settings, game index, executable mappings and exclusions |
| `logs/` | Main, renderer, parser and Watchdog diagnostics |
| `cache/`, `steam_cache/` | Downloaded tools, metadata and artwork caches |
| `Media/` | Seed for custom Windows toast sounds, kept for upgrades (old registry entries point here) |
| `sounds/`, `presets/` | Imported notification sounds and generated user presets |

Settings are in `cfg/options.ini`. Sensitive fields are encrypted before the file is written, with
the key held under Windows DPAPI through Electron's `safeStorage` (`app/util/appSecret.js`). Epic
account tokens use a separate encrypted cache.

## UI and localization

The renderer is a long-lived HTML/JavaScript application. Some locale bindings depend on DOM order,
so changing settings markup can shift text onto the wrong control even when the JSON keys are right.
Update the view, `app/locale/loader.js` and every locale together, then run the full app suite.

The settings panel has two display modes, Simple and Advanced (`[general] interfaceMode`), decided by
the pure module `app/util/interfaceMode.js`: the Advanced-only tabs, the `data-advanced` attribute
for rows inside the tabs Simple keeps, and the Game Health checks Simple leaves out.
`app/ui/settings.js` toggles the `mode-hidden` class, never removes markup, because the positional
locale bindings would break. The mode changes no parser, watcher or stored value, and an unset or
unrecognized value resolves to Advanced. A new settings tab needs its `data-view` in one of the two
lists in `interfaceMode.js`; `test/ui/interfaceMode.test.js` fails otherwise.

On the Sources tab, `hiddenOptionalSources()` folds a niche source (`OPTIONAL_SOURCES`) away only
while it is enabled and no game in the library carries one of its `source` values, so Simple never
hides the only control that would explain a missing game. Those rows carry no `data-advanced` marker.

English is the reference locale. `app/locale/uiLanguages.js` exposes only languages that have a
bundled JSON file, and the loader falls back to English at runtime.

## Packaging boundaries

`app/electron-builder.yml` packages the desktop app and copies the Watchdog beside it. Presets,
sounds and shared Steam-schema mapper modules are unpacked from ASAR because overlay windows and the
external Watchdog load them from disk. A module the Watchdog loads from the app (the host layer, the
Linux Steam reader, the presence pipe name, the playtime store) must be listed in `asarUnpack` too.
On Linux, `app/build/afterPack.js` removes the Windows helpers and other platforms' binaries from the
AppImage and keeps `7za` executable.

`npm run build` and `npm run build:linux` prune Watchdog development dependencies before packaging;
restore them before returning to development. See [BUILD.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md)
and the [release workflow](RELEASE_WORKFLOW.md).

## Change checklist

When changing a parser or watcher, verify discovery and installed state, the initial baseline against
a real new unlock, duplicate suppression, cache identity and platform namespacing, missing and
offline data, and logs and diagnostics. Run both app and Watchdog tests when the change crosses
processes. Windows must stay unchanged, and Linux must work through every host (a Wine prefix as
well as the native folders) when the change reads profile folders, the registry, processes or
notifications.

---

**Next:** [Build guide](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) - running from source, packaging and the native-module
gotchas · [Contributing](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) · [Release workflow](RELEASE_WORKFLOW.md).

<div align="center">

[← Documentation](README.md) · [Build guide](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>