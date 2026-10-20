'use strict';

/*
  Ask the IndexNow engines (Bing, Yandex, ...) to recrawl every public page:
  node tools/site/indexnow.js [--dry-run]. Run it once docs/ is live on main, since the engines fetch
  docs/<key>.txt to check the request; the key is public by design. A project page cannot put the key
  file at the host root, so keyLocation names it and covers the URLs below the project path.
*/

const fs = require('node:fs');
const path = require('node:path');
const { BASE, publicPages } = require('./discovery.js');

const DOCS = path.join(__dirname, '..', '..', 'docs');
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const KEY_FILE = /^[0-9a-f]{32}\.txt$/;

function key() {
  const names = fs.readdirSync(DOCS).filter((name) => KEY_FILE.test(name));
  if (names.length !== 1) throw new Error(`expected one IndexNow key file in docs/, found ${names.length}`);
  const value = names[0].slice(0, -'.txt'.length);
  if (fs.readFileSync(path.join(DOCS, names[0]), 'utf8').trim() !== value) {
    throw new Error(`docs/${names[0]} must contain its own name`);
  }
  return value;
}

function payload() {
  const value = key();
  return {
    host: new URL(BASE).host,
    key: value,
    keyLocation: `${BASE}${value}.txt`,
    urlList: publicPages().map((page) => BASE + page),
  };
}

async function submit() {
  const body = payload();
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  // 200 and 202 both mean accepted; anything else carries the reason in the body.
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow answered ${response.status}: ${await response.text()}`);
  }
  console.log(`indexnow: ${body.urlList.length} URLs submitted (HTTP ${response.status})`);
}

if (require.main === module) {
  submit().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { key, payload };
