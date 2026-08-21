'use strict';

/*
  Locale linter for app/locale/lang and the UI that consumes it.

  The project has no ESLint and no i18n framework, so the rules a framework would enforce live
  here, in plain Node with no dependency: key parity, empty values, placeholder and markup drift,
  copied English prose, a t() slug with no `dialogs` entry, a UI string that never reached the
  locale files at all, and an Achievement Watcher address written by hand instead of coming from
  app/util/links.js.

  Usage, from the repository root or from app/:

    node tools/locale-lint.js            report every rule, exit 1 on a failure
    node tools/locale-lint.js --json     the same findings as JSON
    node tools/locale-lint.js --pseudo   write a pseudo-locale for a visual pass, then exit

  test/core/localeLint.test.js runs the same rules, so `npm test` fails on a regression. Keep the
  rule bodies here and the test a thin caller.
*/

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LANG_DIR = path.join(ROOT, 'app', 'locale', 'lang');
const REFERENCE = 'english.json';

// Files whose English text is the reference copy the loader overwrites, not a hardcoded string.
const VIEW_FILES = [path.join('app', 'view', 'app.html'), path.join('app', 'view', 'overlay.html')];

// Sources scanned for UI strings that never reached the locale files.
const UI_SOURCES = [
  path.join('app', 'app.js'),
  path.join('app', 'ui'),
  path.join('app', 'components'),
  path.join('app', 'electron', 'init.js'),
];

// Every file allowed to spell out an Achievement Watcher address.
const LINK_OWNERS = new Set([path.join('app', 'util', 'links.js')]);

