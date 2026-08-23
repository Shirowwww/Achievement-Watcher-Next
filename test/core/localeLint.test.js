'use strict';

/*
  The locale linter, run as part of the suite, needs two halves or either alone would be misleading:
  the rules have to come back clean over the real tree, and the judgement calls they rest on have to
  be shown to fire on a known-bad value. A checker that only ever passes proves nothing about what it
  would catch.
*/

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

const lint = require(path.join(__dirname, '..', '..', 'tools', 'locale-lint.js'));

test('locale-lint reports no findings for the checked-in tree', () => {
  const findings = lint.lint();
  const summary = findings.map((f) => `${f.rule} ${f.file}${f.key ? ` ${f.key}` : ''}${f.line ? `:${f.line}` : ''}${f.detail ? ` - ${f.detail}` : ''}`);
  assert.deepEqual(summary, [], `run "node tools/locale-lint.js" for the full report`);
});

test('every documented rule is registered', () => {
  const names = lint.RULES.map((rule) => rule.name);
  assert.deepEqual(names, [
    'checkKeyParity',
    'checkEmptyValues',
    'checkDashes',
    'checkPlaceholdersAndMarkup',
    'checkCopiedProse',
    'checkDialogSlugs',
    'checkHardcodedUiStrings',
    'checkLinkCentralization',
    'checkDocsTargets',
    'checkViewLinkKeys',
    'checkSourceLanguageMaps',
  ]);
});

test('placeholder extraction sees the tokens t() substitutes and nothing else', () => {
  assert.deepEqual([...lint.placeholders('Repairing {current} / {total} - {game}')], ['{current}', '{total}', '{game}']);
  assert.deepEqual([...lint.placeholders('No placeholders here')], []);
  // A CSS or percentage brace is not a placeholder.
  assert.deepEqual([...lint.placeholders('{ } {not a token} {ok_1}')], ['{ok_1}']);
});

test('markup comparison counts real tags and ignores placeholder brackets', () => {
  assert.deepEqual(lint.markupTags('Press <b>Ctrl</b> then <i>K</i>'), ['b', 'b', 'i', 'i']);
  // <folder>\<game> is a path template that translators are meant to translate.
  assert.deepEqual(lint.markupTags('Saved to <folder>\\<game>\\<date>.png'), []);
  assert.deepEqual(lint.markupTags('names must match <prefix><digits>'), []);
});

test('the copied-prose heuristic separates a sentence from a product label', () => {
  const isSentence = (value) => value.replace(/\{[^}]*\}|<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length >= 3 && lint.ENGLISH_FUNCTION_WORDS.test(value);
  assert.ok(isSentence('No help topic matches your search.'));
  assert.ok(isSentence('The password is stored encrypted on this PC.'));
  assert.ok(!isSentence('Ubisoft / Uplay R2'));
  assert.ok(!isSentence('Steam / GBE Fork'));
  assert.ok(!isSentence('Name: A -> Z'));
  assert.ok(!isSentence('Steam AppID: {appid} ({name})'));
});

test('the hardcoded-string scanner accepts interface prose and rejects machine values', () => {
  assert.ok(lint.looksLikeUiProse('Could not fetch alternative covers.'));
  assert.ok(lint.looksLikeUiProse('Repair detected Uplay R2 games'));
  assert.ok(!lint.looksLikeUiProse('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'));
  assert.ok(!lint.looksLikeUiProse('Software/Achievement Watcher Next/Playtime/Steam'));
  assert.ok(!lint.looksLikeUiProse('center-bottom'));
  assert.ok(!lint.looksLikeUiProse('Open logs'));
});

test('a log line and a thrown error are not treated as interface text', () => {
  assert.ok(lint.NON_UI_CONTEXT.test("debug.log('Game not found');"));
  assert.ok(lint.NON_UI_CONTEXT.test("finish(new Error('Notification test timed out'))"));
  assert.ok(lint.NON_UI_CONTEXT.test("throw new Error('No trusted Steam mapping for this Ubisoft game');"));
  assert.ok(!lint.NON_UI_CONTEXT.test("$('#status').text('Repair detected Uplay R2 games');"));
});

