'use strict';

/*
  Persistence for util/collections.js: <userData>/cfg/collections.json plus the optional custom
  images under <userData>/cfg/collection-images/. Both live in cfg/ so anything that copies that
  folder takes the collections with it.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const collections = require('./collections.js');
const { replaceFileSync, unlinkForce } = require('./replaceFile.js');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIN_IMAGE_BYTES = 12;

// Decided from the first bytes, never from the extension the user's file happens to carry.
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < MIN_IMAGE_BYTES) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  const gif = buffer.toString('latin1', 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'gif';
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, text);
    replaceFileSync(temporary, file);
  } catch (err) {
    unlinkForce(temporary);
    throw err;
  }
}

function createCollectionStore(userDataPath) {
  const cfgDir = path.join(userDataPath, 'cfg');
  const stateFile = path.join(cfgDir, 'collections.json');
  const imageDir = path.join(cfgDir, 'collection-images');

  function read() {
    let text;
    try {
      text = fs.readFileSync(stateFile, 'utf8');
    } catch {
      return collections.emptyState();
    }
    try {
      return collections.normalizeState(JSON.parse(text));
    } catch {
      // Kept aside so the next save does not destroy a file the user might still want to repair.
      try {
        fs.copyFileSync(stateFile, `${stateFile}.corrupt`);
      } catch {
        /* the copy is a courtesy */
      }
      return collections.emptyState();
    }
  }

  function write(state) {
    const clean = collections.normalizeState(state);
    writeAtomic(stateFile, JSON.stringify(clean, null, 2) + '\n');
    return clean;
  }

  // Reads again before every change, so a file restored from a backup is never overwritten by a stale copy.
  function mutate(change) {
    return write(change(read()));
  }

  function imagePath(file) {
    return collections.IMAGE_FILE_PATTERN.test(String(file || '')) ? path.join(imageDir, file) : '';
  }

  function removeImageFile(file) {
    const target = imagePath(file);
    if (target) unlinkForce(target);
  }

  // Returns the stored file name; throws when the source is not a usable PNG, JPEG, GIF or WebP.
  function importImage(collectionId, sourcePath) {
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile() || stat.size < MIN_IMAGE_BYTES || stat.size > MAX_IMAGE_BYTES) throw new Error('image size not accepted');
    const data = fs.readFileSync(sourcePath);
    const type = detectImageType(data);
    if (!type) throw new Error('image type not accepted');
    const hash = crypto.createHash('sha1').update(data).digest('hex').slice(0, 12);
    const name = `${collectionId}-${hash}.${type}`;
    if (!collections.IMAGE_FILE_PATTERN.test(name)) throw new Error('collection id not accepted');
    writeAtomic(path.join(imageDir, name), data);
    return name;
  }

  function create(fields) {
    const result = { collection: null, error: null };
    const state = mutate((current) => {
      const made = collections.createCollection(current, { ...fields, id: crypto.randomUUID() });
      result.collection = made.collection;
      result.error = made.error;
      return made.state;
    });
    return { ...result, state };
  }

  function update(id, patch) {
    return mutate((current) => collections.updateCollection(current, id, patch));
  }

  function remove(id) {
    const before = collections.collectionById(read(), id);
    const state = mutate((current) => collections.removeCollection(current, id));
    if (before && before.image) removeImageFile(before.image);
    return state;
  }

  function setImage(id, sourcePath) {
    const previous = collections.collectionById(read(), id);
    if (!previous) throw new Error('unknown collection');
    const file = importImage(id, sourcePath);
    const state = update(id, { image: file });
    if (previous.image && previous.image !== file) removeImageFile(previous.image);
    return state;
  }

  function clearImage(id) {
    const previous = collections.collectionById(read(), id);
    const state = update(id, { image: '' });
    if (previous && previous.image) removeImageFile(previous.image);
    return state;
  }

  return {
    stateFile,
    imageDir,
    read,
    write,
    create,
    update,
    remove,
    setImage,
    clearImage,
    imagePath,
    addGames: (id, keys) => mutate((current) => collections.addGames(current, id, keys)),
    removeGames: (id, keys) => mutate((current) => collections.removeGames(current, id, keys)),
  };
}

module.exports = { createCollectionStore, detectImageType, MAX_IMAGE_BYTES };
