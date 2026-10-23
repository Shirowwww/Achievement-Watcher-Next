# Build AW Next

Local development, Windows packaging and the Linux AppImage. [docs/RELEASE_WORKFLOW.md](docs/RELEASE_WORKFLOW.md) covers versioning, publishing, CI and auto-update validation.

<p align="center"><a href="README.md">← Project home</a> · <a href="docs/README.md">Documentation</a> · <a href="CONTRIBUTING.md">Contributing</a></p>

## Requirements

- Windows 10 or 11 for the Windows build.
- A 64-bit Linux system for Linux work and the AppImage, see
  [Develop and test on Linux](#develop-and-test-on-linux).
- Node.js `22.22.2+` or `24.15+`, matching the `engines` field in both package manifests. CI runs
  Node 22.22.2 and 24.19.0 on Windows and 24.19.0 on Linux.
- npm, included with Node.js.

Electron comes with the app dependencies. The supported native packages ship prebuilt binaries, so a
normal setup needs no Visual Studio, Python or manual `node-gyp` build.

The HDR screenshot helper is checked in as a prebuilt x64 executable, so Rust is not needed for
normal development and packaging. Install the stable x64 MSVC Rust toolchain only to change that
helper; its source, tests and copy command are in [`native/hdr-screenshot`](native/hdr-screenshot/README.md).

## Install dependencies

The desktop app and the background Watchdog are separate npm workspaces. Install both from the
repository root:

```powershell
Push-Location watchdog
npm ci
Pop-Location

Push-Location app
npm ci
Pop-Location
```

Use `npm install` instead of `npm ci` only to update a dependency or lockfile.

On Windows, if npm skips install scripts, `registry-js` is left without its compiled addon and every
registry read falls back to spawning `reg.exe`, which makes library scans several times slower.
`npm run build` refuses to package in that state; compile it from `app/` with
`npm rebuild registry-js --foreground-scripts`. Electron is left without its binary the same way:
`node node_modules/electron/install.js` fetches it.

## Run in development

```powershell
Push-Location app
npm start
Pop-Location
```

This starts Electron directly from `app/`; the main process launches the Watchdog.

DevTools is closed by default so a hidden dev instance matches the tray footprint. Open it with:

```powershell
$env:AW_OPEN_DEVTOOLS = '1'
npm start
Remove-Item Env:AW_OPEN_DEVTOOLS -ErrorAction SilentlyContinue
```

If `ELECTRON_RUN_AS_NODE` is set in the parent environment, remove it first, because it makes
Electron start as plain Node and the desktop app cannot load:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

Only the Watchdog child process receives that variable. The packaged app never sets it for itself, and
it is not installed as a user or machine environment variable.

### Library performance diagnostics

Development builds write `[perf]` entries to the renderer log (module load, time to paint the last
complete local library, time to the first fresh tile, total scan time), one parser-log line per
discovery with its per-source breakdown, and the main log's time to a showable window. The first
paint value appears from the second launch on. `AW_PERF=1` enables them in a packaged build.

Two benchmarks catch regressions in the work shape; absolute numbers are machine-specific. The first
uses synthetic data and writes only below the system temporary directory. The second walks real
install folders, so it takes the roots as arguments, exits quietly when none exist, and fails if a
memoized pass detects a different executable than the plain walk:

```powershell
node tools/benchmark-library-state.js 500
node tools/benchmark-discovery-walk.js C:\Games
```

### Driving the running app

The main window, the in-game overlay and the notification windows are all BrowserWindows inside the
one tray-daemon process. `tools/aw-probe.ps1` drives a running dev build from the command line, and
`tools/aw-page.js` drives its pages through the Chromium debug port that `Start` opens (9333,
`-DebugPort 0` for none). An installed copy holds the same single-instance lock, so `Start` refuses
to run while one is up: quit it from its tray icon first.

```powershell
.\tools\aw-probe.ps1 Start                                     # launch and wait for the main window
.\tools\aw-probe.ps1 Windows                                   # what is actually on screen
.\tools\aw-probe.ps1 Send -Arguments '--wintype=overlay --appid=480 --description=open'
.\tools\aw-probe.ps1 Shot -Match 'Achievements Overlay' -Out overlay.png
.\tools\aw-probe.ps1 Key  -Keys ESC -FocusMatch 'Achievements Overlay'
.\tools\aw-probe.ps1 Key  -Keys CTRL+SHIFT+K                   # the global overlay hotkey
.\tools\aw-probe.ps1 Wait -Match 'Achievements Overlay' -Absent # exit code 0/1, for scripting
.\tools\aw-probe.ps1 Stop
```

`Click` and `Scroll` take coordinates relative to a window, so a position read off a screenshot can
be replayed wherever the window sits:

```powershell
.\tools\aw-probe.ps1 Click  -Match 'AW Next' -X 1137 -Y 15      # the settings gear
.\tools\aw-probe.ps1 Scroll -Match 'AW Next' -X 760 -Y 450 -Notches -6
.\tools\aw-probe.ps1 Click  -Match 'AW Next' -X 221 -Y 273 -RightClick
.\tools\aw-probe.ps1 Shot   -Screen -Out desktop.png                        # native menus need this
```

Take a screenshot after every step instead of chaining clicks: panels re-layout as settings change,
so a coordinate read a moment ago can land elsewhere. Native context menus are not part of the
Electron window; capture them with `-Screen`.

`Send` works because the single-instance lock forwards argv to the running instance, the channel the
Watchdog uses. To know whether the overlay is on screen, enumerate windows rather than read the logs:
the main process logs an overlay request before it decides what to do with it.

`tools/aw-page.js` drives the pages themselves. A capture comes from the renderer, so it works on a
covered or hidden window, and clicks and typing aim at a CSS selector. `--page` matches a window's
title or URL.

```powershell
node tools/aw-page.js list                                          # every page and its URL
node tools/aw-page.js shot  --page app.html --out main.png
node tools/aw-page.js shot  --page app.html --selector "#settings" --out settings.png
node tools/aw-page.js click --page app.html --selector ".config-button"
node tools/aw-page.js type  --page app.html --selector "input[type=search]" --text "Halo"
node tools/aw-page.js eval  --page update.html --js "document.title"
node tools/aw-page.js wait  --page app.html --selector ".game-tile" --timeout 20
```

The notification area and Windows toasts are outside the app's windows:

```powershell
.\tools\aw-probe.ps1 Tray                     # left-click AW's icon, in the taskbar or the hidden-icons flyout
.\tools\aw-probe.ps1 Tray -RightClick         # open its menu, capture it, close it
.\tools\aw-probe.ps1 Tray -HoverOnly          # capture its tooltip
.\tools\aw-probe.ps1 Toast                    # capture the corner Windows shows toasts in
.\tools\aw-probe.ps1 Offer -Version 3.12.2    # dev only: a fake update through the real offer path
```

`Offer` makes the running dev app offer a fake update (`--fake-update`, ignored by a packaged build)
with the notes of the two latest real releases, so the notification, the tray dot and the update
window can be checked without publishing. Accepting it fails at the download. The update toast stays
on screen and stacks over the hidden-icons flyout: close it before `Tray`. Without `-Out`, captures
go to `..\preuves\<Subject>\` when that workspace folder exists (`-Subject`, default `gui-probe`;
`aw-page.js` takes `--subject`), else to the current folder.

Never send a key without `-FocusMatch` from a tool that runs inside another app: it reaches whatever
window is in front. Dev and the installed app share `%APPDATA%\Achievement Watcher Next`, so back up
`cfg\options.ini` before a test that changes settings and restore it afterwards.

## Run tests

```powershell
Push-Location app
npm test
Pop-Location

Push-Location watchdog
npm test
Pop-Location
```

`npm test` in `app/` runs both suites (the Watchdog one as a second process), so the second block
only repeats the Watchdog half. The app suite covers parsers, discovery, install state, locale
completeness and local Markdown link and anchor checks. Its categories and focused-run commands are
in [test/README.md](test/README.md).

The real-DOM checks (game list, rarity display, settings filter, sorting) need a Chromium-family
browser. They try each installed candidate in turn and skip, printing why, only when none starts.
Point them at a specific binary with `PUPPETEER_EXECUTABLE_PATH`.

After touching a user-visible string, a locale file or an external link, run the locale linter. It
reports every finding at once, which is faster than the single assertion the suite stops at:

```powershell
node tools/locale-lint.js
```

It covers key parity, empty values, placeholder and markup drift against English, English prose
copied into another language, a `t()` slug with no entry, interface text hardcoded in JavaScript,
and Achievement Watcher addresses written outside `app/util/links.js`. Every rule also runs in
`npm test`. `--pseudo` writes a pseudo-locale to `scratch/pseudo.json` for a visual pass; the full
strategy is in [docs/localization.md](docs/localization.md).

Before handing off a change, also run:

```powershell
git diff --check
```

The repository is LF-only except for Windows command files (`.cmd` and `.bat`), which stay CRLF.
Confirm that an editor has not restyled a file:

```powershell
$a = git diff --numstat; $b = git diff --numstat --ignore-cr-at-eol
if (Compare-Object $a $b) { 'line endings were rewritten - fix before committing' } else { 'ok' }
```

## Develop and test on Linux

Windows is the reference platform: a Linux change must leave the Windows path exactly as it was. On
Linux the app is a native Electron app. It never starts Wine itself, and sees Windows games running
under Wine or Proton through their files inside each prefix and through `/proc`.

Install, test and run from a POSIX shell:

```bash
(cd watchdog && npm ci --ignore-scripts)
(cd app && npm ci --ignore-scripts && npx patch-package && node node_modules/electron/install.js)
chmod +x app/node_modules/7zip-bin/linux/x64/7za
(cd app && npm test)
(cd app && npx electron . --no-sandbox)
```

- `--ignore-scripts` mirrors CI. It leaves the bundled `7za` without its executable bit, which the
  archive tests need, and Electron without its binary until `install.js` runs.
- `--no-sandbox` is for a development tree only: the `chrome-sandbox` helper in `node_modules` is
  not setuid root, so Chromium refuses to start without it.
- Both suites run on Linux. A test that only makes sense on one system is skipped there, never
  deleted: `{ skip: process.platform !== 'win32' && 'Windows-only' }`, or the reverse with
  `'Linux-only'`.
- `tools/aw-probe.ps1` is Windows-only. To watch the app on Linux, run it on a virtual display
  (Xvfb) with a notification daemon such as dunst, record the `Notify` calls with `dbus-monitor
  "interface='org.freedesktop.Notifications'"`, and capture the screen with ImageMagick's
  `import -window root`.
- Check a source that reads files under a Windows profile against a real Wine prefix: a test game
  linked to a Steam emulator and run under Wine writes its saves where a player's game would.
- Under a Wayland session the app restarts itself once through XWayland (`--ozone-platform=x11`,
  `app/util/linuxSession.js`), so its popups and overlay can stay above Wine games, which are X11
  windows. A second start with `--toggle-overlay` toggles the overlay of the running copy. Bind that
  to a desktop keyboard shortcut, since the global shortcut does not fire while a native Wayland
  window has the focus.

### Build the AppImage

```bash
(cd app && npm run build:linux)
```

It runs on Linux only. It writes `app/dist/Achievement.Watcher.<version>.AppImage` and
`app/dist/latest-linux.yml`, then checks that both match (see the
[release workflow](docs/RELEASE_WORKFLOW.md#linux-appimage)). The manual **Linux build** workflow in
GitHub Actions does the same on a clean runner. Running an AppImage needs FUSE 2 (`libfuse2`,
`libfuse2t64` on Ubuntu 24.04).

## Build an unpacked app

```powershell
Push-Location app
npx electron-builder --dir --config electron-builder.yml
Pop-Location
```

The executable is `app\dist\win-unpacked\Achievement Watcher.exe`. Use it for packaging smoke tests;
it is not the installed release that proves automatic updates.

## Build the installer

With the Watchdog dependencies installed:

```powershell
Push-Location app
npm run build
Pop-Location
```

Expected output:

```text
app\dist\Achievement.Watcher.Setup.<version>.exe
app\dist\Achievement.Watcher.Setup.<version>.exe.blockmap
app\dist\Achievement.Watcher.Portable.<version>.zip
app\dist\latest.yml
```

The installer uses NSIS. The automatic updater needs `latest.yml` and the blockmap. The portable ZIP
can be extracted anywhere; its marker makes AW Next keep the whole profile in a `data` folder beside
`Achievement Watcher.exe`, without importing the installed app's profile. The final `win-unpacked`
directory comes from that portable packaging pass and follows the same rule.

### Watchdog dependencies after a build

`npm run build` calls `npm run prepare:watchdog`, which prunes Watchdog development dependencies
before packaging. Restore them before running more Watchdog tests:

```powershell
Push-Location watchdog
npm install
Pop-Location
```

The prune can also change `watchdog/package-lock.json`. Inspect the worktree after every build and
keep only intentional changes.

## Packaging configuration

| Path | Purpose |
|---|---|
| `app/electron-builder.yml` | Shared product metadata, files, NSIS target and update provider |
| `app/electron-builder-portable.yml` | ZIP target and portable artifact name |
| `app/build/installer.nsh` | Installer and uninstaller customizations: pages, languages, uninstall cleanup, update run ([details](docs/INSTALLER_AND_UPDATES.md)) |
| `app/build/x86-unicode/AwSetupUi.dll` | The installer and uninstaller window (NSIS plug-in). Source in `native/setup-ui`; rebuild with `node native/setup-ui/build.js` (needs Rust with the `i686-pc-windows-msvc` target) |
| `app/patches/app-builder-lib+26.15.3.patch` | The NSIS template changes `installer.nsh` relies on |
| `app/build/afterPack.js` | Ensures the packaged Watchdog dependency tree is copied correctly |
| `app/build/icon.ico` | Application and installer icon |

The Watchdog runs under Electron's bundled Node through `ELECTRON_RUN_AS_NODE`; no separate Node or
NW.js runtime is packaged.

### Why `npmRebuild` is disabled

`app/electron-builder.yml` sets `npmRebuild: false`. Keep it unless the native-dependency strategy
changes. The current dependencies ship compatible prebuilt binaries, and electron-builder's rebuild
path can fail when the repository path contains spaces.

### Signing

No publicly trusted code-signing certificate is configured, so official releases can still trigger
SmartScreen. Release installers use the project's self-signed `CN=Shirow` certificate. The in-app
updater accepts only installers signed by one of the certificates pinned by thumbprint in
`app/util/updateSignature.js` (the release certificate and an offline standby) and refuses unsigned
ones; users install neither certificate. `npm run build` refuses to finish a signed build whose
certificate is not pinned. Rotation and backup:
[docs/INSTALLER_AND_UPDATES.md](docs/INSTALLER_AND_UPDATES.md#certificates-and-what-happens-if-one-is-lost).

Local builds use the same setup:

```powershell
Push-Location app
powershell -ExecutionPolicy Bypass -File build/signing/create-self-signed-cert.ps1
Pop-Location
```

The script creates `CN=Shirow` and exports `app/build/signing/Shirow.pfx` plus a local `.password`
file (both git-ignored), leaving the Windows trust stores alone. Once the PFX exists, `npm run build`
signs the app and installer; without it the build stays unsigned (see `app/build/build.js`). Never
publish an unsigned build: installed copies refuse it as an update. The packager excludes the PFX,
certificate and password, so downloaders never receive them and the installer never asks to install
a certificate.

To also suppress SmartScreen on a machine you control, run the script again with `-InstallTrust` and
accept the one-time Windows confirmation, which appears only on that machine:

```powershell
Push-Location app
powershell -ExecutionPolicy Bypass -File build/signing/create-self-signed-cert.ps1 -InstallTrust
Pop-Location
```

The certificate is trusted for the current Windows user only, so other machines still show "Windows
protected your PC". Never describe a release as signed by a trusted publisher unless a real
certificate and signature verification have been added.

The Windows Firewall prompt shows the publisher name from the executable metadata and the signing
certificate subject; both are `Shirow` (CompanyName comes from `author` in `app/package.json`).

### Why a self-signed certificate cannot silence SmartScreen for users

Microsoft's SmartScreen documentation says a self-signed certificate behaves on first download like
no signature at all, and no registry key, flag or build option changes that for machines that do not
trust it. The ways to a warning-free install:

1. **Publish through the Microsoft Store.** Microsoft re-signs Store apps, which never show a
   SmartScreen download warning. This is the only option that guarantees none.
2. **Sign with a public code-signing certificate (OV/EV) or Microsoft Artifact Signing** (formerly
   Trusted Signing, roughly $10/month). A new file is still flagged "unrecognized" until reputation
   builds (typically weeks and hundreds of downloads). EV certificates no longer bypass SmartScreen;
   they only show the verified publisher name.
3. **Enterprise only:** distribute from a trusted intranet location, or have an IT administrator
   submit files through the Microsoft Security Intelligence portal.

References:

- [SmartScreen reputation for Windows app developers (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- [What is Artifact Signing? (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/trusted-signing/overview)
- [electron-builder Code Signing documentation](https://www.electron.build/docs/features/code-signing)

## Versioning

The app and Watchdog versions must match across both `package.json` files and both lockfiles. The
app version sets the installer name and the update feed.

Do not edit `app/dist/latest.yml` by hand: the build generates it from the package version. The
[release workflow](docs/RELEASE_WORKFLOW.md) has the complete checklist.
