// Opens the tour video from the hero thumbnail, or straight away on #tour (the README's link).
(() => {
  const dialog = document.getElementById('tour');
  const thumb = document.querySelector('.tour-thumb');
  if (!dialog || !thumb) return;
  const video = dialog.querySelector('video');
  const open = () => {
    dialog.showModal();
    video.currentTime = 0;
    video.play().catch(() => {}); // a browser that refuses sound without a click shows the play button
  };
  thumb.addEventListener('click', open);
  dialog.querySelector('[data-tour-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => video.pause());
  if (location.hash === '#tour') open();

  // The thumbnail turns into a plain link wherever it would run into the steps bar under the scene.
  const steps = document.querySelector('.game-steps');
  const fit = () => {
    if (!steps) return;
    thumb.classList.remove('is-compact');
    const a = thumb.getBoundingClientRect();
    const b = steps.getBoundingClientRect();
    thumb.classList.toggle('is-compact', b.top < a.bottom + 16 && b.bottom > a.top);
  };
  // Watched: the text above the thumbnail, whose size never depends on it (language, width).
  const observer = new ResizeObserver(() => requestAnimationFrame(fit));
  document.querySelectorAll('.hero h1, .hero-sub').forEach((node) => observer.observe(node));
  window.addEventListener('resize', () => requestAnimationFrame(fit));
  fit();
})();
