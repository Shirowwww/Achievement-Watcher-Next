'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeXmlEntities } = require('../../app/util/xmlText.js');

test('the named entities and character references read back as text', () => {
  assert.equal(decodeXmlEntities('Tom &amp; Jerry &lt;3 &quot;hi&quot; it&apos;s'), 'Tom & Jerry <3 "hi" it\'s');
  assert.equal(decodeXmlEntities('it&#39;s &#039;ok&#039; &#x2019; &#233;'), "it's 'ok' ’ é");
});

test('an escaped ampersand is decoded once, never twice', () => {
  assert.equal(decodeXmlEntities('&amp;lt; &amp;#39;'), '&lt; &#39;');
});

test('a reference outside Unicode and an empty value give nothing, not an exception', () => {
  assert.equal(decodeXmlEntities('a&#x110000;b&#0;c'), 'abc');
  assert.equal(decodeXmlEntities(undefined), '');
  assert.equal(decodeXmlEntities(null), '');
});
