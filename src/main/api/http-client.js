'use strict';

const { ApiError } = require('./api-error');

/**
 * Cliente HTTP delgado sobre fetch nativo con timeout y errores tipados.
 * Sólo acepta HTTPS (salvo localhost para desarrollo).
 */
class HttpClient {
  constructor({ baseUrl, timeoutMs = 15000, fetchImpl = globalThis.fetch }) {
    assertSecureUrl(baseUrl);
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async request(path, { method = 'GET', body, token, headers = {} } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new ApiError('El servidor tardó demasiado en responder', { code: 'TIMEOUT' });
      throw new ApiError('No se pudo conectar con el servidor', { code: 'NETWORK' });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw ApiError.fromResponse(response.status, errorBody);
    }
    try {
      return await response.json();
    } catch {
      throw new ApiError('Respuesta inválida del servidor', { code: 'INVALID_RESPONSE', status: response.status });
    }
  }
}

function assertSecureUrl(url) {
  const parsed = new URL(url);
  const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !isLocal) {
    throw new Error(`La URL de la API debe usar HTTPS: ${url}`);
  }
}

module.exports = { HttpClient, assertSecureUrl };
