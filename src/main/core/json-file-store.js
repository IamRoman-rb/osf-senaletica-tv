'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Persistencia JSON con escritura atómica (tmp + rename) para no corromper
 * el archivo si se corta la luz en la sucursal a mitad de una escritura.
 */
class JsonFileStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  read(fallback = null) {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      return fallback;
    }
  }

  write(data) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  delete() {
    fs.rmSync(this.filePath, { force: true });
  }
}

module.exports = { JsonFileStore };
