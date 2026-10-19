'use strict';

/*
  GitHub's releases.atom read into the list electron-updater's fullChangelog hands over:
  { version, note } per release, newest first. Only the dev-only --fake-update offer uses it, so a
  dev run shows the offer with real release notes instead of a release that does not exist.
*/

const semver = require('semver');

const TAG_VERSION = /\/tag\/v?([^/]+)$/;

/** @returns {{ version: string, note: string }[]} */
function releaseNotesFromFeed(xml, limit) {
  // electron-updater's own XML reader, loaded here only: the packaged app never calls this.
  const { parseXml } = require('builder-util-runtime');
  const notes = [];
  for (const entry of parseXml(String(xml || '')).getElements('entry')) {
    const link = entry.elementOrNull('link');
    const match = link && TAG_VERSION.exec(link.attribute('href'));
    if (match && semver.valid(match[1])) notes.push({ version: match[1], note: entry.elementValueOrEmpty('content') });
  }
  return notes.sort((a, b) => semver.rcompare(a.version, b.version)).slice(0, limit);
}

module.exports = { releaseNotesFromFeed };
