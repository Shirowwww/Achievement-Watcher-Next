'use strict';

/*
  Serves docs/ over http, the way GitHub Pages does.

  The pages fetch their own files - the language manifest, a translation, the release line, the
  gallery listing - and a browser refuses that from file://, so opening docs/index.html directly
  shows an untranslated page with no gallery. This is the small server that makes a local check
  honest. It is a development and test helper only; nothing on the published site uses it.

    node tools/site/serve.js            - http://127.0.0.1:8080
    node tools/site/serve.js 4000       - another port, 0 for one the system picks
*/

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const DOCS = path.join(__dirname, '..', '..', 'docs');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.awpreset': 'application/zip',
  '.md': 'text/markdown; charset=utf-8',
};

// Anything outside docs/ is not on the site, so a request that climbs out of it is a 403 rather
// than a file read.
function resolve(root, url) {
  let clean;
  try {
    clean = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch (err) {
    return null;
  }
  const target = path.resolve(root, '.' + clean);
  if (target !== root && !target.startsWith(root + path.sep)) return null;

  try {
    if (fs.statSync(target).isDirectory()) return path.join(target, 'index.html');
  } catch (err) {
    /* not there: let the caller answer 404 */
  }
  return target;
}

function start(options) {
  const root = path.resolve((options && options.root) || DOCS);
  const server = http.createServer((request, response) => {
    const file = resolve(root, request.url || '/');
    if (!file) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(file, (err, body) => {
      if (err) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      response.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(body);
    });
  });

  return new Promise((resolveStart, reject) => {
    server.on('error', reject);
    server.listen((options && options.port) || 0, '127.0.0.1', () => {
      resolveStart({
        server,
        url: 'http://127.0.0.1:' + server.address().port,
        // closeAllConnections() first: a browser keeps its sockets alive, and server.close()
        // alone would wait for them to idle out (a minute and a half) before it answered.
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(done);
          }),
      });
    });
  });
}

module.exports = { start, DOCS };

if (require.main === module) {
  const port = Number(process.argv[2] || 8080);
  start({ port: Number.isFinite(port) ? port : 8080 }).then((instance) => {
    console.log('docs/ is on ' + instance.url);
  });
}
