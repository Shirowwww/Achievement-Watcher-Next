'use strict';

/*
  Every Achievement Watcher Next address the app can send a user to, in one place.

  Scattered literals drift: the repository was renamed once already, and a link buried in a
  template string is not something a rename sweep finds. `test/core/links.test.js` asserts that no
  UI file builds one of these by hand and that every docs slug below is a real page under docs/.

  The site is GitHub Pages serving docs/ (see docs/_config.yml), so a docs page is its Markdown
  file name with .html - keep DOCS in step with the files in that folder.
*/

const REPO = 'https://github.com/Shirowwww/Achievement-Watcher-Next';
const SITE = 'https://shirowwww.github.io/Achievement-Watcher-Next';

/*
  Slug -> the docs/<slug>.md that backs it.

  The root of the site is the project home page (docs/index.html), not a guide, so the hub of the
  documentation is docs/README.md served at README.html - which is what `home` means here and where
  the app's Documentation button goes. `docs/_config.yml` disables jekyll-readme-index for the same
  reason.
*/
const DOCS = {
  home: 'README',
  gettingStarted: 'getting-started',
  sources: 'sources',
  notifications: 'notifications',
  presets: 'presets',
  overlay: 'overlay',
  controller: 'controller',
  gameHealth: 'game-health',
  troubleshooting: 'troubleshooting',
  faq: 'faq',
  advanced: 'advanced',
  emulatorSetup: 'emulator-setup',
  goldbergGbe: 'goldberg-gbe',
  uplayR2: 'uplay-r2',
  comparison: 'comparison',
  architecture: 'architecture',
  presetGallery: 'preset-gallery',
};

// A page of the documentation site, by the keys above. Unknown names fall back to its home page
// rather than to a 404.
function docs(page = 'home') {
  const slug = Object.prototype.hasOwnProperty.call(DOCS, page) ? DOCS[page] : DOCS.home;
  return slug ? `${SITE}/${slug}.html` : `${SITE}/`;
}

// A tracked file at the repository root, for the documents the site does not publish.
function repoFile(name) {
  return `${REPO}/blob/main/${name}`;
}

const links = {
  REPO,
  SITE,
  DOCS,
  docs,
  repoFile,

  home: REPO,
  website: `${SITE}/`,
  // The gallery is a folder with its own index.html, so it has no .md and is not a DOCS slug.
  presetGallery: `${SITE}/gallery/`,
  releases: `${REPO}/releases`,
  download: `${REPO}/releases/latest`,
  issues: `${REPO}/issues`,
  newIssue: `${REPO}/issues/new/choose`,
  discussions: `${REPO}/discussions`,
  changelog: `${REPO}/blob/main/CHANGELOG.md`,
  security: `${REPO}/blob/main/SECURITY.md`,
  contributing: `${REPO}/blob/main/CONTRIBUTING.md`,
  license: `${REPO}/blob/main/LICENSE`,

  documentation: docs('home'),
  gettingStarted: docs('gettingStarted'),
  troubleshooting: docs('troubleshooting'),
  presets: docs('presets'),
  notifications: docs('notifications'),
  overlay: docs('overlay'),
  controller: docs('controller'),
  sources: docs('sources'),
  gameHealth: docs('gameHealth'),
  faq: docs('faq'),
  presetGalleryGuide: docs('presetGallery'),

  // The projects AW Next descends from, shown in the About and Advanced panels.
  upstream: {
    fork: 'https://github.com/darktakayanagi/Achievement-Watcher',
    original: 'https://github.com/xan105/Achievement-Watcher',
  },
};

module.exports = links;
