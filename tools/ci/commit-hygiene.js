'use strict';

/*
  Checks the commits of one push against the repository's commit rules (AGENTS.md, "Changes and
  commits"): a handful of commits per push, not a burst stamped in the same minute, and no separate
  "fix the CI" commit, since a last-minute fix is amended into the latest commit instead.

    node tools/ci/commit-hygiene.js <before> <after>

  Commits by the GitHub Actions bot are ignored: the gallery listings are rebuilt by a machine.
*/

const { execFileSync } = require('node:child_process');

const MAX_COMMITS = 8;
// Three or more commits whose committer times all fit in this window count as a burst.
const BURST_WINDOW_S = 120;
const BURST_SIZE = 3;
const CI_FIX = /^(?:fix|chore)(?:\([^)]*\))?!?:.*\b(?:ci|lint|linter|the build|codeql)\b/i;

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function commitsOf(before, after) {
  const zero = /^0+$/.test(before || '');
  // With nothing to compare against (a new branch, a rewritten one), only the tip is checked.
  const range = !before || zero ? ['-1', after] : [after, '--not', before];
  const out = git('log', '--format=%H%x09%ct%x09%an%x09%s', ...range);
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, time, author, subject] = line.split('\t');
      return { sha, time: Number(time), author, subject };
    })
    .filter((commit) => !/github-actions\[bot\]/.test(commit.author));
}

function problems(commits) {
  const found = [];
  if (commits.length > MAX_COMMITS) {
    found.push(`${commits.length} commits in one push (at most ${MAX_COMMITS}): squash them by concern before pushing.`);
  }
  const times = commits.map((commit) => commit.time).sort((a, b) => a - b);
  for (let i = 0; i + BURST_SIZE - 1 < times.length; i++) {
    if (times[i + BURST_SIZE - 1] - times[i] <= BURST_WINDOW_S) {
      found.push(`${BURST_SIZE} or more commits stamped within ${BURST_WINDOW_S} s: spread their dates over the time the work took.`);
      break;
    }
  }
  for (const commit of commits) {
    if (CI_FIX.test(commit.subject)) {
      found.push(`${commit.sha.slice(0, 8)} "${commit.subject}" is a CI or lint fix: amend it into the latest commit instead.`);
    }
  }
  return found;
}

if (require.main === module) {
  const [before, after = 'HEAD'] = process.argv.slice(2);
  const commits = commitsOf(before, after);
  const found = problems(commits);
  if (found.length) {
    for (const line of found) console.error(`::error::${line}`);
    process.exitCode = 1;
  } else {
    console.log(`commit hygiene: ${commits.length} commit(s), fine`);
  }
}

module.exports = { problems, MAX_COMMITS, BURST_SIZE, BURST_WINDOW_S };
