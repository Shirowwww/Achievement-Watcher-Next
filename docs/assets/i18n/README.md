# Website translations

The home page and the preset gallery are written in English in their own markup, and a translation
is an overlay applied on top of it. Nothing here is required: with this folder empty the site is
still complete.

Installed: `fr`, `de`, `es`, `it`, `pt-br`, `pl`, `ru`, `ja`, `zh-cn`. Every one of them is complete: the
check below reports nothing falling back to English.

The documentation guides are a separate decision and stay English only. The reasoning is in
[localization.md](../../localization.md).

## Adding a language

1. Generate the key list from the pages themselves:

   ```powershell
   node tools/site/extract-strings.js > docs/assets/i18n/fr.json
   ```

   It writes every `data-i18n` key with its English text, so a translator edits values and never
   hunts for keys.

2. Translate the values. A value may use the same inline tags the English source uses (`code`,
   `kbd`, `b`, `em`, `a`); anything else is set as plain text.

3. Add the language to `languages.json`, which is what makes the picker appear:

   ```json
   [{ "code": "fr", "name": "Francais" }]
   ```

   `code` is a BCP 47 tag and the file name; `name` is the language written in itself.

4. Check the file covers the current markup:

   ```powershell
   node tools/site/extract-strings.js --check
   ```

   It reports keys a translation is missing and keys it carries that no longer exist.

A missing key falls back to the English already in the markup, so a partial translation degrades one
string at a time rather than blanking the page.
