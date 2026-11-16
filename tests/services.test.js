'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MediaCache } = require('../src/main/services/media-cache');
const { sanitizeSettings } = require('../src/main/services/settings-service');
const { pickTargetDisplay } = require('../src/main/services/display-service');
const { HttpClient } = require('../src/main/api/http-client');

test('MediaCache: nombre de archivo determinístico y seguro', () => {
  const item = { id: 'a', url: 'https://x.com/foto.png', type: 'image' };
  const name = MediaCache.fileNameFor(item);
  assert.equal(name, MediaCache.fileNameFor({ ...item }));
  assert.match(name, /^[a-f0-9]{64}\.png$/);
  assert.ok(MediaCache.isValidFileName(name));
  assert.ok(!MediaCache.isValidFileName('../../windows/system32.dll'));
  assert.match(MediaCache.fileNameFor({ id: 'v', url: 'https://x.com/stream', type: 'video' }), /\.mp4$/);
});

test('sanitizeSettings: ignora valores inválidos', () => {
  assert.deepEqual(sanitizeSettings({ fitMode: 'stretch', muteVideos: 0, displayId: '12', extra: 1 }), {
    muteVideos: false,
    displayId: 12,
  });
  assert.deepEqual(sanitizeSettings(null), {});
});

test('sanitizeSettings: sólo acepta rotaciones de 0/90/180/270', () => {
  assert.deepEqual(sanitizeSettings({ rotation: '90' }), { rotation: 90 });
  assert.deepEqual(sanitizeSettings({ rotation: 270 }), { rotation: 270 });
  assert.deepEqual(sanitizeSettings({ rotation: 45 }), {});
});

test('sanitizeSettings: sucursal null = del usuario, "" = todas', () => {
  assert.deepEqual(sanitizeSettings({ branch: '  Las Toninas ' }), { branch: 'Las Toninas' });
  assert.deepEqual(sanitizeSettings({ branch: '' }), { branch: '' });
  assert.deepEqual(sanitizeSettings({ branch: 5 }), { branch: null });
});

test('buildPlaylistPath: arma /screens?sucursal= codificado', () => {
  const { buildPlaylistPath } = require('../src/main/api/osf-api');
  const endpoints = { playlist: '/screens', branchParam: 'sucursal' };
  assert.equal(buildPlaylistPath(endpoints, null), '/screens');
  assert.equal(buildPlaylistPath(endpoints, ''), '/screens');
  assert.equal(buildPlaylistPath(endpoints, 'San Francisco Solano'), '/screens?sucursal=San%20Francisco%20Solano');
});

test('pickTargetDisplay: preferido > secundario > principal', () => {
  const displays = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.equal(pickTargetDisplay(displays, 1, 3).id, 3);
  assert.equal(pickTargetDisplay(displays, 1, 99).id, 2);
  assert.equal(pickTargetDisplay([{ id: 1 }], 1, null).id, 1);
});

test('HttpClient: exige HTTPS salvo localhost', () => {
  assert.throws(() => new HttpClient({ baseUrl: 'http://osf.com/api' }));
  assert.doesNotThrow(() => new HttpClient({ baseUrl: 'http://localhost:3000' }));
});

test('HttpClient: 401 se traduce a error de autenticación', async () => {
  const client = new HttpClient({
    baseUrl: 'https://osf.test',
    fetchImpl: async () => new Response('{}', { status: 401 }),
  });
  await assert.rejects(client.request('/x'), (err) => err.isAuthError === true);
});

test('HttpClient: envía el token como Bearer', async () => {
  let seen;
  const client = new HttpClient({
    baseUrl: 'https://osf.test/',
    fetchImpl: async (url, init) => {
      seen = { url, auth: init.headers.Authorization };
      return Response.json({ ok: true });
    },
  });
  assert.deepEqual(await client.request('/playlist', { token: 'abc' }), { ok: true });
  assert.deepEqual(seen, { url: 'https://osf.test/playlist', auth: 'Bearer abc' });
});
