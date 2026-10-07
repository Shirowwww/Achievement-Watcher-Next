'use strict';

/*
  The CI audit gate accepts one advisory by name. These tests pin what that exception may and may
  not cover: anything else at high or critical still fails, and the accepted one fails again the
  day its package publishes a fix.
*/

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

const { blocking, ACCEPTED } = require(path.join(__dirname, '..', '..', 'tools', 'audit.js'));

const advisory = (id, severity, name = 'pkg') => ({
  source: 1,
  name,
  dependency: name,
  title: `${name} is vulnerable`,
  url: `https://github.com/advisories/${id}`,
  severity,
  range: '*',
});

const report = (entries) => ({ auditReportVersion: 2, vulnerabilities: Object.fromEntries(entries.map((e) => [e.name, e])) });

test('an advisory at high that is not accepted blocks', () => {
  const found = blocking(report([{ name: 'pkg', severity: 'high', via: [advisory('GHSA-aaaa-bbbb-cccc', 'high')], fixAvailable: false }]));
  assert.deepEqual(found.map((f) => f.id), ['GHSA-aaaa-bbbb-cccc']);
});

test('a critical advisory blocks, a moderate one does not', () => {
  const found = blocking(report([
    { name: 'a', severity: 'critical', via: [advisory('GHSA-crit-crit-crit', 'critical', 'a')], fixAvailable: true },
    { name: 'b', severity: 'moderate', via: [advisory('GHSA-mode-mode-mode', 'moderate', 'b')], fixAvailable: true },
  ]));
  assert.deepEqual(found.map((f) => f.id), ['GHSA-crit-crit-crit']);
});

test('the accepted braces advisory does not block while no fix exists', () => {
  assert.ok(ACCEPTED['GHSA-vfj7-8cjw-p6xm'], 'the exception must say why it exists');
  const found = blocking(report([
    { name: 'braces', severity: 'high', via: [advisory('GHSA-vfj7-8cjw-p6xm', 'high', 'braces')], fixAvailable: false },
    { name: 'micromatch', severity: 'high', via: ['braces'], fixAvailable: false },
    { name: 'fast-glob', severity: 'high', via: ['micromatch'], fixAvailable: false },
  ]));
  assert.deepEqual(found, []);
});

test('the accepted advisory blocks again once its package has a fix', () => {
  const found = blocking(report([{ name: 'braces', severity: 'high', via: [advisory('GHSA-vfj7-8cjw-p6xm', 'high', 'braces')], fixAvailable: true }]));
  assert.deepEqual(found.map((f) => f.id), ['GHSA-vfj7-8cjw-p6xm']);
  assert.match(found[0].reason, /fix/);
});

test('an advisory reached through several packages is reported once', () => {
  const shared = advisory('GHSA-dddd-eeee-ffff', 'high', 'shared');
  const found = blocking(report([
    { name: 'shared', severity: 'high', via: [shared], fixAvailable: false },
    { name: 'other', severity: 'high', via: [shared, 'shared'], fixAvailable: false },
  ]));
  assert.deepEqual(found.map((f) => f.id), ['GHSA-dddd-eeee-ffff']);
});

test('a report npm could not produce is an error, not a pass', () => {
  assert.throws(() => blocking({ error: { code: 'ENOAUDIT' } }), /audit report/);
});
