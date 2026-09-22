'use strict';

const path = require('path');

// The immediate child of `rootDir` that holds (or is) `targetDir`, so a file several levels deep can
// be checked against a root-level snapshot taken when a watch started. Falls back to `targetDir`
// itself when it isn't actually under `rootDir`.
function immediateChildDirOf(rootDir, targetDir) {
  const rel = path.relative(rootDir, targetDir);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return targetDir;
  const first = rel.split(path.sep)[0];
  return path.join(rootDir, first);
}

// Known fixed leaf subfolder names an emulator's save layout adds below the appid folder itself, so
// the appid can be recovered even though it is not the last path segment: ALI213-family builds write
// into <appid>/stats or <appid>/SteamEmu(/UserStats), GOG UniverseLAN into <gogAppId>/UniverseLANData.
const APPID_STRIP_SUFFIXES = /(\\stats$)|(\\SteamEmu$)|(\\SteamEmu\\UserStats$)|(\\UniverseLANData$)/gi;

// The trailing numeric appid folder from an achievement file's own directory, stripping one of the
// known fixed leaf subfolders above first. Returns null (never throws) when no trailing digit run is
// found, so the caller decides what a missing appid means.
function deriveAppIdFromDir(dirPath) {
  const stripped = String(dirPath || '').replace(APPID_STRIP_SUFFIXES, '');
  const match = stripped.match(/([0-9]+)$/);
  return match ? match[0] : null;
}

module.exports = { immediateChildDirOf, deriveAppIdFromDir };
