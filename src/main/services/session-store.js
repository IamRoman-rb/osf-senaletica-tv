'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Guarda la sesión cifrada con el almacén seguro del sistema operativo
 * (DPAPI en Windows, vía Electron safeStorage). Nunca se guarda la contraseña.
 */
class SessionStore {
  constructor({ dir, safeStorage, logger }) {
    this.file = path.join(dir, 'session.bin');
    this.safeStorage = safeStorage;
    this.logger = logger;
  }

  load() {
    try {
      if (!fs.existsSync(this.file) || !this.safeStorage.isEncryptionAvailable()) return null;
      const json = this.safeStorage.decryptString(fs.readFileSync(this.file));
      return JSON.parse(json);
    } catch (err) {
      this.logger.warn('No se pudo restaurar la sesión guardada', { message: err.message });
      this.clear();
      return null;
    }
  }

  save(session) {
    if (!this.safeStorage.isEncryptionAvailable()) {
      this.logger.warn('Cifrado del sistema no disponible: la sesión no se recordará');
      return;
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, this.safeStorage.encryptString(JSON.stringify(session)));
  }

  clear() {
    fs.rmSync(this.file, { force: true });
  }
}

module.exports = { SessionStore };
