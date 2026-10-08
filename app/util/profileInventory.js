'use strict';

/*
  What a profile backup holds, as data. Everything under the user data folder is listed once here,
  and a path that matches no rule is NOT exported: a file added to the app later stays out of
  backups until somebody decides it belongs in one. The longest matching rule wins, so a folder can
  be excluded with one child kept (steam_cache is a cache, steam_cache/xbox is a library).

  mode 'merge'   files are replaced one by one and the rest of the folder is left alone (cfg).
  mode 'replace' the folder is swapped as a whole, so the restored set is exactly the saved one.
*/

const fs = require('fs');
const path = require('path');

const CONFIG_EXTENSIONS = ['.json', '.db', '.ini', '.txt'];

const RULES = [
  // Included: choices the user made and data nothing can fetch again.
  { path: 'cfg', include: true, mode: 'merge', rebase: true, extensions: CONFIG_EXTENSIONS, why: 'settings, library choices, overrides, blacklist, manual games, GBE restore index' },
  { path: 'cfg/collection-images', include: true, mode: 'replace', why: 'pictures the user chose for collections' },
  { path: 'covers', include: true, mode: 'replace', why: 'cover art the user picked' },
  { path: 'gameIcons', include: true, mode: 'replace', why: 'square logos the user picked' },
  { path: 'backgrounds', include: true, mode: 'replace', why: 'achievement page backgrounds the user picked' },
  { path: 'themes', include: true, mode: 'replace', why: 'user CSS themes' },
  { path: 'theme-images', include: true, mode: 'replace', why: 'custom theme source pictures' },
  { path: 'sounds', include: true, mode: 'replace', why: 'imported notification sounds' },
  { path: 'presets', include: true, mode: 'replace', why: 'generated and imported notification presets' },
  { path: 'backups', include: true, mode: 'replace', why: 'GBE restore points and achievement reset backups' },
  { path: 'steam_cache/data', include: true, mode: 'replace', why: 'achievement reset baselines' },
  { path: 'steam_cache/xbox', include: true, mode: 'replace', why: 'imported Xbox library, no public source to refetch it' },
  { path: 'steam_cache/retroachievements', include: true, mode: 'replace', why: 'imported RetroAchievements library' },
  { path: 'cache/uplayR2', include: true, mode: 'replace', why: 'user-seeded Uplay R2 loader, no download source' },
  { path: 'cache/gse_fork/custom', include: true, mode: 'replace', why: 'user-imported emulator dll, no download source' },

  // Excluded because it is a secret or tied to this Windows account or machine.
  { path: 'epic_tokens.enc', include: false, why: 'secret: Epic sign-in (DPAPI, machine-bound)' },
  { path: 'steam_session.enc', include: false, why: 'secret: Steam sign-in' },
  { path: 'cfg/secret.key', include: false, why: 'secret: DPAPI-held key of this Windows account' },
  { path: 'cfg/xbox-auth.json', include: false, why: 'secret: Xbox session' },
  { path: 'cfg/retroachievements-auth.json', include: false, why: 'secret: RetroAchievements API key' },
  { path: '.updaterId', include: false, why: 'machine identity' },
  { path: 'cfg/mainWindowState.json', include: false, why: 'window bounds of this monitor layout' },
  { path: 'cfg/overlayBounds.json', include: false, why: 'overlay bounds of this monitor layout' },
  { path: 'cfg/notificationHealth.json', include: false, why: 'delivery health of this machine' },
  { path: 'cfg/userdir.db', include: false, why: 'emulator save folders found on this machine, rediscovered by a scan' },
  { path: 'cfg/steamdb.json', include: false, why: 'name cache' },

  // Excluded because it is regenerated.
  { path: 'steam_cache', include: false, why: 'schema, icon and cover cache' },
  { path: 'uplay_cache', include: false, why: 'Ubisoft schema and icon cache' },
  { path: 'icon_cache', include: false, why: 'console icon cache' },
  { path: 'cache', include: false, why: 'downloaded tools and derived snapshots' },
  { path: 'logs', include: false, why: 'diagnostics, exported separately' },
  { path: 'Source', include: false, why: 'restored by the app at start' },
  { path: 'view', include: false, why: 'restored by the app at start' },
  { path: 'Media', include: false, why: 'restored by the app at start' },
  ...[
    'Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Local Storage', 'Session Storage',
    'IndexedDB', 'Network', 'Partitions', 'blob_storage', 'Shared Dictionary', 'SharedStorage', 'WebStorage',
    'DIPS', 'Service Worker', 'Local State', 'Preferences', 'Crashpad', 'Dictionaries', 'lockfile',
    '.profile-restore',
  ].map((name) => ({ path: name, include: false, why: 'Chromium state or restore bookkeeping, rebuilt by the app' })),
];

