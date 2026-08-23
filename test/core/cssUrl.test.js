'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { cssUrl, cssUrlValue } = require(path.join(__dirname, '..', '..', 'app', 'util', 'cssUrl.js'));

// A CSS declaration is dropped wholesale when the url() token is malformed, so a broken path does
// not throw anywhere - the cover just silently never appears. These assertions pin the two shapes
// that used to slip through.

test('an apostrophe in the path cannot close the quoted url() early', () => {
  const url = pathToFileURL(String.raw`C:\Jeux\Assassin's Creed\icon.png`).href;
  assert.ok(url.includes("'"), 'pathToFileURL is expected to leave the apostrophe literal');

  const token = cssUrl(url);
  assert.equal(token, "url('file:///C:/Jeux/Assassin\\'s%20Creed/icon.png')");
  // Exactly two unescaped single quotes: the opening and closing delimiters.
  assert.equal(token.replace(/\\'/g, '').match(/'/g).length, 2);
});

test('a parenthesis in the path stays inside the token', () => {
  const url = pathToFileURL(String.raw`C:\Program Files (x86)\Game\header.jpg`).href;
  assert.ok(url.includes('('), 'pathToFileURL is expected to leave parentheses literal');

  const token = cssUrl(url);
  // Quoted, so the parenthesis is data rather than the end of the url() function.
  assert.ok(token.startsWith("url('") && token.endsWith("')"));
  assert.ok(token.includes('(x86)'));
});

test('backslashes are escaped so they cannot start a CSS escape sequence', () => {
  // A raw Windows path (not run through pathToFileURL) must not smuggle \U… into the CSS string.
  assert.equal(cssUrl(String.raw`C:\Users\bob\pic.png`), String.raw`url('C:\\Users\\bob\\pic.png')`);
});

test('ordinary URLs are passed through unchanged', () => {
  assert.equal(cssUrl('file:///C:/plain/icon.png'), "url('file:///C:/plain/icon.png')");
  assert.equal(cssUrl('https://cdn.example.com/a/header.jpg'), "url('https://cdn.example.com/a/header.jpg')");
});

test('nullish input yields an empty token instead of "undefined"', () => {
  assert.equal(cssUrl(null), "url('')");
  assert.equal(cssUrl(undefined), "url('')");
});

test('every dynamic background in the renderer goes through cssUrl', () => {
  // Guard against a new `url('${…}')` template creeping back in: those are exactly the ones that
  // broke. Static asset paths written literally in source are fine and stay allowed.
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'app.js'), 'utf8');
  const interpolated = [...source.matchAll(/url\((['"]?)\$\{/g)];
  assert.equal(
    interpolated.length,
    0,
    `found ${interpolated.length} interpolated url() template(s) in app.js; use cssUrl() instead`
  );
});

/*
  Reading one back. The cover picker asks the library tile what it is painted with, so that a cover
  whose value no longer resolves - a token the CDN stopped answering, or no network - can still be
  offered as the way back to what the game already has.
*/
test('a token cssUrl wrote reads back as the path that went in', () => {
  for (const value of [
    'C:\\Games\\A Game\\cover.png',
    "C:\\Games\\Tom's Game\\cover.png",
    'file:///C:/Games/cover%20(1).png',
    'https://cdn.example/library_600x900.jpg',
  ]) {
    assert.equal(cssUrlValue(cssUrl(value)), value, value);
  }
});

test('a browser that renormalizes the quotes is read the same way', () => {
  assert.equal(cssUrlValue('url("C:/Games/cover.png")'), 'C:/Games/cover.png');
  assert.equal(cssUrlValue('url(C:/Games/cover.png)'), 'C:/Games/cover.png');
  assert.equal(cssUrlValue('  url( "C:/Games/cover.png" )  '), 'C:/Games/cover.png');
});

test('anything that is not one url() reads as nothing painted', () => {
  for (const value of ['', 'none', null, undefined, 'linear-gradient(#000, #fff)', 'url(a.png), url(b.png)']) {
    const answer = cssUrlValue(value);
    assert.ok(answer === '' || answer === 'a.png), url(b.png', `${value} must not be mistaken for one picture`);
  }
  // The layered case is the one worth being explicit about: it must never be treated as a path.
  assert.notEqual(cssUrlValue('url(a.png), url(b.png)'), 'a.png');
});