test('translation calls are blanked before the hardcoded-string scan, keeping line numbers', () => {
  const source = ["const a = 1;", "const b = t('slug', 'English text here', 'Texte francais');", "const c = 2;"].join('\n');
  const stripped = lint.stripTranslationCalls(source);
  assert.equal(stripped.split('\n').length, 3, 'line count must be preserved');
  assert.ok(!stripped.includes('English text here'));
  assert.ok(stripped.includes('const c = 2;'));
});

test('the dash rule catches both typographic dashes and leaves the hyphen alone', () => {
  assert.ok(lint.TYPOGRAPHIC_DASH.test('Done — 3 repaired'));
  assert.ok(lint.TYPOGRAPHIC_DASH.test('Ctrl+Alt+Shift+1–5'));
  assert.ok(!lint.TYPOGRAPHIC_DASH.test('Done - 3 repaired'));
  assert.ok(!lint.TYPOGRAPHIC_DASH.test('Name: A -> Z'));
});

test('the map-literal reader stops at the matching brace, not the first one', () => {
  const source = ['const A = { one: { two: 3 }, four: 5 };', 'const B = { six: 7 };'].join('\n');
  assert.equal(lint.literalBody(source, 'A'), '{ one: { two: 3 }, four: 5 }');
  assert.equal(lint.literalBody(source, 'B'), '{ six: 7 }');
  assert.equal(lint.literalBody(source, 'C'), null);
  // A brace inside a string value must not be counted as nesting.
  assert.equal(lint.literalBody("const D = { key: '}' };", 'D'), "{ key: '}' }");
});

test('every language map the linter guards names a file and a side', () => {
  for (const entry of lint.LANGUAGE_MAPS) {
    assert.ok(entry.file && entry.map, 'a guarded map needs a file and an identifier');
    assert.ok(['key', 'value'].includes(entry.side), `${entry.map}: side must be key or value`);
  }
});

test('a language counts as mapped on the side its table actually uses', () => {
  const keyed = "{ koreana: 'ko', schinese: 'zh-CN', 'tchinese': 'zh-TW' }";
  assert.ok(lint.mapsLanguage(keyed, 'koreana', 'key'));
  assert.ok(lint.mapsLanguage(keyed, 'tchinese', 'key'), 'a quoted key counts too');
  assert.ok(!lint.mapsLanguage(keyed, 'dutch', 'key'));
  // The value it maps to is not the language: "ko" must not make koreana look present.
  assert.ok(!lint.mapsLanguage("{ english: 'ko' }", 'koreana', 'key'));

  const valued = "[['ko-kr', 'koreana'], ['nl-nl', 'dutch']]";
  assert.ok(lint.mapsLanguage(valued, 'dutch', 'value'));
  assert.ok(!lint.mapsLanguage(valued, 'danish', 'value'));
});

test('the pseudo-locale rewrites words but never a placeholder or a tag', () => {
  const value = lint.pseudoValue('Repairing {current} of {total} in <b>bold</b>');
  assert.ok(value.includes('{current}'), 'placeholders must survive verbatim');
  assert.ok(value.includes('{total}'));
  assert.ok(value.includes('<b>'), 'markup must survive verbatim');
  assert.ok(!/\bRepairing\b/.test(value), 'plain words must be visibly altered');
  assert.ok(value.startsWith('⟦') && value.endsWith('⟧'), 'the value must be bracketed');
  assert.ok(value.includes('·'), 'the value must be padded so overflow shows up');
});

test('the pseudo-locale keeps the English key structure exactly', () => {
  const english = require(path.join(__dirname, '..', '..', 'app', 'locale', 'lang', 'english.json'));
  const pseudo = lint.pseudoTree(english);
  assert.deepEqual(lint.leaves(pseudo).map(([key]) => key), lint.leaves(english).map(([key]) => key));
});
