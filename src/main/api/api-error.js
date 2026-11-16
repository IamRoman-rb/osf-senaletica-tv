'use strict';

/**
 * Mensajes para los códigos de error que devuelve el servidor de OSF
 * (server/routes/screens.js). Se muestran tal cual al usuario de la sucursal.
 */
const SERVER_MESSAGES = Object.freeze({
  INVALID_CREDENTIALS: 'Usuario o contraseña incorrectos. Usá un usuario de pantalla (no sirven las credenciales de administrador).',
  DEVICE_DISABLED: 'Este usuario de pantalla está deshabilitado. Contactá a un administrador.',
  TOO_MANY_ATTEMPTS: 'Demasiados intentos fallidos. Esperá unos minutos y volvé a intentar.',
  MACHINE_MISMATCH: 'Este usuario ya está vinculado a otro equipo. Un administrador debe desvincularlo desde el panel web.',
  INVALID_TOKEN: 'La sesión venció o se cambió la contraseña. Iniciá sesión nuevamente.',
});

/** Códigos con los que la sesión deja de servir. */
const SESSION_CODES = new Set(['INVALID_CREDENTIALS', 'INVALID_TOKEN', 'MACHINE_MISMATCH', 'DEVICE_DISABLED']);

/** Error tipado de la capa de API, para que la UI muestre mensajes claros. */
class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ code: 'UNAUTHORIZED'|'FORBIDDEN'|'RATE_LIMITED'|'NETWORK'|'TIMEOUT'|'SERVER'|'INVALID_RESPONSE',
   *           status?: number, serverCode?: string|null }} info
   */
  constructor(message, { code, status, serverCode = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.serverCode = serverCode;
  }

  /** Construye el error a partir de una respuesta HTTP no exitosa ({ error, code } del servidor). */
  static fromResponse(status, body) {
    const serverCode = typeof body?.code === 'string' ? body.code : null;
    const code =
      status === 401 ? 'UNAUTHORIZED'
        : status === 403 ? 'FORBIDDEN'
          : status === 429 ? 'RATE_LIMITED'
            : 'SERVER';
    const serverText = typeof body?.error === 'string' && body.error.trim() ? body.error : null;
    const message = SERVER_MESSAGES[serverCode] ?? serverText ?? `El servidor respondió con error ${status}`;
    return new ApiError(message, { code, status, serverCode });
  }

  /** La sesión ya no es válida (hay que volver a iniciar sesión o pedir ayuda a un admin). */
  get isAuthError() {
    return this.code === 'UNAUTHORIZED' || SESSION_CODES.has(this.serverCode);
  }

  /** Vale la pena reintentar un login automático (token vencido), no así un equipo bloqueado. */
  get isRecoverableByLogin() {
    return this.serverCode === 'INVALID_TOKEN' || (this.code === 'UNAUTHORIZED' && !this.serverCode);
  }

  get isConnectivityError() {
    return this.code === 'NETWORK' || this.code === 'TIMEOUT';
  }
}

module.exports = { ApiError, SERVER_MESSAGES };
