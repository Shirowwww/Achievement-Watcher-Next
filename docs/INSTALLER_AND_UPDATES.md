# Installer, uninstaller and updates

How AW Next is installed, removed and kept up to date on Windows, and the reasons behind the parts
that are not electron-builder defaults. [BUILD.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md)
covers building, [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md) covers publishing.

| File | What it owns |
|---|---|
| `app/electron-builder.yml` | NSIS options, the 27 installer languages, the GitHub release feed |
| `app/build/installer.nsh` | Everything custom in the installer and uninstaller |
| `native/setup-ui/` | The installer and uninstaller window, an NSIS plug-in in Rust; its text is `strings.json` |
| `app/build/x86-unicode/AwSetupUi.dll` | That plug-in, built by `node native/setup-ui/build.js` |
| `app/patches/app-builder-lib+26.15.3.patch` | The changes to electron-builder's NSIS templates the two rely on |
| `app/electron/init.js` (`getUpdater`, `scheduleUpdateCheck`, `registerUpdaterEvents`) | The in-app updater |
| `app/electron/updateWindow.js`, `app/view/update.html` | The update window |
| `app/util/updateSignature.js` | Which certificates may sign an update |
| `app/util/updateCacheHousekeeping.js` | Removes an installer that is already installed from the update cache |
| `app/build/build.js` | Signs the release and refuses one clients would reject, including any packaged `.exe` that is unsigned, signed by an unpinned certificate, or a native helper that differs from `watchdog/native/` (`app/build/packagedExecutables.js`) |

## The setup window

The installer and the uninstaller keep electron-builder's NSIS script: its sections, registry keys,
shortcuts, multi-user logic and the command line electron-updater relies on (`--updated`, `/S`,
`--force-run`) are unchanged. What the user sees is drawn by `AwSetupUi.dll`, a Direct2D window in
the app's colours and fonts, with the brand mark, rounded corners, the system shadow, keyboard
navigation and progress on the taskbar button.

- **One window, three steps.** `customPages` in `installer.nsh` replaces electron-builder's page
  list: the choices (a custom page), NSIS's own progress page, where the sections run, and the end.
  NSIS's dialog stays alive behind the window, fully transparent and click-through, so every page,
  section and message box of the template keeps working.
- **The template's message boxes come to the front.** They belong to that invisible dialog, so
  electron-builder's "cannot be closed, retry?" (a file of the installation is in use) or NSIS's own
  file errors opened behind the window and the installer looked frozen. `src/modal.rs` watches for
  them, raises each one above the window, centred on it, and disables the window until it is
  answered.
- **No empty first frame.** The first frame takes a few hundred milliseconds (fonts, layouts, the
  mark); the window stays cloaked until it is drawn instead of showing a bare panel meanwhile.
- **Its own thread.** NSIS sends its main thread a message for every instruction a section runs,
  to move its progress bar. A window drawing on that thread made each instruction wait for a frame
  (a scan of the running processes took 30 seconds), so the window runs on a thread of its own.
- **Measured progress.** The bar follows the run's steps, each owning a slice in proportion to how
  long it takes. The archive extraction reports its real progress (`Nsis7z::ExtractWithCallback`),
  so does the uninstaller's file removal; a step that cannot report creeps toward the end of its
  slice without reaching it.
- **Fallback.** If the window cannot be created, the script continues with NSIS's stock progress
  page and default choices. Setting `AW_SETUP_CLASSIC` in the environment forces that.

## Installer

Per user by default (`%LOCALAPPDATA%\Programs\Achievement Watcher`), with the choice of an
all-users install and of the folder under Options.

- **Language.** Once the app has run, the language picked in its Settings (`[achievement] lang` in
  `cfg\options.ini`) wins, so an update card, a reinstall and the uninstaller speak the app's
  language (`AW_PICK_APP_LANGUAGE`). Otherwise the window and NSIS follow the Windows display
  language, matched on the primary language (`LANGID & 0x3FF`), so regional variants (fr-CA,
  de-CH, es-MX, zh-HK...) get their language instead of English. There is one installer language
  per bundled app locale (Latin American Spanish shares Spanish): 27. Adding one means adding it to
  `installerLanguages`, to both pickers in `installer.nsh`, to `strings.json` and to the picker in
  `native/setup-ui/src/strings.rs`; `test/updates-security/updateInstall.test.js` and
  `setupUiStrings.test.js` fail until they agree. The window speaks to the user the way the app does
  (informally where the app is).
