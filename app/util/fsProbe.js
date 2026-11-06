'use strict';

/*
  The four filesystem questions a source asks all day, answered without ever throwing: a missing,
  locked or unreadable path is "no" (false, [] or ''). Follows links, unlike the lstat-based
  checks some parsers keep for themselves. The Watchdog loads it through sharedAppModulePath.
*/

const fs = require('fs');

function isFile(target) {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function readDirectory(target) {
  try {
    return fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return [];
  }
}

// UTF-8, trimmed; '' when the file cannot be read.
function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

module.exports = { isFile, isDirectory, readDirectory, readText };
