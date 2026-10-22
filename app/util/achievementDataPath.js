'use strict';

const fs = require('fs');

// Return a filesystem path for achievement data, or '' for registry-backed sources.

// Windows-shaped absolute paths ("C:\…", "C:/…", "\\server\share") plus POSIX ones, checked without
// path.isAbsolute so the answer does not depend on which platform the code happens to run on.
function isFilesystemPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return /^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\') || raw.startsWith('/');
}

function resolveAchievementDataPath(data) {
  const raw = String((data && data.path) || '').trim();
  return isFilesystemPath(raw) ? raw : '';
}

/*
  Every file or folder a record's unlocks are read from: its path, shadPS4 0.19's per-user state and,
  for a game kept in several profiles, each profile's list that exists. A reset that only knew the
  first profile would leave the others' unlocks in place.
*/
function achievementDataPaths(data) {
  const profiles = Array.isArray(data && data.profileFiles) ? data.profileFiles : [];
  const found = [resolveAchievementDataPath(data), resolveAchievementDataPath({ path: data && data.statePath })];
  for (const file of profiles) {
    const resolved = resolveAchievementDataPath({ path: file });
    if (resolved && fs.existsSync(resolved)) found.push(resolved);
  }
  return [...new Set(found.filter(Boolean))];
}

module.exports = { resolveAchievementDataPath, achievementDataPaths, isFilesystemPath };