- **Folder.** A picked folder always gets the installation folder's name appended (`D:\Games`
  becomes `D:\Games\Achievement Watcher`), in the window and again in the script: the uninstaller
  removes the whole installation folder. The window takes that name from the per-user default the
  script hands it, so a renamed build (the probe below) appends its own. The window checks free space and, for a per-user install, that the
  folder can be written, and keeps the user on the options with the reason otherwise.
- **All users.** Choosing it relaunches the installer elevated through electron-builder's UAC
  plug-in; the elevated instance reads the choices back from the first one and installs at once. A
  declined elevation returns to the options, with the choices kept.
- **Running app.** The window says when AW Next is running (it looks again every second and a half).
  The install then closes every process started from the installation folder, which includes the
  Watchdog (it runs as `Achievement Watcher.exe watchdog.js` under `ELECTRON_RUN_AS_NODE`) and the
  native helpers. `AwSetupUi::AppRunning` and `::CloseApp` ask Windows directly; electron-builder's
  own check starts PowerShell three times for the same answer, and sandboxes such as Hybrid Analysis
  score an installer starting PowerShell as malicious.
- **Speed.** electron-builder extracts the archive into the installer's temp folder and copies the
  430 MB into place. For a per-user install both folders live in the same profile, so each entry is
  moved instead (`customMoveExtractedFiles`), which costs nothing; the copy only handles what could
  not be moved. An all-users install keeps the copy: a moved file keeps the permissions of the
  user's temp folder, and other accounts could not read it.
- **Disk space.** Once the files are in place, `AwSetupUi::Compress` applies Windows' own
  executable compression (WOF XPRESS16K, what CompactOS uses for the system files) on several
  threads: about 210 MB on disk instead of 410 MB, read back transparently, in under a second. It
  asks the file system directly (`FSCTL_SET_EXTERNAL_BACKING`) rather than running `compact.exe`,
  for the same sandbox reason as above. It runs in `customInstall`, so on updates too and before the
  app starts, then writes the compressed size as `EstimatedSize`, the figure Windows lists under
  Installed apps. The welcome screen announces that size, measured on each build by
  `build/afterPack.js` (`AW_INSTALLED_KB`); the free-space check keeps the uncompressed one, since
  the files are written whole first. A volume without WOF (FAT32, exFAT) keeps the files as they are.
- **User data** is never moved by the installer: `%APPDATA%\Achievement Watcher Next` is only
  created, and the app imports an older `Achievement Watcher 3.0` profile on first launch.

## Uninstaller

The window asks once, with one option, off by default: also delete settings, cache, backups and
playtime. It measures how much space that frees, and warns that it cannot be undone when ticked.

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

**The installation folder goes in one step.** electron-builder renamed each of the ~2100 files
into its temp folder one NSIS instruction at a time (so an update could put them back if one was
busy), then deleted them again on exit: four seconds of every update. `customRemoveFiles` renames
the folder itself, which fails at once while any file inside is in use, then
`AwSetupUi::RemoveTree` deletes the renamed tree on several threads. For an update a refused rename
aborts before anything is touched, as before.

An all-users uninstall started without elevation runs twice: the first copy relaunches itself
elevated through UAC and waits. electron-builder's `un.onInit` makes the installation folder the
working directory, so the waiting copy held it open and `C:\Program Files\<app>` survived the
uninstall, empty. The patch moves the waiting copy to `$TEMP` before it elevates (`multiUser.nsh`).

**An update runs the old version's uninstaller.** electron-builder always passes `--updated` to it,
and every removal above is skipped when `${isUpdated}` is set. Without that, each update would
switch off "Start with Windows" and empty the update cache.

Up to 3.10 the delete-data checkbox did nothing: `customUnInstall` reset its value to
`"0"` before reading it, so only `--delete-app-data` ever deleted anything. For an all-users install
it also pointed at the all-users `%APPDATA%`. Both are fixed and covered by tests.

## Updates

