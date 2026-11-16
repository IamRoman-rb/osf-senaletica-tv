'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpOsfApi, mapLoginResponse } = require('../src/main/api/osf-api');
const { ApiError } = require('../src/main/api/api-error');
const { mapPlaylist } = require('../src/main/api/playlist-mapper');
const { toMachineId, MACHINE_ID_PATTERN } = require('../src/main/services/machine-identity');

const machine = { id: 'win-0123456789abcdef', name: 'TV Recepción' };
const endpoints = { login: '/screens/login', playlist: '/screens' };

function fakeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    return handler(url, init);
  };
  return { calls, fetchImpl };
}

test('login: envía machineId/machineName y mapea la respuesta', async () => {
  const { calls, fetchImpl } = fakeFetch(() =>
    Response.json({ token: 'tok', expiresIn: 2592000, username: 'pantalla-centro', sucursal: 'Centro' }));
  const api = new HttpOsfApi({ baseUrl: 'https://osf.test/api', timeoutMs: 1000, endpoints, defaultImageDurationMs: 10000, machine, fetchImpl });

  const session = await api.login({ username: 'pantalla-centro', password: 'secreta' });

  assert.equal(calls[0].url, 'https://osf.test/api/screens/login');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(calls[0].body, { username: 'pantalla-centro', password: 'secreta', machineId: machine.id, machineName: machine.name });
  assert.equal(session.token, 'tok');
  assert.equal(session.user.branch, 'Centro');
  assert.ok(Date.parse(session.expiresAt) > Date.now() + 29 * 24 * 3600 * 1000);
});

test('playlist: manda Bearer y X-Machine-Id', async () => {
  const { calls, fetchImpl } = fakeFetch(() => Response.json({ updatedAt: '2026-11-16T10:00:00Z', items: [] }));
  const api = new HttpOsfApi({ baseUrl: 'https://osf.test/api', timeoutMs: 1000, endpoints, defaultImageDurationMs: 10000, machine, fetchImpl });

  const playlist = await api.fetchPlaylist('tok');

  assert.equal(calls[0].url, 'https://osf.test/api/screens');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(calls[0].init.headers['X-Machine-Id'], machine.id);
  assert.equal(playlist.version, '2026-11-16T10:00:00Z');
});

test('mapea el formato de /api/screens (tipo, titulo, duracion, orden, mimeType)', () => {
  const { items } = mapPlaylist(
    {
      updatedAt: 'x',
      items: [
        { id: 7, tipo: 'video', url: 'https://osf.test/u/b.mp4', titulo: 'Spot', duracion: null, orden: 2, mimeType: 'video/mp4' },
        { id: 3, tipo: 'imagen', url: 'https://osf.test/u/a', titulo: 'Auto', duracion: 12, orden: 1, mimeType: 'image/jpeg' },
      ],
    },
    { defaultImageDurationMs: 10000 },
  );
  assert.deepEqual(items.map((i) => [i.id, i.type, i.title, i.durationMs]), [
    ['3', 'image', 'Auto', 12000],
    ['7', 'video', 'Spot', null],
  ]);
});

test('errores del servidor -> mensajes y clasificación', () => {
  const mismatch = ApiError.fromResponse(403, { error: 'x', code: 'MACHINE_MISMATCH' });
  assert.ok(mismatch.isAuthError);
  assert.ok(!mismatch.isRecoverableByLogin, 'un equipo bloqueado no se arregla re-logueando');
  assert.match(mismatch.message, /vinculado a otro equipo/);

  const expired = ApiError.fromResponse(401, { error: 'Token inválido o vencido', code: 'INVALID_TOKEN' });
  assert.ok(expired.isAuthError && expired.isRecoverableByLogin);

  const tooMany = ApiError.fromResponse(429, { code: 'TOO_MANY_ATTEMPTS' });
  assert.equal(tooMany.code, 'RATE_LIMITED');
  assert.ok(!tooMany.isAuthError);

  assert.ok(ApiError.fromResponse(403, { code: 'DEVICE_DISABLED' }).isAuthError);
  assert.match(ApiError.fromResponse(500, null).message, /500/);
});

test('mapLoginResponse: sin token es respuesta inválida', () => {
  assert.throws(() => mapLoginResponse({}, 'u'), (err) => err.code === 'INVALID_RESPONSE');
});

test('machineId: estable y con el formato que exige el servidor', () => {
  const guid = '6f1a3c1e-1234-4bcd-9abc-0123456789ab';
  const id = toMachineId(guid);
  assert.equal(id, toMachineId(guid.toUpperCase()));
  assert.match(id, MACHINE_ID_PATTERN);
  assert.ok(!id.includes(guid), 'no expone el GUID real');
});
