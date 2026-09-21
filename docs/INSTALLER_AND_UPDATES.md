# Installer, uninstaller and updates

How AW Next is installed, removed and kept up to date on Windows, and the reasons behind the parts
that are not electron-builder defaults. [BUILD.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md)
covers building, [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md) covers publishing.

| File | What it owns |
|---|---|
| `app/electron-builder.yml` | NSIS options, the 27 installer languages, the GitHub release feed |
| `app/build/installer.nsh` | Everything custom in the installer and uninstaller |
| `app/patches/app-builder-lib+26.15.3.patch` | Three changes to electron-builder's NSIS templates |
| `app/electron/init.js` (`getUpdater`, `scheduleUpdateCheck`, `registerUpdaterEvents`) | The in-app updater |
| `app/util/updateSignature.js` | Which certificates may sign an update |
| `app/util/updateCacheHousekeeping.js` | Removes an installer that is already installed from the update cache |
| `app/build/build.js` | Signs the release and refuses one clients would reject |

## Installer

An assisted NSIS installer, per user by default (`%LOCALAPPDATA%\Programs\Achievement Watcher`),
with the choice of an all-users install and of the folder.

- **Language.** The installer and the uninstaller follow the Windows display language. They match
  on the primary language (`LANGID & 0x3FF`), so regional variants (fr-CA, de-CH, es-MX, zh-HK...)
  get their language instead of English. There is one installer language per bundled app locale
  (Latin American Spanish shares Spanish): 27. Adding one means adding it to `installerLanguages`,
  to `AW_PICK_LANGUAGE` and to every `LangString` block in `installer.nsh`;
  `test/updates-security/updateInstall.test.js` fails until all three agree.
- **Folder check.** Leaving the directory page tests that the folder can be written to. A per-user
  install aimed at `C:\Program Files` used to be accepted, then fail halfway through the extraction
  with NSIS's raw "Error opening file for writing". It now stays on the page with a translated
  explanation. An elevated all-users install passes the same test. electron-builder has no hook on
  that page, which is what the `customDirectoryPageLeave` hook in the patch adds.
- **Running app.** electron-builder's own check closes every `Achievement Watcher.exe` process,
  which includes the Watchdog (it runs as `Achievement Watcher.exe watchdog.js` under
  `ELECTRON_RUN_AS_NODE`). The installer used to start PowerShell as well, to look for a `node.exe`
  Watchdog that no longer exists; that cost one to two seconds before the first window.
- **Progress.** The details pane is shown and filled (the patch undoes upstream's
  `SetDetailsPrint none`), since it is what an update run displays.
- **User data** is never moved by the installer: `%APPDATA%\Achievement Watcher Next` is only
  created, and the app imports an older `Achievement Watcher 3.0` profile on first launch.

## Uninstaller

A first page shows what will happen, with one option, off by default: also delete settings, cache
and saved data. The page shows how much space that frees.

A real uninstall always removes what the app wrote outside its folder:

| Trace | Why it has to go |
|---|---|
| `HKCU\...\CurrentVersion\Run\io.github.shirowwww.achievement.watcher` and its `StartupApproved` flag | Windows would try to start a missing executable at every sign-in |
| `HKCU\Software\Classes\achievement-watcher` | The protocol the toast buttons open |
| `%LOCALAPPDATA%\achievement-watcher-updater` | Up to two copies of the installer, 127 MB each |

With the option ticked (or `--delete-app-data` on a silent uninstall) it also removes
`%APPDATA%\Achievement Watcher Next`, the older `%APPDATA%\Achievement Watcher 3.0`, and their
playtime keys under `HKCU\Software`.

It never touches `%APPDATA%\Achievement Watcher` or `HKCU\Software\Achievement Watcher`: they belong
to the unrelated 1.6.8 app, which may still be installed. Upstream electron-builder deleted that
folder on `--delete-app-data`, because it is named after the install folder; the patch removes that
line.

**An update runs the old version's uninstaller.** electron-builder always passes `--updated` to it,
and every removal above is skipped when `${isUpdated}` is set. Without that, each update would
switch off "Start with Windows" and empty the update cache.

Up to 3.10 the delete-data checkbox did nothing: `customUnInstall` reset its value to
`"0"` before reading it, so only `--delete-app-data` ever deleted anything. For an all-users install
it also pointed at the all-users `%APPDATA%`. Both are fixed and covered by tests.

## Updates

The app checks the GitHub release feed eight seconds after start, then every hour, never during a
game. It asks before downloading and installs only after "Download && Install".

