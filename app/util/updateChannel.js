'use strict';

/*
  The update channel: "stable" follows the releases tagged from main, "nightly" the pre-releases CI
  publishes from every push to dev (vX.Y.Z-nightly.N). electron-updater's GitHub provider does the
  rest from three switches: with the custom channel "nightly" and pre-releases allowed it takes the
  newest nightly tag of the feed; with them off it reads releases/latest, which never lists a
  pre-release. Going back to stable from a nightly is a downgrade on purpose, so it is allowed then.
*/

const semver = require('semver');

const CHANNELS = Object.freeze(['stable', 'nightly']);

/**
 * The channel to follow. Never chosen yet, a copy follows the channel it was built for, so a nightly
 * downloaded by hand keeps getting nightlies instead of being offered the way back at once.
 * @param {unknown} value the saved `general.updateChannel`
 * @param {string} [currentVersion] the running version
 * @returns {'stable' | 'nightly'}
 */
function normalizeChannel(value, currentVersion = '') {
  if (value === 'nightly' || value === 'stable') return value;
  return channelOfVersion(currentVersion);
}

/**
 * The channel a version was published on, from its pre-release tag.
 * @param {string} version
 * @returns {'stable' | 'nightly'}
 */
function channelOfVersion(version) {
  const pre = semver.prerelease(String(version || '').trim());
  return pre && pre[0] === 'nightly' ? 'nightly' : 'stable';
}

/**
 * The electron-updater settings for a channel.
 * @param {string} channel
 * @param {string} currentVersion the running version
 * @returns {{ channel: string, allowPrerelease: boolean, allowDowngrade: boolean }}
 */
function updaterSettings(channel, currentVersion) {
  if (normalizeChannel(channel) === 'nightly') return { channel: 'nightly', allowPrerelease: true, allowDowngrade: false };
  // A pre-release copy that chose stable is offered the latest stable even though it sorts lower.
  return { channel: 'latest', allowPrerelease: false, allowDowngrade: semver.prerelease(String(currentVersion || '')) !== null };
}

/**
 * A stable version offered to a pre-release copy on the stable channel: the way back, not a stale feed.
 * @param {string} offered
 * @param {string} currentVersion
 * @param {string} channel
 * @returns {boolean}
 */
function isReturnToStable(offered, currentVersion, channel) {
  if (normalizeChannel(channel) !== 'stable') return false;
  const offeredValid = semver.valid(String(offered || '').trim());
  const currentValid = semver.valid(String(currentVersion || '').trim());
  return Boolean(offeredValid && currentValid) && semver.prerelease(offeredValid) === null && semver.prerelease(currentValid) !== null;
}

module.exports = { CHANNELS, normalizeChannel, channelOfVersion, updaterSettings, isReturnToStable };
