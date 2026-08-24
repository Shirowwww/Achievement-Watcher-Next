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
      <li id="btn-close"><i class="fas fa-times"></i></li>
      <li id="btn-maximize"><i class="far fa-window-maximize"></i></li>
      <li id="btn-minimize"><i class="far fa-window-minimize"></i></li>
      <li id="btn-settings"><i class="fas fa-cog"></i></li>
    </ul>
`;

export default class titleBar extends HTMLElement {
  constructor() {
    super();

    this.attachShadow({ mode: 'open' }).innerHTML = template;

    this.closeBtn = this.shadowRoot.querySelector('#btn-close');
    this.maximizeBtn = this.shadowRoot.querySelector('#btn-maximize');
    this.settingsBtn = this.shadowRoot.querySelector('#btn-settings');
    this.minimizeBtn = this.shadowRoot.querySelector('#btn-minimize');
    this.watchdogBtn = this.shadowRoot.querySelector('#start-watchdog');
    this.updateCancelBtn = this.shadowRoot.querySelector('#update-cancel');
    this.onClose = () => this.close();
    this.onMaximize = () => this.maximize();
    this.onSettings = () => this.settings();
    this.onMinimize = () => this.minimize();
    this.onStartWatchdog = () => this.start_watchdog();
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
    this.minimizeBtn.addEventListener('click', this.onMinimize);
    this.watchdogBtn.addEventListener('click', this.onStartWatchdog);
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
    this.minimizeBtn.removeEventListener('click', this.onMinimize);
    this.watchdogBtn.removeEventListener('click', this.onStartWatchdog);
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

  update() {
    this.maximizeBtn.style.display = this.hasAttribute('maximizable') ? 'inline-flex' : 'none';
    this.minimizeBtn.style.display = this.hasAttribute('minimizable') ? 'inline-flex' : 'none';
    const disabled = this.hasAttribute('insettings');
    this.settingsBtn.style.pointerEvents = disabled ? 'none' : 'initial';
    this.watchdogBtn.style.pointerEvents = disabled ? 'none' : 'initial';
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
