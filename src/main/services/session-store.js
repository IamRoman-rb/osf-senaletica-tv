'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Guarda la sesión cifrada con el almacén seguro del sistema operativo
 * (DPAPI en Windows, vía Electron safeStorage): sólo el usuario de Windows de este
 * equipo puede descifrarla. Si se eligió "Recordar este equipo" incluye las credenciales
 * del usuario de pantalla, para renovar el token sin intervención. Si el cifrado del
 * sistema no está disponible, no se guarda nada en disco.
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
