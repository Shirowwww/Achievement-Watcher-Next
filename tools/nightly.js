'use strict';

/*
  The nightly builds' bookkeeping, run by .github/workflows/nightly.yml:
    node tools/nightly.js version          the next vX.Y.Z-nightly.N
    node tools/nightly.js notes <sha>      the release notes, from the commits since the last nightly
    node tools/nightly.js prune <keep>     the nightly tags to delete, oldest first
  X.Y.Z is the version dev works towards: app/package.json when it is ahead of the last stable tag,
  otherwise that tag's next patch, so a nightly always sorts below the release it leads to.
*/

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const semver = require(path.join(__dirname, '..', 'app', 'node_modules', 'semver'));

const CHANNEL = 'nightly';
const MAX_BODY_LINES = 6;

const versionOf = (tag) => semver.valid(String(tag || '').trim());
const isNightly = (version) => {
  const pre = semver.prerelease(version);
  return Boolean(pre) && pre[0] === CHANNEL && Number.isInteger(pre[1]);
};

/** @param {string[]} tags @returns {string[]} the nightly versions, newest first */
function nightlyVersions(tags) {
  return tags.map(versionOf).filter((v) => v && isNightly(v)).sort(semver.rcompare);
}

/** @param {string[]} tags @returns {string | null} the newest stable version */
function latestStable(tags) {
  return tags.map(versionOf).filter((v) => v && semver.prerelease(v) === null).sort(semver.rcompare)[0] || null;
}

/**
 * @param {{ packageVersion: string, tags: string[] }} input
 * @returns {string} the next nightly version, without the leading v
 */
function nextNightlyVersion({ packageVersion, tags }) {
  const stable = latestStable(tags) || '0.0.0';
  const declared = semver.valid(semver.coerce(packageVersion));
  const base = declared && semver.gt(declared, stable) ? declared : semver.inc(stable, 'patch');
  const sameBase = nightlyVersions(tags).filter((v) => semver.coerce(v).version === base);
  const last = sameBase.length ? semver.prerelease(sameBase[0])[1] : 0;
  return `${base}-${CHANNEL}.${last + 1}`;
}

/** @param {string[]} tags @param {number} keep @returns {string[]} the tags to delete, as v-prefixed tags */
function tagsToPrune(tags, keep) {
  return nightlyVersions(tags)
    .slice(Math.max(0, keep))
    .toReversed()
    .map((v) => `v${v}`);
}

/** @param {string[]} tags @returns {string | null} the tag the next notes start after */
function previousTag(tags) {
  const nightly = nightlyVersions(tags)[0];
  const stable = latestStable(tags);
  if (nightly) return `v${nightly}`;
  return stable ? `v${stable}` : null;
}

function commitLines({ subject, body }) {
  const lines = String(body || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_BODY_LINES);
  return [`- **${subject.trim()}**`, ...lines.map((line) => `  ${line}`)];
}

/**
 * @param {{ version: string, sha: string, since: string | null, commits: { subject: string, body: string }[] }} input
 * @returns {string} the release notes, Markdown
 */
function releaseNotes({ version, sha, since, commits }) {
  const head = [
    `Nightly build ${version} of the dev branch (${sha.slice(0, 7)}).`,
    '',
    'Built automatically from the latest changes, before they are tested in a release: expect new features early, and new bugs too. Settings > Update channel > Stable goes back to the latest stable version.',
    '',
    since ? `## Changes since ${since}` : '## Changes',
    '',
  ];
  const body = commits.length ? commits.flatMap(commitLines) : ['- No code change, a rebuild of the same commit.'];
  return [...head, ...body, ''].join('\n');
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

function readTags() {
  return git('tag', '--list', 'v*').split('\n').map((t) => t.trim()).filter(Boolean);
}

// What ships, as the workflow's push filter lists it: the notes keep only the commits that change it.
const SHIPPED_PATHS = Object.freeze(['app', 'watchdog', ':(exclude)watchdog/test', 'NOTICE']);

/** @param {string | null} since @param {string} sha @returns {string[]} the git log arguments */
function logArgs(since, sha) {
  return ['log', '--no-merges', '--format=%s%x1f%b%x1e', since ? `${since}..${sha}` : sha, '--', ...SHIPPED_PATHS];
}

function readCommits(since, sha) {
  return git(...logArgs(since, sha))
    .split('\x1e')
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record.trim())
    .map((record) => {
      const [subject, body] = record.split('\x1f');
      return { subject, body };
    });
}

function main([command, arg]) {
  const tags = readTags();
  if (command === 'version') {
    const packageVersion = require(path.join(__dirname, '..', 'app', 'package.json')).version;
    return nextNightlyVersion({ packageVersion, tags });
  }
  if (command === 'notes') {
    const version = process.env.NIGHTLY_VERSION;
    if (!arg || !version) throw new Error('usage: NIGHTLY_VERSION=<version> nightly.js notes <sha>');
    const since = previousTag(tags);
    return releaseNotes({ version, sha: arg, since, commits: readCommits(since, arg) });
  }
  if (command === 'prune') {
    const keep = Number(arg);
    if (!Number.isInteger(keep) || keep < 1) throw new Error('usage: nightly.js prune <keep, 1 or more>');
    return tagsToPrune(tags, keep).join('\n');
  }
  throw new Error('usage: nightly.js version | notes <sha> | prune <keep>');
}

if (require.main === module) {
  try {
    process.stdout.write(`${main(process.argv.slice(2))}\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { logArgs, nextNightlyVersion, tagsToPrune, previousTag, releaseNotes, nightlyVersions, latestStable };
