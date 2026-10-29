'use strict';

/*
  Text cut with an ellipsis (a long game title on a tile, "Comme les déblo…" in a Settings control)
  scrolls to its end while the pointer rests on it, then back, so the whole value can be read without
  opening anything. Only text that is really cut moves. With reduced motion the full text becomes the
  element's tooltip instead.

  Wrapped in a block: every ui/*.js file shares the window's global scope with app.js.
*/
{
  const SPEED_PX_PER_S = 45;
  const PAUSE_MS = 900;
  const MAX_ANCESTORS = 4;
  const measureContext = document.createElement('canvas').getContext('2d');
  const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let active = null;

  // A select draws its own value and reports no overflow, so its text is measured against its box.
  function overflowOf(el) {
    if (el.tagName === 'SELECT') {
      const option = el.selectedOptions && el.selectedOptions[0];
      const text = option ? option.textContent.trim() : '';
      if (!text) return 0;
      const style = getComputedStyle(el);
      measureContext.font = style.font;
      const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return Math.ceil(measureContext.measureText(text).width - room);
    }
    return el.scrollWidth - el.clientWidth;
  }

  // Its own text, not a block of children: only a line of text is scrolled, never a whole layout.
  function ownsText(el) {
    return Array.from(el.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  }

  // Cut means one unwrapped line clipped by its box, with or without an ellipsis drawn at the end.
  function isCutText(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.tagName === 'SELECT') return overflowOf(el) > 1;
    const style = getComputedStyle(el);
    const clipped = style.overflowX === 'hidden' || style.overflowX === 'clip';
    return clipped && style.whiteSpace.startsWith('nowrap') && ownsText(el) && overflowOf(el) > 1;
  }

  function cutTextAt(target) {
    let node = target;
    for (let i = 0; node && i < MAX_ANCESTORS; i++, node = node.parentElement) {
      if (isCutText(node)) return node;
    }
    return null;
  }

  function fullText(el) {
    if (el.tagName === 'SELECT') return (el.selectedOptions[0] && el.selectedOptions[0].textContent.trim()) || '';
    return el.textContent.trim();
  }

  // A select and an `overflow: clip` box cannot be scrolled, so their text is shifted instead.
  function place(el, offset) {
    if (el.tagName === 'SELECT' || getComputedStyle(el).overflowX === 'clip') el.style.textIndent = offset ? `${-offset}px` : '';
    else el.scrollLeft = offset;
  }

  function stop() {
    if (!active) return;
    cancelAnimationFrame(active.frame);
    active.el.removeEventListener('mouseleave', stop);
    place(active.el, 0);
    active.el.classList.remove('text-marquee');
    if (active.addedTitle) active.el.removeAttribute('title');
    active = null;
  }

  function start(el) {
    const distance = overflowOf(el);
    if (distance <= 1) return;
    // Inside a shadow root the document never hears the pointer leave, the element itself does.
    el.addEventListener('mouseleave', stop);
    if (reducedMotion && reducedMotion.matches) {
      const addedTitle = !el.hasAttribute('title');
      if (addedTitle) el.title = fullText(el);
      active = { el, frame: 0, addedTitle };
      return;
    }
    el.classList.add('text-marquee');
    const travelMs = (distance / SPEED_PX_PER_S) * 1000;
    const cycleMs = 2 * (PAUSE_MS + travelMs);
    const begin = performance.now();
    const state = { el, frame: 0, addedTitle: false };
    const tick = (now) => {
      // Rest, scroll to the end, rest, scroll back: one cycle, repeated while the pointer stays.
      const t = (now - begin) % cycleMs;
      let offset = 0;
      if (t < PAUSE_MS) offset = 0;
      else if (t < PAUSE_MS + travelMs) offset = ((t - PAUSE_MS) / travelMs) * distance;
      else if (t < 2 * PAUSE_MS + travelMs) offset = distance;
      else offset = distance - ((t - 2 * PAUSE_MS - travelMs) / travelMs) * distance;
      place(el, Math.round(offset));
      state.frame = requestAnimationFrame(tick);
    };
    state.frame = requestAnimationFrame(tick);
    active = state;
  }

  // The path's first node is the real target, also inside a shadow root (the title bar).
  document.addEventListener('mouseover', (event) => {
    const el = cutTextAt(event.composedPath()[0]);
    if (active && active.el === el) return;
    stop();
    if (el) start(el);
  });
  document.addEventListener('mouseout', (event) => {
    if (active && !(event.relatedTarget && active.el.contains(event.relatedTarget))) stop();
  });
  // A select changed with its arrows shows another value, whose length has to be measured again.
  document.addEventListener('change', (event) => {
    if (active && active.el === event.target) {
      const el = active.el;
      stop();
      start(el);
    }
  });
}
