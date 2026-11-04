# Commit and release workflow

The checklist for `Shirowwww/Achievement-Watcher-Next`. Other documents link here instead of
repeating it.

## Commit rules

- Split work by concern. Code, tests and the matching `CHANGELOG.md` entry go together; unrelated
  docs, dependency updates and CI fixes get their own commits.
- Stage explicit paths and read `git diff --cached` before committing.
- Use short English Conventional Commit subjects: `fix: sync dependency lockfile`,
  `feat: add controller UI navigation`, `docs: clarify notification setup`.
- No generated-by or co-author attribution in commits or public text.
- Never rewrite history that is already pushed.

## Release preparation

Use a new SemVer version. A published version is immutable: clients only update to a higher one, so
never replace an installer to force an update.

Set the same version in `app/package.json`, `watchdog/package.json` and the root entries of both
lockfiles, then move the `Unreleased` entries of `CHANGELOG.md` under the dated version and write
`RELEASE_NOTES.md` (title, highlights, file names). Check the four versions:

```powershell
node -e "for (const p of ['app/package.json','app/package-lock.json','watchdog/package.json','watchdog/package-lock.json']) console.log(p, require('./' + p).version)"
```

Regenerate the site files and commit them with the release; the Site workflow rejects them when they
drift from `CHANGELOG.md`:

```powershell
node tools/site/changelog.js
node tools/site/discovery.js
node tools/site/search-index.js
node tools/site/release-notes.js
```

`release-notes.js` copies `RELEASE_NOTES.md` into `docs/data/notes/english.json`. The update window
shows those notes in the app's language, so the new version then has to be translated block for
block into the other 27 files of that folder (the `locale-translator` agent does it);
`node tools/site/release-notes.js --check` lists what is missing and `npm test` fails on it. A
version without a translation still shows, in English, so a late translation only delays the
language, never the release. The same goes for the guides: a change to an English guide updates its
copy in each `docs/<code>/` folder, or says that the copies are behind
(`node tools/site/translation-check.js` for the structure, `docs/localization.md` for the rules).

Before each release, also check the docs: the README's "What it does" for a new capability,
`docs/comparison.md` for a behaviour this release changed, and every path, file name or link the
release renamed (the app suite checks relative links and heading anchors).

## Clean validation

From the repository root:

```powershell
git diff --check
Push-Location app; npm ci; npm test; node ../tools/audit.js; Pop-Location
Push-Location watchdog; npm ci; npm test; node ../tools/audit.js; Pop-Location
```

`tools/audit.js` is `npm audit --omit=dev --audit-level=high` with a short list of advisories
accepted by id, each with its reason; one blocks again once its package has a fix. If `npm ci`
skipped install scripts, run `npm rebuild registry-js --foreground-scripts` in `app/`, or the build
stops on the missing addon.

The audit only covers what `app/` and `watchdog/` ship. Before building, clear the open security
alerts and dependency pull requests too, so their fixes ship in this release:

```powershell
gh api "repos/Shirowwww/Achievement-Watcher-Next/dependabot/alerts?state=open" --jq '.[] | "\(.number) \(.security_advisory.severity) \(.dependency.package.name) \(.dependency.manifest_path)"'
gh api "repos/Shirowwww/Achievement-Watcher-Next/code-scanning/alerts?state=open" --jq '.[] | "\(.number) \(.rule.severity) \(.rule.id) \(.most_recent_instance.location.path)"'
gh pr list --repo Shirowwww/Achievement-Watcher-Next
```

Fix what has a fix (an update, or an `overrides` entry for a nested package, then rebuild and test
what it touches) and dismiss the rest with its reason. Alerts are computed on `main` and clear once
the fix is pushed there.

## Build and artifact checks

```powershell
Push-Location app; npm run build; Pop-Location
```

This produces `Achievement.Watcher.Setup.<version>.exe`, its `.blockmap`,
`Achievement.Watcher.Portable.<version>.zip` and `latest.yml` in `app/dist/`. Check that
`latest.yml` names this installer and that its SHA-512 matches:

```powershell
$version = (Get-Content app/package.json | ConvertFrom-Json).version
[Convert]::ToBase64String([Security.Cryptography.SHA512]::HashData([IO.File]::ReadAllBytes("app/dist/Achievement.Watcher.Setup.$version.exe")))
Get-Content app/dist/latest.yml
```

The docs link to the installer's VirusTotal report by its SHA-256, so upload the installer there
once before publishing: a hash lookup never creates a report.

Smoke-test the packaged app and the feature the release changed. The build prunes the Watchdog's dev
dependencies: run `npm install` in `watchdog/` before working on it again.

### Linux AppImage

Built on Linux from the same commit as the installer: run the manual **Linux build** workflow on
that commit and download its `linux-appimage` artifact, or build on a Linux machine:

```bash
(cd watchdog && npm ci --ignore-scripts)
(cd app && npm ci --ignore-scripts && npx patch-package && npm run build:linux)
```

It produces `Achievement.Watcher.<version>.AppImage` and `latest-linux.yml`. `build/build-linux.js`
fails unless the AppImage is executable, its `app-update.yml` points at this repository and
`latest-linux.yml` carries this version and its SHA-512. Start it once on Linux (it needs FUSE 2:
`libfuse2t64` on Ubuntu 24.04). The AppImage is not signed; updates are trusted through HTTPS and
that SHA-512.

