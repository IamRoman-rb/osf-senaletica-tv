'use strict';

/**
 * Traduce la respuesta del servidor al modelo interno de la app (patrón Mapper / Anti-Corruption Layer).
 * Si el formato del endpoint real difiere, sólo se ajusta este archivo.
 *
 * Modelo interno:
 *   Playlist  = { version: string, items: MediaItem[] }
 *   MediaItem = { id: string, type: 'image'|'video', url: string, durationMs: number|null, checksum: string|null }
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
  const declared = String(raw.type ?? raw.mimeType ?? raw.mime ?? '').toLowerCase();
  if (declared.startsWith('video')) return 'video';
  if (declared.startsWith('image')) return 'image';
  const ext = extensionOf(url);
  if (VIDEO_EXT.has(ext)) return 'video';
  if (IMAGE_EXT.has(ext)) return 'image';
  return null;
}

function toDurationMs(raw) {
  if (Number.isFinite(raw.durationMs) && raw.durationMs > 0) return Math.round(raw.durationMs);
  if (Number.isFinite(raw.duration) && raw.duration > 0) return Math.round(raw.duration * 1000);
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
    .sort((a, b) => (Number(a.raw.order ?? a.index) - Number(b.raw.order ?? b.index)))
    .map(({ raw, index }) => {
      const url = String(raw.url ?? raw.src ?? raw.fileUrl ?? '');
      const type = inferType(raw, url);
      if (!url || !type) return null;
      const durationMs = toDurationMs(raw) ?? (type === 'image' ? defaultImageDurationMs : null);
      return {
        id: String(raw.id ?? raw.uuid ?? `item-${index}`),
        type,
        url,
        durationMs,
        checksum: raw.checksum ?? raw.hash ?? null,
      };
    })
    .filter(Boolean);

  const version = String(payload?.version ?? payload?.updatedAt ?? hashItems(items));
  return { version, items };
}

function hashItems(items) {
  return items.map((i) => `${i.id}:${i.url}:${i.durationMs}`).join('|');
}

module.exports = { mapPlaylist, extensionOf, inferType };
