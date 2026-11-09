'use strict';

/*
  The game page's readers for the stores beyond Steam and GamesDB, all public and keyless: the
  Microsoft Store catalogue (displaycatalog, for Xbox games), egdata.app (Epic offers, their gallery,
  trailers and players' rating) and GOG's product API (its translated text). Same output as
  util/gameDetails.js; every field optional, text plain, links https.
*/

const { cleanText, httpsUrl, textList, titleKey, MAX_VIDEOS, MAX_SCREENSHOTS } = require('./gameDetails.js');
const { toBcp47 } = require('./intlFormat.js');

// GOG's 639px card for the strip, and its large gallery picture for the viewer.
const GOG_THUMB = 'product_card_v2_mobile_slider_639';
const GOG_FULL = 'ggvgl_2x';
// Microsoft resizes on request; 640px matches the other stores' strip pictures.
const MICROSOFT_THUMB_WIDTH = 640;

const isoDay = (value) => (/^(\d{4}-\d{2}-\d{2})/.exec(typeof value === 'string' ? value : '') || [])[1] || '';
const msUri = (value) => httpsUrl(typeof value === 'string' && value.startsWith('//') ? `https:${value}` : value);

// `url` is the store page the rating comes from, opened when it is clicked.
function starRating(source, score, count, url = '') {
  const value = Number(score);
  if (!Number.isFinite(value) || value <= 0 || value > 5) return [];
  return [{ source, score: Math.round(value * 10) / 10, outOf: 5, count: Math.max(0, Math.round(Number(count) || 0)), url }];
}

const microsoftPage = (id) => (/^[A-Z0-9]{12}$/.test(String(id)) ? `https://www.xbox.com/games/store/p/${id}` : '');
const epicPage = (offer) => {
  const mapping = (Array.isArray(offer.offerMappings) ? offer.offerMappings : []).find((entry) => entry && entry.pageSlug);
  const slug = String(offer.productSlug || (mapping && mapping.pageSlug) || '');
  return /^[a-z0-9-]{1,120}$/i.test(slug) ? `https://store.epicgames.com/p/${slug}` : '';
};

function fromMicrosoftProduct(product) {
  const local = product && Array.isArray(product.LocalizedProperties) ? product.LocalizedProperties[0] : null;
  if (!local) return null;
  const market = (Array.isArray(product.MarketProperties) && product.MarketProperties[0]) || {};
  const images = Array.isArray(local.Images) ? local.Images : [];
  const imageOf = (purpose) => msUri((images.find((image) => image && image.ImagePurpose === purpose) || {}).Uri);
  const allTime = (Array.isArray(market.UsageData) ? market.UsageData : []).find((usage) => usage && usage.AggregateTimeSpan === 'AllTime') || {};
  const categories = product.Properties && (product.Properties.Categories || product.Properties.Category);
  return {
    title: cleanText(local.ProductTitle),
    description: cleanText(local.ShortDescription || local.ProductDescription, 4000),
    genres: textList(categories),
    developers: textList(local.DeveloperName),
    publishers: textList(local.PublisherName),
    releaseDate: isoDay(market.OriginalReleaseDate),
    ratings: starRating('microsoft', allTime.AverageRating, allTime.RatingCount, microsoftPage(product.ProductId)),
    // shortcut: the trailer streams (cdn-dynmedia-1.microsoft.com) answered 403 "Client IP address
    // forbidden" to a home connection in 2026-11, browser included; read CMSVideos once they play.
    videos: [],
    // Each screenshot comes once for the PC store page and once for the console one.
    screenshots: images
      .filter((image) => image && image.ImagePurpose === 'Screenshot' && !/^xbox\//i.test(String(image.ImagePositionInfo || '')))
      .map((image) => msUri(image.Uri))
      .filter(Boolean)
      .slice(0, MAX_SCREENSHOTS)
      .map((full) => ({ thumb: `${full}?w=${MICROSOFT_THUMB_WIDTH}`, full })),
    background: imageOf('SuperHeroArt') || imageOf('TitledHeroArt'),
  };
}

// The store lists every edition under its own title: the game itself first, else one of its editions.
const EDITION = /^(?:standard|deluxe|premium|ultimate|gold|complete|definitive|anniversary|gameoftheyear|goty)?(?:edition|edicion|edizione|ausgabe)?(?:standard|deluxe|premium|ultimate|gold|complete|definitive)?$/;

function chooseMicrosoftProduct(answer, title) {
  const key = titleKey(title);
  if (!key) return null;
  const games = (Array.isArray(answer && answer.Results) ? answer.Results : [])
    .flatMap((family) => (Array.isArray(family && family.Products) ? family.Products : []))
    .filter((product) => product && product.Type === 'Game' && /^[A-Z0-9]{12}$/.test(String(product.ProductId)));
  const exact = games.filter((product) => titleKey(product.Title) === key);
  // Two products of that exact title are two games: none.
  if (exact.length) return exact.length === 1 ? exact[0].ProductId : null;
  const editions = games.filter((product) => {
    const own = titleKey(product.Title);
    return own.startsWith(key) && EDITION.test(own.slice(key.length));
  });
  if (editions.length === 0) return null;
  const standard = editions.find((product) => /standard/i.test(product.Title));
  return (standard || editions[0]).ProductId;
}

function epicVideoOf(video) {
  const outputs = Array.isArray(video && video.outputs) ? video.outputs : [];
  const files = outputs.filter((output) => /^video\/(?:webm|mp4)$/i.test(String(output && output.contentType)) && httpsUrl(output.url));
  if (files.length === 0) return null;
  const best = files.reduce((top, output) => ((Number(output.width) || 0) > (Number(top.width) || 0) ? output : top));
  const thumbnail = outputs.find((output) => /^image\//i.test(String(output && output.contentType)));
  // Epic serves the sound as its own file beside the picture: a silent trailer, for the moving backdrop.
  return { name: '', thumbnail: httpsUrl(thumbnail && thumbnail.url), file: httpsUrl(best.url), silent: true };
}

function fromEgdata(offer, media, polls) {
  if (!offer || typeof offer !== 'object') return null;
  const keyImages = Array.isArray(offer.keyImages) ? offer.keyImages : [];
  const imageOf = (type) => httpsUrl((keyImages.find((image) => image && image.type === type) || {}).url);
  const gallery = (media && Array.isArray(media.images) ? media.images : []).map((image) => httpsUrl(image && image.src)).filter(Boolean);
  return {
    title: cleanText(offer.title),
    description: cleanText(offer.description, 4000),
    genres: [],
    developers: textList(offer.developerDisplayName),
    publishers: textList(offer.publisherDisplayName),
    releaseDate: isoDay(offer.releaseDate || offer.pcReleaseDate),
    ratings: starRating('epic', polls && polls.averageRating, 0, epicPage(offer)),
    videos: (media && Array.isArray(media.videos) ? media.videos : []).map(epicVideoOf).filter(Boolean).slice(0, MAX_VIDEOS),
    screenshots: gallery.slice(0, MAX_SCREENSHOTS).map((url) => ({ thumb: url, full: url })),
    background: imageOf('DieselStoreFrontWide') || imageOf('OfferImageWide'),
  };
}

function gogYoutube(video) {
  const id = (/youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,20})/.exec(String(video && video.video_url)) || [])[1];
  return video && video.provider === 'youtube' && id ? { name: '', thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, youtube: id } : null;
}