### Millennium plugin

Shipped with every release under the same name, so the README's link to the latest release stays
valid:

```powershell
Push-Location millennium; npm ci; npm run check; npm run zip; Pop-Location
```

Expected file: `millennium/dist/aw-next-millennium.zip`, one `aw-next/` folder holding
`plugin.json`, `README.md`, `backend/main.lua` and `.millennium/Dist/index.js`.

The app updates installed copies of this zip and of the Playnite `.pext` from the latest release
(`app/util/extensionUpdate.js`). It looks the assets up by name (`aw-next-millennium.zip`,
`AwNextAchievements_*.pext`) and swaps a folder only when the packaged `version` is higher, so a
changed plugin needs its version raised or no installed copy follows.

### Playnite extension

Packed by the `Toolbox.exe` that comes with Playnite. When the extension changes, raise `Version` in
`playnite/extension.yaml` and `playnite/AwNextAchievements.csproj` together.

```powershell
Push-Location playnite
dotnet test Tests
dotnet build -c Release -o build
& "<Playnite folder>\Toolbox.exe" pack build dist
Pop-Location
```

Expected file: `playnite/dist/AwNextAchievements_4ae86d6e-6590-497f-adf9-0d373068627d_<version>.pext`.

## Push, CI and GitHub release

1. Push `main` and wait for `.github/workflows/test.yml` (lint, both suites and the audits on
   Windows and Linux) to pass.
2. Create the release only then, with every asset:

```powershell
$version = (Get-Content app/package.json | ConvertFrom-Json).version
gh release create "v$version" `
  "app/dist/Achievement.Watcher.Setup.$version.exe" `
  "app/dist/Achievement.Watcher.Setup.$version.exe.blockmap" `
  "app/dist/Achievement.Watcher.Portable.$version.zip" `
  "app/dist/latest.yml" `
  "app/dist/Achievement.Watcher.$version.AppImage" `
  "app/dist/latest-linux.yml" `
  "millennium/dist/aw-next-millennium.zip" `
  (Get-Item "playnite/dist/*.pext").FullName `
  --repo Shirowwww/Achievement-Watcher-Next `
  --target (git rev-parse HEAD) `
  --title "Achievement Watcher Next $version" `
  --notes-file RELEASE_NOTES.md
```

3. Check the release page lists all eight files and that both manifests download. **Every release
   must carry `latest-linux.yml`**, or each installed AppImage reports an error on every update check.
4. Refresh the version, installer link and VirusTotal hash the site quotes, then commit every file
   `git status` lists as `docs: publish <version> on the site`:

```powershell
node tools/site/release-data.js
node tools/site/faq.js
node tools/site/search-index.js
```

   `release-data.js` reads the latest published release and writes `docs/data/release.json`, which
   the site reads from its own origin; without it the pages fall back to their own wording.
5. `.github/workflows/publish.yml` then opens the winget update PR and asks IndexNow to recrawl the
   site. Both can be rerun from the Actions tab.

## Identifiers that must not change

The product was renamed to Achievement Watcher Next in 3.9.0, but installs are keyed on these
identifiers, so they keep their old values. `test/core/branding.test.js` pins them:

| Identifier | Value | Why it stays |
|---|---|---|
| `appId` (AppUserModelID) | `io.github.shirowwww.achievement.watcher` | Windows matches toasts and taskbar pins against it; it also names the autostart registry value the uninstaller removes |
| `executableName` | `Achievement Watcher` | The .exe name, install directory and uninstaller; the autostart value stores that path and the Watchdog starts the app by it |
| `app.setName()` | `Achievement Watcher` | Names the main log file |
| Installer artifact | `Achievement.Watcher.Setup.<version>.exe` | Referenced by `latest.yml` |
| `updaterCacheDirName` | `achievement-watcher-updater` | Partly downloaded updates live there |
| Linux `executableName` | `achievement-watcher` | The Watchdog starts the app by that name on Linux |
| AppImage artifact | `Achievement.Watcher.<version>.AppImage` | Referenced by `latest-linux.yml` and the site |
| Legacy data folders | `Achievement Watcher 3.0`, `Achievement Watcher` | Sources of the one-way migration; never renamed or deleted |

### The repository rename

The repository was renamed from `Achievement-Watcher-3.0` for 3.9.0. Older clients name the old
repository and reach new releases only through GitHub's permanent redirect. **Never create a
repository at `Shirowwww/Achievement-Watcher-3.0`**, and never move releases to another repository:
either strands every client older than 3.9.0.

## Auto-update proof

Only an installed lower version updating to the newly published one proves anything: not source
mode, an unpacked build or a replaced asset.

1. Run the previous stable version, installed.
2. Publish the new version.
3. Start the installed copy normally and check its log: the feed check, the download,
   `[updater] update signer accepted` before the install (an unsigned or unpinned installer is
   refused, see [INSTALLER_AND_UPDATES.md](INSTALLER_AND_UPDATES.md)), then the restart. A
   "fallback to full download" line is not a failure.
4. Confirm the restarted app reports the new version.

On Linux, start from the previous AppImage, run as a file the user owns. "Update now" replaces it
with the new AppImage and restarts it; there is no signer line, the SHA-512 in `latest-linux.yml` is
the check.
