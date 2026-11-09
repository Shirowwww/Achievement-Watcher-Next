'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { mergeTranslatedAchievements } = require('../../app/parser/achievementTranslations.js');

test('translation merge preserves the first image match from the former Array.find', () => {
  const first = { icon: 'first-icon', icongray: 'shared' };
  const later = { icon: 'shared', icongray: 'later-gray' };

  mergeTranslatedAchievements([first, later], [{ img: 'shared', title: 'Translated', description: 'Desc' }]);

  assert.equal(first.displayName, 'Translated');
  assert.equal(first.description, 'Desc');
  assert.equal(later.displayName, undefined);
});

test('translation merge retains the legacy undefined-image match and leaves misses untouched', () => {
  const missingArtwork = { name: 'first' };
  const normal = { name: 'second', icon: 'icon' };

  mergeTranslatedAchievements(
    [missingArtwork, normal],
    [
      { img: undefined, title: 'Fallback', description: 'Fallback desc' },
      { img: 'absent', title: 'No match', description: 'No match desc' },
    ]
  );

  assert.equal(missingArtwork.displayName, 'Fallback');
  assert.equal(missingArtwork.description, 'Fallback desc');
  assert.equal(normal.displayName, undefined);
});

test('translation merge matches full icon URLs against SteamCommunity image hashes', () => {
  const achievement = {
    icon: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/440/abc123.jpg',
    icongray: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/440/abc123_gray.jpg',
    description: 'English hidden text',
  };

  mergeTranslatedAchievements([achievement], [
    { img: 'abc123', title: 'Titre français', description: '' },
  ]);

  assert.equal(achievement.displayName, 'Titre français');
  // The page blanks hidden descriptions: the English text must survive the merge.
  assert.equal(achievement.description, 'English hidden text');
});

test('translation merge still replaces blank schema descriptions with real page text', () => {
  const achievement = { icon: 'https://cdn.example/apps/440/hash.jpg', description: '' };
  mergeTranslatedAchievements([achievement], [{ img: 'hash.jpg', title: 'Visible', description: 'Page text' }]);
  assert.equal(achievement.description, 'Page text');
  assert.equal(achievement.displayName, 'Visible');
});

test('an empty image string never matches a schema entry whose icons are missing', () => {
  const noIcon = { name: 'SH_ENTRY', icon: '', icongray: '', description: 'Real text' };
  const withIcon = { name: 'ICONED', icon: 'https://cdn.example/real.jpg', icongray: 'https://cdn.example/real_gray.jpg' };

  mergeTranslatedAchievements([noIcon, withIcon], [{ img: '', title: 'Wrong title', description: '' }]);

  assert.equal(noIcon.displayName, undefined);
  assert.equal(noIcon.description, 'Real text');
  assert.equal(withIcon.displayName, undefined);
});

// The current community page names every achievement: its rows are matched by that name, and a
// shared icon can no longer hand one achievement's translation to another.
test('rows that carry an apiName are matched by it, whatever their icon', () => {
  const first = { name: 'ACH_A', icon: 'https://cdn.example/same.jpg' };
  const second = { name: 'ACH_B', icon: 'https://cdn.example/same.jpg' };

  mergeTranslatedAchievements(
    [first, second],
    [
      { apiName: 'ACH_B', img: 'same', title: 'Deuxième', description: 'B' },
      { apiName: 'ACH_A', img: 'same', title: 'Premier', description: 'A' },
    ]
  );

  assert.equal(first.displayName, 'Premier');
  assert.equal(second.displayName, 'Deuxième');
});

test('an answer naming one achievement twice, or rows without a name beside named ones, are left out', () => {
  const a = { name: 'ACH_A', icon: 'https://cdn.example/a.jpg' };
  const b = { name: 'ACH_B', icon: 'https://cdn.example/b.jpg' };

  mergeTranslatedAchievements(
    [a, b],
    [
      { apiName: 'ACH_A', img: 'a', title: 'Un', description: '' },
      { apiName: 'ACH_A', img: 'a', title: 'Autre', description: '' },
      { apiName: '', img: 'b', title: 'Sans nom', description: '' },
    ]
  );

  assert.equal(a.displayName, undefined, 'two rows for one name: neither is trusted');
  assert.equal(b.displayName, undefined, 'a row without a name in a named answer is dropped');
});

test('an icon shared by several achievements matches none of them by icon', () => {
  const first = { name: 'ONE', icon: 'https://cdn.example/generic.jpg' };
  const second = { name: 'TWO', icon: 'https://cdn.example/generic.jpg' };
  const own = { name: 'THREE', icon: 'https://cdn.example/own.jpg' };

  mergeTranslatedAchievements(
    [first, second, own],
    [
      { img: 'generic', title: 'Ambigu', description: '' },
      { img: 'own', title: 'Propre', description: '' },
    ]
  );

  assert.equal(first.displayName, undefined);
  assert.equal(second.displayName, undefined);
  assert.equal(own.displayName, 'Propre');
});

test('an apiName in another case still finds its achievement', () => {
  const achievement = { name: 'ACH_Foo', icon: 'https://cdn.example/foo.jpg' };
  mergeTranslatedAchievements([achievement], [{ apiName: 'ach_foo', img: 'foo', title: 'Truc', description: '' }]);
  assert.equal(achievement.displayName, 'Truc');
});

test('a locked icon shared by several achievements matches none of them by icon', () => {
  const a = { name: 'A', icon: 'https://cdn.example/a.jpg', icongray: 'https://cdn.example/gray.jpg' };
  const b = { name: 'B', icon: 'https://cdn.example/b.jpg', icongray: 'https://cdn.example/gray.jpg' };
  mergeTranslatedAchievements([a, b], [{ img: 'gray', title: 'Ambigu', description: '' }]);
  assert.equal(a.displayName, undefined);
  assert.equal(b.displayName, undefined);
});
