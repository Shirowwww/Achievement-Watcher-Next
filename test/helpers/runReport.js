'use strict';

// A node:test reporter for test/run.js, written to its own file next to the usual output: one line
// per test file that failed, one with the time of each top-level test, and one with the run's counts.
// The runner reads it to rerun failed files alone and to print the slowest files and a total.
module.exports = async function* runReport(source) {
  for await (const event of source) {
    const topLevel = (event.type === 'test:pass' || event.type === 'test:fail') && event.data.nesting === 0 && event.data.file;
    if (topLevel) yield `time ${Math.round(event.data.details.duration_ms)} ${event.data.file}\n`;
    if (topLevel && event.type === 'test:fail') {
      yield `fail ${event.data.file}\n`;
    } else if (event.type === 'test:summary' && event.data.file === undefined) {
      const { passed, failed, cancelled } = event.data.counts;
      yield `counts ${passed} ${failed} ${cancelled}\n`;
    }
  }
};
