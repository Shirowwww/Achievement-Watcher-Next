'use strict';

/*
  The OBS browser source (issue #59): OBS cannot capture the notification popup as a window, so the
  Watchdog serves the user's own preset as a page instead. What is asserted here is the contract a
  browser source depends on - the page is the real preset with the bridge in front of it, its files
  resolve relative to it, and the two routes that reach the disk hand out nothing that was not
  announced on the notification feed first.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const obsSource = require('../notification/obsSource.js');
const presetLocator = require('../util/presetLocator.js');

const BUNDLED_PRESETS = path.join(__dirname, '..', '..', 'app', 'presets', 'Default Presets');

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-obs-'));
  const presets = path.join(dir, 'presets');
  const sample = path.join(presets, 'Sample');
  fs.mkdirSync(sample, { recursive: true });
  fs.writeFileSync(
    path.join(sample, 'index.html'),
    [
      '<!DOCTYPE html>',
      '<html lang="en"><head>',
      '<link rel="stylesheet" href="style.css" />',
      '<meta name="duration" content="4200" />',
      '<meta width="500" height="150" />',
      '</head><body><div class="ach"></div></body></html>',
    ].join('\n')
  );
  fs.writeFileSync(path.join(sample, 'style.css'), '.ach { color: red; }');
  const secret = path.join(dir, 'secret.txt');
  fs.writeFileSync(secret, 'not for the stream');
  const artwork = path.join(dir, 'cover.png');
  fs.writeFileSync(artwork, Buffer.from('89504e470d0a1a0a', 'hex'));
  const optionsFile = path.join(dir, 'options.ini');
  fs.writeFileSync(optionsFile, '[achievement]\nlang = english\n[overlay]\nnotificationPreset = Sample\nnotificationScale = 1.5\n');
  return { dir, presets, sample, secret, artwork, optionsFile };
}

async function serve(handlerOptions) {
  const handle = obsSource.createHandler(handlerOptions);
  const server = http.createServer((req, res) => {
    if (handle(req, res)) return;
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('outside');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    request(target, options = {}) {
      return new Promise((resolve, reject) => {
        const req = http.request(`${base}${target}`, { method: options.method || 'GET', headers: options.headers || {} }, (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.on('error', reject);
        req.end();
      });
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('the page is the selected preset with the bridge in front of its own script', async (t) => {
  const workspace = makeWorkspace();
  presetLocator.invalidate();
  obsSource._resetSettingsCache();
  const server = await serve({ presetRoots: [workspace.presets], optionsFile: workspace.optionsFile });
  t.after(() => server.close());

  const redirect = await server.request('/obs');
  assert.equal(redirect.status, 302, 'a preset loads style.css relative to its own folder, so the page needs a directory URL');
  assert.equal(redirect.headers.location, '/obs/');

  const page = await server.request('/obs/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  const html = page.body.toString();
  assert.ok(html.includes('<div class="ach"></div>'), 'the preset markup is served, not a rewritten copy of it');
  assert.ok(html.includes('OBS browser source bridge'));
  assert.ok(html.indexOf('aw-obs-idle-style') > html.indexOf('<head'), 'the bridge belongs inside <head>');
  assert.ok(html.indexOf('aw-obs-idle-style') < html.indexOf('<div class="ach">'), 'window.api must exist before the preset asks for a payload');
  // The user's own settings drive the page, exactly as they drive the in-game popup.
  assert.ok(html.includes('"scale":1.5'));
  assert.ok(html.includes('"presetDurationMs":4200'));
});

test('preset files resolve beside the page, and nothing above the preset folder does', async (t) => {
  const workspace = makeWorkspace();
  presetLocator.invalidate();
  obsSource._resetSettingsCache();
  const server = await serve({ presetRoots: [workspace.presets], optionsFile: workspace.optionsFile });
  t.after(() => server.close());

  const css = await server.request('/obs/style.css');
  assert.equal(css.status, 200);
  assert.match(css.headers['content-type'], /text\/css/);
  assert.match(css.headers['cache-control'], /max-age/, 'a stylesheet that never changes must not be re-read on every reload');

  for (const escape of ['/obs/..%2fsecret.txt', '/obs/sub%2f..%2f..%2fsecret.txt', '/obs/..%5csecret.txt']) {
    const denied = await server.request(escape);
    assert.equal(denied.status, 403, `${escape} must not reach outside the preset folder`);
  }
});

/*
  The client normalizes some of these away before they are ever sent (`%2e%2e` becomes `..`, which
  leaves /obs entirely), so the parser is also checked directly - it is what stands between a
  handcrafted request and the disk.
*/
test('a path that could climb out of the preset folder is refused before it is resolved', () => {
  assert.deepEqual(obsSource.safeSegments('/style.css'), ['style.css']);
  assert.deepEqual(obsSource.safeSegments('/fonts/Inter.woff2'), ['fonts', 'Inter.woff2']);
  assert.deepEqual(obsSource.safeSegments('/a%20b.png'), ['a b.png']);
  for (const hostile of ['/../secret.txt', '/%2e%2e/secret.txt', '/sub/../../secret.txt', '/%2e/x', '/a%5cb', '/%ff%fe']) {
    assert.equal(obsSource.safeSegments(hostile), null, `${hostile} must not be turned into a path`);
  }
  const folder = path.join(os.tmpdir(), 'aw-obs-preset');
  assert.equal(obsSource.resolveWithin(folder, ['style.css']), path.join(folder, 'style.css'));
  assert.equal(obsSource.resolveWithin(folder, ['..', 'secret.txt']), '');
});