### Download size

Differential downloads are on. electron-builder publishes a `.blockmap` with each installer, and
electron-updater fetches only the blocks that changed since the installed version, instead of the
full 127 MB. The base it patches is `installer.exe` in the update cache, which every install
rewrites from the installer that just ran, so it always matches the running version. If patching
fails for any reason, electron-updater downloads the full installer on its own. If the full
download then fails its checksum, the app clears the cache and tries once more before offering the
release page.

They were switched off in 3.8.6 on the belief that a corrupted base would break every later update.
That is not how electron-updater behaves: the patched file is checked inside the differential
downloader, and a mismatch there falls back to the full download.

### Update cache

electron-updater keeps the last downloaded installer in `pending\` until the next update downloads,
beside the `installer.exe` base: 254 MB for one version. On the first check of each run the app
now removes `pending\` once the version in it is installed. A newer download waiting there (held
back while a game runs) is left alone.

### Signature

Before installing, the app checks the installer's Authenticode signature
(`app/util/updateSignature.js`). It refuses:

- an unsigned installer;
- an installer signed by anyone but `CN=Shirow`;
- a `CN=Shirow` installer whose certificate thumbprint is not pinned;
- a file modified after it was signed.

The SHA-512 in `latest.yml` is not a substitute: it comes from the same release as the installer,
so whoever can replace one can replace the other. A common name is no proof either, since anyone
can issue themselves a `CN=Shirow` certificate. The thumbprint is what ties an update to the
project's own key.

If PowerShell itself cannot run, the check is skipped rather than blocking every update forever.
That is not something a forged installer can trigger.

### Certificates, and what happens if one is lost

Two certificates are pinned:

| File (in `app/build/signing/`, never committed) | Role | Thumbprint |
|---|---|---|
| `Shirow.pfx` + `.password` | Signs every release, valid until 2031-08-04 | `2E581B204231D7EED9E33E798B5E0C503AD8FEDC` |
| `Shirow-standby.pfx` + `.password-Shirow-standby` | Kept offline, never used until a rotation | `F64838216091CCC975320E8A2D50F4F403837667` |

**Back up the whole `app/build/signing/` folder somewhere offline.** If both private keys are lost,
every installed copy refuses every later update, and users can only move forward by downloading an
installer by hand.

Rotation, when `Shirow.pfx` expires, leaks or is lost:

1. Promote the standby: rename `Shirow-standby.pfx` to `Shirow.pfx` and `.password-Shirow-standby`
   to `.password`.
2. Create a new standby:
   `powershell -ExecutionPolicy Bypass -File build/signing/create-self-signed-cert.ps1 -FileName Shirow-standby -Years 10`.
3. In `PINNED_THUMBPRINTS`, keep the promoted thumbprint, add the new standby, and remove the old
   release thumbprint only if it leaked.
4. Release. Clients that already trust the promoted certificate take this update and learn the new
   standby from it.

`npm run build` refuses to finish when the installer's certificate is not pinned, and warns loudly
when there is no certificate at all.

### Portable ZIP

The portable build has no `app-update.yml`, so its update checks used to fail with an error balloon.
It now reads the same release feed and, when a new version is out, offers the release page:
extracting the new archive over the folder keeps the `data` folder. It never downloads or runs the
installer.

## Testing without touching the real install

Build a renamed copy so it cannot collide with the installed app. From `app/`:

```powershell
node node_modules/electron-builder/cli.js --config electron-builder.yml --publish never --win nsis `
  -c.appId=io.github.shirowwww.awprobe -c.productName="AW Update Probe" `
  -c.executableName="AW Update Probe" -c.win.executableName="AW Update Probe" `
  '-c.win.artifactName=AW.Probe.Setup.${version}.${ext}' -c.nsis.shortcutName="AW Update Probe" `
  -c.nsis.uninstallDisplayName="AW Update Probe" -c.nsis.differentialPackage=false `
  -c.directories.output=dist-probe -c.extraMetadata.name=aw-update-probe
```

then restore `app/package.json`, which electron-builder rewrites. Install it, run
`<setup>.exe --updated --force-run` to exercise the update path, and uninstall it.

The probe still shares two things with the real install, because they are fixed names rather than
derived from the app id: the `%APPDATA%\Achievement Watcher Next` folder (never tick the delete-data
option when uninstalling the probe) and the `achievement-watcher` protocol key (removed by the
probe's uninstall, registered again by the next launch of the real app).
