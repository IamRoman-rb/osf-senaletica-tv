'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

/**
 * Identidad estable del equipo, requerida por el servidor (machineId).
 * El primer equipo que inicia sesión con un usuario de pantalla queda vinculado a él.
 *
 * Origen: MachineGuid de Windows (sobrevive a reinstalar la app). Se envía hasheado
 * para no exponer el identificador real del sistema. Si no se puede leer, se usa
 * un UUID aleatorio persistido en la carpeta de datos de la app.
 */
const MACHINE_ID_PATTERN = /^[A-Za-z0-9.:_\-{}]{8,200}$/;

async function resolveMachineIdentity({ userDataDir, logger }) {
  const guid = await readWindowsMachineGuid().catch(() => null);
  let id;
  if (guid) {
    id = toMachineId(guid);
  } else {
    id = readOrCreateFallbackId(path.join(userDataDir, 'machine-id'));
    logger?.warn('No se pudo leer el MachineGuid de Windows; se usa un ID local');
  }
  return { id, name: os.hostname().slice(0, 100) };
}

/** 'win-' + 40 hex del SHA-256: cumple 8–200 caracteres del servidor. Función pura. */
function toMachineId(guid) {
  const hash = crypto.createHash('sha256').update(`osf-senaletica|${String(guid).trim().toLowerCase()}`).digest('hex');
  return `win-${hash.slice(0, 40)}`;
}

function readWindowsMachineGuid() {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('No es Windows'));
    execFile(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        if (err) return reject(err);
        const match = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/.exec(stdout);
        return match ? resolve(match[1]) : reject(new Error('MachineGuid no encontrado'));
      },
    );
  });
}

function readOrCreateFallbackId(file) {
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (MACHINE_ID_PATTERN.test(saved)) return saved;
  } catch {
    /* se crea abajo */
  }
  const id = `app-${crypto.randomUUID()}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, id, 'utf8');
  return id;
}

module.exports = { resolveMachineIdentity, toMachineId, MACHINE_ID_PATTERN };
