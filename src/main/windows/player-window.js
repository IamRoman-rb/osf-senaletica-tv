'use strict';

const path = require('node:path');
const { EventEmitter } = require('node:events');
const { BrowserWindow } = require('electron');
const { secureWebPreferences, lockDownNavigation } = require('./secure-web-preferences');

/**
 * Ventana 2: reproductor a pantalla completa en la TV.
 * Se ubica sola en el monitor elegido y se reacomoda si cambia la resolución
 * o se conecta/desconecta la TV.
 */
class PlayerWindowController extends EventEmitter {
  constructor({ displayService, settingsService, logger }) {
    super();
    this.displayService = displayService;
    this.settingsService = settingsService;
    this.logger = logger;
    this.win = null;

    displayService.on('change', () => this.fitToDisplay());
    settingsService.on('change', (_settings, changes) => {
      if ('displayId' in changes) this.fitToDisplay();
    });
  }

  get isOpen() {
    return Boolean(this.win && !this.win.isDestroyed());
  }

  get webContents() {
    return this.isOpen ? this.win.webContents : null;
  }

  open() {
    if (this.isOpen) {
      this.fitToDisplay();
      return;
    }
    const target = this.#targetDisplay();
    this.win = new BrowserWindow({
      x: target.bounds.x,
      y: target.bounds.y,
      width: target.bounds.width,
      height: target.bounds.height,
      frame: false,
      show: false,
      fullscreenable: true,
      resizable: false,
      backgroundColor: '#000000',
      title: 'OSF Señalética — TV',
      webPreferences: {
        ...secureWebPreferences(path.join(__dirname, '..', '..', 'preload', 'player-preload.js')),
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    lockDownNavigation(this.win);
    this.win.once('ready-to-show', () => {
      this.fitToDisplay();
      this.win.show();
    });
    this.win.on('closed', () => {
      this.win = null;
      this.#releasePowerSave();
      this.emit('closed');
    });
    this.win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'player', 'index.html'));
    this.powerSaveId = require('electron').powerSaveBlocker.start('prevent-display-sleep');
    this.emit('opened');
  }

  close() {
    if (this.isOpen) this.win.close();
  }

  #releasePowerSave() {
    const { powerSaveBlocker } = require('electron');
    if (this.powerSaveId != null && powerSaveBlocker.isStarted(this.powerSaveId)) powerSaveBlocker.stop(this.powerSaveId);
    this.powerSaveId = null;
  }

  send(channel, payload) {
    if (this.isOpen) this.win.webContents.send(channel, payload);
  }

  fitToDisplay() {
    if (!this.isOpen) return;
    const target = this.#targetDisplay();
    const onSecondary = target.id !== require('electron').screen.getPrimaryDisplay().id;
    this.win.setFullScreen(false);
    this.win.setBounds(target.bounds);
    this.win.setFullScreen(true);
    // En un monitor secundario la TV queda siempre arriba; con un solo monitor no tapa al panel.
    this.win.setAlwaysOnTop(onSecondary, 'screen-saver');
    this.logger.info(`TV ubicada en monitor ${target.id} (${target.bounds.width}x${target.bounds.height})`);
  }

  #targetDisplay() {
    return this.displayService.resolveTarget(this.settingsService.get().displayId);
  }
}

module.exports = { PlayerWindowController };
