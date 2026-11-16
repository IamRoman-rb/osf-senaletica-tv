'use strict';

const { EventEmitter } = require('node:events');

/**
 * Sincroniza la playlist del servidor con la caché local (offline-first).
 *
 * Eventos (patrón Observer):
 *   'status'       -> ContentStatus (para el panel de administración)
 *   'playlist'     -> PlayerItem[]  (para la ventana de la TV)
 *   'unauthorized' -> la sesión dejó de ser válida
 *
 * @typedef {{ state: 'idle'|'syncing'|'ok'|'offline'|'error', lastSyncAt: string|null, version: string|null,
 *             itemCount: number, progress: { done: number, total: number }|null, message: string|null }} ContentStatus
 */
class ContentService extends EventEmitter {
  constructor({ api, auth, cache, manifestStore, mediaScheme, syncConfig, logger, getBranch = () => null }) {
    super();
    this.api = api;
    this.getBranch = getBranch;
    this.auth = auth;
    this.cache = cache;
    this.manifestStore = manifestStore;
    this.mediaScheme = mediaScheme;
    this.syncConfig = syncConfig;
    this.logger = logger;
    this.timer = null;
    this.running = false;
    this.inFlight = null;

    const manifest = manifestStore.read(null);
    this.manifest = manifest && Array.isArray(manifest.items) ? manifest : null;
    this.status = {
      state: 'idle',
      lastSyncAt: this.manifest?.syncedAt ?? null,
      version: this.manifest?.version ?? null,
      itemCount: this.manifest?.items.length ?? 0,
      progress: null,
      message: null,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.manifest) this.emit('playlist', this.playerItems());
    this.syncNow();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = null;
    this.#setStatus({ state: 'idle', progress: null, message: null });
  }

  getStatus() {
    return { ...this.status };
  }

  /** Elementos listos para el reproductor, apuntando a la caché local. */
  playerItems() {
    if (!this.manifest) return [];
    return this.manifest.items
      .filter((item) => this.cache.has(item.fileName))
      .map((item) => ({
        id: item.id,
        type: item.type,
        src: `${this.mediaScheme}://media/${item.fileName}`,
        durationMs: item.durationMs,
      }));
  }

  /** Dispara una sincronización; si ya hay una en curso devuelve la misma promesa. */
  syncNow() {
    if (this.inFlight) {
      // Hay una en curso (quizás con parámetros viejos): repetir al terminar.
      this.resyncRequested = true;
      return this.inFlight;
    }
    this.inFlight = this.#sync().finally(() => {
      this.inFlight = null;
      if (this.resyncRequested) {
        this.resyncRequested = false;
        this.syncNow();
      }
    });
    return this.inFlight;
  }

  async #sync() {
    const token = this.auth.token;
    if (!token) return;
    clearTimeout(this.timer);
    this.#setStatus({ state: 'syncing', progress: null, message: null });

    let nextDelay = this.syncConfig.intervalMs;
    try {
      const branch = this.getBranch();
      const playlist = await this.api.fetchPlaylist(token, { branch });
      const ready = await this.cache.ensure(playlist.items, (done, total) =>
        this.#setStatus({ progress: { done, total } }),
      );
      const fingerprint = ready.map((i) => i.fileName).join('|');
      const changed = !this.manifest || this.manifest.fingerprint !== fingerprint;
      this.manifest = { version: playlist.version, branch, fingerprint, syncedAt: new Date().toISOString(), items: ready };
      this.manifestStore.write(this.manifest);
      await this.cache.prune(ready.map((i) => i.fileName));

      const missing = playlist.items.length - ready.length;
      this.#setStatus({
        state: 'ok',
        lastSyncAt: this.manifest.syncedAt,
        version: playlist.version,
        itemCount: ready.length,
        progress: null,
        message: missing > 0 ? `${missing} pieza(s) no se pudieron descargar; se reintentará` : null,
      });
      if (missing > 0) nextDelay = this.syncConfig.retryDelayMs;
      if (changed) this.emit('playlist', this.playerItems());
      this.logger.info(`Sincronización OK (${ready.length} piezas, versión ${playlist.version})`);
    } catch (err) {
      nextDelay = this.syncConfig.retryDelayMs;
      if (err.isAuthError) {
        this.logger.warn('Sesión rechazada por el servidor');
        this.#setStatus({ state: 'error', progress: null, message: err.message });
        this.emit('unauthorized');
        return;
      }
      const state = err.isConnectivityError ? 'offline' : 'error';
      this.logger.warn(`Sincronización fallida (${state})`, { message: err.message });
      this.#setStatus({ state, progress: null, message: err.message });
    } finally {
      if (this.running && this.auth.token) {
        this.timer = setTimeout(() => this.syncNow(), nextDelay);
      }
    }
  }

  #setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.getStatus());
  }
}

module.exports = { ContentService };
