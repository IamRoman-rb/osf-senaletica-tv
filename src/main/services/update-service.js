'use strict';

const { EventEmitter } = require('node:events');

/**
 * Actualizaciones automáticas (electron-updater).
 * El feed se configura en electron-builder.yml (sección publish).
 *
 * @typedef {{ state: 'disabled'|'idle'|'checking'|'available'|'downloading'|'ready'|'up-to-date'|'error',
 *             currentVersion: string, newVersion: string|null, percent: number|null, message: string|null }} UpdateStatus
 */
class UpdateService extends EventEmitter {
  constructor({ app, logger, checkIntervalMs }) {
    super();
    this.app = app;
    this.logger = logger;
    this.checkIntervalMs = checkIntervalMs;
    this.updater = null;
    this.status = {
      state: app.isPackaged ? 'idle' : 'disabled',
      currentVersion: app.getVersion(),
      newVersion: null,
      percent: null,
      message: app.isPackaged ? null : 'Las actualizaciones sólo funcionan en la versión instalada',
    };
  }

  start() {
    if (!this.app.isPackaged) return;
    const { autoUpdater } = require('electron-updater');
    this.updater = autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = { info: (m) => this.logger.info(String(m)), warn: (m) => this.logger.warn(String(m)), error: (m) => this.logger.error(String(m)), debug: () => {} };

    autoUpdater.on('checking-for-update', () => this.#set({ state: 'checking', message: null }));
    autoUpdater.on('update-available', (info) => this.#set({ state: 'available', newVersion: info.version }));
    autoUpdater.on('update-not-available', () => this.#set({ state: 'up-to-date', newVersion: null, percent: null }));
    autoUpdater.on('download-progress', (p) => this.#set({ state: 'downloading', percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (info) => this.#set({ state: 'ready', newVersion: info.version, percent: 100 }));
    autoUpdater.on('error', (err) => {
      this.logger.warn('Error de actualización', { message: String(err.message).split('\n')[0] });
      this.#set({ state: 'error', message: 'No se pudo comprobar si hay actualizaciones' });
    });

    this.check();
    this.interval = setInterval(() => this.check(), this.checkIntervalMs);
  }

  check() {
    if (!this.updater) return;
    this.updater.checkForUpdates().catch(() => { /* reportado por el evento 'error' */ });
  }

  installNow() {
    if (this.status.state === 'ready') this.updater.quitAndInstall(false, true);
  }

  getStatus() {
    return { ...this.status };
  }

  #set(patch) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.getStatus());
  }
}

module.exports = { UpdateService };
