'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const settings = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'settings.js'), 'utf8');

// The connect button and the status line of each account card depend on the account state, so
// only refresh() painted them. A language picked in the first-run guide then left them in the
// language Settings was built in (a Japanese card reading "Connecter le compte Xbox").
for (const card of ['Epic', 'Steam', 'Xbox', 'RetroAchievements']) {
  test(`the ${card} account card repaints its state labels on a language change`, () => {
    const start = settings.indexOf(`registerLocaleRefresh(function apply${card}Labels()`);
    assert.ok(start > 0, `apply${card}Labels must exist`);
    const refreshAt = settings.indexOf('async function refresh()', start);
    const apply = settings.slice(start, refreshAt);
    assert.match(apply, /if \(lastStatus\) repaintAccountState\(status, \(\) => paintStatus\(lastStatus\)\);/);

    const paintAt = settings.indexOf('function paintStatus(s)', refreshAt);
    const refresh = settings.slice(refreshAt, paintAt);
    assert.ok(paintAt > refreshAt, `the ${card} card paints through paintStatus`);
    assert.match(refresh, /lastStatus = s;\s*paintStatus\(s\);\s*status\.data\('stateText', status\.text\(\)\);/);

    const declared = settings.lastIndexOf('let lastStatus = null;', start);
    const cardStart = settings.lastIndexOf('(function ', start);
    assert.ok(declared > cardStart, `lastStatus is declared inside the ${card} card, before its refresher runs`);
  });
}

// The locale reloads on every library refresh, and an import ends with one: repainting the state
// there wiped the "Import complete" summary the user had not read yet.
function loadRepaint() {
  const source = settings.match(/function repaintAccountState\(status, paint\) \{[\s\S]*?\n\}/)[0];
  const context = {};
  vm.runInNewContext(`${source}\nthis.repaintAccountState = repaintAccountState;`, context);
  return context.repaintAccountState;
}

function fakeStatus(text, cls) {
  const data = {};
  return {
    _text: text,
    _cls: cls,
    text(value) {
      if (value === undefined) return this._text;
      this._text = value;
      return this;
    },
    attr(name, value) {
      if (value === undefined) return this._cls;
      this._cls = value;
      return this;
    },
    data(key, value) {
      if (value === undefined) return data[key];
      data[key] = value;
      return this;
    },
  };
}

test('a language repaint keeps a result message on the status line', () => {
  const repaintAccountState = loadRepaint();
  const status = fakeStatus('Connected as Shirow', 'success');
  status.data('stateText', 'Connected as Shirow');
  status.text('Import complete: 3 added');
  repaintAccountState(status, () => status.text('Connecté en tant que Shirow'));
  assert.equal(status.text(), 'Import complete: 3 added');
  assert.equal(status.attr('class'), 'success');
});

test('a language repaint translates a status line that still shows the state', () => {
  const repaintAccountState = loadRepaint();
  const status = fakeStatus('Not connected', '');
  status.data('stateText', 'Not connected');
  repaintAccountState(status, () => status.text('Non connecté'));
  assert.equal(status.text(), 'Non connecté');
  assert.equal(status.data('stateText'), 'Non connecté');
});
