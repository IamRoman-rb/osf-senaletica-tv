'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { fileURLToPath } = require('node:url');
const { extensionOf } = require('../api/playlist-mapper');
const { assertSecureUrl } = require('../api/http-client');

const FILE_NAME_PATTERN = /^[a-f0-9]{64}\.[a-z0-9]{1,5}$/;
const DEFAULT_EXT = Object.freeze({ image: 'jpg', video: 'mp4' });

/**
 * Caché local de imágenes y videos (patrón Repository).
 * Permite que la TV siga funcionando aunque se caiga internet en la sucursal.
 */
class MediaCache {
  constructor({ dir, logger, concurrency = 2, fetchImpl = globalThis.fetch }) {
    this.dir = dir;
    this.logger = logger;
    this.concurrency = concurrency;
    this.fetch = fetchImpl;
    fs.mkdirSync(dir, { recursive: true });
  }

  static fileNameFor(item) {
    const hash = crypto.createHash('sha256').update(`${item.id}|${item.url}|${item.checksum ?? ''}`).digest('hex');
    const ext = extensionOf(item.url) || DEFAULT_EXT[item.type] || 'bin';
    return `${hash}.${ext}`;
  }

  static isValidFileName(name) {
    return FILE_NAME_PATTERN.test(name);
  }

  pathFor(fileName) {
    if (!MediaCache.isValidFileName(fileName)) throw new Error('Nombre de archivo de caché inválido');
    return path.join(this.dir, fileName);
  }

  has(fileName) {
    return fs.existsSync(this.pathFor(fileName));
  }

  /**
   * Descarga los elementos que falten. Devuelve los que quedaron disponibles localmente.
   * @param {Array} items
   * @param {(done:number,total:number)=>void} [onProgress]
   */
  async ensure(items, onProgress) {
    const queue = items.map((item) => ({ item, fileName: MediaCache.fileNameFor(item) }));
    const ready = new Map();
    let done = 0;

    const worker = async () => {
      while (queue.length) {
        const { item, fileName } = queue.shift();
        try {
          if (!this.has(fileName)) await this.#download(item, fileName);
          ready.set(item.id, { ...item, fileName });
        } catch (err) {
          this.logger.warn(`No se pudo descargar ${item.id}`, { message: err.message });
        }
        onProgress?.(++done, items.length);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, this.concurrency) }, worker));
    return items.filter((i) => ready.has(i.id)).map((i) => ready.get(i.id));
  }

  /** Borra archivos que ya no están en la playlist vigente. */
  async prune(keepFileNames) {
    const keep = new Set(keepFileNames);
    const entries = await fsp.readdir(this.dir);
    await Promise.all(
      entries
        .filter((name) => !keep.has(name))
        .map((name) => fsp.rm(path.join(this.dir, name), { force: true })),
    );
  }

  async #download(item, fileName) {
    const target = this.pathFor(fileName);
    const tmp = `${target}.part`;
    const url = new URL(item.url);

    if (url.protocol === 'file:') {
      await fsp.copyFile(fileURLToPath(url), tmp);
    } else {
      assertSecureUrl(item.url);
      const response = await this.fetch(item.url);
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tmp));
    }

    if (item.checksum && /^[a-f0-9]{64}$/i.test(item.checksum)) {
      const actual = await sha256File(tmp);
      if (actual.toLowerCase() !== item.checksum.toLowerCase()) {
        await fsp.rm(tmp, { force: true });
        throw new Error('Checksum SHA-256 no coincide');
      }
    }
    await fsp.rename(tmp, target);
  }
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

module.exports = { MediaCache };
