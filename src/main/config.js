'use strict';

/**
 * Configuración central de la aplicación.
 * Todo valor ajustable vive acá (o se sobreescribe por variables de entorno),
 * para no tener "números mágicos" dispersos por el código.
 */

const MINUTE = 60 * 1000;

function readEnv(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function isPackaged() {
  try {
    return require('electron').app.isPackaged;
  } catch {
    return false;
  }
}

const config = Object.freeze({
  api: Object.freeze({
    /**
     * 'http' = servidor real de OSF (por defecto en la versión instalada)
     * 'mock' = datos de prueba locales (por defecto con `npm run dev`)
     */
    mode: readEnv('OSF_API_MODE', isPackaged() ? 'http' : 'mock'),
    baseUrl: readEnv('OSF_API_BASE_URL', 'https://osfbrokerdeseguros.com/api'),
    timeoutMs: Number(readEnv('OSF_API_TIMEOUT_MS', 15000)),
    /** Rutas relativas a baseUrl. */
    endpoints: Object.freeze({
      // TODO(endpoints): confirmar ruta de login con el equipo web.
      login: readEnv('OSF_API_LOGIN_PATH', '/auth/login'),
      /** GET /screens?sucursal=<nombre>  (sin parámetro = todas las sucursales). Requiere Bearer token. */
      playlist: readEnv('OSF_API_PLAYLIST_PATH', '/screens'),
      branchParam: 'sucursal',
    }),
  }),
  sync: Object.freeze({
    intervalMs: Number(readEnv('OSF_SYNC_INTERVAL_MS', 5 * MINUTE)),
    retryDelayMs: Number(readEnv('OSF_SYNC_RETRY_MS', 30 * 1000)),
    downloadConcurrency: 2,
  }),
  player: Object.freeze({
    defaultImageDurationMs: 10 * 1000,
    transitionMs: 600,
  }),
  updates: Object.freeze({
    checkIntervalMs: 60 * MINUTE,
  }),
  security: Object.freeze({
    /** Esquema propio con el que el reproductor accede a la caché local de medios. */
    mediaScheme: 'osf-media',
  }),
});

module.exports = { config };
