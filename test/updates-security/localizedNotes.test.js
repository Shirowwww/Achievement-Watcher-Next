'use strict';

// The update window shows the release notes in the interface language. The translations come from
// the site, over the network and unsigned, so a bad answer must never cost the user the notes.

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

const util = path.join(__dirname, '..', '..', 'app', 'util');
const { releaseNoteBlocks } = require(path.join(util, 'releaseNotes.js'));
const { fetchLocalizedNotes, notesUrl } = require(path.join(util, 'localizedNotes.js'));
const links = require(path.join(util, 'links.js'));

const english = [
  { version: '3.13.1', note: '<h2>Fixes</h2><ul><li>One</li></ul>' },
  { version: '3.13.0', note: '<h2>New</h2><ul><li>Two</li></ul>' },
];
const french = {
  '3.13.1': [
    { kind: 'heading', text: 'Correctifs' },
    { kind: 'item', text: 'Un' },
  ],
};

function reply(body, init = {}) {
  return async () => ({ ok: init.ok !== false, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
}

test('a translated release replaces its English body, and one without a translation keeps it', () => {
  assert.deepEqual(releaseNoteBlocks(english, { translations: french }), [
    { kind: 'version', text: '3.13.1' },
    { kind: 'heading', text: 'Correctifs' },
    { kind: 'item', text: 'Un' },
    { kind: 'version', text: '3.13.0' },
    { kind: 'heading', text: 'New' },
    { kind: 'item', text: 'Two' },
  ]);
});

test('a single body takes the translation of the offered version', () => {
  assert.deepEqual(releaseNoteBlocks('<li>One</li>', { translations: french, version: '3.13.1' }), french['3.13.1']);
  assert.deepEqual(releaseNoteBlocks('<li>One</li>', { translations: french, version: '3.13.2' }), [{ kind: 'item', text: 'One' }]);
  assert.deepEqual(releaseNoteBlocks('<li>One</li>', { translations: null, version: '3.13.1' }), [{ kind: 'item', text: 'One' }]);
});

test('a translation that is not exactly blocks of text is ignored', () => {
  const bad = [
    { '3.13.1': 'not a list' },
    { '3.13.1': [{ kind: 'script', text: 'x' }] },
    { '3.13.1': [{ kind: 'item', text: '' }] },
    { '3.13.1': [{ kind: 'item', text: 'ok' }, { kind: 'item' }] },
    { '3.13.1': [] },
    { __proto__: { '3.13.1': [{ kind: 'item', text: 'inherited' }] } },
  ];
  for (const translations of bad) {
    assert.deepEqual(releaseNoteBlocks(english, { translations }), releaseNoteBlocks(english), JSON.stringify(translations));
  }
});

test('a translated text is cut like an English one', () => {
  const long = { '3.13.1': [{ kind: 'text', text: 'x'.repeat(2000) }] };
  const [block] = releaseNoteBlocks('<p>a</p>', { translations: long, version: '3.13.1' });
  assert.equal(block.text.length, 600);
  assert.ok(block.text.endsWith('…'));
});

test('the notes file of a language is fetched from the site, and only for a real locale id', async () => {
  assert.equal(notesUrl('french'), `${links.SITE}/data/notes/french.json`);
  assert.equal(notesUrl('schinese'), `${links.SITE}/data/notes/schinese.json`);
  for (const bad of ['english', '', undefined, '../french', 'fr/../x', 'French', 'a'.repeat(40), 'fr.json?x=1']) {
    assert.equal(notesUrl(bad), null, String(bad));
  }

  let asked = null;
  const notes = await fetchLocalizedNotes('french', {
    fetchImpl: async (url) => {
      asked = url;
      return reply(french)();
    },
  });
  assert.equal(asked, `${links.SITE}/data/notes/french.json`);
  assert.deepEqual(notes, french);
});

test('every way the fetch can go wrong means no translation, not an error', async () => {
  assert.equal(await fetchLocalizedNotes('english'), null);
  assert.equal(await fetchLocalizedNotes('french', { fetchImpl: reply({}, { ok: false }) }), null);
  assert.equal(await fetchLocalizedNotes('french', { fetchImpl: reply('{not json') }), null);
  assert.equal(await fetchLocalizedNotes('french', { fetchImpl: reply('[1,2]') }), null);
  assert.equal(await fetchLocalizedNotes('french', { fetchImpl: reply('null') }), null);
  assert.equal(await fetchLocalizedNotes('french', { fetchImpl: reply(' '.repeat(600 * 1024)) }), null);
  assert.equal(
    await fetchLocalizedNotes('french', {
      fetchImpl: async () => {
        throw new Error('offline');
      },
    }),
    null
  );
  assert.equal(await fetchLocalizedNotes('french', { fetchImpl: null }), null);
});

test('a slow site does not hold the update offer', async () => {
  const started = Date.now();
  const notes = await fetchLocalizedNotes('french', {
    timeoutMs: 50,
    fetchImpl: (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  });
  assert.equal(notes, null);
  assert.ok(Date.now() - started < 2000);
});
