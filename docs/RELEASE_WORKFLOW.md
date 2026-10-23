# Commit and release workflow

The canonical checklist for `Shirowwww/Achievement-Watcher-Next`. Other project documents link here
instead of repeating the release process.

## Commit rules

1. Start with `git status --short --branch` and keep unrelated changes.
2. Split work by concern. Code, tests and the matching `CHANGELOG.md` entry can stay together;
   unrelated docs, dependency refreshes and CI fixes get separate commits.
3. Stage explicit paths, inspect `git diff --cached`, then commit.
4. Use short English Conventional Commit subjects, for example:
   - `fix: sync dependency lockfile`
   - `feat: add controller UI navigation`
   - `docs: clarify notification setup`
   - `chore: update runtime and dependencies`
5. Add no generated-by or unrelated co-authoring attribution to commits or public-facing text.
6. Never rewrite already-pushed history unless the user explicitly asks.

## Release preparation

Use a new SemVer version. A published version is immutable: never replace its installer to force an
update, because clients only update to a higher version.

Set the same version in all of these places:

- `app/package.json`
- `app/package-lock.json` (root package entries)
- `watchdog/package.json`
- `watchdog/package-lock.json` (root package entries)
- `CHANGELOG.md`: move the relevant `Unreleased` entries under the dated version
- `RELEASE_NOTES.md`: title, highlights and installer filename

The README release badge is dynamic. Never hand-edit the generated `app/dist/latest.yml` or
`latest-linux.yml`; the builds create them.

A release is one version for both systems: the Windows installer and the Linux AppImage are built
from the same commit and published together.

After dating the changelog entry, regenerate the site changelog, the discovery files and the search
index:

```powershell
node tools/site/changelog.js
node tools/site/discovery.js
node tools/site/search-index.js
```

Commit `docs/changelog.md`, `docs/releases.xml`, `docs/sitemap.xml` and `docs/data/search.json` with
the release changes. The site workflow rejects them when they drift from `CHANGELOG.md` or the public
guide inventory.

## Documentation accuracy check

Do this for every release, because stale docs accumulate silently otherwise:

- **`README.md` "What it does" list**: add a phrase for any new capability this release ships (a new
  source, a new tool, a reliability or data-safety change). Bug fixes belong in `CHANGELOG.md`. If
  nothing list-worthy shipped, leave the list alone.
- **`docs/comparison.md`**: touch a row only if this release changed the behavior it describes.
  Re-verifying the whole table is a separate, occasional audit (below).
- **Stale absolute paths**: if this release changed a user-data path, filename or directory (the
  3.5.3 `%APPDATA%\Achievement Watcher 3.0` split from the legacy `%APPDATA%\Achievement Watcher` is
  the precedent), grep the whole repo for the old form: public docs, `.github/ISSUE_TEMPLATE/` and
  the local `CLAUDE.md` and `AGENTS.md` notes drift independently and have shipped stale paths.
- **Broken doc links**: confirm every `[text](path#anchor)` added or touched this release resolves.
  A moved file or renamed heading breaks the anchor silently. The app suite checks every relative link
  and heading anchor in the tracked Markdown files.

### Occasional: re-verify the comparison table against competing projects

Do this only on request, or when a competing project's fork clearly changed. Read the competitor's
source (`main.js`, `preload.js`, the renderer HTML, via
`gh api repos/<owner>/<repo>/contents/<path> -H "Accept: application/vnd.github.raw"`), not just its
README, which under-describes real features. Grep the code before downgrading a ✅ to a ❌.

## Clean validation

From the repository root in PowerShell:

```powershell
git diff --check

Push-Location app
npm ci
npm test
node ../tools/audit.js
Pop-Location

Push-Location watchdog
npm ci
npm test
node ../tools/audit.js
Pop-Location
```

`tools/audit.js` is `npm audit --omit=dev --audit-level=high` with a short list of advisories
accepted by id, each with its reason. An accepted advisory blocks again once its package has a fix.

If `npm ci` skipped install scripts, `npm run build` stops on a missing `registry-js` addon (without
it every registry read starts `reg.exe` and a library scan takes 40 to 60 seconds). Run
`npm rebuild registry-js --foreground-scripts` in `app/` and build again.

The app suite includes locale completeness. If a native optional dependency is unavailable on the
current machine, record the exact limitation; never skip a failed check silently.

