'use strict';

/*
  Development timing marks for the scan and paint paths. Off by default: every call is one
  boolean test until `enable()` is called (dev mode, or `AW_PERF=1` on a packaged build). Timings
  are aggregated per label and reported as one line per scan, since a log line per phase per game
  is itself a measurable cost on a 200-game library.
*/

const { performance } = require('perf_hooks');

let enabled = process.env.AW_PERF === '1';
const totals = new Map();

function enable(flag = true) {
  enabled = Boolean(flag) || process.env.AW_PERF === '1';
}

function isEnabled() {
  return enabled;
}

function record(label, ms) {
  if (!enabled || !label) return;
  const entry = totals.get(label) || { ms: 0, count: 0 };
  entry.ms += ms;
  entry.count += 1;
  totals.set(label, entry);
}

// Returns the stop function even when disabled, so call sites never need a null check.
const NOOP = () => 0;
function start(label) {
  if (!enabled) return NOOP;
  const began = performance.now();
  return () => {
    const elapsed = performance.now() - began;
    record(label, elapsed);
    return elapsed;
  };
}

async function span(label, fn) {
  const stop = start(label);
  try {
    return await fn();
  } finally {
    stop();
  }
}

function reset(prefix) {
  if (!prefix) {
    totals.clear();
    return;
  }
  for (const label of [...totals.keys()]) if (label.startsWith(prefix)) totals.delete(label);
}

// "label 812ms x1, label2 90ms x54" - slowest first, so a regression is the first thing read.
function summary({ prefix = '', top = 12, minMs = 1 } = {}) {
  const rows = [...totals.entries()]
    .filter(([label, entry]) => label.startsWith(prefix) && entry.ms >= minMs)
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, top)
    .map(([label, entry]) => `${label.slice(prefix.length)} ${entry.ms.toFixed(0)}ms${entry.count > 1 ? ` x${entry.count}` : ''}`);
  return rows.join(', ');
}

module.exports = { enable, isEnabled, start, span, record, reset, summary };
