# Contributing

Bug fixes, documentation improvements, translations and focused new features are welcome.

<p align="center"><a href="README.md">← Project home</a> · <a href="docs/README.md">Documentation</a> · <a href="BUILD.md">Build guide</a></p>

## Before opening an issue

- Read the [documentation](docs/README.md) and the [troubleshooting guide](docs/troubleshooting.md).
- Search existing issues for the same symptom.
- Reproduce the problem on the latest release when possible.
- Gather the app version, your system (Windows version, or Linux distribution and desktop, with Wine or Proton for a Windows game), the source involved and the relevant logs.
- Report a suspected vulnerability through the private process in [SECURITY.md](SECURITY.md), never in a public issue.

Use the repository templates for bug reports, feature requests and support questions. Keep reports about AW Next itself; the issue tracker cannot provide games, account access or piracy support. Questions and ideas also fit the [Discord server](https://discord.gg/DjTMrDsXTh).

## Development setup

[BUILD.md](BUILD.md) covers installing both npm workspaces, running the app and building the installer on Windows. For Linux work and the AppImage, see [Develop and test on Linux](BUILD.md#develop-and-test-on-linux).

Create a focused branch and inspect the worktree before making changes:

```powershell
git status --short --branch
git switch -c fix/short-description
```

## Change guidelines

- Keep each change to one behavior or documentation concern.
- Preserve existing user data and settings compatibility unless a migration is included.
- Add or update tests for parser, discovery, notification and configuration behavior.
- A new achievement source is read by the app and by the Watchdog, each with its own list: follow
  [Wiring a save-file emulator](docs/architecture.md#wiring-a-save-file-emulator).
- Put user-visible changes under `Unreleased` in [CHANGELOG.md](CHANGELOG.md).
- Claim publicly only what the current code does.
- Never commit credentials, tokens, personal paths, game files, build output or local logs.
- Use LF line endings: the repository normalizes to LF (`.gitattributes` + `.editorconfig`), with
  `.cmd`/`.bat` files kept as CRLF. Before committing, `git diff --numstat` must match
  `git diff --numstat --ignore-cr-at-eol`.

## Windows and Linux

AW Next ships for Windows and Linux. Windows comes first: a change must not alter what the Windows
build does. Consider both systems whenever a change touches one of the areas below; the full table
is in [docs/architecture.md](docs/architecture.md#windows-and-linux).

- **Folders under a user profile.** Do not read `process.env.APPDATA`, `LOCALAPPDATA`,
  `USERPROFILE` or `PUBLIC` directly. Take the hosts (`appHosts()` in the app) and one root per host.
  On Windows that is this machine; on Linux it is the native XDG folders plus every Wine, Proton,
  Lutris, Heroic and Bottles prefix.
- **Registry.** Read it through a host (`host.regValue` and its siblings), never through
  `app/util/reg.js` directly for a path: on Linux a game's registry is its prefix's `user.reg` and
  `system.reg`. Turn a Windows path into a local one with `host.localPath()`, and back with
  `host.windowsPath()` when a Windows program will read it.
- **Paths.** Split on `[\\/]`, not on `\\`. Compare paths with `winHosts.pathKey()`: Windows
  filesystems ignore case, Linux ones do not, so a folder name must be spelled the same way in the
  app and in the Watchdog.
- **Processes.** Linux processes come from `/proc` (`watchdog/util/procSnapshot.js`); a Windows game
  under Wine is named by its `.exe`, taken from its command line.
- **Desktop integration.** Notifications, sound, autostart, tray, game launch, screenshots and
  updates each have their own Linux path. Check a new notification or setting on both.
- **Code only one system can run** stays behind `process.platform` or the host layer, and its tests
  are skipped on the other system, not deleted. A Linux test of a source builds a fake prefix with
  `withWinePrefix` from `test/helpers/winePrefix.js`.

## Translations and user-visible text

English is the reference locale. A new UI key needs a meaningful translation in every bundled locale
(28) in the same change. Leave no blank values and do not paste the English sentence as a placeholder
in other languages. The parity tests fail on a missing or empty key.

Before writing a user-visible string:

- **Do not format values by hand.** Dates, relative times, played time, counts and percentages come
  from `app/util/intlFormat.js`, which uses `Intl`. The locale files carry the sentence and `Intl`
  carries the value: `"Achievements checked {when}"`, never one key per number of days.
- **Write an Achievement Watcher address only in `app/util/links.js`.** Markup names the destination
  with `data-aw-link="troubleshooting"`; the registry holds the URL.
- **Do not translate logs, thrown errors, file names, registry paths or source identifiers.** They
  are addresses, not words, and a log in twenty-eight languages is a log nobody can search.

Check locale work with the linter, then the suite:

```powershell
node tools/locale-lint.js
```

Its rules (key parity, empty values, placeholder and markup drift, copied English, missing `t()`
slugs, hardcoded interface text, addresses outside the link registry) also run in `npm test`.
`--pseudo` writes a pseudo-locale to `scratch/pseudo.json` for a visual pass.

[docs/localization.md](docs/localization.md) has the full picture, including what stays in English
and how the documentation site fits in. [app/locale/README.md](app/locale/README.md) has the
per-language credits and the procedure for correcting a translation.

## Tests

While developing, run the smallest relevant test. Before opening a pull request, run both suites:

```powershell
Push-Location app
npm test
Pop-Location

Push-Location watchdog
npm test
Pop-Location

git diff --check
```

`npm test` in `app/` already runs the Watchdog suite as a second process, so the `watchdog/` run is
only needed to run that suite alone. When a change touches anything under
[Windows and Linux](#windows-and-linux), run both suites on Linux as well, as described in
[BUILD.md](BUILD.md#develop-and-test-on-linux).

The app suite also verifies every relative Markdown link and heading anchor, including exact file
casing, so documentation links that pass on Windows do not break on GitHub.

The linter covers `app`, `watchdog`, `test` and `tools`, and runs in CI on every push:

```powershell
Push-Location app
npm run lint
Pop-Location
```

For UI or integration work, describe the manual path you tested and include screenshots when they
help reviewers verify the result.

## Commits and pull requests

Use short Conventional Commit subjects such as:

- `fix: preserve custom save paths`
- `feat: add source diagnostics`
- `docs: clarify notification setup`
- `test: cover Ubisoft install discovery`

Stage explicit paths and inspect the staged diff before committing. A pull request explains the
problem, the chosen behavior, the validation performed and any remaining limitation.

Releases are maintained separately; see [docs/RELEASE_WORKFLOW.md](docs/RELEASE_WORKFLOW.md).

## License

By contributing, you agree that your contribution may be distributed under the project's [LGPL-3.0 license](LICENSE). Redistributions must also preserve the applicable project attribution in [NOTICE](NOTICE).
