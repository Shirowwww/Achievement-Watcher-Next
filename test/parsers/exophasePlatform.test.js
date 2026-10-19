'use strict';

// A -psn trophy page on Exophase can be the PS4 or the PS5 list of a game. The titles below are
// the ones Exophase served for those pages (October 2026).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const exophase = require('../../app/parser/exophase.js');

const page = (title) => `<html><head><title>${title}</title></head><body></body></html>`;

test('a PS4 game does not take the PS5 list filed under -psn, and the reverse', () => {
  const hades = page('Hades Trophies - PS5 - Exophase.com');
  const ghost = page('Ghost of Tsushima Trophies - PS4 - Exophase.com');
  assert.equal(exophase.pageListsPlatform(hades, 'ps4'), false);
  assert.equal(exophase.pageListsPlatform(hades, 'ps5'), true);
  assert.equal(exophase.pageListsPlatform(ghost, 'ps5'), false);
  assert.equal(exophase.pageListsPlatform(ghost, 'ps4'), true);
});

test('a game whose own name holds a dash is still read from the end of the title', () => {
  const html = page('Uncharted - The Lost Legacy Trophies - PS4 - Exophase.com');
  assert.equal(exophase.pageListsPlatform(html, 'ps4'), true);
  assert.equal(exophase.pageListsPlatform(html, 'ps5'), false);
});

test('a list shared by several consoles counts for each of them', () => {
  const html = page('Some Game Trophies - PS4, PS5 - Exophase.com');
  assert.equal(exophase.pageListsPlatform(html, 'ps4'), true);
  assert.equal(exophase.pageListsPlatform(html, 'ps5'), true);
  assert.equal(exophase.pageListsPlatform(html, 'ps3'), false);
});

test('a title in another shape, or none at all, is not held against the page', () => {
  assert.equal(exophase.pageListsPlatform(page('Exophase'), 'ps5'), true);
  assert.equal(exophase.pageListsPlatform('<div class="award-details"></div>', 'ps4'), true);
});

test('Xbox and Steam pages are never filtered: their URL already names the platform', () => {
  assert.equal(exophase.pageListsPlatform(page('Fable II Achievements - Xbox 360 - Exophase.com'), 'xbox-360'), true);
});