/*
  GOG writes its description as a page of HTML: the newlines of its source are layout, paragraphs are
  tags, and after the first heading come the feature lists, GIFs and credits. The text before it is
  the game's introduction, the same length as the other stores' summary.
*/
function gogDescription(html) {
  const intro = String(html || '').split(/<h[1-6][\s>]/i)[0];
  return cleanText(intro.replace(/\s+/g, ' ').replace(/<\/p>|<br\s*\/?>/gi, '\n\n'), 4000);
}

function fromGogProduct(product) {
  if (!product || typeof product !== 'object') return null;
  const shot = (image, formatter) => httpsUrl(String((image && image.formatter_template_url) || '').replace('{formatter}', formatter));
  return {
    title: cleanText(product.title),
    description: gogDescription(product.description && (product.description.lead || product.description.full)),
    genres: [],
    developers: [],
    publishers: [],
    releaseDate: isoDay(product.release_date),
    ratings: [],
    videos: (Array.isArray(product.videos) ? product.videos : []).map(gogYoutube).filter(Boolean).slice(0, MAX_VIDEOS),
    screenshots: (Array.isArray(product.screenshots) ? product.screenshots : [])
      .map((image) => ({ thumb: shot(image, GOG_THUMB), full: shot(image, GOG_FULL) }))
      .filter((image) => image.full)
      .slice(0, MAX_SCREENSHOTS),
    background: '',
  };
}

// Epic takes a bare language for most locales and a region for a few (the ones it ships).
const EPIC_REGIONAL = { 'pt-BR': 'pt-BR', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-Hant', 'es-419': 'es-MX' };
// The app's language as a BCP 47 tag, English when it names none.
const tagOf = (lang) => toBcp47(lang) || 'en-US';

function epicLocale(lang) {
  const tag = tagOf(lang);
  return EPIC_REGIONAL[tag] || tag.slice(0, 2).toLowerCase();
}

function microsoftMarket(lang) {
  const tag = tagOf(lang);
  const region = (/-([A-Z]{2})$/.exec(tag) || [])[1] || 'US';
  return { market: region, language: tag.toLowerCase() };
}

module.exports = { fromMicrosoftProduct, chooseMicrosoftProduct, fromEgdata, fromGogProduct, epicLocale, microsoftMarket, storeLocale: tagOf };
