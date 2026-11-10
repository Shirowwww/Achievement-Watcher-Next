'use strict';

/*
  The game page's overview, shown first when a game opens: its trailer playing muted behind the
  title, the actions (play, achievements, captures, cover, Game health, settings), the store's
  description, trailers and screenshots, help links, souvenirs, ratings and details. The host
  (app.js) passes the game and the callbacks; every store field is optional (util/gameDetails.js).
  Text goes in with textContent, and a store link or stream is used only when it is https.
*/
(function () {
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
  const SOUVENIRS_SHOWN = 8;
  let state = null;

  const el = (tag, className, attrs = {}) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const text = (tag, className, value) => {
    const node = el(tag, className);
    node.textContent = value;
    return node;
  };
  const https = (value) => (typeof value === 'string' && /^https:\/\//i.test(value) ? value : '');
  const fa = (name) => el('i', `fas ${name}`, { 'aria-hidden': 'true' });

  function button(className, label, icon, onClick) {
    const node = el('button', `btn ${className}`.trim(), { type: 'button' });
    if (icon) node.append(fa(icon));
    if (label) node.append(text('span', '', label));
    node.addEventListener('click', onClick);
    return node;
  }

  // --- The muted trailer behind the title: plays only on screen, window shown, nothing on top ---

  function syncHero() {
    const video = state && state.heroVideo;
    if (!video) return;
    const allowed = !REDUCED.matches && state.heroSeen && !document.hidden && !state.viewerOpen && state.root.isConnected && !state.root.hidden;
    if (allowed) {
      if (!video.src) video.src = video.dataset.src;
      video.play().catch(() => {});
    } else video.pause();
  }

  // A banner from the host may be a cached local file; anything else must be https.
  const pictureUrl = (value) => (typeof value === 'string' && /^file:\/\//i.test(value) ? value : https(value));

  // Under the trailer (which fades in over it) or alone when there is none, so the top is never an empty band.
  function paintHeroArt(url) {
    const image = el('img', 'game-overview-hero-art', { alt: '', decoding: 'async' });
    // A picture that never loads stays transparent: the page picture behind it shows through.
    image.addEventListener('load', () => image.classList.add('is-ready'), { once: true });
    image.src = url;
    state.hero.prepend(image);
  }

  // Plays every trailer in turn, then starts over at the first; a single one simply loops.
  function mountHeroVideo(hero, streams) {
    const video = el('video', 'game-overview-hero-video', { muted: '', playsinline: '', preload: 'none', 'aria-hidden': 'true' });
    video.muted = true;
    video.loop = streams.length === 1;
    let index = 0;
    video.dataset.src = streams[0];
    // The banner under it would show through the shared fade: it steps aside once the trailer plays.
    video.addEventListener('playing', () => {
      video.classList.add('is-ready');
      hero.classList.add('has-video');
    });
    video.addEventListener('ended', () => {
      index = (index + 1) % streams.length;
      video.src = video.dataset.src = streams[index];
      syncHero();
    });
    // A stream that fails leaves the page picture behind it, as if there were no trailer.
    video.addEventListener('error', () => {
      hero.classList.remove('has-video');
      video.remove();
      if (state && state.heroVideo === video) state.heroVideo = null;
    }, { once: true });
    hero.prepend(video);
    state.heroVideo = video;
    state.heroObserver = new IntersectionObserver(([entry]) => {
      state.heroSeen = entry.isIntersecting;
      syncHero();
    }, { threshold: 0.25 });
    state.heroObserver.observe(video);
  }

  // --- The theatre is the captures viewer: same keys, gamepad and look ---

  function openViewer(items, index, title) {
    if (!window.CaptureViewer || items.length === 0) return;
    state.viewerOpen = true;
    syncHero();
    window.CaptureViewer.open({
      title,
      subtitle: state.game.title,
      items,
      index,
      inset: 30,
      strings: state.host.viewerStrings,
      formatDate: state.host.formatDate,
      onReveal: items.some((item) => item.local) ? state.host.revealCapture : undefined,
      onClose: () => {
        if (!state) return;
        state.viewerOpen = false;
        syncHero();
      },
    });
  }

  function mediaItems(details) {
    // Epic lists some trailers with no picture: the game's own background stands in for a black box.
    const fallbackThumb = https(details.background);
    const videos = (details.videos || [])
      .filter((video) => !video.silent)
      .map((video) => ({ kind: video.youtube ? 'youtube' : 'clip', url: https(video.hls || video.file), youtube: video.youtube, thumb: https(video.thumbnail) || fallbackThumb, name: video.name || '' }))
      .filter((item) => item.url || item.youtube);
    const shots = (details.screenshots || []).map((shot) => ({ kind: 'screenshot', url: https(shot.full), thumb: https(shot.thumb || shot.full), name: '' })).filter((item) => item.url);
    return [...videos, ...shots];
  }

  // What the theatre can show: YouTube trailers open in the browser instead.
  const playableOf = (items) => items.filter((item) => item.kind !== 'youtube');

  function thumb(item, label, onOpen) {
    const node = el('button', 'game-overview-thumb', { type: 'button', 'aria-label': label });
    const image = el('img', '', { alt: '', loading: 'lazy', decoding: 'async' });
    if (item.thumb) image.src = item.thumb;
    node.append(image);
    if (item.kind !== 'screenshot') {
      const play = el('span', 'game-overview-thumb-play', { 'aria-hidden': 'true' });
      play.append(fa(item.kind === 'youtube' ? 'fa-external-link-alt' : 'fa-play'));
      node.append(play);
    }
    node.addEventListener('click', onOpen);
    return node;
  }

  // One row of videos and screenshots, paged by two arrows that grey out at the ends.
  function mediaSection(items) {
    const { t } = state.host;
    const section = el('section', 'game-overview-section');
    const head = el('h2', 'game-overview-title');
    head.append(text('span', '', t('game-page-media', 'Trailers and screenshots', 'Bandes-annonces et captures')));
    const navs = el('span', 'game-overview-navs');
    const rail = el('div', 'game-overview-rail');
    const prev = button('game-overview-nav', '', 'fa-chevron-left', () => page(-1));
    const next = button('game-overview-nav', '', 'fa-chevron-right', () => page(1));
    prev.setAttribute('aria-label', t('capture-viewer-previous', 'Previous', 'Précédent'));
    next.setAttribute('aria-label', t('capture-viewer-next', 'Next', 'Suivant'));
    navs.append(prev, next);
    head.append(navs);
    const page = (direction) => rail.scrollBy({ left: direction * rail.clientWidth, behavior: REDUCED.matches ? 'auto' : 'smooth' });
    const update = () => {
      prev.disabled = rail.scrollLeft <= 2;
      next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
    };
    rail.addEventListener('scroll', update, { passive: true });
    const playable = playableOf(items);
    const shots = items.filter((item) => item.kind === 'screenshot');
    items.forEach((item) => {
      // An unnamed trailer (Epic gives none) is still a trailer to a screen reader.
      const label =
        item.name ||
        (item.kind === 'screenshot' ? t('game-page-screenshot', 'Screenshot {number}', 'Capture {number}', { number: shots.indexOf(item) + 1 }) : t('game-page-trailer', 'Trailer', 'Bande-annonce'));
      rail.append(
        thumb(item, label, () => {
          if (item.kind === 'youtube') state.host.openExternal(`https://www.youtube.com/watch?v=${encodeURIComponent(item.youtube)}`);
          else openViewer(playable, playable.indexOf(item), state.game.title);
        })
      );
    });
    section.append(head, rail);
    requestAnimationFrame(update);
    return section;
  }

  function linksSection(title, links, icon) {
    const section = el('section', 'game-overview-section');
    section.append(text('h2', 'game-overview-title', title));
    const chips = el('div', 'game-overview-chips');
    for (const link of links) {
      const chip = button('game-overview-chip', link.label, icon, () => state.host.openLink(link));
      chips.append(chip);
    }
    section.append(chips);
    return section;
  }

  function souvenirsSection() {
    const { t } = state.host;
    const section = el('section', 'game-overview-section game-overview-souvenirs');
    section.append(text('h2', 'game-overview-title', t('game-page-souvenirs', 'Souvenirs', 'Souvenirs')));
    const body = el('div', 'game-overview-souvenir-grid');
    section.append(body);
    state.souvenirBody = body;
    return section;
  }

  function fillSouvenirs(items) {
    const { t } = state.host;
    const body = state.souvenirBody;
    body.replaceChildren();
    state.captureButton.hidden = items.length === 0;
    if (items.length === 0) {
      const empty = el('div', 'game-overview-empty');
      empty.append(fa('fa-camera-retro'), text('span', '', t('game-page-souvenirs-empty', 'No souvenir of this game yet. The screenshots and clips taken when an achievement unlocks land here.', "Pas encore de souvenir de ce jeu. Les captures et les clips pris au déblocage d'un succès arrivent ici.")));
      body.append(empty);
      return;
    }
    const title = t('game-page-captures', 'Screenshots and clips', 'Captures et clips');
    items.slice(0, SOUVENIRS_SHOWN).forEach((item, i) => {
      body.append(thumb({ kind: item.kind === 'clip' ? 'clip' : 'screenshot', thumb: item.kind === 'clip' ? '' : item.url }, item.name || title, () => openViewer(items, i, title)));
    });
  }

  // A row with a page of its own (a rating's store or review page) is a button that opens it.
  function rowsPanel(rows) {
    const panel = el('div', 'game-overview-rows');
    for (const [label, value, url] of rows) {
      const page = https(url);
      const row = page ? el('button', 'game-overview-row is-link', { type: 'button' }) : el('div', 'game-overview-row');
      row.append(text('span', 'game-overview-row-label', label), value instanceof Node ? value : text('span', '', value));
      if (page) row.addEventListener('click', () => state.host.openExternal(page));
      panel.append(row);
    }
    return panel;
  }

  const ratingSource = (source) => {
    if (source === 'metacritic-users') return state.host.t('game-page-metacritic-players', 'Metacritic players', 'Joueurs Metacritic');
    return { metacritic: 'Metacritic', gamesdb: 'GamesDB', microsoft: 'Microsoft Store', epic: 'Epic Games Store', gog: 'GOG', steam: 'Steam' }[source] || '';
  };
  const localNumber = (value, options) => Number(value).toLocaleString(document.documentElement.lang || undefined, options);
  const SCALES = [5, 10, 100];

  // Metacritic's press score as its badge, the others out of their own scale; each with how many reviewed when known.
  function ratingValue(rating) {
    const { t } = state.host;
    const value = el('span', 'game-overview-rating');
    const params = { count: localNumber(rating.count) };
    if (rating.source === 'metacritic') {
      value.append(text('span', 'game-overview-score is-metacritic', String(rating.score)));
      if (rating.count > 0) value.append(text('span', 'game-overview-rating-count', t('game-page-critic-count', '{count} critic reviews', '{count} critiques', params)));
      return value;
    }
    // Steam says the share of positive reviews, written the way the language writes a percentage.
    const score = rating.percent ? localNumber(rating.score / 100, { style: 'percent' }) : `${localNumber(rating.score)} / ${SCALES.includes(rating.outOf) ? rating.outOf : 100}`;
    value.append(text('span', 'game-overview-score is-plain', score));
    if (rating.count > 0) value.append(text('span', 'game-overview-rating-count', t('game-page-rating-count', '{count} ratings', '{count} avis', params)));
    return value;
  }

  function asideSection(details) {
    const { t } = state.host;
    const aside = el('aside', 'game-overview-aside');
    const ratings = (details.ratings || []).filter((rating) => Number.isFinite(Number(rating.score)) && ratingSource(rating.source));
    if (ratings.length) {
      aside.append(text('h2', 'game-overview-title', t('game-page-ratings', 'Ratings', 'Évaluations')));
      aside.append(rowsPanel(ratings.map((rating) => [ratingSource(rating.source), ratingValue(rating), rating.url])));
    }
    const rows = [
      [t('game-page-genres', 'Genres', 'Genres'), (details.genres || []).join(', ')],
      [t('game-page-developer', 'Developer', 'Développeur'), (details.developers || []).join(', ')],
      [t('game-page-publisher', 'Publisher', 'Éditeur'), (details.publishers || []).join(', ')],
      [t('game-page-release', 'Release date', 'Date de sortie'), state.host.formatRelease(details.releaseDate)],
    ].filter(([, value]) => value);
    if (rows.length) {
      aside.append(text('h2', 'game-overview-title', t('game-page-details', 'Details', 'Détails')));
      aside.append(rowsPanel(rows));
    }
    return aside;
  }

  // --- Building the page ---

  // The achievements button carries the count; a live unlock repaints it without rebuilding the page.
  function paintProgress() {
    const node = state.achievementsButton;
    const { progress } = state.game;
    const { t } = state.host;
    node.querySelector('.game-overview-count').textContent = t('game-page-achievements', 'Achievements {unlocked} / {total}', 'Succès {unlocked} / {total}', progress);
    node.querySelector('.game-overview-progress').style.setProperty('--p', `${progress.percent}%`);
  }

  function heroSection() {
    const { t, actions } = state.host;
    const { game } = state;
    const hero = el('div', 'game-overview-hero');
    const back = button('game-overview-back', state.host.allGamesLabel, 'fa-chevron-left', actions.back);
    const block = el('div', 'game-overview-heading');
    const meta = text('div', 'game-overview-meta', '');
    state.metaLine = meta;
    // The host paints the game's icon here and gives it the same right-click menu as everywhere else.
    const titleRow = el('div', 'game-overview-title-row');
    state.icon = el('span', 'game-overview-icon');
    titleRow.append(state.icon, text('h1', 'game-overview-name', game.title));
    block.append(titleRow, meta);
    const bar = el('div', 'game-overview-actions');
    if (game.launchable) bar.append(button('is-play', t('game-page-play', 'Play', 'Jouer'), 'fa-play', actions.play));
    const achievements = button('is-achievements', '', 'fa-trophy', actions.achievements);
    achievements.append(text('span', 'game-overview-count', ''), el('span', 'game-overview-progress', { 'aria-hidden': 'true' }));
    achievements.lastChild.append(el('i'));
    state.achievementsButton = achievements;
    paintProgress();
    bar.append(achievements, el('span', 'game-overview-sep', { 'aria-hidden': 'true' }));
    state.trailerButton = button('', t('game-page-trailer', 'Trailer', 'Bande-annonce'), 'fa-play-circle', () => state.openTrailer && state.openTrailer());
    state.trailerButton.hidden = true;
    state.captureButton = button('', t('game-page-captures', 'Screenshots and clips', 'Captures et clips'), 'fa-camera', () => openViewer(state.souvenirs || [], 0, t('game-page-captures', 'Screenshots and clips', 'Captures et clips')));
    state.captureButton.hidden = true;
    bar.append(state.trailerButton, state.captureButton, button('', t('game-page-cover', 'Cover', 'Jaquette'), 'fa-image', actions.cover), button('', t('game-page-health', 'Game health', 'État du jeu'), 'fa-heartbeat', actions.health));
    const settings = button('is-icon', '', 'fa-cog', actions.settings);
    settings.setAttribute('aria-label', t('game-settings-menu', 'Game settings', 'Réglages du jeu'));
    settings.title = settings.getAttribute('aria-label');
    bar.append(settings);
    block.append(bar);
    hero.append(back, block);
    return hero;
  }

  function fillDetails(details) {
    const { t } = state.host;
    const { game } = state;
    const meta = [...(details && details.genres ? details.genres.slice(0, 3) : []), ...(details && details.developers ? details.developers.slice(0, 1) : [])];
    const release = details ? state.host.formatRelease(details.releaseDate) : '';
    state.metaLine.textContent = [...meta, release].filter(Boolean).join(' · ');
    const main = state.main;
    main.replaceChildren();
    const about = el('section', 'game-overview-section');
    about.append(text('h2', 'game-overview-title', t('game-page-about', 'About', 'À propos')));
    about.append(text('p', 'game-overview-about', details && details.description ? details.description : t('game-page-no-details', 'The stores have nothing to say about this game yet.', "Les stores n'ont rien à dire sur ce jeu pour l'instant.")));
    main.append(about);
    const items = details ? mediaItems(details) : [];
    if (items.length) main.append(mediaSection(items));
    const guides = game.links.filter((link) => link.kind === 'guide');
    const helps = game.links.filter((link) => link.kind !== 'guide');
    if (guides.length) main.append(linksSection(t('game-page-guides', 'Guides', 'Guides'), guides, 'fa-book'));
    if (helps.length) main.append(linksSection(t('game-page-links', 'Help and links', 'Aide et liens'), helps, 'fa-globe'));
    main.append(souvenirsSection());
    fillSouvenirs(state.souvenirs || []);
    state.aside.replaceWith((state.aside = details ? asideSection(details) : el('aside', 'game-overview-aside')));

    const firstClip = items.find((item) => item.kind === 'clip');
    if (firstClip) {
      const playable = playableOf(items);
      state.openTrailer = () => openViewer(playable, playable.indexOf(firstClip), game.title);
      state.trailerButton.hidden = false;
    }
    // The backdrop is muted anyway, so a trailer without its sound serves there too.
    const clips = items.filter((item) => item.kind === 'clip').map((item) => item.url);
    const backdrops = clips.length ? clips : [silentTrailer(details)].filter(Boolean);
    if (backdrops.length && !REDUCED.matches) mountHeroVideo(state.hero, backdrops);
  }

  const silentTrailer = (details) => ((details && details.videos) || []).filter((video) => video.silent).map((video) => https(video.file))[0] || '';

  function loadingState() {
    const { t } = state.host;
    const about = el('section', 'game-overview-section');
    about.append(text('h2', 'game-overview-title', t('game-page-about', 'About', 'À propos')));
    const skeleton = el('div', 'game-overview-skeleton', { role: 'status', 'aria-label': t('game-page-loading', 'Loading the store page…', 'Chargement de la page du store…') });
    skeleton.append(el('span'), el('span'), el('span'));
    about.append(skeleton);
    state.main.append(about);
  }

  function teardown() {
    if (!state) return;
    if (state.heroObserver) state.heroObserver.disconnect();
    if (state.heroVideo) {
      state.heroVideo.pause();
      state.heroVideo.removeAttribute('src');
      state.heroVideo.load();
    }
  }

  /*
    Shows the overview of `game` in `root`: { appid, title, launchable, progress: { unlocked, total,
    percent }, links }. The host gives t, actions (play, achievements, cover, health, settings, back),
    loadDetails, loadSouvenirs, openLink, openExternal, revealCapture, formatDate, formatRelease,
    viewerStrings and allGamesLabel. A second call for the same game keeps what is already there.
  */
  function show(root, game, host) {
    if (state && state.game.appid === game.appid && state.root === root) {
      state.game = game;
      state.host = host;
      paintProgress();
      return;
    }
    teardown();
    state = { root, game, host, souvenirs: [], heroSeen: false, viewerOpen: false };
    root.replaceChildren();
    state.hero = heroSection();
    state.main = el('div', 'game-overview-main');
    state.aside = el('aside', 'game-overview-aside');
    const body = el('div', 'game-overview-body');
    body.append(state.main, state.aside);
    root.append(state.hero, body);
    if (host.mountIcon) host.mountIcon(state.icon);
    loadingState();
    const current = state;
    // The banner art made for the top of a page, asked at once; the store's background stands in when there is none.
    const heroArt = Promise.resolve(host.loadHeroArt ? host.loadHeroArt() : null).catch(() => null);
    Promise.resolve(host.loadDetails())
      .catch(() => null)
      .then(async (details) => {
        if (state !== current) return;
        fillDetails(details);
        const art = pictureUrl(await heroArt) || https(details && details.background);
        if (state === current && art) paintHeroArt(art);
      });
    Promise.resolve(host.loadSouvenirs())
      .catch(() => [])
      .then((items) => {
        if (state !== current) return;
        state.souvenirs = Array.isArray(items) ? items : [];
        if (state.souvenirBody) fillSouvenirs(state.souvenirs);
        else state.captureButton.hidden = state.souvenirs.length === 0;
      });
  }

  // The page is leaving or another game opens: stop the trailer and forget the game.
  function reset() {
    teardown();
    if (state) state.root.replaceChildren();
    state = null;
  }

  // A view entering: fades up a few pixels, shorter than the page's own entrance.
  function enter(node) {
    if (REDUCED.matches) return node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
    return node.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE_OUT });
  }

  document.addEventListener('visibilitychange', syncHero);
  REDUCED.addEventListener('change', syncHero);

  window.GameOverview = { show, reset, enter, sync: syncHero, current: () => (state ? state.game.appid : null) };
})();
