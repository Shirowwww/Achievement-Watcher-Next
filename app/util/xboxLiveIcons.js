'use strict';

/*
  Xbox Live's old image host still serves every Xbox 360 achievement picture by title id and hex
  image id. It answers over plain http only, which the renderer's CSP refuses, so the files are
  fetched here into a local cache and shown through file://. No userData lookup in this file: the
  Watchdog loads it from outside the app archive.
*/

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const TIMEOUT_MS = 8000;
const CONCURRENCY = 6;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 32 * 1024 * 1024;

/*
  A minimal fetch over Node's own http/https. The parsers run in the renderer, where the global fetch
  is Chromium's and the page CSP refuses both this plain-http host and dbox.tools, instantly and
  silently: every Xenia icon and every dbox lookup failed there while passing in tests under Node.
*/
function nodeFetch(url, { signal, redirects = MAX_REDIRECTS } = {}) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }
    const client = target.protocol === 'http:' ? require('http') : require('https');
    const req = client.get(target, { headers: { 'User-Agent': 'AchievementWatcherNext' }, signal }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
        res.resume();
        resolve(nodeFetch(new URL(res.headers.location, target).toString(), { signal, redirects: redirects - 1 }));
        return;
      }
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) req.destroy(new Error(`${url} answered more than ${MAX_BODY_BYTES} bytes`));
        else chunks.push(chunk);
      });
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: status >= 200 && status < 300,
          status,
          arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length),
          json: async () => JSON.parse(body.toString('utf8')),
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

const uint32 = (v) => Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 0xffffffff;

function xboxLiveIconUrl(titleId, imageId) {
  if (!/^[0-9a-f]{8}$/i.test(String(titleId || '')) || !uint32(imageId) || Number(imageId) === 0) return null;
  return `http://image.xboxlive.com/global/t.${String(titleId).toUpperCase()}/ach/0/${Number(imageId).toString(16)}`;
}

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const isImage = (buf) =>
  buf.length > 4 && (buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC) || buf.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC));

// The Xbox 360 marketplace's own art for a title (en-US), served by the same Microsoft host family.
function marketplaceArtUrl(titleId, file) {
  if (!/^[0-9a-f]{8}$/i.test(String(titleId || ''))) return null;
  return `http://download.xbox.com/content/images/66acd000-77fe-1000-9115-d802${String(titleId).toLowerCase()}/1033/${file}`;
}

// A 404 is remembered with an empty marker so a title the host does not know costs one request per
// picture, not one per scan. Network failures are not: offline today says nothing about tomorrow.
async function downloadImage(url, iconPath, fetchImpl = nodeFetch) {
  const missPath = `${iconPath}.missing`;
  if (!url || typeof fetchImpl !== 'function' || fs.existsSync(missPath)) return false;
  let resp;
  try {
    resp = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return false;
  }
  if (resp.status === 404) {
    await fsp.writeFile(missPath, '').catch(() => {});
    return false;
  }
  if (!resp.ok) return false;
  const buf = Buffer.from(await resp.arrayBuffer());
  if (!isImage(buf)) return false;
  // Written aside then moved in: a torn file would otherwise pass the existsSync check forever.
  const tmpPath = `${iconPath}.${process.pid}.tmp`;
  try {
    await fsp.writeFile(tmpPath, buf);
    await fsp.rename(tmpPath, iconPath);
    return true;
  } catch {
    await fsp.rm(tmpPath, { force: true }).catch(() => {});
    return false;
  }
}

function downloadXboxLiveIcon(titleId, imageId, iconPath, fetchImpl = nodeFetch) {
  return downloadImage(xboxLiveIconUrl(titleId, imageId), iconPath, fetchImpl);
}

// Sets icon/icongray on each { entry, imageId } row whose picture is cached or could be fetched.
async function fillMissingIcons(titleId, iconDir, rows, fetchImpl = nodeFetch) {
  const queue = rows.slice();
  const worker = async () => {
    while (queue.length) {
      const row = queue.shift();
      const iconPath = path.join(iconDir, `${row.imageId}.png`);
      if (fs.existsSync(iconPath) || (await downloadXboxLiveIcon(titleId, row.imageId, iconPath, fetchImpl))) {
        row.entry.icon = row.entry.icongray = 'file:///' + iconPath.replace(/\\/g, '/');
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
}

module.exports = { xboxLiveIconUrl, marketplaceArtUrl, downloadImage, downloadXboxLiveIcon, fillMissingIcons, nodeFetch };
