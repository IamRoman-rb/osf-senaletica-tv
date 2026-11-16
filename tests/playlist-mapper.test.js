'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mapPlaylist, inferType } = require('../src/main/api/playlist-mapper');

const opts = { defaultImageDurationMs: 10000 };

test('acepta un objeto con items y ordena por "order"', () => {
  const result = mapPlaylist(
    {
      version: 'v7',
      items: [
        { id: 'b', url: 'https://cdn.osf.com/b.mp4', order: 2 },
        { id: 'a', url: 'https://cdn.osf.com/a.jpg', order: 1, duration: 8 },
      ],
    },
    opts,
  );
  assert.equal(result.version, 'v7');
  assert.deepEqual(result.items.map((i) => i.id), ['a', 'b']);
  assert.equal(result.items[0].durationMs, 8000);
  assert.equal(result.items[1].type, 'video');
  assert.equal(result.items[1].durationMs, null, 'los videos sin duración se reproducen completos');
});

test('acepta un arreglo plano y aplica duración por defecto a imágenes', () => {
  const result = mapPlaylist([{ id: 1, src: 'https://x.com/p.png' }], opts);
  assert.equal(result.items[0].id, '1');
  assert.equal(result.items[0].durationMs, 10000);
});

test('descarta inactivos, sin URL o de tipo desconocido', () => {
  const result = mapPlaylist(
    [
      { id: 'ok', url: 'https://x.com/a.webp' },
      { id: 'off', url: 'https://x.com/b.jpg', active: false },
      { id: 'nourl' },
      { id: 'pdf', url: 'https://x.com/c.pdf' },
    ],
    opts,
  );
  assert.deepEqual(result.items.map((i) => i.id), ['ok']);
});

test('el tipo declarado tiene prioridad sobre la extensión', () => {
  assert.equal(inferType({ mimeType: 'video/mp4' }, 'https://x.com/stream?id=3'), 'video');
  assert.equal(inferType({}, 'https://x.com/a.JPG'), 'image');
});

test('rechaza respuestas sin lista', () => {
  assert.throws(() => mapPlaylist({ foo: 1 }, opts), TypeError);
});
