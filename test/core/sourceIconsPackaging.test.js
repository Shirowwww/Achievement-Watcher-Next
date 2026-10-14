'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');

// The build copies the platform icons to resources/<folder>/Source and the app copies them from
// there into the profile. Linux paths are case-sensitive, so a folder spelled differently on either
// side leaves every Steam, PlayStation or Xbox badge as a broken image in the AppImage.
test('the app reads the packaged source icons from the folder the build writes them to', () => {
  const builder = fs.readFileSync(path.join(appDir, 'electron-builder.yml'), 'utf8');
  const packaged = /to:\s*resources\/([^/\s]+)\/Source\s*$/m.exec(builder);
  assert.ok(packaged, 'electron-builder.yml ships ./Source under resources/<folder>/Source');

  const init = fs.readFileSync(path.join(appDir, 'electron', 'init.js'), 'utf8');
  const read = /path\.join\(process\.resourcesPath, '([^']+)'\)/.exec(init);
  assert.ok(read, 'init.js resolves the packaged resources folder');
  assert.equal(read[1], packaged[1]);
});
