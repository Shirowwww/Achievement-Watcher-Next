'use strict';

/*
  Release notes for the update window, as plain blocks of text.

  electron-updater hands over the GitHub release body as HTML (the release feed's <content>), or as
  a list of { version, note } with fullChangelog. That HTML comes from the network and, unlike the
  installer, is not covered by the signature check, so it is never put in the page as markup: it is
  reduced here to headings, list items and paragraphs, and the window sets each one as text.
*/

const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'li', 'ul', 'ol', 'pre', 'blockquote']);
// Tables (the release page's download list) say nothing in a small window, so they go too.
const SKIPPED_TAGS = new Set(['script', 'style', 'template', 'noscript', 'table']);
// Everything after the first rule is the release page's footer of links.
const END_TAG = 'hr';
const MAX_BLOCKS = 60;
const MAX_TEXT = 600;

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', rarr: '→', mdash: '-', ndash: '-' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

function kindOf(tag) {
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'li') return 'item';
  return 'text';
}

function notesSource(notes) {
  if (Array.isArray(notes)) return notes.map((entry) => (entry && typeof entry.note === 'string' ? entry.note : '')).join('\n');
  return typeof notes === 'string' ? notes : '';
}

// A body without any tag is Markdown: "#" lines are headings and "-"/"*" lines are list items.
function markdownBlocks(source) {
  const lines = source.split(/\r?\n/).map((line) => line.trim());
  const end = lines.findIndex((line) => /^(-{3,}|\*{3,}|_{3,})$/.test(line));
  return (end < 0 ? lines : lines.slice(0, end))
    .filter((line) => line && !line.startsWith('|'))
    .map((line) => line.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'))
    .map((line) => {
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (heading) return { kind: 'heading', text: heading[1] };
      const item = /^[-*+]\s+(.*)$/.exec(line);
      if (item) return { kind: 'item', text: item[1] };
      return { kind: 'text', text: line };
    })
    .map((block) => ({ ...block, text: block.text.replace(/\*\*|__|`/g, '') }));
}

function htmlBlocks(source) {
  const blocks = [];
  let kind = 'text';
  let buffer = '';
  let skipping = null;
  const flush = () => {
    const text = decodeEntities(buffer).replace(/\s+/g, ' ').trim();
    buffer = '';
    if (text) blocks.push({ kind, text });
  };
  for (const match of source.matchAll(/<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9]*)[^>]*>|<!--[\s\S]*?-->|([^<]+)|</g)) {
    if (match[3] !== undefined) {
      if (!skipping) buffer += match[3];
      continue;
    }
    if (!match[2]) continue;
    const closing = Boolean(match[1]);
    const tag = match[2].toLowerCase();
    if (skipping) {
      if (closing && tag === skipping) skipping = null;
      continue;
    }
    if (tag === END_TAG) break;
    if (SKIPPED_TAGS.has(tag)) {
      if (!closing) skipping = tag;
    } else if (tag === 'br') {
      buffer += ' ';
    } else if (BLOCK_TAGS.has(tag)) {
      flush();
      kind = closing ? 'text' : kindOf(tag);
    }
  }
  flush();
  return blocks;
}

/** @returns {{ kind: 'heading' | 'item' | 'text', text: string }[]} */
function releaseNoteBlocks(notes) {
  const source = notesSource(notes);
  const blocks = /<[a-zA-Z!/]/.test(source) ? htmlBlocks(source) : markdownBlocks(source);
  // A body opening on "Achievement Watcher Next 3.12.0" repeats the window's own title.
  if (blocks[0] && blocks[0].kind === 'heading' && /\d+\.\d+/.test(blocks[0].text)) blocks.shift();
  return blocks.slice(0, MAX_BLOCKS).map((block) => ({
    kind: block.kind,
    text: block.text.length > MAX_TEXT ? `${block.text.slice(0, MAX_TEXT - 1)}…` : block.text,
  }));
}

module.exports = { releaseNoteBlocks };
