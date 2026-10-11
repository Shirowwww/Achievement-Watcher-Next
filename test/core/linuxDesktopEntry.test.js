'use strict';

// The Linux application entry: menu, notification identity and the achievement-watcher:// handler.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const desktopEntry = require('../../app/util/linuxDesktopEntry.js');

test('the entry hands the link to AW and declares the scheme', () => {
  const text = desktopEntry.applicationEntry({ command: '"/opt/AW Next.AppImage"', protocol: 'achievement-watcher' });
  assert.match(text, /^Exec="\/opt\/AW Next\.AppImage" %u$/m);
  assert.match(text, /^MimeType=x-scheme-handler\/achievement-watcher;$/m);
  assert.match(text, /^Icon=achievement-watcher-next$/m);
});

test('installing writes the entry and the icon once, then routes the scheme with xdg-mime', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-desktop-'));
  const calls = [];
  const exec = async (command, args) => {
    calls.push([command, ...args]);
    return { ok: true, output: '' };
  };
  const icon = path.join(home, 'icon.png');
  fs.writeFileSync(icon, 'png');
  const ctx = { env: { APPIMAGE: '/opt/aw.AppImage' }, home };
  try {
    const first = await desktopEntry.install({ protocol: 'achievement-watcher', iconSource: icon, ctx, exec });
    assert.equal(first.changed, true);
    assert.equal(first.handler, true);
    assert.match(fs.readFileSync(desktopEntry.applicationFile(ctx), 'utf8'), /^Exec=\/opt\/aw\.AppImage %u$/m);
    assert.equal(fs.readFileSync(desktopEntry.iconFile(ctx), 'utf8'), 'png');
    assert.deepEqual(calls.at(-1), ['xdg-mime', 'default', desktopEntry.DESKTOP_FILE, 'x-scheme-handler/achievement-watcher']);

    calls.length = 0;
    const second = await desktopEntry.install({ protocol: 'achievement-watcher', iconSource: icon, ctx, exec });
    assert.equal(second.changed, false);
    assert.deepEqual(
      calls.map((c) => c[0]),
      ['xdg-mime']
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
