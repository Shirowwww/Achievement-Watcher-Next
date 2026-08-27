'use strict';

/*
  App-package import and architecture-safe loader installation for Goldberg Uplay R2. The bundled
  DLLs are validated into a private cache before a repair can use them; user-selected DLLs can
  replace that cache without weakening the install checks.
*/

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pe = require('../util/pe.js');
const uplayR2 = require('./uplayR2.js');
const { readRegistryString, listRegistryAllSubkeys } = require('../util/reg.js');

const noopLog = { log() {}, error() {} };
const PACKAGE_MANIFEST = 'package-import.json';
/*
  One bundled package per emulator generation. A game loads only the generation its executable
  imports, so the two are never interchangeable and each keeps its own resources, hashes and cache.
*/
const R2_SHA = Object.freeze({
  x86: '01c016c11b029f4e029018074233ae0c695cddbdf3b719ff4e60dfd14509c131',
  x64: 'fb93763842016cfa992f5f17f96209213c943248e0f00b9bbc2edeb0f83e7105',
});
const R1_SHA = Object.freeze({
  x86: '912ceb30ccb667f8fab8f5131db95b012010f0e35a035137f97440721d9a4743',
  x64: '2baa49dcc090276aafb84847844f502978bfc043a0a02ed453226f12a9d30d15',
});
const PACKAGES = Object.freeze({
  r2: Object.freeze({
    id: 'r2',
    dir: path.join(__dirname, '..', 'resources', 'uplayR2'),
    archive: 'GoldbergUplayR2-11-07-2026.7z',
    archiveSha256: '655edfd05ab61c87b35dd24d9e96e2f4263672f9a6651014e52a2b0649155c34',
    cacheName: 'uplayR2',
    sha256: Object.freeze({
      'uplay_r2_loader.dll': R2_SHA.x86,
      'uplay_r2_loader64.dll': R2_SHA.x64,
      'upc_r2_loader.dll': R2_SHA.x86,
      'upc_r2_loader64.dll': R2_SHA.x64,
    }),
  }),
  r1: Object.freeze({
    id: 'r1',
    dir: path.join(__dirname, '..', 'resources', 'uplayR1'),
    archive: 'UplayR1-08-19-2026.7z',
    archiveSha256: 'f48c6e18c55939b697f7a4fb4e73c6d7aeca240cf97db9f5f6533622deb9b335',
    cacheName: 'uplayR1',
    sha256: Object.freeze({
      'uplay_r1_loader.dll': R1_SHA.x86,
      'uplay_r1_loader64.dll': R1_SHA.x64,
      'upc_r1_loader.dll': R1_SHA.x86,
      'upc_r1_loader64.dll': R1_SHA.x64,
    }),
  }),
});
function packageFor(flavour) {
  return PACKAGES[String((flavour && flavour.id) || flavour || 'r2').toLowerCase()] || PACKAGES.r2;
}
// Kept for callers that name a single generation: they all mean R2.
const BUNDLED_LOADERS_DIR = PACKAGES.r2.dir;
const BUNDLED_RECOVERY_ARCHIVE = path.join(PACKAGES.r2.dir, PACKAGES.r2.archive);
const BUNDLED_RECOVERY_SHA256 = PACKAGES.r2.archiveSha256;
const BUNDLED_LOADER_SHA256 = PACKAGES.r2.sha256;
const MAX_SCAN_FILES = 4096;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const POST_REPAIR_WARNING_FAILURES = new Set(['NO_INI', 'BAD_SAVE_REDIRECT', 'SCHEMA_KEYS_NOT_CANONICAL']);

const LOADER = Object.freeze({
  'uplay_r2_loader.dll': Object.freeze({ arch: 'x86', family: 'uplay', flavour: 'r2' }),
  'uplay_r2_loader64.dll': Object.freeze({ arch: 'x64', family: 'uplay', flavour: 'r2' }),
  'upc_r2_loader.dll': Object.freeze({ arch: 'x86', family: 'upc', flavour: 'r2' }),
  'upc_r2_loader64.dll': Object.freeze({ arch: 'x64', family: 'upc', flavour: 'r2' }),
  'uplay_r1_loader.dll': Object.freeze({ arch: 'x86', family: 'uplay', flavour: 'r1' }),
  'uplay_r1_loader64.dll': Object.freeze({ arch: 'x64', family: 'uplay', flavour: 'r1' }),
  'upc_r1_loader.dll': Object.freeze({ arch: 'x86', family: 'upc', flavour: 'r1' }),
  'upc_r1_loader64.dll': Object.freeze({ arch: 'x64', family: 'upc', flavour: 'r1' }),
});
// The four names of one generation. A cache, an import and an install plan only ever mix one set.
function loaderNamesFor(flavour) {
  const id = packageFor(flavour).id;
  return Object.keys(LOADER).filter((name) => LOADER[name].flavour === id);
}

function resolveUnpackedBinary(binPath) {
  const unpacked = String(binPath).replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
  if (fs.existsSync(unpacked)) return unpacked;
  return binPath;
}

