'use strict';

/*
  A theme submission is a file somebody else wrote, listed publicly and handed to everybody who
  clicks it. app/util/themePackage.js validates the package itself (test/core/themePackage.test.js);
  this covers the layer the gallery adds - file naming, the picture's size, and the listing matching disk.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const { collect, serialize, LIMITS } = require(path.join(root, 'tools', 'gallery', 'build-themes.js'));
const { readThemePackage, exportTheme } = require(path.join(root, 'app', 'util', 'themePackage.js'));
const { defaultCustomTheme } = require(path.join(root, 'app', 'util', 'themeLayers.js'));
const appVersion = require(path.join(root, 'app', 'package.json')).version;

const COMMUNITY = path.join(root, 'docs', 'gallery', 'themes', 'community');
const INDEX = path.join(root, 'docs', 'gallery', 'themes', 'index.json');

test('the theme folder holds only themes, pictures and their notes', () => {
  for (const entry of fs.readdirSync(COMMUNITY, { withFileTypes: true })) {
    assert.ok(entry.isFile(), `${entry.name} is a folder; the gallery is a flat list of files`);
    const extension = path.extname(entry.name).toLowerCase();
    assert.ok(['.awtheme', '.jpg', '.jpeg', '.webp', '.png', '.json'].includes(extension), `${entry.name} is not part of the gallery format`);
  }
});

test('every theme in the repository validates and is under the gallery limits', () => {
  const { records, problems } = collect();
  assert.deepEqual(problems, []);
  assert.ok(records.length > 0, 'the gallery ships with at least the example themes');

  for (const record of records) {
    assert.ok(record.file.bytes <= LIMITS.packageBytes, `${record.slug} is over the package limit`);
    assert.ok(record.preview.width >= LIMITS.previewMin.width, `${record.slug}: the picture is too small`);
    assert.ok(record.preview.height >= LIMITS.previewMin.height);
    assert.ok(record.preview.width <= LIMITS.previewMax.width);
    assert.ok(record.preview.height <= LIMITS.previewMax.height);
    assert.match(record.file.sha256, /^[0-9a-f]{64}$/);
  }
});

test('the committed listing is what the folder produces', () => {
  const { records } = collect();
  assert.equal(fs.readFileSync(INDEX, 'utf8'), serialize(records), 'run: node tools/gallery/build-themes.js');
});

/*
  What a card shows about a theme comes out of the package, not out of anything a sender typed.
  A palette that disagreed with the file would be the one thing a picture cannot correct for.
*/
test('the facts on a card are read out of the package', () => {
  for (const record of collect().records) {
    const read = readThemePackage(path.join(COMMUNITY, `${record.slug}.awtheme`), { appVersion });
    assert.equal(read.ok, true, `${record.slug}: ${read.error}`);
    assert.equal(record.name, read.manifest.name);
    assert.equal(record.version, read.manifest.version);
    assert.deepEqual(record.tags, read.manifest.tags);
    assert.equal(record.images, read.manifest.assets.length);
    assert.equal(record.accent, read.theme.accent.color);
    assert.deepEqual(record.swatches, ['bg', 'header', 'panel', 'card', 'accent'].map((id) => read.theme[id].color));
  }
});

test('a theme the app would refuse is never listed', (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-theme-gallery-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

  // The gallery builder never has its own opinion about a package: it asks the app's reader.
  const broken = path.join(scratch, 'broken.awtheme');
  fs.writeFileSync(broken, 'not a zip at all');
  assert.equal(readThemePackage(broken, { appVersion }).ok, false);

  // And a valid one it writes itself reads back, so the two agree.
  const good = path.join(scratch, 'good.awtheme');
  const out = exportTheme({ theme: defaultCustomTheme(), name: 'Round Trip', destination: good, appVersion });
  assert.equal(out.ok, true, out.error);
  assert.equal(readThemePackage(good, { appVersion }).ok, true);
});

test('the listing carries no address from the machine that built it', () => {
  const listing = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  assert.equal(listing.format, 2);
  assert.equal(listing.count, listing.themes.length);
  for (const theme of listing.themes) {
    assert.match(theme.file.path, /^community\//, 'a committed listing addresses files beside it');
    assert.match(theme.preview.file, /^community\//);
    assert.ok(!/[A-Za-z]:[\\/]/.test(JSON.stringify(theme)), `${theme.slug} carries a path from a machine`);
  }
});
