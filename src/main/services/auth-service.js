'use strict';

const { EventEmitter } = require('node:events');

/** Se renueva el token cuando le quedan menos de 2 días (dura 30). */
const REFRESH_BEFORE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Autenticación con usuarios de pantalla del servidor de OSF.
 *
 * Si se marca "Recordar este equipo", las credenciales se guardan cifradas con DPAPI
 * (SessionStore) para que la TV renueve el token sola cuando vence, sin que alguien
 * tenga que volver a iniciar sesión en la sucursal cada 30 días.
 *
 * Eventos: 'change' (publicSession|null, reason: 'login'|'refresh'|'manual'|'expired', message?)
 */
class AuthService extends EventEmitter {
  constructor({ api, sessionStore, logger }) {
    super();
    this.api = api;
    this.sessionStore = sessionStore;
    this.logger = logger;
    this.session = null;
    this.refreshing = null;
  }

  /** Restaura la sesión guardada. Si el token venció pero hay credenciales, se renovará al sincronizar. */
  restore() {
    const saved = this.sessionStore.load();
    if (saved?.token && (saved.credentials || !isExpired(saved))) {
      this.session = saved;
      this.logger.info(`Sesión restaurada para ${saved.user.username}`);
    } else if (saved) {
      this.sessionStore.clear();
    }
    return this.publicSession();
  }

  async login(username, password, { remember = true } = {}) {
    const credentials = { username: String(username ?? '').trim(), password: String(password ?? '') };
    if (!credentials.username || !credentials.password) throw new Error('Ingresá usuario y contraseña');
    const session = await this.api.login(credentials);
    this.#setSession({ ...session, credentials: remember ? credentials : null }, remember);
    this.logger.info(`Inicio de sesión correcto: ${credentials.username}`);
    this.emit('change', this.publicSession(), 'login');
    return this.publicSession();
  }

  /**
   * Vuelve a iniciar sesión con las credenciales guardadas.
   * @returns {Promise<boolean>} true si se obtuvo un token nuevo.
   */
  refresh() {
    if (!this.refreshing) {
      this.refreshing = this.#doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  /** Renueva por adelantado si el token está por vencer. Nunca lanza. */
  async refreshIfExpiring() {
    const expiresAt = Date.parse(this.session?.expiresAt ?? '');
    if (this.session?.credentials && Number.isFinite(expiresAt) && expiresAt - Date.now() < REFRESH_BEFORE_MS) {
      await this.refresh();
    }
  }

  /** El servidor rechazó la sesión: se pide login otra vez, pero la TV sigue con lo que tiene en caché. */
  expire(message) {
    if (!this.session) return;
    this.logger.warn(`Sesión invalidada: ${message}`);
    this.session = null;
    this.sessionStore.clear();
    this.emit('change', null, 'expired', message);
  }

  logout() {
    if (!this.session) return;
    this.logger.info('Cierre de sesión manual');
    this.session = null;
    this.sessionStore.clear();
    this.emit('change', null, 'manual');
  }

  get token() {
    return this.session?.token ?? null;
  }

  publicSession() {
    return this.session ? { user: this.session.user, expiresAt: this.session.expiresAt } : null;
  }

  async #doRefresh() {
    const credentials = this.session?.credentials;
    if (!credentials) return false;
    try {
      const session = await this.api.login(credentials);
      this.#setSession({ ...session, credentials }, true);
      this.logger.info('Token renovado automáticamente');
      this.emit('change', this.publicSession(), 'refresh');
      return true;
    } catch (err) {
      this.logger.warn('No se pudo renovar el token', { message: err.message, code: err.serverCode });
      if (err.isAuthError) this.expire(err.message);
      return false;
    }
  }

  #setSession(session, persist) {
    this.session = session;
    if (persist) this.sessionStore.save(session);
    else this.sessionStore.clear();
  }
}

function isExpired(session) {
  return Boolean(session.expiresAt) && Date.parse(session.expiresAt) <= Date.now();
}

module.exports = { AuthService };