function loaderName(file) {
  const name = path.basename(String(file || '')).toLowerCase();
  return LOADER[name] ? name : '';
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function sameFileBytes(left, right) {
  try {
    const a = fs.statSync(left);
    const b = fs.statSync(right);
    return a.size === b.size && sha256(left) === sha256(right);
  } catch {
    return false;
  }
}

function inspectPackageDll(file, expectedName) {
  const name = loaderName(expectedName || file);
  const spec = name ? LOADER[name] : null;
  const arch = pe.exeArch(file);
  const capabilities = uplayR2.inspectLoader(file);
  let error = '';
  if (!name) error = 'UNRECOGNIZED_NAME';
  else if (!arch) error = 'NOT_PE';
  else if (arch !== spec.arch) error = 'ARCH_MISMATCH';
  else if (!capabilities.supportsAchievements) error = 'NOT_UPLAY_R2_LOADER';
  return {
    name,
    file,
    arch,
    expectedArch: spec && spec.arch,
    capabilities,
    valid: !error,
    error,
  };
}

function looseLoaderName(file) {
  const basename = path.basename(String(file || '')).toLowerCase();
  const arch = pe.exeArch(file);
  const capabilities = uplayR2.inspectLoader(file);
  if (!arch || !capabilities.supportsAchievements) return '';
  const family = basename.includes('upc') ? 'upc' : basename.includes('uplay') ? 'uplay' : '';
  if (!family) return '';
  return `${family}_r2_loader${arch === 'x64' ? '64' : ''}.dll`;
}

function walkFiles(root, { maxDepth = 8 } = {}) {
  const files = [];
  const visit = (dir, depth) => {
    if (depth > maxDepth || files.length >= MAX_SCAN_FILES) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_SCAN_FILES) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name.toLowerCase() !== uplayR2.BACKUP_DIR_NAME) visit(full, depth + 1);
      else if (entry.isFile()) files.push(full);
    }
  };
  visit(root, 0);
  return files;
}

function findPackageDlls(root) {
  const byName = new Map();
  for (const file of walkFiles(root)) {
    const name = loaderName(file);
    if (!name) continue;
    const inspected = inspectPackageDll(file, name);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(inspected);
  }

  const accepted = {};
  const rejected = [];
  for (const [name, candidates] of byName) {
    const valid = candidates.filter((candidate) => candidate.valid);
    rejected.push(...candidates.filter((candidate) => !candidate.valid));
    if (valid.length === 0) continue;
    const hashes = new Map(valid.map((candidate) => [sha256(candidate.file), candidate]));
    if (hashes.size > 1) {
      rejected.push(...valid.map((candidate) => ({ ...candidate, valid: false, error: 'AMBIGUOUS_DUPLICATE' })));
      continue;
    }
    accepted[name] = valid[0];
  }
  return { accepted, rejected };
}

function safeArchiveEntry(entry) {
  const name = String((entry && entry.file) || '').replace(/\\/g, '/');
  if (!name || name.includes('\0') || name.includes(':') || name.startsWith('/') || name.startsWith('//')) return false;
  const segments = name.split('/');
  if (segments.some((segment) => segment === '..')) return false;
  // Do not materialize links from a recovery archive. The bundled package contains ordinary files;
  // a link is unnecessary here and could point the scanner outside its temporary extraction root.
  if (/l/i.test(String((entry && entry.attributes) || ''))) return false;
  return true;
}

