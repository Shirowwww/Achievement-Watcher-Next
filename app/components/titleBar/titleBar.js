'use strict';

const { ipcRenderer } = require('electron');

const template = `
    
    <link rel="stylesheet" href="../resources/css/normalize.css" type="text/css"/>
    <link rel="stylesheet" href="../resources/css/fontawesome.css" type="text/css"/>
    <link rel="stylesheet" href="../resources/css/common.css" type="text/css" />
    <link rel="stylesheet" href="../resources/css/titlebar.css" type="text/css" />

    <div class="sf-indicator">
    <ul id="watchdog-status" class="sf-indicator"><span class="status-dot status-orange status-pulse"></span><span class="status-text"></span> <span id="start-watchdog"></span><span id="update-status" hidden><i class="fas fa-circle-down" aria-hidden="true"></i><span class="update-text"></span><span class="update-track"><span class="update-fill"></span></span><span id="update-cancel" role="button" tabindex="0"><i class="fas fa-xmark" aria-hidden="true"></i></span></span></ul>
    </div>
    <ul id="window-controls">
      <li id="btn-close" role="button" tabindex="0"><i class="fas fa-times"></i></li>
      <li id="btn-maximize" role="button" tabindex="0"><i class="far fa-window-maximize"></i></li>
      <li id="btn-minimize" role="button" tabindex="0"><i class="far fa-window-minimize"></i></li>
      <li id="btn-settings" role="button" tabindex="0"><i class="fas fa-cog"></i></li>
      <li id="btn-refresh" role="button" tabindex="0"><i class="fas fa-sync-alt"></i></li>
    </ul>
`;

