'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { HttpClient } = require('./http-client');
const { ApiError } = require('./api-error');
const { mapPlaylist } = require('./playlist-mapper');

/**
 * Contrato de la API de OSF (patrón Adapter + Strategy).
 * La app sólo conoce esta interfaz; hay dos implementaciones intercambiables:
 *   - HttpOsfApi: servidor real (server/routes/screens.js).
 *   - MockOsfApi: datos locales para desarrollo y demos.
 *
 * @typedef {{ username: string, password: string }} Credentials
 * @typedef {{ token: string, user: { username: string, displayName: string, branch: string|null }, expiresAt: string|null }} Session
 * @typedef {{ version: string, items: Array<{id:string,type:'image'|'video',url:string,title:string|null,durationMs:number|null,checksum:string|null}> }} Playlist
 */

class HttpOsfApi {
  constructor({ baseUrl, timeoutMs, endpoints, defaultImageDurationMs, machine, fetchImpl }) {
    this.http = new HttpClient({ baseUrl, timeoutMs, fetchImpl });
    this.endpoints = endpoints;
    this.defaultImageDurationMs = defaultImageDurationMs;
    this.machine = machine;
  }

  /**
   * POST /api/screens/login
   * Body: { username, password, machineId, machineName }
   * Respuesta: { token, expiresIn (s), username, sucursal }
   * @param {Credentials} credentials
   * @returns {Promise<Session>}
   */
  async login({ username, password }) {
    const data = await this.http.request(this.endpoints.login, {
      method: 'POST',
      body: { username, password, machineId: this.machine.id, machineName: this.machine.name },
    });
    return mapLoginResponse(data, username);
  }

  /**
   * GET /api/screens (el servidor ya filtra por la sucursal del usuario, activos y fechas).
   * @returns {Promise<Playlist>}
   */
  async fetchPlaylist(token) {
    const data = await this.http.request(this.endpoints.playlist, {
      token,
      headers: { 'X-Machine-Id': this.machine.id },
    });
    const playlist = mapPlaylist(data, { defaultImageDurationMs: this.defaultImageDurationMs });
    const apiUrl = new URL(this.http.baseUrl);
    return {
      ...playlist,
      items: playlist.items.map((item) => ({ ...item, url: upgradeToApiProtocol(item.url, apiUrl) })),
    };
  }
}

/**
 * Detrás de nginx el servidor puede armar las URLs de archivos con http:// aunque el sitio
 * sea https. Si el archivo es del mismo dominio que la API y la API es https, se pide por https.
 * Otros dominios no se tocan (siguen sujetos a la regla de sólo HTTPS).
 */
function upgradeToApiProtocol(url, apiUrl) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' && apiUrl.protocol === 'https:' && parsed.hostname === apiUrl.hostname) {
      parsed.protocol = 'https:';
      if (parsed.port === '80') parsed.port = '';
      return parsed.toString();
    }
  } catch {
    /* URL inválida: la descarga fallará y se registrará */
  }
  return url;
}

/** Respuesta del login -> Session interna. Función pura (testeable). */
function mapLoginResponse(data, fallbackUsername, now = Date.now()) {
  if (!data?.token) throw new ApiError('El servidor no devolvió un token de sesión', { code: 'INVALID_RESPONSE' });
  const expiresIn = Number(data.expiresIn);
  const username = data.username ?? fallbackUsername;
  return {
    token: data.token,
    user: { username, displayName: username, branch: data.sucursal ?? null },
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(now + expiresIn * 1000).toISOString() : null,
  };
}

class MockOsfApi {
  constructor({ samplesDir, defaultImageDurationMs }) {
    this.samplesDir = samplesDir;
    this.defaultImageDurationMs = defaultImageDurationMs;
  }

  async login({ username, password }) {
    await delay(400);
    if (!username || !password || password.length < 4) {
      throw ApiError.fromResponse(401, { code: 'INVALID_CREDENTIALS' });
    }
    return mapLoginResponse({ token: `mock-token-${Date.now()}`, expiresIn: 2592000, username, sucursal: 'Sucursal de prueba' }, username);
  }

  async fetchPlaylist() {
    await delay(300);
    const sample = (file) => pathToFileURL(path.join(this.samplesDir, file)).toString();
    return mapPlaylist(
      {
        updatedAt: 'mock-9x16',
        items: [
          { id: 'demo-9x16-1', tipo: 'imagen', titulo: 'Pieza de prueba 1', url: sample('demo-1.svg'), duracion: 6 },
          { id: 'demo-9x16-2', tipo: 'imagen', titulo: 'Pieza de prueba 2', url: sample('demo-2.svg'), duracion: 6 },
          { id: 'demo-9x16-3', tipo: 'imagen', titulo: 'Pieza de prueba 3', url: sample('demo-3.svg'), duracion: 6 },
        ],
      },
      { defaultImageDurationMs: this.defaultImageDurationMs },
    );
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Factory: elige la implementación según configuración. */
function createOsfApi(apiConfig, { samplesDir, defaultImageDurationMs, machine }) {
  if (apiConfig.mode === 'http') {
    return new HttpOsfApi({ ...apiConfig, defaultImageDurationMs, machine });
  }
  return new MockOsfApi({ samplesDir, defaultImageDurationMs });
}

module.exports = { createOsfApi, HttpOsfApi, MockOsfApi, mapLoginResponse, upgradeToApiProtocol };