Before release, confirm the four package and lockfile root versions match:

```powershell
node -e "for (const p of ['app/package.json','app/package-lock.json','watchdog/package.json','watchdog/package-lock.json']) console.log(p, require('./' + p).version)"
```

## Build and artifact checks

Build on Windows from `app/`:

```powershell
Push-Location app
npm run build
Pop-Location
```

Expected files:

- `app/dist/Achievement.Watcher.Setup.<version>.exe`
- `app/dist/Achievement.Watcher.Setup.<version>.exe.blockmap`
- `app/dist/Achievement.Watcher.Portable.<version>.zip`
- `app/dist/latest.yml`

Check that `latest.yml` names the exact installer and version, and that its SHA-512 matches the built
installer:

```powershell
$version = (Get-Content app/package.json | ConvertFrom-Json).version
$installer = "app/dist/Achievement.Watcher.Setup.$version.exe"
$expected = [Convert]::ToBase64String(
  [Security.Cryptography.SHA512]::HashData([IO.File]::ReadAllBytes($installer))
)
Get-Content app/dist/latest.yml
$expected
```

The documentation links to a VirusTotal report for the current installer, keyed on its SHA-256.
Upload the installer to VirusTotal once so the report exists: a hash lookup never creates one, and a
link to a file nobody submitted is dead. Step 5 below rewrites the hash and version everywhere the
site quotes them.

Also smoke-test the packaged runtime and the affected feature path. To inspect the runtime, use
Electron as Node temporarily and always remove the variable:

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& 'app/dist/win-unpacked/Achievement Watcher.exe' -e "console.log(process.versions)"
Remove-Item Env:ELECTRON_RUN_AS_NODE
```

The build runs `npm prune --omit=dev` in `watchdog/`. Restore its development dependencies afterward
with `npm install` from `watchdog/`.

### Linux AppImage

The AppImage is built on Linux, from the same commit as the installer. Either run the manual
**Linux build** workflow (`.github/workflows/build-linux.yml`) on that commit and download its
`linux-appimage` artifact, or build on a Linux machine:

```bash
(cd watchdog && npm ci --ignore-scripts)
(cd app && npm ci --ignore-scripts && npx patch-package && npm run build:linux)
```

Expected files:

- `app/dist/Achievement.Watcher.<version>.AppImage`
- `app/dist/latest-linux.yml`

`build/build-linux.js` fails the build unless the AppImage is executable, its embedded
`app-update.yml` points at `Shirowwww/Achievement-Watcher-Next`, and `latest-linux.yml` carries this
version and the AppImage's SHA-512. Then start the AppImage once on Linux and check the affected
feature path. It needs FUSE 2 (`libfuse2`, `libfuse2t64` on Ubuntu 24.04).

The AppImage is not code-signed: an update is trusted through HTTPS and the SHA-512 in
`latest-linux.yml`.

## Push, CI and GitHub release

1. Make sure commits are atomic and the worktree holds no accidental files.
2. Push `main` to `origin` and wait for `.github/workflows/test.yml` to pass. It runs lint, both
   suites and the dependency audits on Windows (Node 22.22.2 and 24.19.0) and on Linux (Node 24.19.0).
3. Create the GitHub release only after CI succeeds, uploading the Windows updater assets, the
   portable archive, and the AppImage with `latest-linux.yml`:

```powershell
$version = (Get-Content app/package.json | ConvertFrom-Json).version
$target = git rev-parse HEAD
gh release create "v$version" `
  "app/dist/Achievement.Watcher.Setup.$version.exe" `
  "app/dist/Achievement.Watcher.Setup.$version.exe.blockmap" `
  "app/dist/Achievement.Watcher.Portable.$version.zip" `
  "app/dist/latest.yml" `
  "app/dist/Achievement.Watcher.$version.AppImage" `
  "app/dist/latest-linux.yml" `
  --repo Shirowwww/Achievement-Watcher-Next `
  --target $target `
  --title "Achievement Watcher Next $version" `
  --notes-file RELEASE_NOTES.md