export default class titleBar extends HTMLElement {
  constructor() {
    super();

    this.attachShadow({ mode: 'open' }).innerHTML = template;

    this.closeBtn = this.shadowRoot.querySelector('#btn-close');
    this.maximizeBtn = this.shadowRoot.querySelector('#btn-maximize');
    this.settingsBtn = this.shadowRoot.querySelector('#btn-settings');
    this.refreshBtn = this.shadowRoot.querySelector('#btn-refresh');
    this.minimizeBtn = this.shadowRoot.querySelector('#btn-minimize');
    this.watchdogBtn = this.shadowRoot.querySelector('#start-watchdog');
    this.updateCancelBtn = this.shadowRoot.querySelector('#update-cancel');
    this.watchdogBtn.setAttribute('role', 'button');
    this.watchdogBtn.tabIndex = 0;
    this.onClose = () => this.close();
    this.onMaximize = () => this.maximize();
    // pointer-events: none keeps the mouse out while Settings is open; the keyboard needs the guard.
    this.onSettings = () => {
      if (!this.inSettings) this.settings();
    };
    // Enter and Space press a focused control, the way a native button would.
    this.onPressKey = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.currentTarget.click();
    };
    // The library rescan lives in ui/refresh.js (F5); the button only asks for it.
    this.onRefresh = (event) => {
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (!this.inSettings) this.dispatchEvent(new CustomEvent('refresh-library'));
    };
    this.onMinimize = () => this.minimize();
    this.onStartWatchdog = () => {
      if (!this.inSettings) this.start_watchdog();
    };
    this.onCancelUpdate = (event) => {
      // Keyboard reachable: the chip is the only place a download in flight can be stopped from.
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      this.cancel_update();
    };
  }

  /* Life Cycle */
  connectedCallback() {
    this.closeBtn.addEventListener('click', this.onClose);
    this.maximizeBtn.addEventListener('click', this.onMaximize);
    this.settingsBtn.addEventListener('click', this.onSettings);
    this.refreshBtn.addEventListener('click', this.onRefresh);
    this.refreshBtn.addEventListener('keydown', this.onRefresh);
    this.minimizeBtn.addEventListener('click', this.onMinimize);
    this.watchdogBtn.addEventListener('click', this.onStartWatchdog);
    for (const button of this.pressables()) button.addEventListener('keydown', this.onPressKey);
    this.updateCancelBtn.addEventListener('click', this.onCancelUpdate);
    this.updateCancelBtn.addEventListener('keydown', this.onCancelUpdate);

    const defaults = [ipcRenderer.invoke('win-isMinimizable'), ipcRenderer.invoke('win-isMaximizable')];
    Promise.allSettled(defaults).then(([isMinimizable, isMaximizable]) => {
      if (isMinimizable.value === true) this.setAttribute('minimizable', '');
      if (isMaximizable.value === true) this.setAttribute('maximizable', '');
      this.update();
    });
  }

  disconnectedCallback() {
    this.closeBtn.removeEventListener('click', this.onClose);
    this.maximizeBtn.removeEventListener('click', this.onMaximize);
    this.settingsBtn.removeEventListener('click', this.onSettings);
    this.refreshBtn.removeEventListener('click', this.onRefresh);
    this.refreshBtn.removeEventListener('keydown', this.onRefresh);
    this.minimizeBtn.removeEventListener('click', this.onMinimize);
    this.watchdogBtn.removeEventListener('click', this.onStartWatchdog);
    for (const button of this.pressables()) button.removeEventListener('keydown', this.onPressKey);
    this.updateCancelBtn.removeEventListener('click', this.onCancelUpdate);
    this.updateCancelBtn.removeEventListener('keydown', this.onCancelUpdate);
  }

  /* Update */

  static get observedAttributes() {
    return ['maximizable', 'minimizable', 'insettings'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    this.update();
  }

  // Controls that take Enter and Space; refresh has its own handler.
  pressables() {
    return [this.closeBtn, this.maximizeBtn, this.minimizeBtn, this.settingsBtn, this.watchdogBtn];
  }

  update() {
    this.maximizeBtn.style.display = this.hasAttribute('maximizable') ? 'inline-flex' : 'none';
    this.minimizeBtn.style.display = this.hasAttribute('minimizable') ? 'inline-flex' : 'none';
    const disabled = this.hasAttribute('insettings');
    this.settingsBtn.style.pointerEvents = disabled ? 'none' : 'initial';
    this.refreshBtn.style.pointerEvents = disabled ? 'none' : 'initial';
    this.watchdogBtn.style.pointerEvents = disabled ? 'none' : 'initial';
    // Out of the tab order while Settings covers the window, so Tab does not land behind it.
    for (const button of [this.settingsBtn, this.refreshBtn]) button.tabIndex = disabled ? -1 : 0;
  }

  /* Getter/Setter */
  get maximizable() {
    return this.hasAttribute('maximizable');
  }

  set maximizable(isMaximizable) {
    if (isMaximizable) {
      this.setAttribute('maximizable', '');
    } else {
      this.removeAttribute('maximizable');
    }
  }

  get minimizable() {
    return this.hasAttribute('minimizable');
  }

  set minimizable(isMinimizable) {
    if (isMinimizable) {
      this.setAttribute('minimizable', '');
    } else {
      this.removeAttribute('minimizable');
    }
  }

  get inSettings() {
    return this.hasAttribute('inSettings');
  }

  set inSettings(isInSettings) {
    if (isInSettings) {
      this.setAttribute('inSettings', '');
    } else {
      this.removeAttribute('inSettings');
    }
  }

  /* Custom method */
  close() {
    ipcRenderer.invoke('win-close');
  }

  maximize() {
    ipcRenderer.invoke('win-maximize');
  }

  settings() {
    this.dispatchEvent(new CustomEvent('open-settings'));
  }

  minimize() {
    ipcRenderer.invoke('win-minimize');
  }

  start_watchdog() {
    ipcRenderer.invoke('start-watchdog');
  }

  // The main process answers by broadcasting the new state, so the chip is never updated from a
  // guess here - if the download had already finished, the chip simply moves on to "ready".
  cancel_update() {
    ipcRenderer.invoke('cancel-update-download').catch(() => {});
  }
}
