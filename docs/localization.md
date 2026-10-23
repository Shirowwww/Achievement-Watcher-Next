<div align="center">

# Localization

How AW Next is translated, what stays in English, and what a contributor has to run.

[← Documentation](README.md) · [Contributing](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>

## The short version

| | |
|---|---|
| Application interface | 28 bundled languages, full key parity, enforced by tests |
| Website: the guides | English only, with the language declared so browser translation works |
| Website: home page and the two galleries | 9 languages, as an overlay over the English markup |
| Dates, times, durations, numbers | Not translated: `Intl` produces them from the selected language |
| Logs, file names, protocol values, source ids | Not translated |
| Check everything | `node tools/locale-lint.js`, or `cd app && npm test` |

## What gets translated

Anything a user reads on screen. There are three routes into the locale files:

1. **Markup with a stable id or list position.** `app/view/app.html` carries English text as the
   reference copy and `app/locale/loader.js` overwrites it for the selected language. A new row
   needs its binding in the loader in the same change.
2. **`t('slug', 'English', 'Français')`** for strings built in JavaScript: dialogs, menus, busy
   labels. The slug resolves to `dialogs.<slug>` in the locale files, which are the source of truth.
   The two literals are a safety net for a catastrophic locale failure, not a translation.
3. **`localeText('dotted.path')`** for a label that already exists elsewhere in the locale tree. It
   returns an empty string when the locale has not loaded, because a blank label is a visible bug and
   a silently English one is not.

The standalone Watchdog process cannot read the renderer locale files, so its few strings are
mirrored in `watchdog/locale.json`.

## What does not get translated

- **Logs and diagnostics.** `parser.log` and `notification.log` are read by the maintainer and pasted
  into issues; a log in twenty-eight languages is a log nobody can search.
- **Thrown `Error` messages.** The dialog around an error is localized and the message is shown as
  technical detail. Half a sentence in the reader's language and half in English is worse than either.
- **File names, registry paths, INI keys, protocol values, source identifiers.** `steam`,
  `epic-official`, `steam_settings`, `%APPDATA%\Achievement Watcher Next` are addresses, not words.
- **Product and format names.** "Steam / GBE Fork", "Ubisoft / Uplay R1/R2", "Goldberg".
- **Dates, relative times, durations, numbers and percentages.** See below.

## Dates, numbers and durations come from Intl

`app/util/intlFormat.js` is the only place that formats a value rather than a sentence. It maps the
app's language id to a BCP-47 tag and hands the work to the platform:

| Value | API |
|---|---|
| A date or a timestamp | `Intl.DateTimeFormat` |
| "3 days ago", "yesterday" | `Intl.RelativeTimeFormat` |
| Played time | `Intl.DurationFormat` |
| Counts and percentages | `Intl.NumberFormat` |
| "Steam, GOG and Epic" | `Intl.ListFormat` |

The locale files carry the sentence and Intl carries the value. The Game Health footer is the model:
`dialogs.gh-verified-when` is `"Achievements checked {when}"` in every language, and `{when}` is what
`Intl.RelativeTimeFormat` produces. That is one key per language instead of one each for today,
yesterday and N days ago, each a chance to get a plural rule wrong.

The sandboxed overlay window cannot read `app/locale/steam.json`, so the BCP-47 table is spelled out
in `intlFormat.js`; `test/core/intlFormat.test.js` reconciles the two.

## External links

Every Achievement Watcher address the app can open lives in `app/util/links.js`: home, download,
documentation, the individual documentation pages, presets, issues, security, the upstream credits.
Nothing else may spell one out. Markup names the destination instead of the address:

```html
<a data-aw-link="troubleshooting" target="_blank">…</a>
```

`applyExternalLinks()` in `app/app.js` fills the `href` in at startup. `test/core/links.test.js`
checks that every documentation slug resolves to a page the site publishes, and
`tools/locale-lint.js` fails the build if an address is written by hand anywhere else. A repository
rename is then one edit.

## The website

The site has two parts, localized differently.

### The guides

The guides are English only, by decision. They are the same Markdown files GitHub renders in the
repository; the site adds a shared layout (`docs/_layouts/default.html`) with the header, contents
list and guide list, and leaves the Markdown alone. Twenty-eight forked copies would drift apart at
different speeds, and a translation two releases behind serves a reader worse than current English.

Each page declares its language (`site.lang`: the `<html lang>` attribute, `content-language` and a
self `hreflang`, from `docs/_layouts/default.html` and `docs/_includes/head-custom.html`), which is
what browser translation and screen readers read.

The in-app Help tab is the localized documentation: translated into all 28 languages, tailored to
the reader's configuration, and what the app points at first. Its links lead here for the long form.
A maintained translation of the guides would go in a sibling directory with its own `hreflang`.

### The home page and the two galleries

These three are hand-written pages, translated one language at a time without forking anything.
Nine languages are complete: French, German, Spanish, Italian, Portuguese (Brazil), Polish, Russian,
Japanese and Simplified Chinese, all languages the application is already translated into.

English lives in the markup: every visible string is in `docs/index.html`, `docs/gallery/index.html`
and `docs/gallery/themes/index.html` and carries `data-i18n`, so the pages are complete and indexable
before a script runs. That covers the navigation, both galleries, the submission forms and
everything their scripts say back to a sender, validation refusals included. A translation is an
overlay: a flat JSON file of key to string in `docs/assets/i18n/`, applied over that markup after
load. A missing key falls back to the English on the page.

| | |
|---|---|
| Start a language | `node tools/site/extract-strings.js > docs/assets/i18n/fr.json` |
| Make it appear | add `{ "code": "fr", "name": "Francais" }` to `docs/assets/i18n/languages.json` |
| Check it | `node tools/site/extract-strings.js --check` |

`extract-strings.js` reads the pages plus the fallbacks the page scripts pass to `awI18n.t()`, so the
key list is generated, not maintained. `--check` fails on a key that no longer exists in the markup
and reports the ones not translated yet. `test/site/pages.test.js` enforces the rule the overlay
depends on: one key, one English string, wherever it appears.

## Adding or changing a string

1. Add the key to `app/locale/lang/english.json`, the structural reference.
2. Add a real translation to the other 27 files. The loader would show the English text for a
   missing or empty key, but the parity tests fail on one, so a gap never ships.
3. A `t()` slug belongs under `dialogs`. Keep the placeholder set identical to English.
4. Markup with a position in a list needs its `nth-child` selector in `app/locale/loader.js` updated
   in the same change. Obsolete rows are hidden, never deleted or reordered.
5. A `watchdog.*` key is mirrored into `watchdog/locale.json` with `node tools/sync-watchdog-locale.js`
   (`--check` reports drift; `npm test` fails on it).
6. Run the checks:

```powershell
node tools/locale-lint.js
Push-Location app
npm test
Pop-Location
```

## What the linter checks

`tools/locale-lint.js` is plain Node with no dependency. Every rule also runs inside the test suite
(`test/core/localeLint.test.js`), so a regression fails `npm test`.

| Rule | What it catches |
|---|---|
| `missing-key` / `extra-key` | A locale that has drifted from the English key set |
| `empty-value` | A key present but never translated |
| `placeholder-mismatch` | `{count}` dropped, renamed or invented in a translation |
| `markup-mismatch` | `<b>` lost or unbalanced in a translation |
| `copied-from-english` | An English sentence pasted into another language unchanged |
| `missing-dialog-slug` | A `t('slug')` the locale files do not define |
| `hardcoded-ui-string` | Interface prose in JavaScript that no translation helper wraps |
| `uncentralized-link` | An Achievement Watcher address written outside `app/util/links.js` |
| `dead-docs-link` | An in-app link to a documentation page that does not exist |
| `unknown-link-key` | A `data-aw-link` naming something the registry does not hold |

Two rules are judgement calls, tuned to stay quiet on real content:

- `copied-from-english` fires only on a value of three or more words that contains an English
  function word. "Ubisoft / Uplay R1/R2" and "Name: A → Z" are the same in every language;
  "No help topic matches your search." is not.
- `hardcoded-ui-string` ignores log lines, thrown errors, paths, version strings and the arguments of
  the translation helpers. Deliberate exceptions are in the allowlist at the top of the rule.

## The pseudo-locale

```powershell
node tools/locale-lint.js --pseudo
```

writes `scratch/pseudo.json`: every English value with its vowels accented and padded by 30%,
placeholders and markup untouched.

```
"Achievements checked {when}"  ->  "⟦Äçhïëvëmëñtš çhëçkëd {when}·······⟧"
```

Copy it over `app/locale/lang/english.json` in a scratch checkout and run the app. Anything still in
plain English is a string the locale layer never reached; anything clipped or badly wrapped will
break in German or Russian. Restore the file afterwards. The pseudo-locale is written outside
`app/locale` so it is never picked up as a twenty-ninth bundled language.

## Translation credits

The per-language credits and the procedure for updating an existing translation are in
[app/locale/README.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/locale/README.md).
Corrections from fluent speakers are welcome.

<p align="center">

[← Documentation](README.md) · [Contributing](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</p>
