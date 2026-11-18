'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { logArgs, nextNightlyVersion, tagsToPrune, previousTag, releaseNotes } = require('../../tools/nightly.js');

const STABLES = ['v3.12.5', 'v3.12.6', 'v3.12.7'];

test('the first nightly after a release leads to its next patch', () => {
  assert.equal(nextNightlyVersion({ packageVersion: '3.12.7', tags: STABLES }), '3.12.8-nightly.1');
});

test('the counter follows the newest nightly of the same base', () => {
  const tags = [...STABLES, 'v3.12.8-nightly.9', 'v3.12.8-nightly.10', 'v3.12.8-nightly.8'];
  assert.equal(nextNightlyVersion({ packageVersion: '3.12.7', tags }), '3.12.8-nightly.11');
});

test('a stable release restarts the counter on the next patch', () => {
  const tags = [...STABLES, 'v3.12.8-nightly.12', 'v3.12.8'];
  assert.equal(nextNightlyVersion({ packageVersion: '3.12.8', tags }), '3.12.9-nightly.1');
});

test('a version bumped ahead on dev becomes the base', () => {
  assert.equal(nextNightlyVersion({ packageVersion: '3.13.0', tags: STABLES }), '3.13.0-nightly.1');
  assert.equal(nextNightlyVersion({ packageVersion: '3.13.0-beta.2', tags: STABLES }), '3.13.0-nightly.1');
});

test('betas and odd tags neither count as stable nor as nightly', () => {
  const tags = [...STABLES, 'v3.13.0-beta.1', 'latest', 'v3.12.8-nightly'];
  assert.equal(nextNightlyVersion({ packageVersion: '3.12.7', tags }), '3.12.8-nightly.1');
});

test('only the newest nightlies are kept, the oldest pruned first', () => {
  const tags = [...STABLES, 'v3.12.8-nightly.1', 'v3.12.8-nightly.2', 'v3.12.8-nightly.3', 'v3.12.8-nightly.4', 'v3.12.9-nightly.1'];
  assert.deepEqual(tagsToPrune(tags, 3), ['v3.12.8-nightly.1', 'v3.12.8-nightly.2']);
  assert.deepEqual(tagsToPrune(STABLES, 3), []);
});

test('the notes start after the last nightly, or the last release when there is none', () => {
  assert.equal(previousTag([...STABLES, 'v3.12.8-nightly.2', 'v3.12.8-nightly.1']), 'v3.12.8-nightly.2');
  assert.equal(previousTag(STABLES), 'v3.12.7');
  assert.equal(previousTag([]), null);
});

test('the notes list each commit with its description and warn that it is a nightly', () => {
  const notes = releaseNotes({
    version: '3.12.8-nightly.2',
    sha: 'abcdef1234567',
    since: 'v3.12.8-nightly.1',
    commits: [{ subject: 'fix: give the platinum its own icon', body: 'The popup showed the last unlock.\n\nNow the game icon.\n' }],
  });
  assert.match(notes, /Nightly build 3\.12\.8-nightly\.2 of the dev branch \(abcdef1\)/);
  assert.match(notes, /Settings > Update channel > Stable/);
  assert.match(notes, /## Changes since v3\.12\.8-nightly\.1/);
  assert.match(notes, /- \*\*fix: give the platinum its own icon\*\*\n {2}The popup showed the last unlock\.\n {2}Now the game icon\./);
});

test('the notes only list commits that change what ships', () => {
  const args = logArgs('v3.12.8-nightly.1', 'abc1234');
  assert.deepEqual(args.slice(args.indexOf('--') + 1), ['app', 'watchdog', ':(exclude)watchdog/test', 'NOTICE']);
  assert.ok(args.includes('v3.12.8-nightly.1..abc1234'));
});

test('the push filter of the workflow lists the same shipped paths', () => {
  const workflow = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', '.github', 'workflows', 'nightly.yml'), 'utf8');
  for (const line of ["- 'app/**'", "- 'watchdog/**'", "- '!watchdog/test/**'", "- 'NOTICE'"]) assert.ok(workflow.includes(line), line);
});

test('a rebuild without new commits still says what it is', () => {
  assert.match(releaseNotes({ version: '3.12.8-nightly.3', sha: 'abc1234', since: 'v3.12.8-nightly.2', commits: [] }), /No code change/);
});
