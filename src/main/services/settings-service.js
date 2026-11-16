'use strict';

const { EventEmitter } = require('node:events');

const DEFAULT_SETTINGS = Object.freeze({
  /** id del monitor elegido para la TV; null = automático (primer monitor secundario). */
  displayId: null,
  /** 'contain' muestra la pieza completa; 'cover' llena la pantalla recortando bordes. */
  fitMode: 'contain',
  autoStartWithWindows: true,
  autoOpenPlayer: true,
  muteVideos: true,
  /**
   * Sucursal cuyo contenido se muestra (parámetro ?sucursal= de /screens).
   * null = la sucursal del usuario logueado; '' = todas las sucursales.
   */
  branch: null,
});

const MAX_BRANCH_LENGTH = 100;

/** Valida y normaliza un objeto de ajustes parcial. Función pura: testeable sin Electron. */
function sanitizeSettings(partial) {
  const out = {};
  if (partial == null || typeof partial !== 'object') return out;
  if ('displayId' in partial) {
    out.displayId = partial.displayId === null ? null : Number.isFinite(Number(partial.displayId)) ? Number(partial.displayId) : null;
  }
  if ('fitMode' in partial && ['contain', 'cover'].includes(partial.fitMode)) out.fitMode = partial.fitMode;
  if ('branch' in partial) {
    out.branch = typeof partial.branch === 'string' ? partial.branch.trim().slice(0, MAX_BRANCH_LENGTH) : null;
  }
  for (const key of ['autoStartWithWindows', 'autoOpenPlayer', 'muteVideos']) {
    if (key in partial) out[key] = Boolean(partial[key]);
  }
  return out;
}

class SettingsService extends EventEmitter {
  constructor({ store }) {
    super();
    this.store = store;
    this.settings = { ...DEFAULT_SETTINGS, ...sanitizeSettings(store.read({})) };
  }

  get() {
    return { ...this.settings };
  }

  update(partial) {
    const changes = sanitizeSettings(partial);
    this.settings = { ...this.settings, ...changes };
    this.store.write(this.settings);
    this.emit('change', this.get(), changes);
    return this.get();
  }
}

module.exports = { SettingsService, sanitizeSettings, DEFAULT_SETTINGS };
