'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { HttpClient } = require('./http-client');
const { ApiError } = require('./api-error');
const { mapPlaylist } = require('./playlist-mapper');

/**
 * Contrato de la API de OSF (patrón Adapter + Strategy).
 * La app sólo conoce esta interfaz; hay dos implementaciones intercambiables:
 *   - HttpOsfApi: servidor real.
 *   - MockOsfApi: datos locales para desarrollo y demos.
 *
 * @typedef {{ token: string, user: { username: string, displayName: string, branch: string|null }, expiresAt: string|null }} Session
 * @typedef {{ version: string, items: Array<{id:string,type:'image'|'video',url:string,durationMs:number|null,checksum:string|null}> }} Playlist
 */

class HttpOsfApi {
  constructor({ baseUrl, timeoutMs, endpoints, defaultImageDurationMs, fetchImpl }) {
    this.http = new HttpClient({ baseUrl, timeoutMs, fetchImpl });
    this.endpoints = endpoints;
    this.defaultImageDurationMs = defaultImageDurationMs;
  }

  /** @returns {Promise<Session>} */
  async login(username, password) {
    // TODO(endpoints): ajustar cuerpo y mapeo de la respuesta al endpoint real de login.
    const data = await this.http.request(this.endpoints.login, {
      method: 'POST',
      body: { username, password },
    });
    const token = data?.token ?? data?.accessToken ?? data?.access_token;
    if (!token) throw new ApiError('El servidor no devolvió un token de sesión', { code: 'INVALID_RESPONSE' });
    return {
      token,
      user: {
        username,
        displayName: data?.user?.name ?? data?.user?.displayName ?? username,
        branch: data?.user?.branch ?? data?.branch ?? null,
      },
      expiresAt: data?.expiresAt ?? null,
    };
  }

  /**
   * GET /screens?sucursal=<branch>
   * @param {string} token
   * @param {{ branch?: string|null }} [options]
   * @returns {Promise<Playlist>}
   */
  async fetchPlaylist(token, { branch } = {}) {
    const data = await this.http.request(buildPlaylistPath(this.endpoints, branch), { token });
    return mapPlaylist(data, { defaultImageDurationMs: this.defaultImageDurationMs });
  }
}

class MockOsfApi {
  constructor({ samplesDir, defaultImageDurationMs }) {
    this.samplesDir = samplesDir;
    this.defaultImageDurationMs = defaultImageDurationMs;
  }

  async login(username, password) {
    await delay(400);
    if (!username || !password || password.length < 4) {
      throw new ApiError('Usuario o contraseña incorrectos', { code: 'UNAUTHORIZED', status: 401 });
    }
    return {
      token: `mock-token-${Date.now()}`,
      user: { username, displayName: username, branch: 'Sucursal de prueba' },
      expiresAt: null,
    };
  }

  async fetchPlaylist() {
    await delay(300);
    const sample = (file) => pathToFileURL(path.join(this.samplesDir, file)).toString();
    return mapPlaylist(
      {
        version: 'mock-9x16',
        items: [
          { id: 'demo-9x16-1', type: 'image', url: sample('demo-1.svg'), duration: 6 },
          { id: 'demo-9x16-2', type: 'image', url: sample('demo-2.svg'), duration: 6 },
          { id: 'demo-9x16-3', type: 'image', url: sample('demo-3.svg'), duration: 6 },
        ],
      },
      { defaultImageDurationMs: this.defaultImageDurationMs },
    );
  }
}

/** '/screens' + '?sucursal=Las%20Toninas' (sin sucursal = todas). */
function buildPlaylistPath(endpoints, branch) {
  const name = typeof branch === 'string' ? branch.trim() : '';
  if (!name) return endpoints.playlist;
  const sep = endpoints.playlist.includes('?') ? '&' : '?';
  return `${endpoints.playlist}${sep}${encodeURIComponent(endpoints.branchParam ?? 'sucursal')}=${encodeURIComponent(name)}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Factory: elige la implementación según configuración. */
function createOsfApi(apiConfig, { samplesDir, defaultImageDurationMs }) {
  if (apiConfig.mode === 'http') {
    return new HttpOsfApi({ ...apiConfig, defaultImageDurationMs });
  }
  return new MockOsfApi({ samplesDir, defaultImageDurationMs });
}

module.exports = { createOsfApi, HttpOsfApi, MockOsfApi, buildPlaylistPath };
