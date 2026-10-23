# Interface translations

AW Next loads interface text from `app/locale/lang`. English is the reference locale. When the selected
language has no game metadata, the upstream game source may return English instead.

<p align="center"><a href="../../README.md">← Project home</a> · <a href="../../CONTRIBUTING.md">Contributing</a></p>

## Bundled languages

The build includes 28 languages: Brazilian Portuguese, Chinese (Simplified), Chinese (Traditional),
Czech, Danish, Dutch, English, Finnish, French, German, Greek, Hungarian, Indonesian, Italian,
Japanese, Korean, Latin American Spanish, Norwegian, Polish, Portuguese, Russian, Slovak, Spanish,
Swedish, Thai, Turkish, Ukrainian and Vietnamese.

`uiLanguages.js` exposes only languages that have a matching JSON file. Other entries in `steam.json`
stay available as Steam language metadata but are not offered as interface choices.

## Update a translation

1. Use `lang/english.json` as the structural reference.
2. Translate values, never keys.
3. Keep placeholders, HTML fragments and array order.
4. Use the same terms as the labels visible in the app.
5. Add every new key to every bundled locale in the same change.
6. Run the app tests from `app/`.

```powershell
Push-Location app
npm test
Pop-Location
```

The locale test compares recursive key paths and rejects missing or empty values. It also rejects
Help-panel prose copied verbatim from English into another language. A top-level object count would
prove neither parity nor a finished translation.

For a full report before running the suite, and for rules the suite does not spell out one by one, run
the linter:

```powershell
node tools/locale-lint.js
```

It also compares placeholders and markup with English, finds English prose pasted into another language
anywhere in the tree, finds interface text hardcoded in JavaScript, and finds Achievement Watcher
addresses written outside `app/util/links.js`. Every rule also runs inside `npm test`.

`node tools/locale-lint.js --pseudo` writes a pseudo-locale to `scratch/pseudo.json`: every English
value accented and padded by 30%, with placeholders and markup untouched. Copy it over `english.json`
in a scratch checkout and run the app. Anything still in plain English is a string the locale layer
never reached, and anything clipped is a label that will break in a longer language.

## Values that are not translated

Dates, relative times, played time, counts and percentages come from `app/util/intlFormat.js` and
`Intl`, not from locale keys. The locale files carry the sentence and `Intl` the value, so
`dialogs.gh-verified-when` is `"Achievements checked {when}"` in every language and ICU supplies "3 days
ago" with the right plural rule. Do not add per-number or per-unit keys.

The addresses the app can open work the same way. They live in `app/util/links.js`, and markup refers
to them with `data-aw-link="<key>"` instead of spelling out a URL.

[docs/localization.md](../../docs/localization.md) gives the reasoning behind both, and what stays in
English on purpose.

## Layout overrides

Use `override.css` only when translated text needs a language-specific layout adjustment:

```css
html[lang='fr'] .selector {
  /* minimal layout adjustment */
}
```

Prefer flexible layout and wrapping in the shared styles before adding a locale override.

## Imperative strings (dialogs, menus, notifications)

Strings built in JavaScript (message boxes, tray and context menus, toasts, busy labels) go through the
`t()` helper (`app/locale/t.js` in the renderer, its counterpart in `electron/init.js` for the main
process), not `fr ? '…' : '…'` ternaries. Every `t()` slug lives under `dialogs` in `english.json` and
is translated in every bundled locale: `t('steamless-detail', …)` reads `dialogs.steamless-detail`.

Values may contain `{name}` placeholders that `t()` fills from its optional fourth argument. The
placeholder set must match the English value (the locale test enforces it). The English and French
fallbacks embedded in `t()` calls are only a safety net for a catastrophic locale failure; the locale
files are the source of truth.

## Watchdog strings

The standalone Watchdog process cannot load the renderer locale files, so the small `watchdog` section
of every locale is mirrored in `watchdog/locale.json` (same keys, generated from `app/locale/lang`).
When you add or change a `watchdog.*` key, update `watchdog/locale.json` too.
`test/integration/watchdogLocale.test.js` enforces the mirror.

## Translation credits

The translations build on work from the original Achievement Watcher community and later contributors.

| Language or area | Contributors recorded by the original project |
|---|---|
| English and French | Anthony Beaumont |
| Simplified Chinese | [fiyeck](https://github.com/fiyeck) |
| German | Anthony Beaumont, [Shanas377](https://github.com/Shanas377), [shakeyourbunny](https://github.com/shakeyourbunny) |
| Hungarian | [Roschach96](https://github.com/Roschach96) |
| Italian | pollolollo9001 |
| Brazilian Portuguese | wallis6n, Ardente07 |
| Russian | [hugmouse](https://github.com/hugmouse), [kochetov2000](https://github.com/kochetov2000) |
| Spanish and Latin American Spanish | [1024mb](https://github.com/1024mb) |
| Thai and early Japanese work | Anthony Beaumont and the original localization sources |

Corrections from fluent speakers are welcome. [CONTRIBUTING.md](../../CONTRIBUTING.md) describes the
contribution and validation process.
