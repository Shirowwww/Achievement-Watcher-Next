# Contributing

Bug fixes, documentation improvements, translations and focused new features are welcome.

<p align="center"><a href="README.md">← Project home</a> · <a href="docs/README.md">Documentation</a> · <a href="BUILD.md">Build guide</a></p>

## Before opening an issue

- Read the [documentation](docs/README.md) and [troubleshooting guide](docs/troubleshooting.md).
- Search existing issues for the same symptom.
- Reproduce the problem on the latest release when possible.
- Gather the app version, Windows version, source involved and relevant logs.
- Report a suspected vulnerability through the private process in [SECURITY.md](SECURITY.md), never in a public issue.

Use the repository templates for bug reports, feature requests and support questions. Keep reports focused on AW Next itself; the issue tracker cannot provide games, account access or piracy support.

## Development setup

AW Next is developed and packaged on Windows. Follow [BUILD.md](BUILD.md) to install both npm workspaces, run the app and build the installer.

Create a focused branch and inspect the worktree before making changes:

```powershell
git status --short --branch
git switch -c fix/short-description
```

## Change guidelines

- Keep each change focused on one behavior or documentation concern.
- Preserve existing user data and settings compatibility unless a migration is included.
- Add or update tests for parser, discovery, notification and configuration behavior.
- Put user-visible changes under `Unreleased` in [CHANGELOG.md](CHANGELOG.md).
- Keep public claims grounded in behavior that exists in the current code.
- Never commit credentials, tokens, personal paths, game files, build output or local logs.
- Use LF line endings: the repository normalizes to LF (`.gitattributes` + `.editorconfig`),
  with `.cmd`/`.bat` files kept as CRLF. Before committing, `git diff --numstat` must match
  `git diff --numstat --ignore-cr-at-eol`.

## Translations and user-visible text

English is the reference locale. When a new UI key is added, add a meaningful translation to every bundled locale in the same change. Do not leave blank values or duplicate the English sentence as a placeholder in unrelated languages. There is no English fallback at runtime, so a missing key ships as blank UI.

Three rules are worth knowing before writing a user-visible string:

- **Do not format values by hand.** Dates, relative times, played time, counts and percentages come
  from `app/util/intlFormat.js`, which uses `Intl`. The locale files carry the sentence, `Intl`
  carries the value: `"Achievements checked {when}"`, never one key per number of days.
- **Do not write an Achievement Watcher address anywhere but `app/util/links.js`.** Markup names
  the destination with `data-aw-link="troubleshooting"`; the registry holds the URL.
- **Do not translate logs, thrown errors, file names, registry paths or source identifiers.** They
  are addresses, not words, and a log in twenty-eight languages is a log nobody can search.

Check locale work with the linter, then the suite:

```powershell
node tools/locale-lint.js
```

It reports missing and extra keys, empty values, placeholder and markup drift, English prose copied
into another language, a `t()` slug with no entry, interface text hardcoded in JavaScript, and an
address written outside the link registry. Every rule also runs in `npm test`.
`node tools/locale-lint.js --pseudo` writes a pseudo-locale to `scratch/pseudo.json` for a visual
pass: anything still in plain English on screen is a string the locale layer never reached.

The full picture, including what is deliberately left in English and how the documentation site fits
in, is in [docs/localization.md](docs/localization.md). Per-language credits and the procedure for
correcting an existing translation are in [app/locale/README.md](app/locale/README.md).

## Tests

Run the smallest relevant test while developing, followed by both suites before opening a pull request:

```powershell
Push-Location app
npm test
Pop-Location

Push-Location watchdog
npm test
Pop-Location

git diff --check
```

The app suite also verifies every relative Markdown link and heading anchor, including exact file
casing so documentation links do not pass on Windows and then break on GitHub.

For UI or integration work, describe the manual path you tested and include screenshots when they help reviewers verify the result.

## Commits and pull requests

Use short Conventional Commit subjects such as:

- `fix: preserve custom save paths`
- `feat: add source diagnostics`
- `docs: clarify notification setup`
- `test: cover Ubisoft install discovery`

Stage explicit paths and inspect the staged diff before committing. A pull request should explain the problem, the chosen behavior, validation performed and any remaining limitation.

Releases are maintained separately through [docs/RELEASE_WORKFLOW.md](docs/RELEASE_WORKFLOW.md).

## License

By contributing, you agree that your contribution may be distributed under the project's [LGPL-3.0 license](LICENSE). Redistributions must also preserve the applicable project attribution in [NOTICE](NOTICE).
