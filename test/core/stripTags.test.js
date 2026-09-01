'use strict';

/*
  Locale text and scraped game text pass through here before reaching the interface. A single regex
  pass is not enough: removing the inner match of "<scri<script>pt>" reforms a live tag out of what
  is left, which is why the pass repeats until the string stops changing. It had real callers in the
  locale loader, the game view and the search box, and no test of its own.
*/

const assert = require('node:assert/strict');
const test = require('node:test');
const { stripTags } = require('../../app/util/stripTags.js');

test('a tag is removed and its text kept', () => {
  assert.equal(stripTags('<b>Half-Life</b>'), 'Half-Life');
  assert.equal(stripTags('a <br> b'), 'a  b');
  assert.equal(stripTags('<img src="x">'), '');
});

// What matters is that nothing tag-shaped survives, not the exact leftover text: the pass repeats
// until the string stops changing, so a nested payload cannot reassemble itself into a live tag.
test('a nested payload cannot leave a live tag behind', () => {
  for (const payload of ['<scri<script>pt>alert(1)</scr</script>ipt>', '<<a>a href="x">', '<<>>', '<img<img src=x>src=x onerror=y>']) {
    assert.doesNotMatch(stripTags(payload), /<[^>]*>/, `${payload} must leave nothing that opens a tag`);
  }
  assert.match(stripTags('<scri<script>pt>alert(1)</scr</script>ipt>'), /alert\(1\)/, 'the text itself is kept');
});

test('plain text is returned untouched, including bare angle brackets', () => {
  assert.equal(stripTags('5 > 3 and 2 < 4'), '5 > 3 and 2 < 4');
  assert.equal(stripTags('Achievements: 12/40'), 'Achievements: 12/40');
});

test('an absent value reads as an empty string, never "undefined"', () => {
  assert.equal(stripTags(undefined), '');
  assert.equal(stripTags(null), '');
  assert.equal(stripTags(0), '0');
});
