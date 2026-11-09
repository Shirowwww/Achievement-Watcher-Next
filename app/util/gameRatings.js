'use strict';

/*
  Ratings beyond what the stores' own pages carry, all keyless: Metacritic's critics and players
  scores (its site's own backend, found by exact title) and GOG's players rating (its catalogue).
  Same rating shape as util/gameDetails.js: { source, score, outOf?, count?, url }.
*/

const { titleKey } = require('./gameDetails.js');
const { libraryBadgeOf } = require('./sourceIdentity.js');

const METACRITIC_GAME = 13;
const PC = ['PC'];
const PLATFORMS_BY_FAMILY = {
  xbox: ['Xbox Series X', 'Xbox One', 'Xbox 360', 'Xbox', 'PC'],
  playstation: ['PlayStation 5', 'PlayStation 4', 'PlayStation 3', 'PlayStation 2', 'PlayStation', 'PSP', 'PlayStation Vita'],
};
// RetroAchievements console names that Metacritic spells otherwise.
const METACRITIC_CONSOLES = {
  'playstation portable': 'PSP',
  'nes/famicom': 'NES',
  'snes/super famicom': 'Super Nintendo',
  'genesis/mega drive': 'Genesis',
  'nintendo ds': 'DS',
  'game boy color': 'Game Boy Color',
};

function metacriticPlatforms(game) {
  const family = libraryBadgeOf(game && game.source);
  if (family !== 'retroachievements') return PLATFORMS_BY_FAMILY[family] || PC;
  const consoleName = String((game && game.console) || (/ \(([^()]{2,60})\)$/.exec(String((game && game.name) || '')) || [])[1] || '').trim();
  return consoleName ? [METACRITIC_CONSOLES[consoleName.toLowerCase()] || consoleName] : [];
}

const platformNames = (item) => (Array.isArray(item && item.platforms) ? item.platforms : []).map((platform) => String((platform && platform.name) || ''));

// A name is not an id: one game of exactly that title on the game's own platform. The same title
// elsewhere only (DOOM 2016 for the SNES Doom) is another game.
function chooseMetacriticGame(answer, title, platforms) {
  const key = titleKey(title);
  const items = answer && answer.data && Array.isArray(answer.data.items) ? answer.data.items : [];
  if (!key) return null;
  const native = items.filter(
    (item) =>
      item &&
      item.typeId === METACRITIC_GAME &&
      /^[a-z0-9-]{1,120}$/.test(String(item.slug)) &&
      titleKey(item.title) === key &&
      platformNames(item).some((name) => platforms.includes(name))
  );
  return native.length === 1 ? native[0].slug : null;
}

const statsOf = (answer) => (answer && answer.data && answer.data.item) || {};
const count = (value) => Math.max(0, Math.round(Number(value) || 0));

function metacriticRatings(slug, critic, user) {
  const page = `https://www.metacritic.com/game/${slug}/`;
  const press = statsOf(critic);
  const players = statsOf(user);
  const list = [];
  const pressScore = Number(press.score);
  if (press.score !== null && Number.isFinite(pressScore) && pressScore > 0 && pressScore <= 100) list.push({ source: 'metacritic', score: Math.round(pressScore), count: count(press.reviewCount), url: page });
  const playersScore = Number(players.score);
  if (players.score !== null && Number.isFinite(playersScore) && playersScore > 0 && playersScore <= 10) {
    list.push({ source: 'metacritic-users', score: Math.round(playersScore * 10) / 10, outOf: 10, count: count(players.reviewCount), url: `${page}user-reviews/` });
  }
  return list;
}

// GOG rates out of 50 (46 is 4.6 stars) in its catalogue, searched by title and matched by product id.
function gogRating(answer, productId) {
  const product = (answer && Array.isArray(answer.products) ? answer.products : []).find((item) => item && String(item.id) === String(productId));
  const value = Number(product && product.reviewsRating);
  const slug = String((product && product.slug) || '');
  const url = /^[a-z0-9_]{1,120}$/.test(slug) ? `https://www.gog.com/game/${slug}` : '';
  return Number.isFinite(value) && value > 0 && value <= 50 ? [{ source: 'gog', score: value / 10, outOf: 5, count: 0, url }] : [];
}

// Steam's review histogram (keyless, unlike appreviews) counts up and down votes per month since
// release: their sum is every review, shown as the share of positive ones like the store does.
function steamReviews(answer, appid) {
  const rollups = answer && answer.success === 1 && answer.results && Array.isArray(answer.results.rollups) ? answer.results.rollups : [];
  let up = 0;
  let down = 0;
  for (const month of rollups) {
    up += count(month && month.recommendations_up);
    down += count(month && month.recommendations_down);
  }
  const total = up + down;
  if (total === 0 || !/^\d{1,12}$/.test(String(appid))) return [];
  return [{ source: 'steam', score: Math.round((up / total) * 100), outOf: 100, percent: true, count: total, url: `https://store.steampowered.com/app/${appid}/#app_reviews_hash` }];
}

module.exports = { metacriticPlatforms, chooseMetacriticGame, metacriticRatings, gogRating, steamReviews };
