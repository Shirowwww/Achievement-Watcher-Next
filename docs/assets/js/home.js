/*
  Motion for the home page: the game scene at the top, the entrances further down and the figures.
  Without script the scene shows its final frame, the popup plays on its own and nothing is hidden.
*/
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var observes = 'IntersectionObserver' in window;

  /*
    One turn of the demo per preset: the objective in the HUD, then the unlock it earns. The goals
    are the descriptions assets/js/preset-preview.js gives each state, so the card that lands says
    what the player just did.
  */
  var TURNS = [
    { preset: 'aw-next', name: 'AW Next', state: 'normal', goal: 'Reach the summit before dawn' },
    { preset: 'steam-modern', name: 'Steam Modern', state: 'rare', goal: 'Finish the heist without an alarm' },
    { preset: 'playstation', name: 'PlayStation', state: 'progress', goal: 'Relics recovered 34 / 50' },
    { preset: 'xbox', name: 'Xbox', state: 'normal', goal: 'Reach the summit before dawn' },
    { preset: 'glass', name: 'Glass', state: 'rare', goal: 'Finish the heist without an alarm' },
    { preset: 'epic-games', name: 'Epic Games', state: 'progress', goal: 'Relics recovered 34 / 50' },
  ];
  var CLIMB_MS = 1700;
  var POPUP_DELAY_MS = 450;
  var TURN_MS = 8000;
  var FADE_MS = 200;
  // A turn the visitor asked for: the climb in fast forward, then the popup almost at once.
  var QUICK = { climb: 380, popup: 60, fade: 80 };
  var PACED = { climb: CLIMB_MS, popup: POPUP_DELAY_MS, fade: FADE_MS };
  var ALTITUDE_FROM = 4806;
  var ALTITUDE_TO = 4861;
  // How much of a block has to be above the fold before it plays.
  var REVEAL_RATIO = 0.15;

  function setupGame() {
    var game = document.querySelector('[data-game]');
    var frame = game && game.querySelector('[data-preset-frame]');
    if (!game || !frame) return;

    var goal = game.querySelector('[data-hud-goal]');
    var altitude = game.querySelector('[data-hud-alt]');
    var presetName = game.querySelector('[data-hero-preset]');
    var steps = game.querySelectorAll('[data-step]');
    var turn = 0;
    var timers = [];
    var visible = true;

    function later(fn, ms) {
      timers.push(window.setTimeout(fn, ms));
    }

    function stepTo(name) {
      Array.prototype.forEach.call(steps, function (step) {
        step.classList.toggle('is-on', step.getAttribute('data-step') === name);
      });
    }

    function play(state) {
      if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'aw-preset-play', state: state }, '*');
    }

    function countAltitude(duration) {
      if (!altitude) return;
      var start = performance.now();
      function frameTick(now) {
        var t = Math.min(1, (now - start) / duration);
        var value = Math.round(ALTITUDE_FROM + (ALTITUDE_TO - ALTITUDE_FROM) * t);
        altitude.textContent = value.toLocaleString('fr-FR');
        if (t < 1) window.requestAnimationFrame(frameTick);
      }
      window.requestAnimationFrame(frameTick);
    }

    // The climb, the tick in the HUD, then the popup: the order a player lives it in.
    function perform(current, pace) {
      game.classList.remove('is-climbing', 'is-goal');
      game.style.setProperty('--climb', pace.climb + 'ms');
      void game.offsetWidth;
      game.classList.add('is-climbing');
      stepTo('play');
      countAltitude(pace.climb);
      later(function () {
        game.classList.add('is-goal');
        stepTo('goal');
      }, pace.climb);
      later(function () {
        play(current.state);
        stepTo('popup');
      }, pace.climb + pace.popup);
    }

    function load(index, pace) {
      var current = TURNS[index];
      pace = pace || PACED;
      timers.forEach(window.clearTimeout);
      timers = [];
      if (goal) goal.textContent = current.goal;
      if (presetName) presetName.textContent = current.name;
      frame.classList.add('is-switching');
      later(function () {
        frame.addEventListener(
          'load',
          function () {
            frame.classList.remove('is-switching');
            perform(current, pace);
            if (visible && !document.hidden) later(next, TURN_MS);
          },
          { once: true }
        );
        frame.setAttribute('src', 'assets/preset/' + current.preset + '/index.html?hold');
      }, pace.fade);
    }

    function next(pace) {
      turn = (turn + 1) % TURNS.length;
      load(turn, pace);
    }

    // The frame's first page plays its card on its own, which is all a still page needs.
    if (reduced) {
      game.classList.add('is-goal');
      stepTo('popup');
      return;
    }

    var replay = game.querySelector('[data-replay]');
    if (replay) {
      replay.addEventListener('click', function () {
        next(QUICK);
      });
    }

    // A turn already on screen finishes; the next one waits until the scene can be seen again.
    var sceneOnScreen = true;
    function resume() {
      var wasVisible = visible;
      visible = !document.hidden && sceneOnScreen;
      if (visible && !wasVisible) load(turn);
    }
    document.addEventListener('visibilitychange', resume);
    if (observes) {
      new IntersectionObserver(function (entries) {
        sceneOnScreen = entries[entries.length - 1].isIntersecting;
        resume();
      }).observe(game);
    }

    load(0);
  }

  // A figure counts up to its value once, the first time it is seen.
  // A figure counts up each time its block comes back into view; a newer run cancels an older one.
  var countRuns = new WeakMap();
  function countUp(node) {
    if (!node.hasAttribute('data-to')) node.setAttribute('data-to', node.textContent.trim());
    var target = Number(node.getAttribute('data-to'));
    if (!(target > 0)) return;
    var run = (countRuns.get(node) || 0) + 1;
    countRuns.set(node, run);
    var start = performance.now();
    var duration = 1100;
    function tick(now) {
      if (countRuns.get(node) !== run) return;
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 4);
      node.textContent = String(Math.round(target * eased));
      if (t < 1) window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  function setupReveal() {
    var blocks = document.querySelectorAll('[data-reveal], [data-split], [data-shutter]');
    // The source cards come in row by row: the delay is the card's place in its row of three.
    Array.prototype.forEach.call(document.querySelectorAll('.source'), function (card, index) {
      card.style.setProperty('--i', String(index % 3));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-reveal]'), function (block) {
      block.style.setProperty('--n', String(block.children.length));
      Array.prototype.forEach.call(block.children, function (child, index) {
        child.style.setProperty('--i', String(index));
      });
    });

    function show(block) {
      if (block.classList.contains('is-in')) return;
      block.classList.add('is-in');
      if (reduced) return;
      var figures = block.classList.contains('strip-list') ? block.querySelectorAll('b') : block.querySelectorAll('[data-count]');
      Array.prototype.forEach.call(figures, countUp);
    }

    function hide(block) {
      block.classList.remove('is-in');
    }

    if (reduced || !observes) {
      Array.prototype.forEach.call(blocks, function (block) {
        block.classList.add('is-in');
      });
      return;
    }

    /*
      A block clipped shut has no visible area, so the browser never reports it as intersecting:
      what is watched is the block's parent, and the block is what gets shown.

      It plays forwards as it comes up from the bottom and backwards when it goes back down below
      the fold, so scrolling up undoes the page and scrolling down again plays it once more. A
      block that leaves through the top stays as it is: nobody sees it go.
    */
    var watched = new Map();
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var group = watched.get(entry.target);
          group.forEach(function (block) {
            block.classList.toggle('is-idle', !entry.isIntersecting);
          });
          if (entry.isIntersecting && entry.intersectionRatio >= REVEAL_RATIO) {
            group.forEach(show);
            return;
          }
          var fold = entry.rootBounds ? entry.rootBounds.bottom : window.innerHeight;
          if (!entry.isIntersecting && entry.boundingClientRect.top >= fold) group.forEach(hide);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: [0, REVEAL_RATIO] }
    );
    Array.prototype.forEach.call(blocks, function (block) {
      var clipped = block.hasAttribute('data-shutter');
      var target = clipped ? block.parentElement : block;
      if (!watched.has(target)) watched.set(target, []);
      watched.get(target).push(block);
      observer.observe(target);
    });
  }

  // The install step shows the visitor's own system; this brings up the other one, and back.
  function setupPlatformSwitch() {
    var toggle = document.querySelector('[data-platform-switch]');
    if (!toggle) return;
    toggle.addEventListener('click', function () {
      toggle.parentElement.classList.toggle('is-other');
    });
  }

  setupGame();
  setupReveal();
  setupPlatformSwitch();
})();
