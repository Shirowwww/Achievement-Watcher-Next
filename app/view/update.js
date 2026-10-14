'use strict';

/*
  The update window's page. It draws the view object the main process sends (util/updateWindowView.js)
  and reports clicks; it decides nothing. Every text, release notes included, is set as textContent.
*/
(function () {
  const bridge = window.awUpdate;
  const byId = (id) => document.getElementById(id);
  let primary = null;

  function setText(id, text) {
    const node = byId(id);
    node.textContent = text || '';
    node.hidden = !text;
  }

  function renderProgress(progress) {
    const box = byId('progress');
    box.hidden = !progress;
    if (!progress) return;
    box.classList.toggle('indeterminate', Boolean(progress.indeterminate));
    box.querySelector('.fill').style.transform = progress.indeterminate ? '' : `scaleX(${Math.max(0, Math.min(100, progress.percent)) / 100})`;
    byId('progress-detail').textContent = progress.detail || '';
    byId('progress-percent').textContent = progress.indeterminate ? '' : progress.percentText || '';
  }

  function noteNode(block) {
    const tag = block.kind === 'heading' ? 'h3' : block.kind === 'item' ? 'li' : 'p';
    const node = document.createElement(tag);
    node.textContent = block.text;
    return node;
  }

  // Consecutive items share one list, so the bullets line up as they do on the release page.
  function renderNotes(notes) {
    const section = byId('notes');
    section.hidden = !notes;
    if (!notes) return;
    byId('notes-title').textContent = notes.title;
    const body = byId('notes-body');
    body.replaceChildren();
    let list = null;
    for (const block of notes.blocks) {
      if (block.kind === 'item') {
        if (!list) list = body.appendChild(document.createElement('ul'));
        list.appendChild(noteNode(block));
      } else {
        list = null;
        body.appendChild(noteNode(block));
      }
    }
    if (!notes.blocks.length) {
      const empty = body.appendChild(document.createElement('p'));
      empty.className = 'empty';
      empty.textContent = notes.empty;
    }
    byId('notes-link').textContent = notes.link;
  }

  function renderActions(actions) {
    const footer = byId('actions');
    footer.replaceChildren();
    primary = null;
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `action ${action.kind}`;
      button.textContent = action.label;
      button.addEventListener('click', () => bridge.act(action.id));
      footer.appendChild(button);
      if (action.kind === 'primary') primary = button;
    }
  }

  function render(view) {
    if (!view) return;
    document.body.dataset.phase = view.phase;
    byId('title').textContent = view.title;
    byId('meta').textContent = view.meta || '';
    setText('message', view.message);
    renderProgress(view.progress);
    renderNotes(view.notes);
    renderActions(view.actions);
    byId('close').title = view.close;
    byId('close').setAttribute('aria-label', view.close);
  }

  byId('close').addEventListener('click', () => bridge.act('dismiss'));
  byId('notes-link').addEventListener('click', () => bridge.act('notes'));
  // Enter answers with the main button unless another one has the keyboard focus; Escape closes.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') bridge.act('dismiss');
    if (event.key === 'Enter' && primary && !document.activeElement?.matches('button')) primary.click();
  });
  bridge.onView(render);
  bridge.ready();
})();
