'use strict';

const path = require('path');
const urlParser = require('url');
const fs = require('fs');
const request = require('../util/lazyRequire.js').lazyRequire('request-zero');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const { isImageBuffer, usableCachedImage } = require(sharedAppModulePath('util/imageSniff.js'));


const cdnProviders = [
  'https://cdn.akamai.steamstatic.com/steam/apps/',
  'https://cdn.cloudflare.steamstatic.com/steam/apps/',
  'https://media.steampowered.com/steam/apps/',
  'https://steamcdn-a.akamaihd.net/steam/apps/',
  'https://shared.fastly.steamstatic.com/steam/apps/',
  'https://shared.fastly.steamstatic.com/community_assets/images/apps/',
  'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/',
  'https://steampipe.akamaized.net/steam/apps/',
  'https://google2.cdn.steampipe.steamcontent.com/steam/apps/',
  'https://steamcdn-a.akamaihd.net/steam/apps/',
  'https://media.steampowered.com/steam/apps/',
];
async function answersWithContent(url) {
  try {
    const res = await request(url, { method: 'HEAD' });
    return res.code === 200 && Boolean(res.headers['content-type']);
  } catch {
    return false;
  }
}

// Every CDN is probed at once, but the first one in list order that answers still wins.
async function findWorkingLink(appid, basename) {
  for (const ext of ['.jpg', '.png']) {
    const urls = cdnProviders.map((cdn) => `${cdn}${appid}/${basename}${ext}`);
    const probes = urls.map(answersWithContent);
    for (const [index, url] of urls.entries()) {
      if (await probes[index]) return url;
    }
  }
  return null;
}

module.exports = async (url, appID) => {
  let validUrl;
  let filePath;
  try {
    // Console-emulator watchers already provide extracted local icons. Never turn those paths into
    // failed Steam-CDN probes; keep them untouched for the toast transport.
    if (typeof url === 'string' && fs.existsSync(url)) return url;
    if (typeof url === 'string' && url.startsWith('file:///')) {
      try {
        const localPath = urlParser.fileURLToPath(url);
        if (fs.existsSync(localPath)) return localPath;
      } catch {}
    }
    const cache = path.join(require('../util/userData.js').userDataDir(), `steam_cache/icon/${appID}`);
    let filename = path.parse(url).base;
    filePath = path.join(cache, filename);
    if (usableCachedImage(filePath)) return filePath;
    let exts = ['.jpg', '.png'];
    if (!url.endsWith('.jpg') && !url.endsWith('.png'))
      for (let ext of exts) {
        filePath = path.join(cache, filename + ext);
        if (usableCachedImage(filePath)) return filePath;
      }
    //legacy url are full urls, check if they are still valid
    let isValid = false;
    validUrl = url;
    try {
      new URL(url);
      const res = await request(url, { method: 'HEAD' });
      isValid = res.code === 200;
      isValid = isValid ? res.headers['content-type'] : isValid;
    } catch (e) {}

    if (!isValid)
      validUrl = await findWorkingLink(
        appID,
        url.startsWith('http')
          ? url
              .split('/')
              .pop()
              .split('?')[0]
              .replace(/\.[^.]+$/, '')
          : url.endsWith('.jpg') || url.endsWith('.png')
          ? url.slice(0, url.length - 4)
          : url
      );

    filename = path.parse(urlParser.parse(validUrl).pathname).base;

    filePath = path.join(cache, filename);

    if (usableCachedImage(filePath)) {
      return filePath;
    } else {
      const saved = (await request.download(validUrl, cache, { validateFileSize: false })).path;
      return usableCachedImage(saved) ? saved : validUrl;
    }
  } catch (err) {
    if (err.code === 'ESIZEMISMATCH') {
      try {
        const res = await fetch(validUrl);
        if (!res.ok) return validUrl;
        const buffer = Buffer.from(await res.arrayBuffer());
        if (!isImageBuffer(buffer)) return validUrl;
        fs.writeFileSync(filePath, buffer);
        return filePath;
      } catch (e) {
        return validUrl;
      }
    }
    return url;
  }
};