test('a preset can be pinned in the URL, so a stream can look different from the desktop', async (t) => {
  presetLocator.invalidate();
  obsSource._resetSettingsCache();
  const server = await serve({ presetRoots: [BUNDLED_PRESETS] });
  t.after(() => server.close());

  const redirect = await server.request('/obs/preset/Xbox');
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.location, '/obs/preset/Xbox/');

  const page = await server.request('/obs/preset/Xbox/');
  assert.equal(page.status, 200);
  assert.ok(page.body.toString().includes('OBS browser source bridge'));

  const css = await server.request('/obs/preset/Xbox/style.css');
  assert.equal(css.status, 200);
  assert.ok(css.body.length > 0);

  // An unknown name falls back to the default preset rather than 404ing a live stream off the air.
  const unknown = await server.request('/obs/preset/Does%20Not%20Exist/');
  assert.equal(unknown.status, 200);
});

test('local artwork is served only after a notification announced it', async (t) => {
  const workspace = makeWorkspace();
  presetLocator.invalidate();
  obsSource._resetSettingsCache();
  obsSource._resetArtwork();
  const server = await serve({ presetRoots: [workspace.presets], optionsFile: workspace.optionsFile });
  t.after(() => server.close());

  const before = await server.request(`/obs/_art?p=${encodeURIComponent(workspace.artwork)}`);
  assert.equal(before.status, 403, 'a query string is not a licence to read the disk');

  obsSource.rememberArtwork({ icon: workspace.artwork });
  const after = await server.request(`/obs/_art?p=${encodeURIComponent(workspace.artwork)}`);
  assert.equal(after.status, 200);
  assert.equal(after.headers['content-type'], 'image/png');

  // Announced or not, only pictures: the route exists to paint a card, not to hand out files.
  obsSource.rememberArtwork({ icon: workspace.secret });
  const secret = await server.request(`/obs/_art?p=${encodeURIComponent(workspace.secret)}`);
  assert.equal(secret.status, 403);
});

test('artwork is remembered by real path, from either shape the feed carries', () => {
  obsSource._resetArtwork();
  obsSource.rememberArtwork({ icon: 'https://cdn.example/icon.png' });
  assert.equal(obsSource.isAllowedArtwork('https://cdn.example/icon.png'), false, 'a remote URL is fetched by the browser, not by us');

  const file = path.join(os.tmpdir(), 'aw-obs-art', 'cover.png');
  obsSource.rememberArtwork({ image: `file:///${file.replace(/\\/g, '/')}` });
  assert.equal(obsSource.isAllowedArtwork(file), true, 'a file:// URL and a plain path name the same picture');

  // Bounded, so a long session cannot grow the list without end.
  for (let i = 0; i < 200; i += 1) obsSource.rememberArtwork({ icon: path.join(os.tmpdir(), `aw-obs-${i}.png`) });
  assert.equal(obsSource.isAllowedArtwork(path.join(os.tmpdir(), 'aw-obs-0.png')), false);
  assert.equal(obsSource.isAllowedArtwork(path.join(os.tmpdir(), 'aw-obs-199.png')), true);
});

test('/obs/_config reports what the source should be sized to', async (t) => {
  const workspace = makeWorkspace();
  presetLocator.invalidate();
  obsSource._resetSettingsCache();
  const server = await serve({ presetRoots: [workspace.presets], optionsFile: workspace.optionsFile });
  t.after(() => server.close());

  // The designer's live-preview scratch folder is a preset folder on disk; it is not a preset the
  // user chose, and every list the app offers already leaves it out.
  fs.mkdirSync(path.join(workspace.presets, '__aw-preview__'), { recursive: true });
  fs.writeFileSync(path.join(workspace.presets, '__aw-preview__', 'index.html'), '<html><head></head><body></body></html>');
  presetLocator.invalidate();

  const config = await server.request('/obs/_config');
  assert.equal(config.status, 200);
  const body = JSON.parse(config.body.toString());
  assert.equal(body.preset, 'Sample');
  // The page fits the card to the source, so the size offered is a sharp default rather than a
  // requirement: twice the preset's own box. The Settings scale is reported but no longer applied.
  assert.equal(body.designWidth, 500);
  assert.equal(body.designHeight, 150);
  assert.equal(body.scale, 1.5);
  assert.equal(body.width, 1000);
  assert.equal(body.height, 300);
  assert.deepEqual(body.presets, ['Sample']);
});

test('the browser source is as reachable as the feed it renders, and no more', async (t) => {
  presetLocator.invalidate();
  obsSource._resetSettingsCache();
  const server = await serve({ presetRoots: [BUNDLED_PRESETS], auth: 'stream:secret' });
  t.after(() => server.close());

  const anonymous = await server.request('/obs/');
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers['www-authenticate'], /^Basic/);

  const authorized = await server.request('/obs/', {
    headers: { authorization: `Basic ${Buffer.from('stream:secret').toString('base64')}` },
  });
  assert.equal(authorized.status, 200);

  const posted = await server.request('/obs/', {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from('stream:secret').toString('base64')}` },
  });
  assert.equal(posted.status, 405, 'a browser source only reads');

  const elsewhere = await server.request('/');
  assert.equal(elsewhere.body.toString(), 'outside', 'anything that is not /obs stays the caller of the handler');
});

test('the bridge is inserted into markup it did not write', () => {
  assert.match(obsSource.injectBridge('<html><head><title>x</title></head><body></body></html>', 'BRIDGE'), /<head>\nBRIDGE/);
  assert.match(obsSource.injectBridge('<html><body></body></html>', 'BRIDGE'), /<html>\nBRIDGE/);
  assert.match(obsSource.injectBridge('<div class="ach"></div>', 'BRIDGE'), /^BRIDGE\n/);
});
