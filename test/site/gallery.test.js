'use strict';

// A submission is a file somebody else wrote, listed publicly and handed to everybody who clicks
// it. app/util/presetPackage.js validates the package itself (test/core/presetPackage.test.js);
// this covers the layer the gallery adds - file naming, the preview really being an image, and the
// listing matching what is on disk.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const { collect, imageInfo, serialize, LIMITS, NAME_RE } = require(path.join(root, 'tools', 'gallery', 'build.js'));

const COMMUNITY = path.join(root, 'docs', 'gallery', 'community');
const INDEX = path.join(root, 'docs', 'gallery', 'index.json');

function pngHeader(width, height) {
  const buffer = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function jpegHeader(width, height) {
  const buffer = Buffer.alloc(32);
  buffer.writeUInt16BE(0xffd8, 0); // start of image
  buffer.writeUInt16BE(0xffc0, 2); // baseline frame
  buffer.writeUInt16BE(11, 4); // segment length
  buffer[6] = 8; // sample precision
  buffer.writeUInt16BE(height, 7);
  buffer.writeUInt16BE(width, 9);
  return buffer;
}

function webpLosslessHeader(width, height) {
  const buffer = Buffer.alloc(32);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8L', 12, 'ascii');
  buffer[20] = 0x2f; // lossless signature
  buffer.writeUInt32LE(((height - 1) << 14) | (width - 1), 21);
  return buffer;
}

test('an image states its own size, whatever it is named', () => {
  assert.deepEqual(imageInfo(pngHeader(1188, 472)), { type: 'png', width: 1188, height: 472 });
  assert.deepEqual(imageInfo(jpegHeader(800, 600)), { type: 'jpeg', width: 800, height: 600 });
  assert.deepEqual(imageInfo(webpLosslessHeader(640, 320)), { type: 'webp', width: 640, height: 320 });

  assert.equal(imageInfo(Buffer.from('<html>not an image at all</html>')), null);
  assert.equal(imageInfo(Buffer.alloc(4)), null, 'a truncated file is not an image');
  assert.equal(imageInfo('preview.png'), null, 'only bytes are inspected');
});

test('a preset file is named so it can be a URL', () => {
  for (const name of ['blueprint', 'neon-2', 'a1']) assert.ok(NAME_RE.test(name), `${name} should be accepted`);
  for (const name of ['My Preset', '../escape', 'UPPER', 'a', '-leading', 'trailing-']) {
    assert.ok(!NAME_RE.test(name), `${name} must be refused`);
  }
});

test('the gallery folder holds only presets, pictures and their notes', () => {
  for (const entry of fs.readdirSync(COMMUNITY, { withFileTypes: true })) {
    assert.ok(entry.isFile(), `${entry.name} is a folder; the gallery is a flat list of files`);
    const extension = path.extname(entry.name).toLowerCase();
    assert.ok(
      ['.awpreset', '.png', '.webp', '.jpg', '.jpeg', '.json'].includes(extension),
      `${entry.name} is not part of the gallery format`
    );
  }
});

test('every submission in the repository validates and is under the gallery limits', () => {
  const { records, problems } = collect();
  assert.deepEqual(problems, []);
  assert.ok(records.length > 0, 'the gallery ships with at least the example presets');

  for (const record of records) {
    assert.ok(NAME_RE.test(record.slug));
    assert.ok(record.name, `${record.slug} installs under a name`);
    assert.ok(record.summary, `${record.slug} says what it is`);
    assert.match(record.file.sha256, /^[0-9a-f]{64}$/);
    assert.ok(record.file.bytes <= LIMITS.packageBytes);
    assert.ok(record.preview.width >= LIMITS.previewMin.width && record.preview.height >= LIMITS.previewMin.height);
    assert.ok(fs.existsSync(path.join(root, 'docs', 'gallery', record.file.path)));
    assert.ok(fs.existsSync(path.join(root, 'docs', 'gallery', record.preview.file)));
  }
});

test('a preset the app would refuse is never listed', () => {
  const stray = path.join(COMMUNITY, 'not-a-preset.awpreset');
  const picture = path.join(COMMUNITY, 'not-a-preset.png');
  fs.writeFileSync(stray, Buffer.from('this is not a zip'));
  fs.writeFileSync(picture, pngHeader(900, 400));

  try {
    const { problems } = collect();
    assert.ok(problems.some((problem) => problem.includes("the app's own reader")), problems.join('; '));
  } finally {
    fs.rmSync(stray, { force: true });
    fs.rmSync(picture, { force: true });
  }
});

test('a package with no picture beside it is reported rather than listed', () => {
  const source = fs.readdirSync(COMMUNITY).find((file) => file.endsWith('.awpreset'));
  const copy = path.join(COMMUNITY, 'lonely.awpreset');
  fs.copyFileSync(path.join(COMMUNITY, source), copy);

  try {
    const { problems, records } = collect();
    assert.ok(problems.some((problem) => problem.includes('lonely.png')), problems.join('; '));
    assert.ok(!records.some((record) => record.slug === 'lonely'));
  } finally {
    fs.rmSync(copy, { force: true });
  }
});

test('a picture that is not what its name claims is refused', () => {
  const source = fs.readdirSync(COMMUNITY).find((file) => file.endsWith('.awpreset'));
  const slug = path.basename(source, '.awpreset');
  const picture = path.join(COMMUNITY, `${slug}.png`);
  const original = fs.readFileSync(picture);

  try {
    fs.writeFileSync(picture, jpegHeader(900, 400));
    const jpeg = collect().problems;
    assert.ok(jpeg.some((problem) => problem.includes('really a jpeg')), jpeg.join('; '));

    fs.writeFileSync(picture, Buffer.from('<svg>not an image</svg>'));
    const svg = collect().problems;
    assert.ok(svg.some((problem) => problem.includes('not a PNG, WebP or JPEG')), svg.join('; '));

    fs.writeFileSync(picture, pngHeader(64, 24));
    const tiny = collect().problems;
    assert.ok(tiny.some((problem) => problem.includes('at least')), tiny.join('; '));
  } finally {
    fs.writeFileSync(picture, original);
  }
});

test('the optional notes file only carries the three fields it may carry', () => {
  const slug = path.basename(
    fs.readdirSync(COMMUNITY).find((file) => file.endsWith('.awpreset')),
    '.awpreset'
  );
  const notes = path.join(COMMUNITY, `${slug}.json`);

  try {
    fs.writeFileSync(notes, JSON.stringify({ by: 'Someone', summary: 'A line.', link: 'https://example.com/x' }));
    const good = collect();
    assert.deepEqual(good.problems, []);
    const record = good.records.find((entry) => entry.slug === slug);
    assert.equal(record.by, 'Someone', 'the notes file wins over the package');
    assert.equal(record.summary, 'A line.');

    fs.writeFileSync(notes, JSON.stringify({ by: 'Someone', license: 'MIT' }));
    assert.ok(collect().problems.some((problem) => problem.includes('"license" is not one of')));

    fs.writeFileSync(notes, JSON.stringify({ link: 'http://example.com' }));
    assert.ok(collect().problems.some((problem) => problem.includes('https address')));

    fs.writeFileSync(notes, '{ "by": ');
    assert.ok(collect().problems.some((problem) => problem.includes('not valid JSON')));
  } finally {
    fs.rmSync(notes, { force: true });
  }
});

const { STATES, STATE_NAMES, stateOutput } = require(path.join(root, 'tools', 'gallery', 'render-preview.js'));

// A package copied under another name, with the pictures a test wants beside it. Everything it
// wrote is removed afterwards, whatever the assertions did.
function withStagedPreset(pictures, run) {
  const source = fs.readdirSync(COMMUNITY).find((file) => file.endsWith('.awpreset'));
  const written = [path.join(COMMUNITY, 'staged.awpreset')];
  fs.copyFileSync(path.join(COMMUNITY, source), written[0]);
  for (const [file, content] of Object.entries(pictures)) {
    written.push(path.join(COMMUNITY, file));
    fs.writeFileSync(written.at(-1), content);
  }
  try {
    return run();
  } finally {
    for (const file of written) fs.rmSync(file, { force: true });
  }
}

test('the pictures of the other states are listed beside the normal one, normal first', () => {
  const { records, problems } = collect();
  assert.deepEqual(problems, []);

  const withStates = records.filter((record) => record.previews);
  assert.ok(withStates.length > 0, 'the example presets ship a picture for every state');

  for (const record of withStates) {
    assert.deepEqual(Object.keys(record.previews), STATE_NAMES.filter((state) => record.previews[state]), 'states keep their paging order');
    assert.deepEqual(record.previews.normal, record.preview, 'preview stays the normal picture, for older readers');
    for (const picture of Object.values(record.previews)) {
      const file = path.join(root, 'docs', 'gallery', picture.file);
      assert.ok(fs.existsSync(file), `${picture.file} is listed but missing`);
      assert.ok(fs.statSync(file).size <= LIMITS.previewBytes, `${picture.file} is over the picture limit`);
    }
  }

  // Nothing on disk is left out of the listing.
  for (const file of fs.readdirSync(COMMUNITY)) {
    const found = /^([a-z0-9-]+)\.(bronze|silver|gold|platinum|progress)\.png$/.exec(file);
    if (!found) continue;
    const record = records.find((entry) => entry.slug === found[1]);
    assert.equal(record.previews[found[2]].file, `community/${file}`);
  }
});

test('a preset with one picture is listed exactly as before', () => {
  withStagedPreset({ 'staged.png': pngHeader(900, 400) }, () => {
    const record = collect().records.find((entry) => entry.slug === 'staged');
    assert.deepEqual(record.preview, { file: 'community/staged.png', width: 900, height: 400 });
    assert.ok(!('previews' in record), 'no previews key when there is nothing to page through');
  });
});

test('a state picture is picked up with its own size and kept after the normal one', () => {
  withStagedPreset({ 'staged.png': pngHeader(900, 400), 'staged.progress.png': pngHeader(900, 420), 'staged.gold.png': pngHeader(900, 400) }, () => {
    const { records, problems } = collect();
    assert.ok(!problems.some((problem) => problem.includes('staged.')), problems.join('; '));
    const record = records.find((entry) => entry.slug === 'staged');
    assert.deepEqual(Object.keys(record.previews), ['normal', 'gold', 'progress']);
    assert.deepEqual(record.previews.progress, { file: 'community/staged.progress.png', width: 900, height: 420 });
    assert.deepEqual(record.preview, { file: 'community/staged.png', width: 900, height: 400 });
  });
});

test('a state picture gets the checks the normal picture gets', () => {
  const oversized = Buffer.concat([pngHeader(900, 400), Buffer.alloc(LIMITS.previewBytes)]);
  const cases = [
    ['staged.silver.png', jpegHeader(900, 400), 'really a jpeg'],
    ['staged.silver.png', Buffer.from('<svg>not an image</svg>'), 'not a PNG, WebP or JPEG'],
    ['staged.silver.png', pngHeader(64, 24), 'at least'],
    ['staged.silver.png', pngHeader(4000, 400), 'the limit is'],
    ['staged.silver.png', oversized, 'KB; the limit is'],
  ];
  for (const [file, content, expected] of cases) {
    withStagedPreset({ 'staged.png': pngHeader(900, 400), [file]: content }, () => {
      const problems = collect().problems.filter((problem) => problem.startsWith(file));
      assert.ok(problems.some((problem) => problem.includes(expected)), `${expected}: ${problems.join('; ')}`);
    });
  }
});

test('a picture named after a state nobody knows, or a preset nobody has, is refused', () => {
  withStagedPreset({ 'staged.png': pngHeader(900, 400), 'staged.rare.png': pngHeader(900, 400), 'staged.normal.png': pngHeader(900, 400) }, () => {
    const problems = collect().problems;
    assert.ok(problems.some((problem) => problem.includes('staged.rare.png: "rare" is not a state')), problems.join('; '));
    assert.ok(problems.some((problem) => problem.includes('staged.normal.png: "normal" is not a state')), problems.join('; '));
  });

  const orphan = path.join(COMMUNITY, 'orphan.gold.png');
  fs.writeFileSync(orphan, pngHeader(900, 400));
  try {
    assert.ok(collect().problems.some((problem) => problem.includes('orphan.gold.png has no orphan.awpreset')));
  } finally {
    fs.rmSync(orphan, { force: true });
  }
});

test('the render tool names its states and its files the way the listing reads them', () => {
  assert.deepEqual(STATE_NAMES, ['normal', 'bronze', 'silver', 'gold', 'platinum', 'progress']);
  for (const state of STATE_NAMES) assert.ok(STATES[state], `${state} has no stand-in payload`);
  assert.equal(STATES.rare, STATES.gold, 'rare is the older name of gold');

  assert.equal(stateOutput('/x/blueprint.png', 'normal'), '/x/blueprint.png');
  assert.equal(path.basename(stateOutput(path.join('x', 'blueprint.png'), 'gold')), 'blueprint.gold.png');
  assert.equal(path.basename(stateOutput(path.join('x', 'a.b.webp'), 'progress')), 'a.b.progress.webp');
});

// The older engine reads only the rate (gold under 3, silver 3 to 6, bronze 6 to 10), the newer one
// the tier, falling back on the rate. A stand-in that satisfies both draws one tier on every preset.
test('the rare stand-ins carry a tier and a rate that every engine reads the same way', () => {
  const band = { gold: [0, 3], silver: [3, 6], bronze: [6, 10] };
  for (const [tier, [from, to]] of Object.entries(band)) {
    assert.equal(STATES[tier].rarityTier, tier);
    assert.ok(STATES[tier].rarityPercent >= from && STATES[tier].rarityPercent < to, `${tier} rate ${STATES[tier].rarityPercent}`);
  }
  for (const state of ['normal', 'platinum', 'progress']) assert.ok(!STATES[state].rarityTier, `${state} is not a rare tier`);
});

test('the committed listing is what the folder produces', () => {
  const { records, problems } = collect();
  assert.deepEqual(problems, []);
  assert.equal(fs.readFileSync(INDEX, 'utf8'), serialize(records), 'run: node tools/gallery/build.js');
});
