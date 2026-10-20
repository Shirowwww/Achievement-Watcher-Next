/*
  SAN's notification page (src/notify/base.ts, see SOURCES.md) inside an AW Next preset page: the
  same custom properties, body attributes and text slots, so SAN's cards in ./layouts read every
  option a theme carries. UMD so the pure parts run under node:test as well as inlined in the page.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AWSanEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /*
    What changes with the base card a theme was built on. `partial` cards shift their text up a slot
    when the theme shows fewer than three lines; `fastBelow` cards play a quicker animation under
    that many seconds on screen; `score` cards print a gamerscore on their text lines.
  */
  const LAYOUTS = {
    default: { width: 300, height: 50 },
    xqjan: { width: 353, height: 58, fastBelow: 8 },
    steamdeck: { width: 300, height: 50, partial: true },
    epicgames: { width: 325, height: 100, partial: true, unit: ' XP', keepDecoration: true },
    xboxone: { width: 300, height: 50, fastBelow: 8, score: true },
    xbox360: { width: 300, height: 45, score: true, unit: 'G' },
    ps5: { width: 300, height: 50, partial: true },
    ps4: { width: 300, height: 45, offset: 0 },
    ps3: { width: 300, height: 65 },
    windows: { width: 300, height: 100 },
    gfwl: { width: 300, height: 75, offset: 0, score: true, unit: 'G' },
  };
  const LAYOUT_IDS = Object.keys(LAYOUTS);
  const FALLBACK_LAYOUT = 'default';

  // The element ids a layout fills; every layout carries all three, hidden or not.
  const TEXT_SLOTS = ['unlockmsg', 'title', 'desc'];

  // SAN's tier names for an unlock rate, rarest last.
  const TYPES = ['main', 'semi', 'rare', 'plat'];

  const BADGE_ANCHORS = {
    topleft: ['20%', '10%'],
    topcenter: ['50%', '10%'],
    topright: ['80%', '10%'],
    bottomleft: ['20%', '90%'],
    bottomcenter: ['50%', '90%'],
    bottomright: ['80%', '90%'],
  };

  function layoutOf(id) {
    return Object.prototype.hasOwnProperty.call(LAYOUTS, id) ? id : FALLBACK_LAYOUT;
  }

  // Number(null) and Number('') are 0, which would read a missing setting as a real zero.
  function num(value, fallback) {
    if (value == null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  // SAN's own defaults for its two rarity cut-offs, in percent.
  const DEFAULT_RARITY = 10;
  const DEFAULT_SEMIRARITY = 25;

  function cutOffs(thresholds) {
    return {
      rarity: num(thresholds && thresholds.rarity, DEFAULT_RARITY),
      semirarity: num(thresholds && thresholds.semirarity, DEFAULT_SEMIRARITY),
    };
  }

  /*
    Which of the four SAN themes paints this unlock. A completion is always `plat`; otherwise the
    unlock rate against the theme's own two cut-offs, and an unknown rate is an ordinary unlock.
  */
  function notifyType(percent, thresholds, platinum) {
    if (platinum) return 'plat';
    if (percent == null || percent === '') return 'main';
    const value = Number(percent);
    if (!Number.isFinite(value)) return 'main';
    const cut = cutOffs(thresholds);
    if (value <= cut.rarity) return 'rare';
    if (value <= cut.semirarity) return 'semi';
    return 'main';
  }

  /*
    The state for AW Next's own rarity tier, so an imported theme follows the cut-offs and the mode
    set in AW Next like every other preset. Rare mode grades only the rarest: gold and silver are
    SAN's rare, bronze its semi-rare. Trophy mode grades everything, one state per grade. A payload
    with no tier at all (from an older build) falls back to the theme's own cut-offs.
  */
  const TIER_STATE = { platinum: 'plat', gold: 'rare', silver: 'semi', bronze: 'main' };
  function stateOf(opts) {
    const o = opts || {};
    if (o.platinum || o.tier === 'platinum') return 'plat';
    if (typeof o.tier !== 'string') return notifyType(o.percent, o.thresholds, false);
    if (o.tier === 'bronze' && o.mode !== 'trophy') return 'semi';
    if (o.tier === 'silver' && o.mode !== 'trophy') return 'rare';
    return TIER_STATE[o.tier] || 'main';
  }

  // The tier a state paints its per-tier pictures and glow with, as SAN pairs them.
  const STATE_TIER = { plat: 'gold', rare: 'gold', semi: 'silver', main: 'bronze' };

  // bronze/silver/gold for an unlock rate, by the same two cut-offs.
  function tierOf(percent, thresholds) {
    const value = num(percent, 100);
    const cut = cutOffs(thresholds);
    if (value <= cut.rarity) return 'gold';
    if (value <= cut.semirarity) return 'silver';
    return 'bronze';
  }

  /*
    The three lines a popup prints. SAN's "custom text" replaces any of them with a fixed string or
    the game's title; a completion has its own wording. `strings` holds the localized defaults.
  */
  function textLines(customisation, info, strings) {
    const c = customisation || {};
    const s = strings || {};
    const platinum = info.type === 'plat';
    const game = String(info.gameName || '').trim() || s.gameTitle || '';
    const custom = (slot) => {
      if (!c.usecustomtext) return '';
      if (c['usegametitle' + slot]) return game;
      return String(c['customtext' + slot] || '');
    };
    return {
      unlockmsg: custom('unlockmsg') || (platinum ? s.congrats : s.unlocked) || '',
      title: custom('title') || String(info.title || ''),
      desc: custom('desc') || String(info.desc || ''),
    };
  }

  // The percentage as SAN prints it: one decimal, never below 0.1.
  function percentValue(percent) {
    return Math.max(Math.round(num(percent, 0) * 10) / 10, 0.1);
  }

  /*
    Every custom property SAN's page sets, from one customisation. `ctx.url(value)` turns a theme
    asset into something a stylesheet can load; nothing here touches the DOM.
  */
  function computeProperties(customisation, ctx) {
    const c = customisation || {};
    const url = ctx.url || ((value) => value);
    const percent = num(ctx.percent, 100);
    const thresholds = ctx.thresholds || {};
    const tier = ctx.tier || tierOf(percent, thresholds);
    const scale = num(c.scale, 100) / 100;
    const layout = layoutOf(c.preset);
    const props = {};
    const set = (name, value) => {
      props['--' + name] = value;
    };
    const cssUrl = (value) => {
      const resolved = value ? url(value) : '';
      return resolved ? "url('" + String(resolved).replace(/['\\]/g, '\\$&') + "')" : '';
    };
    const byTier = (bronze, silver, gold) => (tier === 'bronze' ? bronze : tier === 'silver' ? silver : gold);
    const sizeOf = (key) => (c.usecustomfontsizes ? num(c[key], 100) : num(c.fontsize, 100)) / 100;
    const colorOf = (key) => (c.usecustomfontcolors ? c[key] : c.fontcolor);

    set('displaytime', num(c.displaytime, 10) + 's');
    set('scale', String(scale));
    set('gradientangle', num(c.gradientangle, 90) + 'deg');
    set('bgimg', ctx.background ? cssUrl(ctx.background) : 'none');
    set('bgimgbrightness', num(c.bgimgbrightness, 100) + '%');
    set('brightness', num(c.brightness, 100) + '%');
    set('roundness', (num(c.roundness, 25) / 4) * scale + 'px');
    set('fontsize', String(c.usecustomfontsizes ? 1 : num(c.fontsize, 100) / 100));
    set('opacity', String(num(c.opacity, 100) / 100));
    set('iconroundness', num(c.iconroundness, 0) === 100 ? '50%' : (num(c.iconroundness, 0) / 6) * scale + 'px');
    set('fontoutline', c.fontoutline ? scale * num(c.fontoutlinescale, 1) + 'px ' + c.fontoutlinecolor : 'none');
    set(
      'fontshadow',
      c.fontshadow
        ? ('drop-shadow(' + num(c.fontshadowx, 0) + 'px ' + num(c.fontshadowy, 0) + 'px ' + scale * num(c.fontshadowscale, 1.5) + 'px ' + c.fontshadowcolor + ') ').repeat(3)
        : 'none'
    );

    // The logo and decoration a base card draws, per card, optionally one picture per tier.
    const icons = (c.customicons && c.customicons[c.preset]) || {};
    const iconUrl = (kind) => {
      const which = kind === 'logo' && icons.decoration && c.replacelogo ? 'decoration' : kind;
      const value = icons[which];
      if (!value) return '';
      return Array.isArray(value) ? cssUrl(byTier(value[0], value[1], value[2])) : cssUrl(value);
    };
    set('logo', iconUrl('logo'));
    set('decoration', iconUrl('decoration'));
    set('decorationdisplaytype', 'block');

    set('gs', c.usepercent ? percent.toFixed(1) : String(100 - Math.round(percent / 5) * 5));
    set('unit', c.usepercent ? '%' : LAYOUTS[layout].unit || '');
    set('raritycolor', byTier('#a05526', '#828282', '#b4904a'));
    set('hiddenicon', c.hiddenicon ? cssUrl(c.hiddenicon) : ctx.lockIcon ? cssUrl(ctx.lockIcon) : 'none');
    set('glow', c.glow ? 'drop-shadow(' + (num(c.glowx, 0) * scale) / 10 + 'px ' + (num(c.glowy, 0) * scale) / 10 + 'px var(--glowsize) var(--glowcolor))' : 'none');
    set('glowsize', (num(c.glowsize, 50) / 100) * 0.6 + 'rem');
    set('glowcolor', c.glowrarity ? byTier(c.glowcolorbronze, c.glowcolorsilver, c.glowcolorgold) : c.glowcolor);
    set('glowanim', c.glow && c.glowanim && c.glowanim !== 'off' ? c.glowanim + ' calc(var(--transition) * var(--glowspeed)) linear infinite' : 'none');
    set('glowspeed', String(num(c.glowspeed, 50)));
    set('blur', (num(c.blur, 0) * scale) / 50 + 'px');
    set('mask', c.mask && c.maskimg ? cssUrl(c.maskimg) + ' center / cover no-repeat' : 'none');
    set('outline', c.useoutline ? c.outline || 'solid' : 'none');
    set('outlinecolor', c.outlinecolor);
    set('outlinewidth', (num(c.outlinewidth, 50) / 25) * scale + 'px');

    const anchor = BADGE_ANCHORS[c.percentbadgepos] || BADGE_ANCHORS.bottomcenter;
    const badgeX = num(c.percentbadgex, 0) * scale;
    const badgeY = num(c.percentbadgey, 0) * scale;
    set('badgeposx', 'calc(' + anchor[0] + ' + ' + badgeX + 'px) calc(' + (100 - parseInt(anchor[0], 10)) + '% - ' + badgeX + 'px)');
    set('badgeposy', 'calc(' + anchor[1] + ' + ' + badgeY + 'px) 0');
    set('badgecolor', c.percentbadgecolor);
    set('badgefontcolor', c.percentbadgefontcolor);
    set('badgesize', (num(c.percentbadgefontsize, 100) / 10) * scale + 'px');
    const badgeRound = num(c.percentbadgeroundness, 50);
    set('badgeroundness', badgeRound === 100 ? '50%' : num(c.percentbadgefontsize, 100) / 4 / (badgeRound / 10) + 'px');
    set('badgeimg', c.percentbadgeimg ? cssUrl(byTier(c.percentbadgeimgbronze, c.percentbadgeimgsilver, c.percentbadgeimggold)) || ctx.badgeIcon || 'none' : 'none');

    set('iconscale', String(num(c.iconscale, 100) / 100));
    set('iconshadowcolor', String(c.iconshadowcolor || ''));
    set('iconanimcolor', String(c.iconanimcolor || ''));
    set('logoscale', String(num(c.logoscale, 100) / 100));
    set('decorationscale', String(num(c.decorationscale, 100) / 100));
    set('unlockmsgfontsize', String(sizeOf('unlockmsgfontsize')));
    set('titlefontsize', String(sizeOf('titlefontsize')));
    set('descfontsize', String(sizeOf('descfontsize')));
    set('unlockmsgfontcolor', String(colorOf('unlockmsgfontcolor') || ''));
    set('titlefontcolor', String(colorOf('titlefontcolor') || ''));
    set('descfontcolor', String(colorOf('descfontcolor') || ''));
    const border = c.iconborderrarity ? byTier(c.iconborderimgbronze, c.iconborderimgsilver, c.iconborderimg) : c.iconborderimg;
    set('iconborder', c.showiconborder ? cssUrl(border) : '');
    set('iconborderpos', c.iconborderpos === 'back' ? '-1' : '99');
    set('iconborderscale', String(num(c.iconborderscale, 100) / 100));
    set('iconborderx', String(num(c.iconborderx, 0)));
    set('iconbordery', String(num(c.iconbordery, 0)));
    set('textvspace', String(num(c.textvspace, 0)));

    for (const key of ['primarycolor', 'secondarycolor', 'tertiarycolor', 'fontcolor']) set(key, String(c[key] || ''));

    // A theme that hides its decoration hides the slot too, except on the card whose layout is built
    // around it.
    if (!num(c.decorationpos, 0) && !LAYOUTS[layout].keepDecoration) {
      set('decoration', 'none');
      set('decorationdisplaytype', 'none');
    }
    set('decorationindex', String(num(c.decorationpos, 0)));
    return props;
  }

  /*
    The body attributes a layout styles against: the state, the background style, the screen
    position, and a few switches. Returned as a list so the page and the tests read the same thing.
  */
  function bodyAttributes(customisation, ctx) {
    const c = customisation || {};
    const layout = LAYOUTS[layoutOf(c.preset)];
    const attrs = [ctx.type || 'main'];
    if (!c.iconanim) attrs.push('noiconanim');
    if (ctx.notify1line) attrs.push('notify1line');
    if (c.decorationshadow === false) attrs.push('nodecorationshadow');
    if (layout.fastBelow && num(c.displaytime, 10) < layout.fastBelow) attrs.push('fastanim');
    if (c.bgstyle) attrs.push(String(c.bgstyle));
    if (c.bgonly) attrs.push('bgonly');
    if (ctx.pos) attrs.push(String(ctx.pos));
    return attrs.filter((name) => /^[a-z][a-z0-9-]*$/.test(name));
  }

  /*
    What goes in each text slot: the decoration, lock and percentage are placed by their own
    position number (1-3) next to the line in that position. Returned as data, built into nodes by
    the page, so a theme's text is never parsed as markup.
  */
  function slotContents(customisation, ctx) {
    const c = customisation || {};
    const lines = ctx.lines || {};
    const elems = (Array.isArray(c.elems) ? c.elems : TEXT_SLOTS).filter((elem) => elem !== null && TEXT_SLOTS.includes(elem));
    const all = elems.length === 3;
    const shift = LAYOUTS[layoutOf(c.preset)].partial && !all ? 1 : 0;
    const placements = { unlockmsg: [1, 0], title: [2 - shift, 1 - shift], desc: [3 - shift, 2 - shift] };
    const at = (key, pos) => num(c[key + 'pos'], 0) !== 0 && num(c[key + 'pos'], 0) === pos;
    const slots = {};
    for (const slot of TEXT_SLOTS) {
      const [pos, index] = placements[slot];
      const text = elems[index] ? String(lines[elems[index]] || '') : '';
      const percent = at('percent', pos) && ctx.percentText ? ' ' + ctx.percentText : '';
      if (!text && !percent.trim()) {
        slots[slot] = null;
        continue;
      }
      slots[slot] = {
        decoration: at('decoration', pos),
        hiddenIcon: at('hiddenicon', pos) && Boolean(c.showhiddenicon) && Boolean(ctx.hidden),
        text: text,
        percent: percent,
      };
    }
    return { slots: slots, alldetails: all };
  }

  // The " (12.3%)" SAN appends to a line, or '' when its setting says not to.
  function percentSuffix(customisation, ctx) {
    if (customisation && customisation.percentbadge) return '';
    const show = ctx.showpercent || 'rareonly';
    const type = ctx.type;
    const shown = ((type === 'main' || type === 'semi') && show === 'all') || (type === 'rare' && show !== 'off');
    return shown ? '(' + percentValue(ctx.percent) + '%)' : '';
  }

  // ---- the page ----------------------------------------------------------------------------------

  function fillSlot(element, content) {
    while (element.firstChild) element.removeChild(element.firstChild);
    if (!content) return;
    const doc = element.ownerDocument;
    const marker = (id) => {
      const span = doc.createElement('span');
      span.id = id;
      return span;
    };
    if (content.decoration) element.appendChild(marker('decoration'));
    if (content.hiddenIcon) element.appendChild(marker('hiddenicon'));
    if (content.text) element.appendChild(doc.createTextNode(content.text));
    if (content.percent) element.appendChild(doc.createTextNode(content.percent));
    // A slot whose only content would be its markers is left empty, as an unused line.
    if (!element.textContent) while (element.firstChild) element.removeChild(element.firstChild);
  }

  /*
    Draws one notification. `opts.layoutHtml` is the base card's markup; `opts.customisation` the
    theme for this state with every asset already resolved through `opts.url`. Calls `opts.onEnd`
    when the card has played out and faded, which is when the host closes the window.
  */
  function render(opts) {
    const doc = opts.document || document;
    const body = doc.body;
    const html = doc.documentElement;
    const c = Object.assign({}, opts.customisation || {});
    c.preset = layoutOf(c.preset);
    // The host zooms the whole page to the chosen size, so the theme is drawn at its design size.
    c.scale = 100;
    const info = opts.info || {};
    const type = TYPES.includes(info.type) ? info.type : 'main';

    for (const name of bodyAttributes(c, { type: type, notify1line: opts.notify1line, pos: opts.pos })) body.setAttribute(name, '');

    const mount = doc.getElementById('aw-san-card') || body;
    mount.insertAdjacentHTML('beforeend', opts.layoutHtml || '');
    const meta = mount.querySelector('meta[width]');
    // getAttribute answers null for a missing attribute, and Number(null) is 0, not "absent".
    const attr = (name, fallback) => (meta && meta.hasAttribute(name) ? num(meta.getAttribute(name), fallback) : fallback);
    const dims = {
      width: attr('width', LAYOUTS[c.preset].width),
      height: attr('height', LAYOUTS[c.preset].height),
      offset: attr('offset', LAYOUTS[c.preset].offset != null ? LAYOUTS[c.preset].offset : 20),
    };
    html.style.setProperty('--notifywidth', dims.width + 'px');
    html.style.setProperty('--notifyheight', dims.height + 'px');

    const url = opts.url || ((value) => value);
    let icon = info.icon || '';
    if (c.usecustomimgicon && c.customimgicon) icon = url(c.customimgicon);
    else if (c.usegameicon) icon = (c.gameicontype === 'logo' ? info.gameLogo : info.gameIcon) || info.icon || '';
    for (const img of doc.querySelectorAll('#achicon')) {
      if (icon) img.setAttribute('src', icon);
      else img.removeAttribute('src');
    }

    const percent = percentValue(info.percent);
    const thresholds = opts.thresholds || {};
    if (c.percentbadge) {
      for (const wrapper of doc.querySelectorAll('.wrapper#achiconwrapper')) {
        const badge = doc.createElement('span');
        badge.id = 'badge';
        if (c.percentbadgeimg) badge.setAttribute('badgeimg', '');
        else badge.textContent = percent + '%';
        wrapper.appendChild(badge);
      }
    }

    const lines = textLines(c, Object.assign({}, info, { type: type }), opts.strings);
    const placed = slotContents(c, {
      lines: lines,
      hidden: info.hidden,
      percentText: percentSuffix(c, { type: type, percent: info.percent, showpercent: opts.showpercent }),
    });
    body.toggleAttribute('alldetails', placed.alldetails);
    for (const slot of TEXT_SLOTS) {
      const element = doc.getElementById(slot);
      if (element) fillSlot(element, placed.slots[slot]);
    }

    let background = '';
    if (c.bgstyle === 'bgimg') background = c.bgachicon ? icon : c.bgimg ? url(c.bgimg) : '';
    else if (c.bgstyle === 'gameart') background = info.gameArt || '';

    const props = computeProperties(c, {
      url: url,
      percent: percent,
      tier: STATE_TIER[type],
      thresholds: thresholds,
      background: background,
      lockIcon: opts.lockIcon,
      badgeIcon: opts.badgeIcon,
    });

    // Score cards print the gamerscore from attributes, on a dedicated wrapper or their text lines.
    if (LAYOUTS[c.preset].score || doc.getElementById('xpwrapper')) {
      const wrapper = doc.getElementById('xpwrapper');
      const targets = wrapper ? [wrapper] : [doc.getElementById('title'), doc.getElementById('desc')];
      if (targets.every(Boolean)) {
        for (const target of targets) {
          target.setAttribute('gs', props['--gs']);
          target.setAttribute('unit', props['--unit']);
        }
      }
    }

    if (c.customfont) {
      const face = doc.createElement('style');
      face.id = 'aw-san-font';
      face.textContent =
        '@font-face { font-family: "customfont"; src: url("' + String(url(c.customfont)).replace(/["\\]/g, '\\$&') + '"); }\n' +
        '.wrapper#achcont > .wrapper#achcontent { font-family: "customfont" !important; }';
      doc.head.appendChild(face);
    }

    for (const name of Object.keys(props)) html.style.setProperty(name, props[name]);
    html.style.setProperty('--bodyopacity', '1');

    // The card says when it is done: SAN's `animend` runs for the display time, then the page fades.
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      if (typeof opts.onEnd === 'function') opts.onEnd();
    };
    body.addEventListener('animationend', (event) => {
      if (event.animationName !== 'animend') return;
      body.addEventListener('transitionend', (fade) => {
        if (fade.propertyName === 'opacity') finish();
      });
      html.style.setProperty('--bodyopacity', '0');
      // A layout without a fade transition would never answer; give it the transition's own length.
      setTimeout(finish, 1500);
    });

    const images = Array.from(doc.querySelectorAll('img'));
    if (background) {
      const probe = new doc.defaultView.Image();
      probe.src = background;
      images.push(probe);
    }
    return { dims: dims, type: type, images: images };
  }

  // Resolves once every picture the card needs has loaded or failed, so the first frame is whole.
  function whenImagesSettle(images, timeoutMs) {
    const pending = (images || []).filter((img) => img && img.getAttribute && img.getAttribute('src') && !img.complete);
    if (!pending.length) return Promise.resolve();
    return new Promise((resolve) => {
      let left = pending.length;
      const done = () => {
        left -= 1;
        if (left <= 0) resolve();
      };
      for (const img of pending) {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
      setTimeout(resolve, timeoutMs || 3000);
    });
  }

  return {
    LAYOUTS: LAYOUTS,
    LAYOUT_IDS: LAYOUT_IDS,
    TYPES: TYPES,
    TEXT_SLOTS: TEXT_SLOTS,
    layoutOf: layoutOf,
    notifyType: notifyType,
    stateOf: stateOf,
    tierOf: tierOf,
    textLines: textLines,
    percentValue: percentValue,
    percentSuffix: percentSuffix,
    computeProperties: computeProperties,
    bodyAttributes: bodyAttributes,
    slotContents: slotContents,
    render: render,
    whenImagesSettle: whenImagesSettle,
  };
});
