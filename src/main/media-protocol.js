'use strict';

const { protocol, net } = require('electron');
const { pathToFileURL } = require('node:url');
const { MediaCache } = require('./services/media-cache');

/** Debe llamarse ANTES de app.whenReady(). */
function registerMediaSchemePrivileges(scheme) {
  protocol.registerSchemesAsPrivileged([
    { scheme, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
  ]);
}

/**
 * Sirve archivos de la caché local al reproductor: osf-media://media/<sha256>.<ext>
 * Sólo nombres con formato de hash: imposible salir de la carpeta de caché (path traversal).
 */
function handleMediaScheme(scheme, cache) {
  protocol.handle(scheme, (request) => {
    const url = new URL(request.url);
    const fileName = url.pathname.replace(/^\/+/, '');
    if (url.hostname !== 'media' || !MediaCache.isValidFileName(fileName) || !cache.has(fileName)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(cache.pathFor(fileName)).toString(), {
      headers: request.headers,
    });
  });
}

module.exports = { registerMediaSchemePrivileges, handleMediaScheme };
