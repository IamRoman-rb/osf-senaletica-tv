'use strict';

/** Error tipado de la capa de API, para que la UI muestre mensajes claros. */
class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ code: 'UNAUTHORIZED'|'NETWORK'|'TIMEOUT'|'SERVER'|'INVALID_RESPONSE', status?: number }} info
   */
  constructor(message, { code, status } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }

  get isAuthError() {
    return this.code === 'UNAUTHORIZED';
  }

  get isConnectivityError() {
    return this.code === 'NETWORK' || this.code === 'TIMEOUT';
  }
}

module.exports = { ApiError };
