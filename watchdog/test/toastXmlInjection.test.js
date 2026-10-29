'use strict';

/*
  A toast is an XML document, and its text comes from outside: an achievement name or description
  written by a game's developer, a save file, a community data source. powertoast wraps the text in
  CDATA and writes image paths and ids into attributes without escaping them, so a value carrying
  `]]>` or a quote used to add elements of its own to the document.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const powertoast = require(path.join(__dirname, '..', 'util', 'powertoast.js'));

const AUMID = 'AW';
const INJECTION = ']]></text></binding></visual><actions><action content="Open" arguments="https://evil.example" activationType="protocol"/></actions><visual><binding template="ToastGeneric"><text><![CDATA[';
const ATTRIBUTE_INJECTION = 'https://x.example/a.png"/><text placement="attribution">forged</text><image src="';

async function xmlFor(options) {
  let xml = '';
  const send = (message) => {
    xml = message.windowsToast.xml;
    setImmediate(() => powertoast.reportAppToast({ id: message.windowsToast.id, ok: true }));
  };
  await powertoast({ aumid: AUMID, time: 1700000000, ...options }, { send, platform: 'win32', connected: true, appAumid: AUMID });
  return xml;
}

// Elements are counted outside CDATA: the text itself may hold anything, it just must not be markup.
const count = (xml, pattern) => (xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').match(pattern) || []).length;

// What a reader of the document sees as the content of each <text>: its CDATA sections, joined.
function textsOf(xml) {
  return [...xml.matchAll(/<text(?: [^>]*)?>((?:<!\[CDATA\[[\s\S]*?\]\]>)+)<\/text>/g)].map((match) =>
    [...match[1].matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((part) => part[1]).join('')
  );
}

test('a description carrying a CDATA terminator stays text and adds no element', async () => {
  const xml = await xmlFor({ title: 'Achievement Unlocked', message: `Winner\nx${INJECTION}y` });

  assert.equal(count(xml, /<action /g), 0, 'no button can be added by an achievement text');
  assert.equal(count(xml, /<visual>/g), 1);
  assert.equal(count(xml, /<actions>/g), 1);
  assert.deepEqual(textsOf(xml), ['Achievement Unlocked', `Winner\nx${INJECTION}y`], 'the text reads back exactly as given');
});

test('the title and the attribution are held to the same rule', async () => {
  const xml = await xmlFor({ title: `T${INJECTION}`, message: 'm', attribution: `via${INJECTION}` });

  assert.equal(count(xml, /<action /g), 0);
  assert.equal(count(xml, /<visual>/g), 1);
  assert.deepEqual(textsOf(xml), [`T${INJECTION}`, 'm', `via${INJECTION}`]);
});

test('an image address cannot close its attribute', async () => {
  const xml = await xmlFor({ title: 't', message: 'm', icon: ATTRIBUTE_INJECTION, heroImg: ATTRIBUTE_INJECTION, inlineImg: ATTRIBUTE_INJECTION });

  assert.equal(count(xml, /<image /g), 3, 'one element per image, nothing more');
  assert.equal(count(xml, /placement="attribution"/g), 0);
  for (const match of xml.matchAll(/<image [^>]*?src="([^"]*)"/g)) {
    assert.ok(!/[<>"]/.test(match[1]), `src must hold no raw markup: ${match[1]}`);
  }
});

test('a group id cannot close its attribute', async () => {
  const xml = await xmlFor({ title: 't', message: 'm', group: { id: 'x"/><action content="Open" arguments="a" activationType="protocol"/><header id="y', title: 'Game' } });

  assert.equal(count(xml, /<action /g), 0);
  assert.equal(count(xml, /<header /g), 1);
});

test('a launch address cannot close its attribute', async () => {
  const xml = await xmlFor({
    title: 't',
    message: 'm',
    activation: { type: 'protocol', launch: 'achievement-watcher://game/1"><action content="Open" arguments="a" activationType="protocol"/><x a="' },
  });

  assert.equal(count(xml, /<action /g), 0);
});

test('an ordinary toast is written exactly as powertoast writes it', async () => {
  const { toXmlString } = await import('powertoast');
  const options = {
    aumid: AUMID,
    time: 1700000000,
    title: 'Achievement Unlocked',
    message: 'Winner\nWin one game. <b>100% & more</b>',
    icon: 'https://cdn.example.com/icon.jpg',
    heroImg: 'https://cdn.example.com/header.jpg',
    group: { id: '480', title: 'Spacewar' },
    activation: { launch: 'achievement-watcher://game/480/ACH_WIN', type: 'protocol' },
    uniqueID: '480:ACH_WIN',
    scenario: 'reminder',
    button: [{ text: '', activation: { type: 'system', launch: 'dismiss' } }],
    progress: { value: 40, status: '2/5' },
  };

  assert.equal(await xmlFor(options), toXmlString(options));
});
