'use strict';

/*
  Enter and Space press anything marked role="button" that is not a native button, so the library
  toolbar, the game page and the other div-based controls work from the keyboard. A handler that has
  already dealt with the key (trophy rows, collapsible Settings headers) calls preventDefault and is
  left alone.
*/

(() => {
  const pressable = '[role="button"][tabindex]:not(button, a, input, select, textarea, summary)';

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.matches(pressable)) return;
    // Handlers lock a control with pointer-events: none while its animation runs; honour that lock.
    if (getComputedStyle(target).pointerEvents === 'none') return;
    event.preventDefault();
    target.click();
  });
})();
