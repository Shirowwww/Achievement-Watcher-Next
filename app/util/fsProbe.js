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

// readDirectory, or the listing a test injects through a parser's initDebug({ listDirectory }).
function directoryLister(listDirectory) {
  if (typeof listDirectory !== 'function') return readDirectory;
  return (target) => listDirectory(target) || [];
}

/*
  A text file inside a user-writable game folder: a real file (never a link, which could point
  anywhere), at most `maxBytes`, strict UTF-8 without its BOM. null for anything else.
*/
function readStrictText(file, maxBytes) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file)).replace(/^﻿/, '');
  } catch {
    return null;
  }
}

module.exports = { isFile, isDirectory, readDirectory, readText, directoryLister, readStrictText };
