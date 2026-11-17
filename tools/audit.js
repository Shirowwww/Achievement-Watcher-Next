'use strict';

/*
  CI audit gate for production dependencies. It fails on any high or critical advisory, like
  `npm audit --omit=dev --audit-level=high`, except the ones listed in ACCEPTED below.

    node ../tools/audit.js       run from app/ or watchdog/

  An accepted advisory stops being accepted the day its package has a fix, so an exception never
  outlives the reason for it. test/core/auditGate.test.js pins that behaviour.
*/

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const BLOCKING = new Set(['high', 'critical']);

// Advisory id -> why it is accepted. Keep each entry short and re-read it when it is touched.
const ACCEPTED = {
  'GHSA-vfj7-8cjw-p6xm':
    'braces <= 3.0.3 (through fast-glob) can overflow the stack on a deeply nested brace pattern. ' +
    'No release fixes it. Every glob pattern is written by the parsers from local folder paths, ' +
    'never taken from the network, so the worst case is one failed scan.',
  'GHSA-fc5q-39xc-vjpf':
    'picomatch <= 4.0.7 (through fast-glob) backtracks on a crafted extglob pattern such as +(*a). ' +
    'No release fixes it. The parsers only use their own fixed patterns and escape folder paths, ' +
    'and those patterns stay linear on any file name.',
};

function installedVersion(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

function isNewer(version, than) {
  const parts = (v) => String(v).split('-')[0].split('.').map((n) => Number(n) || 0);
  const [a, b] = [parts(version), parts(than)];
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
}

// When no release fixes a package, npm offers to downgrade its parent instead (fast-glob 3 back to
// 2.2.7 for picomatch): going back a version is not a fix.
function hasFix(fixAvailable, installed) {
  if (!fixAvailable || typeof fixAvailable !== 'object') return Boolean(fixAvailable);
  const current = installed(fixAvailable.name);
  return !current || isNewer(fixAvailable.version, current);
}

function advisoryId(advisory) {
  const match = /GHSA-[\w-]+/.exec(String(advisory.url || ''));
  return match ? match[0] : String(advisory.source);
}

function blocking(report, accepted = ACCEPTED, installed = installedVersion) {
  if (!report || typeof report.vulnerabilities !== 'object' || report.vulnerabilities === null) {
    throw new Error('npm did not produce an audit report');
  }
  const found = new Map();
  for (const entry of Object.values(report.vulnerabilities)) {
    for (const advisory of entry.via || []) {
      // A string names another vulnerable package; its own entry carries the advisory.
      if (typeof advisory !== 'object' || !BLOCKING.has(advisory.severity)) continue;
      const id = advisoryId(advisory);
      if (found.has(id)) continue;
      const owner = report.vulnerabilities[advisory.name] || entry;
      if (accepted[id] && !hasFix(owner.fixAvailable, installed)) continue;
      found.set(id, {
        id,
        package: advisory.name,
        severity: advisory.severity,
        title: advisory.title,
        reason: accepted[id] ? 'accepted, but a fix is now available: update it and drop the exception' : 'not accepted',
      });
    }
  }
  return [...found.values()];
}

function runAudit() {
  try {
    return execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    // npm audit exits 1 whenever it finds anything; the report is still on stdout.
    if (err.stdout) return err.stdout;
    throw err;
  }
}

function main() {
  const found = blocking(JSON.parse(runAudit()));
  for (const id of Object.keys(ACCEPTED)) console.log(`[audit] accepted ${id}: ${ACCEPTED[id]}`);
  if (found.length === 0) {
    console.log('[audit] no blocking advisory');
    return;
  }
  for (const f of found) console.error(`[audit] ${f.severity} ${f.id} in ${f.package}: ${f.title} (${f.reason})`);
  process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { ACCEPTED, blocking };