// ---------------------------------------------------------------------------------------------
// helpers

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function localeFiles() {
  return fs
    .readdirSync(LANG_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

// Every leaf as [dotted.path, value]; array items keep their index so order changes are visible.
function leaves(value, prefix = '', out = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => leaves(child, `${prefix}[${index}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      leaves(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  out.push([prefix, value]);
  return out;
}

function placeholders(value) {
  return new Set(String(value).match(/\{[A-Za-z0-9_]+\}/g) || []);
}

/*
  Only real markup counts. Several help strings use angle brackets as placeholder tokens
  (`<folder>\<game>`, `<prefix><digits>`), and those are translated on purpose, so matching every
  <word> would report a correct translation as broken markup.
*/
const HTML_TAGS = new Set(['a', 'b', 'br', 'code', 'em', 'i', 'kbd', 'li', 'p', 'small', 'span', 'strong', 'sup', 'u', 'ul']);

function markupTags(value) {
  return (String(value).match(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi) || [])
    .map((tag) => tag.toLowerCase())
    .map((tag) => tag.replace(/^<\/?|[\s>].*$|>$/g, ''))
    .filter((name) => HTML_TAGS.has(name))
    .sort();
}

function sameSet(left, right) {
  if (left.size !== right.size) return false;
  for (const item of left) if (!right.has(item)) return false;
  return true;
}

function walkJs(target, out = []) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return out;
  }
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'lib') continue;
      walkJs(path.join(target, entry), out);
    }
  } else if (target.endsWith('.js')) out.push(target);
  return out;
}

// Blank a span but keep its newlines, so reported line numbers stay true.
function blankSpan(source, start, end) {
  return source.slice(0, start) + source.slice(start, end).replace(/[^\n]/g, ' ') + source.slice(end);
}

function stripComments(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (c === '/' && source[i + 1] === '*') {
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') {
          out += source[i] + (source[i + 1] || '');
          i += 2;
          continue;
        }
        out += source[i];
        i++;
      }
      out += source[i] || '';
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/*
  Blank every call to a translation helper. Their English and French arguments are the documented
  safety net for a catastrophic locale failure, not strings waiting to be translated, so a scan for
  hardcoded UI text has to look past them.
*/
const TRANSLATION_HELPERS = /(?<![\w$.])(?:t|localeText|uplaySettingsText|helpText|overlayText)\s*\(/g;

function stripTranslationCalls(source) {
  const spans = [];
  let match;
  TRANSLATION_HELPERS.lastIndex = 0;
  while ((match = TRANSLATION_HELPERS.exec(source))) {
    let depth = 0;
    let i = match.index + match[0].length - 1;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === '"' || c === "'" || c === '`') {
        const quote = c;
        i++;
        while (i < source.length && source[i] !== quote) {
          if (source[i] === '\\') i++;
          i++;
        }
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    spans.push([match.index, Math.min(i + 1, source.length)]);
  }
  for (let k = spans.length - 1; k >= 0; k--) source = blankSpan(source, spans[k][0], spans[k][1]);
  return source;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

// ---------------------------------------------------------------------------------------------
// rules

function checkKeyParity(findings) {
  const english = new Map(leaves(readJson(path.join(LANG_DIR, REFERENCE))));
  for (const file of localeFiles()) {
    if (file === REFERENCE) continue;
    const locale = new Map(leaves(readJson(path.join(LANG_DIR, file))));
    for (const key of english.keys()) {
      if (!locale.has(key)) findings.push({ rule: 'missing-key', file: `app/locale/lang/${file}`, key });
    }
    for (const key of locale.keys()) {
      if (!english.has(key)) findings.push({ rule: 'extra-key', file: `app/locale/lang/${file}`, key });
    }
  }
}

function checkEmptyValues(findings) {
  for (const file of localeFiles()) {
    for (const [key, value] of leaves(readJson(path.join(LANG_DIR, file)))) {
      if (typeof value !== 'string') continue;
      if (!value.trim()) findings.push({ rule: 'empty-value', file: `app/locale/lang/${file}`, key });
    }
  }
}

/*
  The repository writes a plain hyphen, never an em or en dash.

  The edit hook enforces that on text as it is written, which says nothing about text already on
  disk: sixty of them had accumulated across the locale tree, three in english.json itself, where
  every translator faithfully carried the shape into their own language.
*/
const TYPOGRAPHIC_DASH = /[–—]/;

function checkDashes(findings) {
  for (const file of localeFiles()) {
    for (const [key, value] of leaves(readJson(path.join(LANG_DIR, file)))) {
      if (typeof value !== 'string') continue;
      if (TYPOGRAPHIC_DASH.test(value)) {
        findings.push({ rule: 'typographic-dash', file: `app/locale/lang/${file}`, key, detail: value.slice(0, 70) });
      }
    }
  }
}

function checkPlaceholdersAndMarkup(findings) {
  const english = new Map(leaves(readJson(path.join(LANG_DIR, REFERENCE))));
  for (const file of localeFiles()) {
    if (file === REFERENCE) continue;
    for (const [key, value] of leaves(readJson(path.join(LANG_DIR, file)))) {
      const reference = english.get(key);
      if (typeof reference !== 'string' || typeof value !== 'string') continue;

      if (!sameSet(placeholders(reference), placeholders(value))) {
        findings.push({
          rule: 'placeholder-mismatch',
          file: `app/locale/lang/${file}`,
          key,
          detail: `expected ${[...placeholders(reference)].join(' ') || '(none)'}, found ${[...placeholders(value)].join(' ') || '(none)'}`,
        });
      }

      const referenceTags = markupTags(reference).join(' ');
      const localeTags = markupTags(value).join(' ');
      if (referenceTags !== localeTags) {
        findings.push({
          rule: 'markup-mismatch',
          file: `app/locale/lang/${file}`,
          key,
          detail: `expected ${referenceTags || '(none)'}, found ${localeTags || '(none)'}`,
        });
      }
    }
  }
}

/*
  Prose identical to English in another locale is untranslated text.

  Being identical is not enough on its own: "Ubisoft / Uplay R2", "Steam / GBE Fork" and
  "Name: A -> Z" are the same in every language and always will be. What separates a sentence from
  a label is an English function word, so one has to be present before a match is reported.
*/
const ENGLISH_FUNCTION_WORDS =
  /\b(?:the|an|is|are|was|were|be|been|to|of|and|or|not|no|with|for|from|your|you|this|that|these|those|it|its|will|can|could|when|while|if|only|use|used|uses|has|have|does|do|on|in|at|by|as|but|so|than|then|there|here|any|all|each|every|per|into|onto|about|after|before|until|unless)\b/i;

function checkCopiedProse(findings) {
  const english = new Map(leaves(readJson(path.join(LANG_DIR, REFERENCE))));
  for (const file of localeFiles()) {
    if (file === REFERENCE) continue;
    for (const [key, value] of leaves(readJson(path.join(LANG_DIR, file)))) {
      const reference = english.get(key);
      if (typeof reference !== 'string' || typeof value !== 'string') continue;
      if (reference !== value) continue;
      // Placeholders and markup are the same everywhere, so judge the words around them.
      const prose = value.replace(/\{[^}]*\}|<[^>]*>/g, ' ').trim();
      if (prose.split(/\s+/).filter(Boolean).length < 3) continue;
      if (!ENGLISH_FUNCTION_WORDS.test(prose)) continue;
      findings.push({ rule: 'copied-from-english', file: `app/locale/lang/${file}`, key, detail: value.slice(0, 70) });
    }
  }
}

// Every t('slug') the app uses has to exist, non-empty, under `dialogs` in every locale.
function checkDialogSlugs(findings) {
  const slugs = new Set();
  const files = UI_SOURCES.flatMap((relative) => walkJs(path.join(ROOT, relative)));
  const re = /(?<![\w$.])t\(\s*['"]([^'"]+)['"]/g;
  for (const file of files) {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(source))) slugs.add(match[1]);
  }
  if (slugs.size < 50) {
    findings.push({ rule: 'scanner-broken', file: 'tools/locale-lint.js', detail: `only ${slugs.size} t() slugs found` });
    return;
  }
  for (const file of localeFiles()) {
    const dialogs = readJson(path.join(LANG_DIR, file)).dialogs || {};
    for (const slug of slugs) {
      if (!String(dialogs[slug] || '').trim()) {
        findings.push({ rule: 'missing-dialog-slug', file: `app/locale/lang/${file}`, key: `dialogs.${slug}` });
      }
    }
  }
}

/*
  English prose sitting in a JavaScript string that no translation helper wraps: a label that will
  read English in all 28 languages. Deliberate exceptions - product names, protocol values, log
  lines - are listed in ALLOWED_UI_STRINGS rather than being silently skipped.
*/
const UI_STRING_ALLOWLIST = new Set([
  // Windows and Steam paths, brand names and other values that are not interface text.
  'Goldberg SteamEmu Saves',
  'Achievement Watcher Next',
  'Achievement Watcher 3.0',
  'GBE / Goldberg',
  'Steam Community',
  'Epic Games Store',
  'Ubisoft Store',
  'RPCS3 Wiki',
  'AW Next',
]);

function looksLikeUiProse(value) {
  const words = value.trim().split(/\s+/);
  if (words.length < 3) return false;
  if (!/^[A-Z]/.test(value.trim())) return false;
  if (/^[A-Z_ ]+$/.test(value)) return false;
  if (/https?:|\\|\/\/|\.(js|json|dll|exe|ini|html|css)\b/i.test(value)) return false;
  if (/[<>{}$]/.test(value)) return false;
  // A "Name/1.2" token means a version string, not a sentence: user agents look like prose otherwise.
  if (/\b[A-Za-z]+\/\d/.test(value)) return false;
  // Two or more unspaced slashes make it a path or a key, never a sentence. One is left alone,
  // because a label legitimately reads "GBE/Goldberg backup created".
  if ((value.match(/\w\/\w/g) || []).length >= 2) return false;
  return words.every((word) => /^[A-Za-z0-9'’,.:;!?()%&/-]+$/.test(word));
}

/*
  Statements whose result never reaches the interface.

  An Error message counts as diagnostic: the app localizes the dialog it wraps an error in and
  shows the raw message only as technical detail, so translating a throw site would put half a
  sentence in the user's language and half in English.
*/
const NON_UI_CONTEXT = /\b(?:debug|console)\s*\.\s*\w+\s*\(|\bnew\s+\w*Error\s*\(|\bthrow\s|\brequire\s*\(/;

function checkHardcodedUiStrings(findings) {
  const files = UI_SOURCES.flatMap((relative) => walkJs(path.join(ROOT, relative)));
  const re = /(['"`])((?:(?!\1)[^\\]|\\.){8,220})\1/g;
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const scanned = stripTranslationCalls(stripComments(raw));
    const rawLines = raw.split('\n');
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(scanned))) {
      const value = match[2];
      if (!looksLikeUiProse(value)) continue;
      if (UI_STRING_ALLOWLIST.has(value)) continue;
      const line = lineOf(scanned, match.index);
      if (NON_UI_CONTEXT.test(rawLines[line - 1] || '')) continue;
      findings.push({
        rule: 'hardcoded-ui-string',
        file: path.relative(ROOT, file).split(path.sep).join('/'),
        line,
        detail: value.length > 80 ? `${value.slice(0, 77)}...` : value,
      });
    }
  }
}

/*
  An Achievement Watcher address written by hand. The registry is the only place allowed to spell
  one out, so a rename stays a single edit and an in-app link cannot quietly rot.
*/
function checkLinkCentralization(findings) {
  const owned = /https?:\/\/(?:[a-z0-9-]+\.)*(?:github\.com\/Shirowwww\/Achievement-Watcher-Next|shirowwww\.github\.io\/Achievement-Watcher-Next)/gi;
  const targets = [
    ...UI_SOURCES.flatMap((relative) => walkJs(path.join(ROOT, relative))),
    ...VIEW_FILES.map((relative) => path.join(ROOT, relative)),
    ...walkJs(path.join(ROOT, 'app', 'util')),
  ];
  for (const file of new Set(targets)) {
    const relative = path.relative(ROOT, file);
    if (LINK_OWNERS.has(relative)) continue;
    const source = fs.readFileSync(file, 'utf8');
    let match;
    owned.lastIndex = 0;
    while ((match = owned.exec(source))) {
      findings.push({
        rule: 'uncentralized-link',
        file: relative.split(path.sep).join('/'),
        line: lineOf(source, match.index),
        detail: match[0],
      });
    }
  }
}

// Every documentation slug the app can link to has to be a page the site actually publishes.
function checkDocsTargets(findings) {
  const links = require(path.join(ROOT, 'app', 'util', 'links.js'));
  for (const [name, slug] of Object.entries(links.DOCS)) {
    const source = slug ? path.join(ROOT, 'docs', `${slug}.md`) : path.join(ROOT, 'docs', 'README.md');
    if (!fs.existsSync(source)) {
      findings.push({ rule: 'dead-docs-link', file: 'app/util/links.js', key: name, detail: `docs/${slug || 'README'}.md is missing` });
    }
  }
}

// Every data-aw-link in the views has to name something the registry actually holds.
function checkViewLinkKeys(findings) {
  const links = require(path.join(ROOT, 'app', 'util', 'links.js'));
  for (const relative of VIEW_FILES) {
    const file = path.join(ROOT, relative);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const re = /data-aw-link="([^"]+)"/g;
    let match;
    while ((match = re.exec(source))) {
      const value = match[1].split('.').reduce((current, part) => (current && typeof current === 'object' ? current[part] : undefined), links);
      if (typeof value !== 'string' || !value) {
        findings.push({ rule: 'unknown-link-key', file: relative.split(path.sep).join('/'), line: lineOf(source, match.index), key: match[1] });
      }
    }
  }
}

/*
  Bundling a language is more than shipping its locale file.

  Half a dozen tables elsewhere key off the same Steam language id: the achievement text an official
  source is asked for, the controller vocabulary the overlay shows, the duration wording the
  Watchdog formats. A language missing from one of them does not fail - it quietly serves English,
  which reads like a translation gap rather than a wiring gap. Slovak sat in five of these tables'
  blind spots for as long as it had been bundled.

  Only tables whose contract really is "every interface language" belong here. The Uplay R2 loader
  and the shadPS4 map cover the fixed set those emulators support and fall back on purpose, so a
  missing id there is correct.
*/
const LANGUAGE_MAPS = [
  { file: 'app/parser/exophase.js', map: 'EXOPHASE_LANG_MAP', side: 'key' },
  { file: 'app/parser/epicOfficial.js', map: 'EPIC_LOCALE_MAP', side: 'key' },
  { file: 'app/parser/xboxPc.js', map: 'XBOX_SCHEMA_LANGUAGE_LOCALES', side: 'key' },
  { file: 'app/parser/ubisoftOfficial.js', map: 'UBISOFT_LOCALE_MAP', side: 'value' },
  { file: 'watchdog/console/ubisoftWatch.js', map: 'LANG_PREFIX', side: 'key' },
  { file: 'watchdog/util/notifyStrings.js', map: 'HUMANIZE_LOCALES', side: 'key' },
  // English is the base table these two fall back to, so it is absent from them on purpose.
  { file: 'app/util/controllerLabels.js', map: 'LOCALIZED_BUTTON_LABELS', side: 'key', skip: ['english'] },
  { file: 'app/util/controllerLabels.js', map: 'LOCALIZED_COMMON_LABELS', side: 'key', skip: ['english'] },
];

// The literal that follows `<name> =`, brace-matched so a nested object cannot end it early.
function literalBody(source, name) {
  const start = source.search(new RegExp(`\\b${name}\\s*=`));
  if (start < 0) return null;
  const open = source.slice(start).search(/[[{]/);
  if (open < 0) return null;
  let depth = 0;
  for (let i = start + open; i < source.length; i++) {
    const c = source[i];
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return source.slice(start + open, i + 1);
    } else if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') i++;
        i++;
      }
    }
  }
  return null;
}

/*
  Whether a map literal actually has an entry for a language id.

  Two shapes are in use: most tables are keyed by the language id, while the Ubisoft map is keyed by
  the vendor's locale code and carries the id as the value, so the side has to be told apart.
*/
function mapsLanguage(body, id, side) {
  return side === 'value'
    ? new RegExp(`['"]${id}['"]`).test(body)
    : new RegExp(`(?:^|[{,\\s])['"]?${id}['"]?\\s*:`).test(body);
}

function checkSourceLanguageMaps(findings) {
  const bundled = localeFiles().map((name) => name.replace(/\.json$/, ''));
  for (const entry of LANGUAGE_MAPS) {
    const file = path.join(ROOT, entry.file);
    if (!fs.existsSync(file)) {
      findings.push({ rule: 'missing-language-map', file: entry.file, key: entry.map, detail: 'file not found' });
      continue;
    }
    const body = literalBody(stripComments(fs.readFileSync(file, 'utf8')), entry.map);
    if (!body) {
      findings.push({ rule: 'missing-language-map', file: entry.file, key: entry.map, detail: 'map literal not found' });
      continue;
    }
    for (const id of bundled) {
      if (entry.skip && entry.skip.includes(id)) continue;
      if (!mapsLanguage(body, id, entry.side)) {
        findings.push({ rule: 'language-not-mapped', file: entry.file, key: `${entry.map}.${id}`, detail: 'the language would fall back to English' });
      }
    }
  }
}

const RULES = [
  checkKeyParity,
  checkEmptyValues,
  checkDashes,
  checkPlaceholdersAndMarkup,
  checkCopiedProse,
  checkDialogSlugs,
  checkHardcodedUiStrings,
  checkLinkCentralization,
  checkDocsTargets,
  checkViewLinkKeys,
  checkSourceLanguageMaps,
];

function lint() {
  const findings = [];
  for (const rule of RULES) rule(findings);
  return findings;
}

// ---------------------------------------------------------------------------------------------
// pseudo-locale

/*
  A pseudo-locale turns every English value into text that is still readable but obviously not
  English, padded by 30% so a label that will overflow in German does so here too. Anything left in
  plain English on screen is a string the locale layer never reached. Written outside app/locale so
  it can never be picked up as a twenty-ninth bundled language.
*/
const PSEUDO_MAP = { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', c: 'ç', n: 'ñ', s: 'š', y: 'ý', A: 'Ä', E: 'Ë', I: 'Ï', O: 'Ö', U: 'Ü', N: 'Ñ', S: 'Š' };

function pseudoValue(value) {
  // Placeholders and markup have to survive verbatim or the app renders them as literal text.
  const parts = String(value).split(/(\{[A-Za-z0-9_]+\}|<[^>]+>|%[A-Za-z]+%)/g);
  const accented = parts
    .map((part, index) => (index % 2 ? part : part.replace(/[aeiouAEIOUcnsyNS]/g, (ch) => PSEUDO_MAP[ch] || ch)))
    .join('');
  const padding = '·'.repeat(Math.ceil(accented.replace(/\{[^}]*\}|<[^>]*>/g, '').length * 0.3));
  return `⟦${accented}${padding}⟧`;
}

function pseudoTree(value) {
  if (typeof value === 'string') return value.trim() ? pseudoValue(value) : value;
  if (Array.isArray(value)) return value.map(pseudoTree);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = pseudoTree(child);
    return out;
  }
  return value;
}

function writePseudoLocale(target) {
  const english = readJson(path.join(LANG_DIR, REFERENCE));
  const out = target || path.join(ROOT, 'scratch', 'pseudo.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(pseudoTree(english), null, 2)}\n`);
  return out;
}

// ---------------------------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--pseudo')) {
    const out = writePseudoLocale(argv[argv.indexOf('--pseudo') + 1]);
    console.log(`pseudo-locale written to ${path.relative(ROOT, out).split(path.sep).join('/')}`);
    console.log('Copy it over app/locale/lang/english.json in a scratch checkout to review the UI, then restore it.');
    return;
  }

  const findings = lint();

  if (argv.includes('--json')) {
    console.log(JSON.stringify(findings, null, 2));
  } else if (findings.length === 0) {
    console.log('locale-lint: no findings.');
  } else {
    const byRule = new Map();
    for (const finding of findings) {
      if (!byRule.has(finding.rule)) byRule.set(finding.rule, []);
      byRule.get(finding.rule).push(finding);
    }
    for (const [rule, items] of byRule) {
      console.log(`\n${rule} (${items.length})`);
      for (const item of items.slice(0, 40)) {
        const where = item.line ? `${item.file}:${item.line}` : item.file;
        console.log(`  ${where}${item.key ? ` ${item.key}` : ''}${item.detail ? ` - ${item.detail}` : ''}`);
      }
      if (items.length > 40) console.log(`  ... and ${items.length - 40} more`);
    }
    console.log(`\nlocale-lint: ${findings.length} finding(s).`);
  }

  process.exitCode = findings.length ? 1 : 0;
}

if (require.main === module) main();

module.exports = {
  lint,
  RULES,
  writePseudoLocale,
  literalBody,
  mapsLanguage,
  LANGUAGE_MAPS,
  pseudoValue,
  pseudoTree,
  // The judgement calls the rules rest on, exported so they can be tested against known cases
  // rather than only proven by a clean run over a tree that already passes.
  placeholders,
  markupTags,
  TYPOGRAPHIC_DASH,
  looksLikeUiProse,
  leaves,
  ENGLISH_FUNCTION_WORDS,
  NON_UI_CONTEXT,
  stripTranslationCalls,
  stripComments,
};