async function listArchive(archivePath, sevenBin) {
  const Seven = require('node-7z');
  return new Promise((resolve, reject) => {
    const entries = [];
    let settled = false;
    const stream = Seven.list(resolveUnpackedBinary(archivePath), { $bin: sevenBin });
    stream.on('data', (entry) => entries.push(entry));
    stream.on('end', () => {
      if (!settled) {
        settled = true;
        resolve(entries);
      }
    });
    stream.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

/*
  A failure that is really an antivirus, told apart from a failure that is really a bug.

  A Uplay loader replaces a game's Ubisoft library, which is exactly the shape malware detection
  looks for, so engines flag it - Windows Defender took all four copies of ours at once, the ones
  shipped with the app included. Reported under the same code as the Goldberg download so the one
  explanation the app already has covers both, and `folder` says which folder to allow.
*/
const QUARANTINE_STDERR = /virus|malware|potentially unwanted|indésirable|unerwünschte|Operation did not complete/i;

function quarantineError(err, folder) {
  const stderr = String((err && err.stderr) || '');
  if (!QUARANTINE_STDERR.test(stderr)) return null;
  const blocked = new Error(
    'the Uplay loader package was quarantined by security software before it could be read. ' +
      'Ubisoft emulators are flagged by most antivirus engines; allow the file it reported, then try again.'
  );
  blocked.code = 'EMULATOR_PACKAGE_BLOCKED';
  blocked.stderr = stderr;
  blocked.folder = folder;
  return blocked;
}

async function extractPackage(archivePath, destDir, { log = noopLog } = {}) {
  const Seven = require('node-7z');
  const sevenBin = resolveUnpackedBinary(require('7zip-bin').path7za);
  if (!fs.existsSync(sevenBin)) throw new Error(`7za.exe not found at "${sevenBin}"`);
  const entries = await listArchive(archivePath, sevenBin);
  if (entries.length === 0 || entries.length > MAX_SCAN_FILES) throw new Error('Uplay R2 archive has an invalid file count');
  let totalBytes = 0;
  const archivePaths = new Set();
  for (const entry of entries) {
    if (!safeArchiveEntry(entry)) throw new Error(`Unsafe path or link in Uplay R2 archive: ${entry.file || '(unnamed)'}`);
    const archivePathKey = String(entry.file).replace(/\\/g, '/').toLowerCase();
    if (archivePaths.has(archivePathKey)) throw new Error(`Duplicate path in Uplay R2 archive: ${entry.file}`);
    archivePaths.add(archivePathKey);
    const directory = /^d/i.test(String(entry.attributes || ''));
    if (!directory && !Number.isFinite(entry.size)) throw new Error(`Uplay R2 archive entry has no safe size: ${entry.file}`);
    totalBytes += Number(entry.size) || 0;
    if (totalBytes > MAX_ARCHIVE_BYTES) throw new Error('Uplay R2 archive expands beyond the 256 MiB safety limit');
  }
  const loaderEntries = entries.map((entry) => entry.file).filter((file) => loaderName(file));
  if (loaderEntries.length === 0) throw new Error('No recognized Uplay R2 loader name in archive');
  fs.mkdirSync(destDir, { recursive: true });
  await new Promise((resolve, reject) => {
    // Extract only loader candidates. INIs, schemas, links, and unrelated package material never
    // enter even the temporary tree used by the importer.
    const stream = Seven.extractFull(resolveUnpackedBinary(archivePath), destDir, { $bin: sevenBin, $cherryPick: loaderEntries });
    stream.on('end', resolve);
    // node-7z's own message is just the archive path; 7za's stderr carries the real cause, and the
    // most frequent one by far is an antivirus taking the loader between the write and the read.
    stream.on('error', (err) => reject(quarantineError(err, destDir) || err));
  });
  log.log(`[uplayR2] extracted loader package ${path.basename(archivePath)}`);
}

/*
  Import a user-selected archive, directory, or individual DLL. Only the four known loader names are
  copied. Every accepted file must be a real PE with the architecture its public basename promises
  and must contain the Uplay R2 achievement setting understood by the repair path.
*/
async function importPackage({ packagePath, cacheDir, flavour = 'r2', log = noopLog, preserveValidExisting = false } = {}) {
  if (!packagePath || !fs.existsSync(packagePath)) throw new Error(`Uplay R2 package not found: ${packagePath}`);
  if (!cacheDir) throw new Error('importPackage: cacheDir is required');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-r2-import-'));
  let sourceRoot = '';
  try {
    const stat = fs.statSync(packagePath);
    if (stat.isDirectory()) {
      sourceRoot = packagePath;
    } else if (loaderName(packagePath) || path.extname(packagePath).toLowerCase() === '.dll') {
      const targetName = loaderName(packagePath) || looseLoaderName(packagePath);
      if (!targetName) throw new Error('The selected DLL is not a recognized achievement-capable Uplay R2 loader');
      sourceRoot = path.join(tempDir, 'single');
      fs.mkdirSync(sourceRoot, { recursive: true });
      fs.copyFileSync(packagePath, path.join(sourceRoot, targetName));
    } else {
      sourceRoot = path.join(tempDir, 'extracted');
      await extractPackage(packagePath, sourceRoot, { log });
    }

    const found = findPackageDlls(sourceRoot);
    const accepted = Object.values(found.accepted);
    if (accepted.length === 0) {
      const reasons = [...new Set(found.rejected.map((entry) => entry.error).filter(Boolean))];
      throw new Error(`No compatible Uplay R2 loader DLL found${reasons.length ? ` (${reasons.join(', ')})` : ''}`);
    }

    fs.mkdirSync(cacheDir, { recursive: true });
    const result = { dir: cacheDir, imported: [], unchanged: [], rejected: found.rejected };
    for (const entry of accepted) {
      const destination = path.join(cacheDir, entry.name);
      if (fs.existsSync(destination) && sameFileBytes(entry.file, destination)) {
        result.unchanged.push(entry.name);
        continue;
      }
      if (preserveValidExisting && fs.existsSync(destination) && inspectPackageDll(destination, entry.name).valid) {
        result.unchanged.push(entry.name);
        continue;
      }
      const temporary = path.join(cacheDir, `.${entry.name}.${process.pid}.${Date.now()}.tmp`);
      try {
        fs.copyFileSync(entry.file, temporary);
        const copied = inspectPackageDll(temporary, entry.name);
        if (!copied.valid) throw new Error(`${entry.name}: imported copy failed validation (${copied.error})`);
        fs.renameSync(temporary, destination);
      } finally {
        try {
          if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        } catch {
          /* ignore cleanup failure */
        }
      }
      result.imported.push(entry.name);
    }

    const cache = ensureEmulatorDlls({ cacheDir, flavour });
    const manifest = {
      format: 1,
      importedAt: new Date().toISOString(),
      source: path.basename(packagePath),
      files: Object.values(cache.details)
        .filter((entry) => entry.valid)
        .map((entry) => ({
          name: entry.name,
          arch: entry.arch,
          sha256: sha256(entry.file),
          supportsAchRedirect: !!entry.capabilities.supportsAchRedirect,
          supportsAchKeyPrefix: !!entry.capabilities.supportsAchKeyPrefix,
        })),
    };
    const manifestFile = path.join(cacheDir, PACKAGE_MANIFEST);
    const temporaryManifest = `${manifestFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryManifest, JSON.stringify(manifest, null, 2));
    fs.renameSync(temporaryManifest, manifestFile);
    return { ...result, cache, manifest };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup failure */
    }
  }
}

/*
  Normal repairs seed from the plain DLLs shipped with AW Next. They pass the same PE, capability,
  architecture and hash checks as a user-selected loader. A valid custom cache wins unless the user
  explicitly restores the integrated files.
*/
async function ensureBundledEmulatorDlls({ cacheDir, flavour = 'r2', packagePath = '', log = noopLog, replaceExisting = false } = {}) {
  const bundle = packageFor(flavour);
  const defaultDir = bundle.dir;
  const requested = packagePath || defaultDir;
  let cache = ensureEmulatorDlls({ cacheDir, flavour: bundle.id });
  let source = resolveUnpackedBinary(requested);
  if (!fs.existsSync(source)) throw new Error(`Bundled ${bundle.id.toUpperCase()} loader folder not found: ${source}`);
  if (path.resolve(requested) === path.resolve(defaultDir)) {
    let directFilesValid = true;
    for (const [name, expectedHash] of Object.entries(bundle.sha256)) {
      const file = path.join(source, name);
      if (!fs.existsSync(file) || !inspectPackageDll(file, name).valid || sha256(file) !== expectedHash) {
        directFilesValid = false;
        break;
      }
    }
    if (!directFilesValid) {
      const archive = resolveUnpackedBinary(path.join(defaultDir, bundle.archive));
      if (!fs.existsSync(archive) || sha256(archive) !== bundle.archiveSha256) {
        /*
          Both the loaders and the archive AW Next installs alongside itself are gone. They were
          there when the app was installed, so something removed them since, and on these files that
          something is an antivirus in all but the rarest case. Saying "unavailable" left the user
          looking for a bug in the app instead of at the alert their antivirus had just shown them.
        */
        const missing = Object.keys(bundle.sha256).filter((name) => !fs.existsSync(path.join(source, name)));
        const gone = new Error(
          missing.length > 0
            ? `the Uplay loaders shipped with AW Next are no longer on disk (${missing.join(', ')}), and neither is the recovery archive. ` +
              'Ubisoft emulators are flagged by most antivirus engines; allow this folder, then try again.'
            : `Bundled ${bundle.id.toUpperCase()} loaders and recovery archive are unavailable`
        );
        if (missing.length > 0) {
          gone.code = 'EMULATOR_PACKAGE_BLOCKED';
          gone.folder = source;
        }
        throw gone;
      }
      source = archive;
    }
  }
  let bundledImport = null;
  if (!cache.complete || replaceExisting) {
    bundledImport = await importPackage({
      packagePath: source,
      cacheDir,
      flavour: bundle.id,
      log,
      preserveValidExisting: !replaceExisting,
    });
    cache = bundledImport.cache;
  }
  if (!cache.complete) throw new Error(`Bundled ${bundle.id.toUpperCase()} package did not provide all x86/x64 loader aliases`);
  const customNames = Object.entries(cache.files)
    .filter(([name, file]) => file && sha256(file) !== bundle.sha256[name])
    .map(([name]) => name);
  return { ...cache, bundledImport, customNames, integrated: customNames.length === 0 };
}

// A misleading filename or arbitrary DLL never becomes eligible merely because it was copied into
// the folder by hand.
function ensureEmulatorDlls({ cacheDir, flavour = 'r2' } = {}) {
  if (!cacheDir) throw new Error('ensureEmulatorDlls: cacheDir is required');
  fs.mkdirSync(cacheDir, { recursive: true });

  const files = {};
  const details = {};
  const invalid = [];
  for (const name of loaderNamesFor(flavour)) {
    const file = path.join(cacheDir, name);
    if (!fs.existsSync(file)) {
      files[name] = null;
      continue;
    }
    const inspected = inspectPackageDll(file, name);
    details[name] = inspected;
    if (inspected.valid) files[name] = file;
    else {
      files[name] = null;
      invalid.push(inspected);
    }
  }
  return {
    dir: cacheDir,
    flavour: packageFor(flavour).id,
    seeded: Object.values(files).some(Boolean),
    complete: Object.values(files).every(Boolean),
    files,
    details,
    invalid,
  };
}

function importedLoaderNames(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const stat = fs.fstatSync(fd);
    // Only bounded header, section-table, descriptor and name reads happen below. Do not reject a
    // legitimate game merely because its executable is large; no executable body is read wholesale.
    if (stat.size < 256) return [];
    const readAt = (offset, length) => {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset + length > stat.size) return null;
      const buffer = Buffer.alloc(length);
      const read = fs.readSync(fd, buffer, 0, length, offset);
      return read === length ? buffer : null;
    };
    const dos = readAt(0, 64);
    if (!dos || dos.readUInt16LE(0) !== 0x5a4d) return [];
    const peOffset = dos.readUInt32LE(0x3c);
    const coff = readAt(peOffset, 24);
    if (!coff || coff.readUInt32LE(0) !== 0x00004550) return [];
    const sectionCount = coff.readUInt16LE(6);
    const optionalSize = coff.readUInt16LE(20);
    if (sectionCount < 1 || sectionCount > 96 || optionalSize < 104) return [];
    const optional = readAt(peOffset + 24, optionalSize);
    if (!optional) return [];
    const magic = optional.readUInt16LE(0);
    const dataDirectories = magic === 0x20b ? 112 : magic === 0x10b ? 96 : -1;
    if (dataDirectories < 0 || dataDirectories + 16 > optional.length) return [];
    const importRva = optional.readUInt32LE(dataDirectories + 8);
    const importSize = optional.readUInt32LE(dataDirectories + 12);
    if (!importRva || !importSize) return [];

    const sectionTable = readAt(peOffset + 24 + optionalSize, sectionCount * 40);
    if (!sectionTable) return [];
    const sections = [];
    for (let index = 0; index < sectionCount; index++) {
      const base = index * 40;
      sections.push({
        virtualSize: sectionTable.readUInt32LE(base + 8),
        virtualAddress: sectionTable.readUInt32LE(base + 12),
        rawSize: sectionTable.readUInt32LE(base + 16),
        rawOffset: sectionTable.readUInt32LE(base + 20),
      });
    }
    const rvaToOffset = (rva) => {
      for (const section of sections) {
        const span = Math.max(section.virtualSize, section.rawSize);
        if (rva >= section.virtualAddress && rva < section.virtualAddress + span) {
          const delta = rva - section.virtualAddress;
          if (delta >= section.rawSize) return -1;
          return section.rawOffset + delta;
        }
      }
      return -1;
    };
    const readCString = (offset) => {
      if (offset < 0 || offset >= stat.size) return '';
      const data = readAt(offset, Math.min(260, stat.size - offset));
      if (!data) return '';
      const end = data.indexOf(0);
      return data.subarray(0, end < 0 ? data.length : end).toString('ascii').toLowerCase();
    };

    const tableOffset = rvaToOffset(importRva);
    if (tableOffset < 0) return [];
    const found = new Set();
    const descriptorCount = Math.min(2048, Math.ceil(importSize / 20));
    for (let index = 0; index < descriptorCount; index++) {
      const descriptor = readAt(tableOffset + index * 20, 20);
      if (!descriptor || descriptor.every((byte) => byte === 0)) break;
      const nameOffset = rvaToOffset(descriptor.readUInt32LE(12));
      if (nameOffset < 0) continue;
      const name = readCString(nameOffset);
      if (LOADER[name]) found.add(name);
    }
    return [...found];
  } catch {
    return [];
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/*
  A game that resolves its loader with LoadLibrary has no import table entry to read, and that is the
  common case: of four real installs checked, only two named the loader statically. The executable
  still carries the API it speaks, and the two generations use disjoint achievement entry points, so
  a bounded literal scan settles which loader belongs in the folder. The loader basenames are the
  fallback for a title that never calls achievements at all.
*/
const FLAVOUR_API_MARKERS = Object.freeze([
  Object.freeze({ flavour: 'r2', literals: Object.freeze(['UPC_AchievementUnlock', 'UPC_AchievementListGet']) }),
  Object.freeze({ flavour: 'r1', literals: Object.freeze(['UPLAY_ACH_EarnAchievement', 'UPLAY_ACH_GetAchievements']) }),
]);
const MAX_SCANNED_EXECUTABLES = 8;
const MAX_SCANNED_BYTES = 512 * 1024 * 1024;

// Chunked literal search: a game executable can be hundreds of MB, so never hold one in memory.
// Chunks overlap by the longest needle so a match cannot fall between two reads.
function scanFileForLiterals(file, literals) {
  const found = new Set();
  const needles = literals.map((literal) => ({ literal, buffer: Buffer.from(literal, 'ascii') }));
  if (needles.length === 0) return found;
  const overlap = Math.max(...needles.map((entry) => entry.buffer.length));
  const chunk = 8 * 1024 * 1024;
  const buffer = Buffer.alloc(chunk + overlap);
  let fd;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return found;
  }
  try {
    const size = Math.min(fs.fstatSync(fd).size, MAX_SCANNED_BYTES);
    let position = 0;
    let carry = 0;
    while (position < size) {
      const wanted = Math.min(chunk, size - position);
      const read = fs.readSync(fd, buffer, carry, wanted, position);
      if (read <= 0) break;
      const view = buffer.subarray(0, carry + read);
      for (const entry of needles) {
        if (!found.has(entry.literal) && view.indexOf(entry.buffer) !== -1) found.add(entry.literal);
      }
      if (found.size === needles.length) break;
      view.copy(buffer, 0, view.length - overlap);
      carry = overlap;
      position += read;
    }
  } catch {
    /* an unreadable executable is simply not evidence */
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      /* ignore */
    }
  }
  return found;
}

// The generation an executable speaks, or '' when it names both or neither.
function flavourFromExecutableStrings(exe) {
  const api = scanFileForLiterals(exe, FLAVOUR_API_MARKERS.flatMap((marker) => [...marker.literals]));
  const spoken = FLAVOUR_API_MARKERS.filter((marker) => marker.literals.some((literal) => api.has(literal)));
  if (spoken.length === 1) return spoken[0].flavour;
  if (spoken.length > 1) return '';
  const names = scanFileForLiterals(exe, Object.keys(LOADER));
  const flavours = new Set([...names].map((name) => LOADER[name].flavour));
  return flavours.size === 1 ? [...flavours][0] : '';
}

/*
  The loader basenames this executable will hand to LoadLibrary, for placement rather than detection.
  A basename on its own is NOT authorization - a readme or a log line can mention one - so an
  achievement entry point of the same generation must be present too. That name is a GetProcAddress
  argument: an executable carrying it intends to call that API, which a stray mention never does.
*/
function loaderNamesFromExecutableStrings(exe, flavour) {
  const marker = FLAVOUR_API_MARKERS.find((entry) => entry.flavour === packageFor(flavour).id);
  if (!marker) return [];
  const found = scanFileForLiterals(exe, [...marker.literals, ...loaderNamesFor(flavour)]);
  if (!marker.literals.some((literal) => found.has(literal))) return [];
  return loaderNamesFor(flavour).filter((name) => found.has(name));
}

function executableCandidates(gameDir, exePath) {
  const files = [];
  const add = (file) => {
    if (!file || path.extname(file).toLowerCase() !== '.exe' || !fs.existsSync(file)) return;
    const key = path.resolve(file).toLowerCase();
    if (!files.some((existing) => path.resolve(existing).toLowerCase() === key)) files.push(file);
  };
  add(exePath);
  for (const file of walkFiles(gameDir, { maxDepth: 5 })) {
    if (files.length >= 256) break;
    add(file);
  }
  return files;
}

/*
  Ubisoft Connect records every product it installed under Software\Ubisoft\Launcher\Installs\<id>
  with its InstallDir. A folder inside one of those is the single case where the loader beside the
  executable is Ubisoft's own file and must never be replaced.
*/
function isRegisteredUbisoftInstall(gameDir) {
  if (!gameDir) return false;
  let target;
  try {
    target = path.resolve(gameDir).toLowerCase();
  } catch {
    return false;
  }
  for (const hive of ['HKLM', 'HKCU']) {
    for (const root of ['Software/WOW6432Node/Ubisoft/Launcher/Installs', 'Software/Ubisoft/Launcher/Installs']) {
      let subs = [];
      try {
        subs = listRegistryAllSubkeys(hive, root) || [];
      } catch {
        continue;
      }
      for (const sub of subs) {
        let dir = '';
        try {
          dir = readRegistryString(hive, `${root}/${sub}`, 'InstallDir') || '';
        } catch {
          continue;
        }
        if (!dir) continue;
        let installed;
        try {
          installed = path.resolve(dir).toLowerCase();
        } catch {
          continue;
        }
        if (target === installed || target.startsWith(installed.endsWith(path.sep) ? installed : installed + path.sep)) return true;
      }
    }
  }
  return false;
}

/*
  May the emulator be installed into this folder? Either it already carries a Goldberg configuration,
  or its executable proves which loader name and architecture it links against while Ubisoft Connect
  does not claim the folder as an installed product. The second branch is what lets a repack shipping
  no config at all be adopted; the repair itself stays explicit, confirmed and fully backed up.
*/
function canAdoptInstall({ gameDir, loaderPaths = [], exePath = '' } = {}) {
  if (!gameDir) return false;
  if (uplayR2.hasEmulatorEvidence(gameDir)) return true;
  if (isRegisteredUbisoftInstall(gameDir)) return false;
  return !!detectInstallFlavour({ gameDir, loaderPaths, exePath });
}

/*
  Which emulator generation this install needs: the one it already runs, else the one its executables
  import. A game only ever loads the generation it was linked against, so installing the other one
  would drop a DLL nothing opens - which is exactly how an R1 title ends up looking "repaired" while
  recording nothing. Returns '' when neither signal names a loader.
*/
function detectInstallFlavour({ gameDir, loaderPaths = [], exePath = '' } = {}) {
  const existing = (loaderPaths.length ? loaderPaths : uplayR2.detectEmulator(gameDir).dll).map((file) => loaderName(file)).filter(Boolean);
  if (existing.length > 0) return LOADER[existing[0]].flavour;
  const exes = executableCandidates(gameDir, exePath);
  // A named import is the strongest signal and stays first: an executable can carry the other
  // generation's basename as a leftover string while importing only the one it really loads.
  for (const exe of exes) {
    for (const name of importedLoaderNames(exe)) return LOADER[name].flavour;
  }
  for (const exe of exes.slice(0, MAX_SCANNED_EXECUTABLES)) {
    const flavour = flavourFromExecutableStrings(exe);
    if (flavour) return flavour;
  }
  return '';
}

/*
  The safe installation plan. A correctly suffixed existing loader provides architecture evidence;
  a missing, unreadable, or contradictory DLL requires an executable that explicitly imports one of
  the four names and whose PE machine agrees. The install itself must separately be proven emulated.
*/
function planInstall({ gameDir, dlls, loaderPaths = [], exePath = '', trustedInstall = false } = {}) {
  if (!gameDir || !fs.existsSync(gameDir)) throw new Error(`planInstall: game folder not found: ${gameDir}`);
  const cache = dlls || { files: {} };
  const targets = [];
  const issues = [];
  // Official Ubisoft games can import the exact same R2 basenames. Executable imports prove where
  // and which architecture a DLL must have, but do not prove that replacing Ubisoft's DLL with an
  // emulator is appropriate. Require Goldberg config/capability evidence or a persisted discovery
  // record tied to this install before planning any binary write.
  if (!trustedInstall && !uplayR2.hasEmulatorEvidence(gameDir)) {
    return {
      gameDir,
      targets,
      issues: [{ code: 'UNVERIFIED_UPLAY_R2_INSTALL' }],
      safe: false,
      architectures: [],
    };
  }
  const addTarget = ({ dir, name, exe = '', evidence }) => {
    const spec = LOADER[name];
    if (!spec) return;
    const destination = path.join(dir, name);
    const source = cache.files && cache.files[name];
    if (!source) {
      issues.push({ code: 'PACKAGE_MISSING_LOADER', name, arch: spec.arch, destination });
      return;
    }
    const sourceInfo = inspectPackageDll(source, name);
    if (!sourceInfo.valid) {
      issues.push({ code: sourceInfo.error || 'PACKAGE_INVALID_LOADER', name, arch: spec.arch, source });
      return;
    }
    const key = path.resolve(destination).toLowerCase();
    if (targets.some((target) => path.resolve(target.destination).toLowerCase() === key)) return;
    targets.push({ name, arch: spec.arch, family: spec.family, dir, destination, source, exe, evidence, changed: !sameFileBytes(source, destination) });
  };

  const existing = (loaderPaths.length ? loaderPaths : uplayR2.detectEmulator(gameDir).dll).filter((file) => loaderName(file));
  if (existing.length > 0) {
    let exes = null;
    for (const file of existing) {
      const name = loaderName(file);
      const expected = LOADER[name].arch;
      const currentArch = pe.exeArch(file);
      if (currentArch === expected) {
        addTarget({ dir: path.dirname(file), name, evidence: 'existing-loader-architecture' });
        continue;
      }

      // A corrupt, unreadable, or misleadingly suffixed existing DLL is not architecture evidence.
      // Repair it only when an executable beside that DLL imports the exact basename and its own PE
      // architecture agrees with the package alias. This is the same proof required for first install.
      exes = exes || executableCandidates(gameDir, exePath);
      const targetDir = path.resolve(path.dirname(file)).toLowerCase();
      const importers = exes.filter(
        (exe) => path.resolve(path.dirname(exe)).toLowerCase() === targetDir && importedLoaderNames(exe).includes(name)
      );
      const compatible = importers.find((exe) => pe.exeArch(exe) === expected);
      if (compatible) {
        addTarget({ dir: path.dirname(file), name, exe: compatible, evidence: 'pe-import-repair' });
      } else {
        issues.push({
          code: 'EXISTING_LOADER_ARCH_UNVERIFIED',
          file,
          name,
          loaderArch: currentArch,
          expectedArch: expected,
          importers,
        });
      }
    }
  } else {
    const exes = executableCandidates(gameDir, exePath);
    for (const exe of exes) {
      const arch = pe.exeArch(exe);
      for (const name of importedLoaderNames(exe)) {
        const expected = LOADER[name].arch;
        if (!arch) {
          issues.push({ code: 'EXE_ARCH_UNKNOWN', exe, name, arch: expected });
          continue;
        }
        if (arch !== expected) {
          issues.push({ code: 'EXE_IMPORT_ARCH_MISMATCH', exe, name, exeArch: arch, loaderArch: expected });
          continue;
        }
        addTarget({ dir: path.dirname(exe), name, exe, evidence: 'pe-import' });
      }
    }
    /*
      Nothing imported a loader by name, which does not mean the game has none: it may resolve one
      with LoadLibrary. The basename it will ask for is still in the executable, and the generation
      is settled separately, so place only that generation's alias and only when the executable's own
      architecture agrees - the same proof the import path requires.
    */
    if (targets.length === 0 && issues.length === 0) {
      const flavour = detectInstallFlavour({ gameDir, loaderPaths: [], exePath });
      if (flavour) {
        for (const exe of exes.slice(0, MAX_SCANNED_EXECUTABLES)) {
          const arch = pe.exeArch(exe);
          if (!arch) continue;
          for (const name of loaderNamesFromExecutableStrings(exe, flavour)) {
            if (LOADER[name].arch !== arch) continue;
            addTarget({ dir: path.dirname(exe), name, exe, evidence: 'pe-string' });
          }
          if (targets.length > 0) break;
        }
      }
    }
  }

  if (targets.length === 0 && issues.length === 0) issues.push({ code: 'NO_RUNTIME_TARGET' });
  const fatal = new Set([
    'PACKAGE_MISSING_LOADER',
    'PACKAGE_INVALID_LOADER',
    'NOT_PE',
    'ARCH_MISMATCH',
    'NOT_UPLAY_R2_LOADER',
    'EXISTING_LOADER_ARCH_UNVERIFIED',
    'UNVERIFIED_UPLAY_R2_INSTALL',
    'EXE_ARCH_UNKNOWN',
    'EXE_IMPORT_ARCH_MISMATCH',
  ]);
  return {
    gameDir,
    targets,
    issues,
    safe: targets.length > 0 && !issues.some((issue) => fatal.has(issue.code)),
    architectures: [...new Set(targets.map((target) => target.arch))],
  };
}

function installDlls({ plan, log = noopLog } = {}) {
  if (!plan || !plan.safe || !Array.isArray(plan.targets) || plan.targets.length === 0) {
    const codes = (plan && plan.issues ? plan.issues : []).map((issue) => issue.code).join(', ');
    throw new Error(`installDlls: no safe Uplay R2 installation plan${codes ? ` (${codes})` : ''}`);
  }
  const summary = { installed: 0, skipped: 0, perDir: [] };
  const perDir = new Map();
  for (const target of plan.targets) {
    const entry = perDir.get(target.dir) || { dir: target.dir, wrote: [], skipped: [] };
    perDir.set(target.dir, entry);
    fs.mkdirSync(target.dir, { recursive: true });
    if (sameFileBytes(target.source, target.destination)) {
      entry.skipped.push(target.name);
      summary.skipped++;
      continue;
    }
    const sourceInfo = inspectPackageDll(target.source, target.name);
    if (!sourceInfo.valid || sourceInfo.arch !== target.arch) {
      throw new Error(`${target.name}: refusing loader with architecture ${sourceInfo.arch || 'unknown'} (expected ${target.arch})`);
    }
    const temporary = path.join(target.dir, `.${target.name}.${process.pid}.${Date.now()}.tmp`);
    try {
      fs.copyFileSync(target.source, temporary);
      const copied = inspectPackageDll(temporary, target.name);
      if (!copied.valid || copied.arch !== target.arch) throw new Error(`${target.name}: copied loader failed architecture validation`);
      fs.renameSync(temporary, target.destination);
    } finally {
      try {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      } catch {
        /* ignore cleanup failure */
      }
    }
    entry.wrote.push(target.name);
    summary.installed++;
    log.log(`[uplayR2] installed ${target.name} (${target.arch}) into ${target.dir}`);
  }
  summary.perDir = [...perDir.values()];
  return summary;
}

/*
  Apply loader + schema/config as one reversible transaction. The snapshot records every changed
  destination before the first write. Any write or validation failure restores it immediately.
*/
function repairInstallation({
  gameDir,
  installPlan = null,
  loaderPaths = [],
  steamAppid,
  uplayId = '',
  name = '',
  mapping = null,
  schema,
  prefix,
  objectiveIds = null,
  accountName,
  language,
  logging,
  log = noopLog,
} = {}) {
  if (!gameDir || !fs.existsSync(gameDir)) throw new Error(`repairInstallation: game folder not found: ${gameDir}`);
  const installTargets = installPlan && Array.isArray(installPlan.targets) ? installPlan.targets : [];
  if (installTargets.length > 0 && !installPlan.safe) {
    const codes = (Array.isArray(installPlan.issues) ? installPlan.issues : []).map((issue) => issue.code).join(', ');
    throw new Error(`repairInstallation: unsafe loader plan${codes ? ` (${codes})` : ''}`);
  }
  const currentLoaders = loaderPaths.length ? loaderPaths : uplayR2.detectEmulator(gameDir).dll;
  const targetDirs = new Set();
  for (const loader of currentLoaders) targetDirs.add(path.dirname(loader));
  for (const target of installTargets) targetDirs.add(target.dir);
  if (targetDirs.size === 0) throw new Error('repairInstallation: no deterministic loader directory');

  const repairPlans = [];
  const touched = [];
  // Re-evaluate against disk immediately before the snapshot. A plan may have been prepared while
  // the game updater was still replacing files; stale `changed` flags must never produce an
  // unsnapshotted write or an unnecessary rewrite.
  for (const target of installTargets) {
    if (!sameFileBytes(target.source, target.destination)) touched.push(target.destination);
  }

  for (const dir of targetDirs) {
    const plannedSources = installTargets.filter((target) => path.resolve(target.dir).toLowerCase() === path.resolve(dir).toLowerCase()).map((target) => target.source);
    const currentInDir = currentLoaders.filter((loader) => path.resolve(path.dirname(loader)).toLowerCase() === path.resolve(dir).toLowerCase());
    // Only the generation being repaired counts: the other one's DLL is dead weight the game never
    // loads, and averaging it in would strip a redirect the active loader supports.
    const dirFlavour = uplayR2.resolveFlavour((plannedSources[0] || currentInDir[0]) || 'r2').id;
    const activeInDir = currentInDir.filter((loader) => (uplayR2.flavourForDll(loader) || { id: 'r2' }).id === dirFlavour);
    const caps = uplayR2.inspectInstalledLoaders(plannedSources.length ? plannedSources : activeInDir.length ? activeInDir : currentInDir);
    if (!caps.supportsAchievements) throw new Error(`repairInstallation: ${dir} has no compatible Uplay R2 achievement loader`);
    if (!caps.architectureValid) throw new Error(`repairInstallation: ${dir} has a loader whose architecture does not match its filename`);

    const schemaJson = uplayR2.buildAchievementsSchemaJson(schema, { keyed: caps.supportsAchKeyPrefix, prefix, objectiveIds });
    if (Object.keys(schemaJson).length === 0) throw new Error('repairInstallation: achievement schema is empty');
    const schemaFile = path.join(dir, uplayR2.ACH_SCHEMA_FILE);
    const schemaText = JSON.stringify(schemaJson, null, 2);
    let previousSchema = null;
    try {
      previousSchema = fs.readFileSync(schemaFile, 'utf8');
    } catch {
      /* missing schema is a planned write */
    }
    if (previousSchema !== schemaText) touched.push(schemaFile);

    const ini = uplayR2.planSettingsConfig({ dir, steamAppid, prefix, accountName, language, logging, capabilities: caps });
    for (const entry of ini.files) if (entry.changed) touched.push(entry.file);
    repairPlans.push({ dir, capabilities: caps, flavour: dirFlavour });
  }

  const snapshot = touched.length > 0 ? uplayR2.createSetupBackup({ gameDir, files: touched }) : null;
  try {
    const install = installTargets.length > 0 ? installDlls({ plan: installPlan, log }) : { installed: 0, skipped: 0, perDir: [] };
    const repairs = repairPlans.map(({ dir, capabilities }) =>
      uplayR2.repair({
        dir,
        gameDir,
        steamAppid,
        schema,
        prefix,
        objectiveIds,
        accountName,
        language,
        logging,
        capabilities,
        backup: false,
      })
    );

    const validation = [];
    for (const { dir } of repairPlans) {
      const runtimeLoaders = uplayR2.detectEmulator(dir).dll.filter(
        (loader) => path.resolve(path.dirname(loader)).toLowerCase() === path.resolve(dir).toLowerCase()
      );
      const report = uplayR2.diagnose({
        gameDir: dir,
        appid: uplayId ? `UPLAY${uplayId}` : steamAppid,
        name,
        loaderPaths: runtimeLoaders,
        mapping,
        flavour: repairPlans.find((entry) => entry.dir === dir)?.flavour,
      });
      const failures = report.issues.filter(
        (issue) => issue.level === 'error' || (issue.level === 'warning' && POST_REPAIR_WARNING_FAILURES.has(issue.code))
      );
      validation.push({ dir, ok: failures.length === 0, issues: report.issues });
      if (failures.length > 0) throw new Error(`Uplay R2 validation failed in ${dir}: ${failures.map((issue) => issue.code).join(', ')}`);
    }
    return {
      gameDir,
      changed: touched.length > 0,
      backupDir: snapshot && snapshot.backupDir,
      install,
      repairs,
      validation,
      runtimeDirs: [...targetDirs],
    };
  } catch (error) {
    if (snapshot) {
      try {
        const backup = { name: path.basename(snapshot.backupDir), dir: snapshot.backupDir, files: snapshot.files, manifest: snapshot.manifest };
        uplayR2.restoreConfigBackup({ dir: gameDir, backup });
        error.rolledBack = true;
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  }
}

module.exports = {
  LOADER,
  loaderNamesFromExecutableStrings,
  flavourFromExecutableStrings,
  scanFileForLiterals,
  isRegisteredUbisoftInstall,
  canAdoptInstall,
  detectInstallFlavour,
  PACKAGES,
  packageFor,
  loaderNamesFor,
  PACKAGE_MANIFEST,
  BUNDLED_LOADERS_DIR,
  BUNDLED_LOADER_SHA256,
  BUNDLED_RECOVERY_ARCHIVE,
  BUNDLED_RECOVERY_SHA256,
  inspectPackageDll,
  findPackageDlls,
  importPackage,
  quarantineError,
  ensureEmulatorDlls,
  ensureBundledEmulatorDlls,
  safeArchiveEntry,
  importedLoaderNames,
  planInstall,
  installDlls,
  repairInstallation,
  sameFileBytes,
};