// Outside the user data folder: nothing else is exported. Listed so the classification is complete.
const OUTSIDE_USER_DATA = [
  { where: 'HKCU\\Software\\Achievement Watcher Next\\Playtime\\Steam', include: true, why: 'playtime counters, carried in the manifest and merged with max()' },
  { where: 'Pictures\\Achievement Watcher Next, Videos\\Achievement Watcher Next', include: false, why: 'the user\'s own screenshots and clips' },
  { where: 'Startup entry (Run key)', include: false, why: 'derived from a setting and re-applied at start' },
  { where: 'Install folder (watchdog/playtime/filter.json)', include: false, why: 'optional, not user data' },
];

// Whatever the folder, these never travel.
const SECRET_EXTENSIONS = new Set(['.enc', '.key', '.pem', '.pfx', '.p12']);
const SECRET_NAME = /(^|[-_.])(tokens?|secrets?|credentials?|cookies?|passwords?|auth|session)([-_.]|$)/i;

const MAX_ENTRIES = 200000;
const MAX_FILE_BYTES = 4 * 1024 ** 3;
const MAX_TOTAL_BYTES = 32 * 1024 ** 3;

const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

const byLength = [...RULES].sort((a, b) => b.path.length - a.path.length);

function isSecretFile(rel) {
  const base = rel.split('/').pop();
  if (SECRET_EXTENSIONS.has(path.extname(base).toLowerCase())) return true;
  // The name pattern is only applied where configuration lives; a sound called "session.wav" is fine.
  return (rel.startsWith('cfg/') || !rel.includes('/')) && SECRET_NAME.test(base);
}

/*
  A relative path as it may appear in an archive: forward slashes, no drive, no stream suffix, no
  dot segments, no Windows device names. Anything else is refused outright rather than cleaned.
*/
function isSafeRelativePath(rel) {
  if (typeof rel !== 'string' || !rel || rel.length > 240) return false;
  if (rel.includes('\\') || rel.includes('\0') || rel.includes(':') || rel.startsWith('/')) return false;
  return rel.split('/').every(
    (part) => part && part !== '.' && part !== '..' && !/[<>"|?*\x00-\x1f]/.test(part) && !/[. ]$/.test(part) && !RESERVED_NAMES.test(part)
  );
}

function ruleFor(rel) {
  const lower = rel.toLowerCase();
  return byLength.find((rule) => {
    const p = rule.path.toLowerCase();
    return lower === p || lower.startsWith(`${p}/`);
  });
}

// { include, rule, reason } for a relative path; unlisted paths are excluded.
function classify(rel) {
  if (!isSafeRelativePath(rel)) return { include: false, rule: null, reason: 'unsafe-path' };
  if (isSecretFile(rel)) return { include: false, rule: null, reason: 'secret' };
  const rule = ruleFor(rel);
  if (!rule) return { include: false, rule: null, reason: 'not-listed' };
  if (!rule.include) return { include: false, rule, reason: rule.why };
  if (rule.extensions && !rule.extensions.includes(path.extname(rel).toLowerCase())) {
    return { include: false, rule, reason: 'extension' };
  }
  return { include: true, rule, reason: rule.why };
}

// The unit a restore swaps for this file: the whole folder for 'replace', the file itself for 'merge'.
function unitFor(rel) {
  const verdict = classify(rel);
  if (!verdict.include) return null;
  return verdict.rule.mode === 'replace' ? { rel: verdict.rule.path, kind: 'dir' } : { rel, kind: 'file' };
}

// Every file of the included rules, as { rel, abs, size }. Links and junctions are never followed.
function listProfileFiles(userDataDir) {
  const found = [];
  let owner = null;
  const walk = (abs, rel) => {
    let stat;
    try {
      stat = fs.lstatSync(abs);
    } catch {
      return;
    }
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      let names = [];
      try {
        names = fs.readdirSync(abs).sort();
      } catch {
        return;
      }
      for (const name of names) walk(path.join(abs, name), `${rel}/${name}`);
    } else if (stat.isFile()) {
      // A folder with its own rule inside another included one (cfg/collection-images in cfg) is
      // walked twice; only the rule that owns the file lists it, or the manifest holds a duplicate.
      const verdict = classify(rel);
      if (verdict.include && verdict.rule === owner) found.push({ rel, abs, size: stat.size });
    }
  };
  for (const rule of RULES) {
    if (!rule.include) continue;
    owner = rule;
    walk(path.join(userDataDir, ...rule.path.split('/')), rule.path);
  }
  return found;
}

module.exports = {
  RULES,
  OUTSIDE_USER_DATA,
  MAX_ENTRIES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  isSafeRelativePath,
  isSecretFile,
  classify,
  unitFor,
  listProfileFiles,
};
