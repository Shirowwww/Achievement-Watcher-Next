# Interface translations

AW Next loads interface text from `app/locale/lang`. English is the reference locale. When the selected language does not provide game metadata, the upstream game source may return English instead.

<p align="center"><a href="../../README.md">← Project home</a> · <a href="../../CONTRIBUTING.md">Contributing</a></p>

## Bundled languages

The current build includes:

- Brazilian Portuguese
- Chinese (Simplified)
- Chinese (Traditional)
- Czech
- Danish
- Dutch
- English
- Finnish
- French
- German
- Greek
- Hungarian
- Indonesian
- Italian
- Japanese
- Korean
- Latin American Spanish
- Norwegian
- Polish
- Portuguese
- Russian
- Slovak
- Spanish
- Swedish
- Thai
- Turkish
- Ukrainian
- Vietnamese

`uiLanguages.js` exposes only languages that have a matching JSON file. Other entries in `steam.json` remain available as Steam language metadata but do not appear as interface choices.

## Update a translation

1. Use `lang/english.json` as the structural reference.
2. Translate values, never keys.
3. Preserve placeholders, HTML fragments and array order.
4. Keep terminology consistent with the labels visible in the application.
5. Add every new key to every bundled locale in the same change.
6. Run the app tests from `app/`.

```powershell
Push-Location app
npm test
Pop-Location
```

The locale test compares recursive key paths and rejects missing or empty values. It also rejects
Help-panel prose copied verbatim from English into another language. A top-level object count is not
enough to prove parity or a completed translation.

For a full report before running the suite, and for the rules the suite does not spell out one by
one, use the linter:

```powershell
node tools/locale-lint.js
```

It adds placeholder and markup comparison against English, detection of English prose pasted into
another language anywhere in the tree, interface text hardcoded in JavaScript, and Achievement
Watcher addresses written outside `app/util/links.js`. Every rule also runs inside `npm test`.

`node tools/locale-lint.js --pseudo` writes a pseudo-locale to `scratch/pseudo.json` - every English
value accented and padded by 30%, placeholders and markup untouched. Copy it over `english.json` in a
scratch checkout and run the app: anything still in plain English is a string the locale layer never
reached, and anything clipped is a label that will break in a longer language.

## Values that are not translated

Dates, relative times, played time, counts and percentages are produced by `app/util/intlFormat.js`
from `Intl`, not by a locale key. The locale files carry the sentence and `Intl` carries the value,
so `dialogs.gh-verified-when` is `"Achievements checked {when}"` in every language and ICU supplies
"3 days ago" with the right plural rule. Do not add per-number or per-unit keys.

The addresses the app can open are the same idea: they live in `app/util/links.js`, and markup names
them with `data-aw-link="<key>"` rather than spelling out a URL.

The reasoning behind both, and what is deliberately left in English, is in
[docs/localization.md](../../docs/localization.md).

## Layout overrides

Use `override.css` only when translated text genuinely needs a language-specific layout adjustment:

```css
html[lang='fr'] .selector {
  /* minimal layout adjustment */
}
```

Prefer flexible layout and wrapping in the shared styles before adding a locale override.

## Imperative strings (dialogs, menus, notifications)

Strings built imperatively in JavaScript (message boxes, tray/context menus,
toasts, busy labels) go through the `t()` helper (`app/locale/t.js` in the
renderer, its counterpart in `electron/init.js` for the main process) instead
of hardcoding `fr ? '…' : '…'` ternaries. Every `t()` slug lives under
`dialogs` in `english.json` (the structural reference) and is translated in
every bundled locale, per the parity rule above - e.g.
`t('steamless-detail', …)` → `dialogs.steamless-detail`.

Values may contain `{name}` placeholders that `t()` substitutes from the
optional fourth argument; the placeholder set must match the English value
(the locale test enforces this). The English/French fallbacks still embedded
in the `t()` calls are only a safety net for catastrophic locale failures -
the locale files are the source of truth.

## Watchdog strings

The standalone Watchdog process cannot load the renderer locale files, so the
small `watchdog` section of every locale is mirrored in `watchdog/locale.json`
(same keys, generated from `app/locale/lang`). When adding or changing a
`watchdog.*` key, update `watchdog/locale.json` too - the
`test/integration/watchdogLocale.test.js` suite enforces the mirror.

## Translation credits

The current translation set builds on work from the original Achievement Watcher community and later contributors.

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

Corrections from fluent speakers are welcome. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the normal contribution and validation process.
