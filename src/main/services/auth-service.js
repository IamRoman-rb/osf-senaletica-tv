'use strict';

const { EventEmitter } = require('node:events');

/**
 * Autenticación contra el servidor de OSF.
 * Emite 'change' con la sesión pública (sin token) cada vez que cambia.
 */
class AuthService extends EventEmitter {
  constructor({ api, sessionStore, logger }) {
    super();
    this.api = api;
    this.sessionStore = sessionStore;
    this.logger = logger;
    this.session = null;
  }

  restore() {
    const saved = this.sessionStore.load();
    if (saved && !isExpired(saved)) {
      this.session = saved;
      this.logger.info(`Sesión restaurada para ${saved.user.username}`);
    } else if (saved) {
      this.sessionStore.clear();
    }
    return this.publicSession();
  }

  async login(username, password, { remember = true } = {}) {
    const cleanUser = String(username ?? '').trim();
    if (!cleanUser || !password) throw new Error('Ingresá usuario y contraseña');
    const session = await this.api.login(cleanUser, String(password));
    this.session = session;
    if (remember) this.sessionStore.save(session);
    else this.sessionStore.clear();
    this.logger.info(`Inicio de sesión correcto: ${cleanUser}`);
    this.emit('change', this.publicSession());
    return this.publicSession();
  }

  logout(reason = 'manual') {
    if (!this.session) return;
    this.logger.info(`Cierre de sesión (${reason})`);
    this.session = null;
    this.sessionStore.clear();
    this.emit('change', null);
  }

  get token() {
    return this.session?.token ?? null;
  }

  publicSession() {
    return this.session ? { user: this.session.user, expiresAt: this.session.expiresAt } : null;
  }
}

function isExpired(session) {
  return Boolean(session.expiresAt) && Date.parse(session.expiresAt) <= Date.now();
}

module.exports = { AuthService };
