/*
  The home page's feel under the hand: smooth scrolling, the hero receding under the figures, the
  marquee, the preset ring, the words that come into focus and the light and depth that answer the
  pointer. assets/css/effects.css holds the looks; without this file every part sits still and whole.
*/
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var observes = 'IntersectionObserver' in window;

  // A button leans a few pixels towards a pointer over it or just beside it, never into its neighbour.
  var MAGNET_REACH_PX = 16;
  var MAGNET_PULL_X = 0.08;
  var MAGNET_PULL_Y = 0.18;
  var MAGNET_MAX_PX = 6;
  var TILT_X_DEG = 6;
  var TILT_Y_DEG = 8;
  var SWIPE_PX = 40;

  function each(selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn);
  }

  function headHeight() {
    var head = document.querySelector('.site-head');
    return head ? head.offsetHeight : 0;
  }

  function setupScroll() {
    if (reduced || typeof window.Lenis !== 'function') return;
    new window.Lenis({ autoRaf: true, lerp: 0.1, anchors: { offset: -headHeight() } });
  }

  // --recede goes from 0 to 1 while the figures slide up over the pinned hero.
  function setupRecede() {
    var pin = document.querySelector('.hero-pin');
    var hero = pin && pin.querySelector('.hero');
    var sheet = pin && pin.querySelector('.strip');
    if (!hero || !sheet || reduced) return;

    var queued = false;
    function update() {
      queued = false;
      var view = window.innerHeight;
      var head = headHeight();
      var progress = (view - sheet.getBoundingClientRect().top) / Math.max(1, view - head);
      hero.style.setProperty('--recede', Math.min(1, Math.max(0, progress)).toFixed(3));
    }
    function queue() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(update);
    }
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    update();
  }

  // Each heading becomes a row of words, so they can come into focus one after the other. The
  // translation overlay rewrites the text, so the words are cut again every time it does.
  function splitWords(node) {
    var words = node.textContent.trim().split(/\s+/);
    node.textContent = '';
    node.style.setProperty('--wn', String(words.length));
    words.forEach(function (word, index) {
      if (index) node.appendChild(document.createTextNode(' '));
      var span = document.createElement('span');
      span.className = 'w';
      span.style.setProperty('--w', String(index));
      span.textContent = word;
      node.appendChild(span);
    });
  }

  function setupWords() {
    each('[data-split]', splitWords);
    document.addEventListener('aw-i18n-applied', function () {
      each('[data-split]', splitWords);
    });
  }

  // The track holds the list twice; it only runs while it can be seen.
  function setupMarquee() {
    var marquee = document.querySelector('[data-marquee]');
    var track = marquee && marquee.querySelector('.marquee-track');
    if (!track) return;
    Array.prototype.slice.call(track.children).forEach(function (item) {
      track.appendChild(item.cloneNode(true));
    });
    if (reduced || !observes) return;
    new IntersectionObserver(function (entries) {
      marquee.classList.toggle('is-running', entries[entries.length - 1].isIntersecting);
    }).observe(marquee);
  }

  /*
    The preset ring. The tab list stays the control (site.js selects the tab and describes the
    preset); the ring only turns to whatever is selected, and turning it by hand presses the tab.
  */
  function setupCarousel() {
    var ring = document.querySelector('[data-carousel]');
    var tabs = document.querySelector('[data-preset-tabs]');
    if (!ring || !tabs) return;
    var slides = Array.prototype.slice.call(ring.querySelectorAll('[data-slide]'));
    var active = 0;

    function place() {
      var count = slides.length;
      slides.forEach(function (slide, index) {
        var offset = index - active;
        if (offset > count / 2) offset -= count;
        if (offset < -count / 2) offset += count;
        var distance = Math.abs(offset);
        slide.style.setProperty('--d', String(offset));
        slide.style.setProperty('--a', String(distance));
        slide.classList.toggle('is-active', offset === 0);
        slide.classList.toggle('is-far', distance > 2);
        slide.setAttribute('aria-hidden', String(offset !== 0));
      });
    }

    function currentState() {
      var pressed = document.querySelector('[data-state-tabs] [aria-pressed="true"]');
      return (pressed && pressed.getAttribute('data-state')) || 'normal';
    }

    function press(index) {
      var count = slides.length;
      var slug = slides[((index % count) + count) % count].getAttribute('data-slide');
      var tab = tabs.querySelector('[data-preset="' + slug + '"]');
      if (tab) tab.click();
    }

    document.addEventListener('aw-preset-select', function (event) {
      var slug = event.detail && event.detail.slug;
      var index = slides.findIndex(function (slide) {
        return slide.getAttribute('data-slide') === slug;
      });
      if (index < 0 || index === active) return;
      active = index;
      place();
      // The preset that comes round to the front plays its entry again, as it would on screen.
      var frame = slides[active].querySelector('iframe');
      if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ type: 'aw-preset-play', state: currentState() }, '*');
      }
    });

    ring.addEventListener('click', function (event) {
      var slide = event.target.closest('[data-slide]');
      if (slide && !slide.classList.contains('is-active')) press(slides.indexOf(slide));
    });

    each('[data-turn]', function (button) {
      button.addEventListener('click', function () {
        press(active + Number(button.getAttribute('data-turn')));
      });
    });

    var startX = null;
    ring.addEventListener('pointerdown', function (event) {
      startX = event.clientX;
    });
    ring.addEventListener('pointerup', function (event) {
      if (startX === null) return;
      var moved = event.clientX - startX;
      startX = null;
      if (Math.abs(moved) > SWIPE_PX) press(active + (moved < 0 ? 1 : -1));
    });

    var narrow = window.matchMedia('(max-width: 960px)');
    var webkit = Boolean(window.CSS && window.CSS.supports('font', '-apple-system-body'));
    function flatten() {
      ring.classList.toggle('is-flat', webkit || narrow.matches);
    }
    if (narrow.addEventListener) narrow.addEventListener('change', flatten);
    flatten();
    place();
  }

  // A screenshot leans towards the pointer; the light on it follows.
  function setupTilt() {
    if (reduced || !finePointer) return;
    each('.feature-shot', function (shot) {
      var frame = 0;
      shot.addEventListener('pointerenter', function () {
        shot.classList.add('is-tilting');
      });
      shot.addEventListener('pointermove', function (event) {
        var box = shot.getBoundingClientRect();
        var x = (event.clientX - box.left) / box.width - 0.5;
        var y = (event.clientY - box.top) / box.height - 0.5;
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(function () {
          shot.style.setProperty('--rx', (-y * TILT_X_DEG).toFixed(2) + 'deg');
          shot.style.setProperty('--ry', (x * TILT_Y_DEG).toFixed(2) + 'deg');
          shot.style.setProperty('--sx', ((0.5 - x) * 100).toFixed(1) + '%');
        });
      });
      shot.addEventListener('pointerleave', function () {
        window.cancelAnimationFrame(frame);
        shot.classList.remove('is-tilting');
        shot.style.removeProperty('--rx');
        shot.style.removeProperty('--ry');
      });
    });
  }

  function setupGlow() {
    if (!finePointer) return;
    each('.source, .tile, .pair > div', function (card) {
      card.setAttribute('data-glow', '');
    });
    document.addEventListener(
      'pointermove',
      function (event) {
        var card = event.target.closest && event.target.closest('[data-glow]');
        if (!card) return;
        var box = card.getBoundingClientRect();
        card.style.setProperty('--gx', Math.round(event.clientX - box.left) + 'px');
        card.style.setProperty('--gy', Math.round(event.clientY - box.top) + 'px');
      },
      { passive: true }
    );
  }

  // The large buttons lean towards a pointer that comes near, and settle back when it leaves.
  function setupMagnets() {
    if (reduced || !finePointer) return;
    var magnets = [];
    each('.btn-lg', function (button) {
      button.setAttribute('data-magnet', '');
      magnets.push(button);
    });
    if (!magnets.length) return;

    var pointer = null;
    var queued = false;
    var pulled = new WeakMap();
    function clamp(value) {
      return Math.max(-MAGNET_MAX_PX, Math.min(MAGNET_MAX_PX, value));
    }
    // Measured where the button sits at rest, so its own pull does not feed back into the next one.
    function update() {
      queued = false;
      magnets.forEach(function (button) {
        var box = button.getBoundingClientRect();
        var shift = pulled.get(button) || { x: 0, y: 0 };
        var dx = pointer.x - (box.left - shift.x + box.width / 2);
        var dy = pointer.y - (box.top - shift.y + box.height / 2);
        var near = Math.abs(dx) < box.width / 2 + MAGNET_REACH_PX && Math.abs(dy) < box.height / 2 + MAGNET_REACH_PX;
        var next = near ? { x: clamp(dx * MAGNET_PULL_X), y: clamp(dy * MAGNET_PULL_Y) } : { x: 0, y: 0 };
        pulled.set(button, next);
        button.classList.toggle('is-pulled', near);
        button.style.setProperty('--pull-x', next.x.toFixed(1) + 'px');
        button.style.setProperty('--pull-y', next.y.toFixed(1) + 'px');
      });
    }
    document.addEventListener(
      'pointermove',
      function (event) {
        pointer = { x: event.clientX, y: event.clientY };
        if (queued) return;
        queued = true;
        window.requestAnimationFrame(update);
      },
      { passive: true }
    );
  }

  setupScroll();
  setupWords();
  setupRecede();
  setupMarquee();
  setupCarousel();
  setupTilt();
  setupGlow();
  setupMagnets();
})();
