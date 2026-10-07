'use strict';

/*
  CI audit gate for production dependencies. It fails on any high or critical advisory, like
  `npm audit --omit=dev --audit-level=high`, except the ones listed in ACCEPTED below.

    node ../tools/audit.js       run from app/ or watchdog/

  An accepted advisory stops being accepted the day its package has a fix, so an exception never
  outlives the reason for it. test/core/auditGate.test.js pins that behaviour.
*/

const { execSync } = require('node:child_process');

const BLOCKING = new Set(['high', 'critical']);

// Advisory id -> why it is accepted. Keep each entry short and re-read it when it is touched.
const ACCEPTED = {
  'GHSA-vfj7-8cjw-p6xm':
    'braces <= 3.0.3 (through fast-glob) can overflow the stack on a deeply nested brace pattern. ' +
    'No release fixes it. Every glob pattern is written by the parsers from local folder paths, ' +
    'never taken from the network, so the worst case is one failed scan.',
};

function advisoryId(advisory) {
  const match = /GHSA-[\w-]+/.exec(String(advisory.url || ''));
  return match ? match[0] : String(advisory.source);
}

function blocking(report, accepted = ACCEPTED) {
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
      if (accepted[id] && !owner.fixAvailable) continue;
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
