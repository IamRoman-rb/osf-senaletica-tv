'use strict';

/**
 * Traduce la respuesta del servidor al modelo interno de la app (patrón Mapper / Anti-Corruption Layer).
 * Si el formato del endpoint real difiere, sólo se ajusta este archivo.
 *
 * Respuesta de GET /api/screens:
 *   { updatedAt, sucursal, total, items: [{ id, tipo, url, titulo, duracion, orden, sucursales, mimeType }] }
 *
 * Modelo interno:
 *   Playlist  = { version: string, items: MediaItem[] }
 *   MediaItem = { id, type: 'image'|'video', url, title: string|null, durationMs: number|null, checksum: string|null }
 *     - durationMs null en videos = se reproduce completo.
 */

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'svg']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'm4v', 'mov', 'ogv']);

function extensionOf(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = /\.([a-z0-9]+)$/i.exec(pathname);
    return match ? match[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

function inferType(raw, url) {
  // mimeType es lo más confiable; 'tipo' viene en español ('imagen' | 'video').
  for (const candidate of [raw.mimeType, raw.mime, raw.type, raw.tipo]) {
    const declared = String(candidate ?? '').toLowerCase();
    if (declared.startsWith('video')) return 'video';
    if (declared.startsWith('image') || declared.startsWith('imagen')) return 'image';
  }
  const ext = extensionOf(url);
  if (VIDEO_EXT.has(ext)) return 'video';
  if (IMAGE_EXT.has(ext)) return 'image';
  return null;
}

function toDurationMs(raw) {
  if (Number.isFinite(raw.durationMs) && raw.durationMs > 0) return Math.round(raw.durationMs);
  // 'duracion' / 'duration' en segundos
  const seconds = Number(raw.duracion ?? raw.duration);
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
  return null;
}

/**
 * @param {unknown} payload respuesta cruda del endpoint
 * @param {{ defaultImageDurationMs: number }} options
 */
function mapPlaylist(payload, { defaultImageDurationMs }) {
  const rawItems = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : null;
  if (!rawItems) throw new TypeError('La playlist no contiene una lista de elementos');

  const items = rawItems
    .filter((raw) => raw && typeof raw === 'object' && raw.active !== false && raw.enabled !== false)
    .map((raw, index) => ({ raw, index }))
    .sort((a, b) => orderOf(a) - orderOf(b) || a.index - b.index)
    .map(({ raw, index }) => {
      const url = String(raw.url ?? raw.src ?? raw.fileUrl ?? '');
      const type = inferType(raw, url);
      if (!url || !type) return null;
      const durationMs = toDurationMs(raw) ?? (type === 'image' ? defaultImageDurationMs : null);
      return {
        id: String(raw.id ?? raw.uuid ?? `item-${index}`),
        type,
        url,
        title: raw.titulo ?? raw.title ?? null,
        durationMs,
        checksum: raw.checksum ?? raw.hash ?? null,
      };
    })
    .filter(Boolean);

  const version = String(payload?.version ?? payload?.updatedAt ?? hashItems(items));
  return { version, items };
}

function orderOf({ raw, index }) {
  const value = Number(raw.orden ?? raw.order);
  return Number.isFinite(value) ? value : index;
}

function hashItems(items) {
  return items.map((i) => `${i.id}:${i.url}:${i.durationMs}`).join('|');
}

module.exports = { mapPlaylist, extensionOf, inferType };