The app checks the GitHub release feed eight seconds after start, then every hour, never during a
game. A new version found by that check is announced by a desktop notification (a Windows toast, or
the desktop's notification on Linux) and the title-bar chip, so nothing takes the focus from a game
or another app; clicking either opens the update window (`app/electron/updateWindow.js`).
**Settings → Check for updates** opens it at once. The window shows the versions, the download size
and the release notes, with Update now, Later and Skip this version. The notes come
from the release body, which the installer's signature does not cover, so they are reduced to plain
headings, items and paragraphs (`app/util/releaseNotes.js`) and set as text, never as markup.

After Update now the same window follows the download (size, speed, Cancel) and can be sent to the
background; the title-bar chip brings it back, and so does Settings > Check for updates while an
offer or a download is under way. When the download lands the app says it is installing and quits,
and the installer shows a compact card (versions, progress) until AW Next starts again. An update
held back by a running game can be installed from the window anyway.

The window, the title-bar chip and the Settings line read the same state and say the same thing:
"Checking the download" (nothing left to cancel) once every byte is in, and a failed download or
install is reported as such, not as a failed check. A refused signature and a broken download each
get a plain sentence of what happened and what to do; the updater's own English message stays in
the log, with only its error code (`ERR_UPDATER_INVALID_SIGNATURE`...) under the title.

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
(`app/util/updateSignature.js`, `app/util/authenticode.js`). The check runs inside the app and
starts no other program: behaviour engines such as Bitdefender's blocked the PowerShell process it
used before. It refuses:

- an unsigned installer;
- an installer signed by anyone but `CN=Shirow`;
- a `CN=Shirow` installer whose certificate thumbprint is not pinned;
- a file modified after it was signed;
- a signature that does not verify against the pinned key. The certificate block of any release is
  public, so the app verifies each signature layer against its certificate and recomputes the PE
  hash it covers, rather than trusting a block that only names the signer.

The SHA-512 in `latest.yml` is not a substitute: it comes from the same release as the installer,
so whoever can replace one can replace the other. A common name is no proof either, since anyone
can issue themselves a `CN=Shirow` certificate. The thumbprint is what ties an update to the
project's own key.

If the installer cannot be read or is not a Windows executable, the update is refused and the message
points to the GitHub releases page for a manual download. A check that cannot answer never counts as
a pass.

The check runs again when the update finishes downloading and just before the installer starts, on the
same file with its SHA-512 compared between the two. electron-updater reuses an installer cached by a
previous launch without verifying its signature, so a cached file that fails is deleted.

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
It now reads the same release feed and, when a new version is out, offers the release page in the
update window: extracting the new archive over the folder keeps the `data` folder. It never
downloads or runs the installer.

With no installer to compress it, the extracted folder is compressed by the Watchdog half a minute
after the first start (`watchdog/util/installCompression.js`, the same request as the plug-in), and
again after the files are replaced by a newer archive. The `data` folder is left alone.

## Testing without touching the real install

The window alone, without building an installer: `cd native/setup-ui`, then
`cargo run --release --example preview -- install 1036` (also `upgrade`, `update`, `uninstall`,
`error`; the number is a Windows language id). It drives the DLL the way NSIS does, with a
simulated install.

A whole installer: build a renamed copy so it cannot collide with the installed app. From `app/`,
after `node ../native/setup-ui/build.js`:

```powershell
node node_modules/electron-builder/cli.js --config electron-builder.yml --publish never --win nsis `
  -c.appId=io.github.shirowwww.awprobe -c.productName="AW Update Probe" `
  -c.executableName="AW Update Probe" -c.win.executableName="AW Update Probe" `
  '-c.win.artifactName=AW.Probe.Setup.${version}.${ext}' -c.nsis.shortcutName="AW Update Probe" `
  -c.nsis.uninstallDisplayName="AW Update Probe" -c.nsis.differentialPackage=false `
  -c.directories.output=dist-probe -c.extraMetadata.name=aw-update-probe
```

then restore `app/package.json`, which electron-builder rewrites. Adding
`--prepackaged <copy of dist\win-unpacked with the exe renamed to AW Update Probe.exe>` builds only
the installer, in seconds. Install it, run `<setup>.exe --updated --force-run` to exercise the
update path (`-c.extraMetadata.version=` gives a second build to update to), and uninstall it.
With `AW_SETUP_TRACE` set to a file path, each step of a run is written there with its time.

The probe still shares two things with the real install, because they are fixed names rather than
derived from the app id: the `%APPDATA%\Achievement Watcher Next` folder (never tick the delete-data
option when uninstalling the probe) and the `achievement-watcher` protocol key (removed by the
probe's uninstall, registered again by the next launch of the real app). A launched probe also
rewrites the "Start with Windows" value to its own path. To test deleting data or the language
setting, build the probe from a copy of `build/installer.nsh` with `Achievement Watcher Next` and
`Achievement Watcher 3.0` replaced by throwaway names.

The update path end to end: point the probe at a local feed (a copy of `electron-builder.yml` whose
`publish` is `provider: generic` with `url: http://127.0.0.1:<port>/`), sign it with the release
certificate (`CSC_LINK`, `CSC_KEY_PASSWORD`), serve the next version's `latest.yml`, installer and
blockmap over HTTP with byte ranges, and start the installed probe with
`--user-data-dir=<throwaway folder>` so it does not hand over to the running app. An unsigned build
on the same feed exercises the refusal.

A sandboxed or elevated shell may not see the registry the installer writes:
start installers through `explorer.exe` and read their keys from a process started the same way.