```

4. Verify the release page exposes the installer, portable ZIP, blockmap, `latest.yml`, the AppImage
   and `latest-linux.yml`, and that both public manifests download. Once an AppImage has been
   published, **every later release must carry `latest-linux.yml`**: without it, each installed
   AppImage reports an error on every update check.
5. Refresh the version, installer link and VirusTotal hash the site quotes, and commit the result:

```powershell
node tools/site/release-data.js
git status --short
git add docs/data/release.json
git commit -m "docs: publish <version> on the site"
```

   The script reads the latest published release, writes `docs/data/release.json` and rewrites the
   version and hash in `README.md`, `docs/index.html`, `docs/faq.md`, `docs/troubleshooting.md` and
   the translation files in `docs/assets/i18n/`. Add every file `git status` lists. The site reads
   the JSON from its own origin, so a visitor spends no GitHub API rate limit to see a version
   number; missing or stale, the pages fall back to their own wording and never show a wrong version.
6. Nothing to run for the rest. `.github/workflows/publish.yml` opens the winget update PR for
   `Shirow.AchievementWatcherNext` when the release is published (it needs the `WINGET_TOKEN`
   secret, a classic token with the `public_repo` scope, and skips without it). It also asks the
   IndexNow engines to recrawl the site after each Pages build of `main`. Both can be rerun from the
   Actions tab.

## Identifiers that must not change

The product was renamed to Achievement Watcher Next in 3.9.0, but several identifiers kept their
historical value because an existing install is keyed on them. Changing one breaks upgrades, and
`test/core/branding.test.js` pins them:

| Identifier | Value | Why it stays |
|---|---|---|
| `appId` (AppUserModelID) | `io.github.shirowwww.achievement.watcher` | Windows matches toasts and taskbar pins against it; it also names the autostart registry value, which the uninstaller removes by that name |
| `executableName` | `Achievement Watcher` | Fixes the .exe name, install directory and uninstaller filename; the autostart registry value stores that full path, and the Watchdog spawns the app by it |
| `app.setName()` | `Achievement Watcher` | Names the main log file |
| Installer artifact | `Achievement.Watcher.Setup.<version>.exe` | Referenced by `latest.yml`; published releases are immutable |
| `updaterCacheDirName` | `achievement-watcher-updater` | Existing partially downloaded updates live there |
| Linux `executableName` | `achievement-watcher` | The Watchdog starts the app by that name on Linux |
| AppImage artifact | `Achievement.Watcher.<version>.AppImage` | Referenced by `latest-linux.yml` and named by the site |
| Legacy data folders | `Achievement Watcher 3.0`, `Achievement Watcher` | Import sources for the one-way migration; never renamed or deleted |

### The repository rename

The repository was renamed `Achievement-Watcher-3.0` → `Achievement-Watcher-Next` for 3.9.0. Clients
released before 3.9.0 ship an `app-update.yml` naming the old repository, so they reach new releases
only through GitHub's permanent rename redirect. The `releases.atom` feed, the `latest.yml` channel
file and the installer asset all follow that 301 through electron-updater's own HTTP stack.

**Never create a new repository at `Shirowwww/Achievement-Watcher-3.0`.** It would take over the old
path, kill the redirect and strand every client older than 3.9.0. Releases must also stay on this
repository: moving them to another owner or repo breaks the same path.

## Auto-update proof

An updater check proves something only from an installed lower version to the newly published higher
version.

1. Keep the previous stable installer and install and run that version.
2. Publish the new higher version with its matching `latest.yml`, installer and blockmap.
3. Launch the previous installed version normally (not `npm start`).
4. Confirm the logs show the GitHub feed check, the new version download and the restart prompt. A
   differential download logs "Download block maps"; a line "Cannot download differentially, fallback
   to full download" is not a failure, but note it. `[updater] update signer accepted` must appear
   before the install: an unsigned or unpinned installer is refused (see
   [INSTALLER_AND_UPDATES.md](INSTALLER_AND_UPDATES.md)).
5. Accept the restart, then confirm the running app reports the new version.

On Linux the same proof starts from the previous AppImage, run as a file the user owns. After
"Update now", electron-updater replaces it with `Achievement.Watcher.<version>.AppImage` and restarts
it; the log then reports the new version, and the autostart entry, when enabled, points at the new
file. There is no signer line on Linux: the SHA-512 in `latest-linux.yml` is the check.

Do not claim auto-update success from source mode, an unpacked build, or a same-version asset
replacement.

## Final handoff

- Confirm `git status --short --branch` is clean and synchronized.
- Report tests, build output, CI result, release URL and updater result separately.
- If the user asked to relaunch the application, relaunch the installed build only after validation
  is complete.
