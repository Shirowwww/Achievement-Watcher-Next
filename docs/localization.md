<div align="center">

# 🌍 Localization

How AW Next is translated, what is deliberately left in English, and what a contributor has to run.

[← Documentation](README.md) · [Contributing](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>

## The short version

| | |
|---|---|
| Application interface | **28 bundled languages**, full key parity, no English fallback at runtime |
| Documentation site | **English only** today, with the language declared so browser translation works |
| Dates, times, durations, numbers | Not translated: `Intl` produces them from the selected language |
| Logs, file names, protocol values, source ids | Not translated, on purpose |
| Check everything | `node tools/locale-lint.js`, or just `cd app && npm test` |

## What gets translated

Anything a user reads on screen. There are three routes into the locale files and no fourth:

1. **Markup with a stable id or list position.** `app/view/app.html` carries English text as the
   reference copy; `app/locale/loader.js` overwrites it for the selected language. Adding a row
   here means adding its binding in the loader in the same change.
2. **`t('slug', 'English', 'Français')`** for strings built in JavaScript - dialogs, menus, busy
   labels. The slug resolves to `dialogs.<slug>` in the locale files, which are the source of
   truth; the two literals are a safety net for a catastrophic locale failure, not a translation.
3. **`localeText('dotted.path')`** for a label that already exists elsewhere in the locale tree.
   It returns an empty string when the locale has not loaded, because a blank label is a visible
   bug and a silently English one is not.

The standalone Watchdog process cannot read the renderer locale files, so its handful of strings
are mirrored in `watchdog/locale.json`.

## What does not get translated

Translating these would make the product worse, not better:

- **Logs and diagnostics.** `parser.log` and `notification.log` are read by the maintainer and
  pasted into issues; a log in twenty-eight languages is a log nobody can search.
- **Thrown `Error` messages.** The dialog around an error is localized; the message itself is shown
  as technical detail. Half a sentence in the reader's language and half in English is worse than
  either.
- **File names, registry paths, INI keys, protocol values, source identifiers.** `steam`,
  `epic-official`, `steam_settings`, `%APPDATA%\Achievement Watcher Next`. These are addresses, not
  words.
- **Product and format names.** "Steam / GBE Fork", "Ubisoft / Uplay R2", "Goldberg".
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

The rule this follows: **the locale files carry the sentence, Intl carries the value.** The Game
Health footer is the shape to copy - `dialogs.gh-verified-when` is `"Achievements checked {when}"`
in every language, and `{when}` is whatever `Intl.RelativeTimeFormat` produces. Three keys per
language for today/yesterday/N-days-ago were three chances to get a plural rule wrong, in twenty-eight
languages, for information ICU already has.

This is also a correctness matter, not only tidiness: playtime used to be built with a language tag
that the duration library did not recognise for Simplified Chinese or Brazilian Portuguese, and its
fallback option turned that into silent English for those users.

The BCP-47 table is spelled out in `intlFormat.js` because the in-game overlay window is sandboxed
and cannot read `app/locale/steam.json`. `test/core/intlFormat.test.js` reconciles the two, so
adding a language is still one edit in practice.

## External links

Every Achievement Watcher address the app can open lives in `app/util/links.js` - home, download,
documentation, the individual documentation pages, presets, issues, security, the upstream credits.
Nothing else may spell one out.

Markup names the destination rather than the address:

```html
<a data-aw-link="troubleshooting" target="_blank">…</a>
```

`applyExternalLinks()` in `app/app.js` fills the `href` in at startup. `test/core/links.test.js`
checks that every documentation slug resolves to a page this site actually publishes, and
`tools/locale-lint.js` fails the build if an address is written by hand anywhere else. The
repository has been renamed once already; the point is that the next rename is one edit.

## The documentation site

This site is published in English only, and that is a decision rather than a gap.

The pages are the same Markdown files that GitHub renders when browsing the repository. There is no
layout, no include and no Liquid template beyond a favicon and a theme toggle, which is what keeps
the two renderings identical. Forking that into twenty-eight directories would mean twenty-eight copies of
every guide drifting apart at different speeds, and a reader landing on a translation that is two
releases behind is worse served than one reading current English.

What is done instead:

- The page declares its language (`site.lang`, plus `content-language`, `og:locale` and a self
  `hreflang` in `_includes/head-custom.html`), which is what browser translation and screen readers
  read. Machine translation of a page that declares itself is good; of one that does not, it is a
  guess.
- The few strings the site builds in script rather than in Markdown - the theme toggle labels and
  the alert box captions - are collected in one `SITE_STRINGS` object in that same file, so they
  are not the one part of the site a translator cannot reach.
- The **in-app Help tab is the localized documentation**. It is translated into all 28 languages,
  it reflects the reader's actual configuration, and it is what the app points at first. The links
  in that tab lead here for the long form.

If a language ever gets a maintained translation of these guides, the shape to add is a sibling
directory with its own `hreflang` beside the one already declared, not a rewrite.

## Adding or changing a string

1. Add the key to `app/locale/lang/english.json` - it is the structural reference.
2. Add a **real translation** to the other 17 files. A missing key ships as blank UI; there is no
   English fallback at runtime.
3. If it is a `t()` slug, it belongs under `dialogs`. Keep the placeholder set identical to English.
4. If it is markup with a position in a list, update the `nth-child` selector in
   `app/locale/loader.js` in the same change. Obsolete rows are hidden, never deleted or reordered.
5. If it is a `watchdog.*` key, mirror it into `watchdog/locale.json`.
6. Run the checks.

```powershell
node tools/locale-lint.js
Push-Location app
npm test
Pop-Location
```

## What the linter checks

`tools/locale-lint.js` is plain Node with no dependency, and every rule also runs inside the test
suite (`test/core/localeLint.test.js`), so a regression fails `npm test` rather than waiting for
someone to run a tool.

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

Two of these are judgement calls rather than facts, and are tuned to stay quiet on real content:

- `copied-from-english` only fires on a value that is three or more words **and** contains an
  English function word. "Ubisoft / Uplay R2" and "Name: A → Z" are the same in every language and
  always will be; "No help topic matches your search." is not.
- `hardcoded-ui-string` ignores log lines, thrown errors, paths, version strings and the arguments
  of the translation helpers. Deliberate exceptions are listed in the allowlist at the top of the
  rule rather than silently skipped.

## The pseudo-locale

```powershell
node tools/locale-lint.js --pseudo
```

writes `scratch/pseudo.json`: every English value with its vowels accented and padded by 30%,
placeholders and markup untouched.

```
"Achievements checked {when}"  ->  "⟦Äçhïëvëmëñtš çhëçkëd {when}·······⟧"
```

Copy it over `app/locale/lang/english.json` in a scratch checkout and run the app. Two things become
visible that no automated rule can see: **anything still in plain English is a string the locale
layer never reached**, and anything clipped or wrapped badly is a label that will break in German
or Russian. Restore the file afterwards - it is written outside `app/locale` so it can never be
picked up as a twenty-ninth bundled language by accident.

## Translation credits

The per-language credits and the update procedure for an existing translation are in
[app/locale/README.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/locale/README.md).
Corrections from fluent speakers are welcome.

<p align="center">

[← Documentation](README.md) · [Contributing](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</p>
