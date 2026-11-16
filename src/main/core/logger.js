'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Logger mínimo con rotación de un archivo (app.log -> app.old.log).
 * Nunca registra contraseñas ni tokens: quien llama es responsable de no pasarlos.
 */
class Logger {
  constructor({ dir, level = 'info', scope = 'app' } = {}) {
    this.dir = dir;
    this.levelName = level;
    this.level = LEVELS[level] ?? LEVELS.info;
    this.scope = scope;
    this.file = dir ? path.join(dir, 'app.log') : null;
    if (dir) fs.mkdirSync(dir, { recursive: true });
  }

  child(scope) {
    return new Logger({ dir: this.dir, level: this.levelName, scope });
  }

  debug(msg, meta) { this.#write('debug', msg, meta); }
  info(msg, meta) { this.#write('info', msg, meta); }
  warn(msg, meta) { this.#write('warn', msg, meta); }
  error(msg, meta) { this.#write('error', msg, meta); }

  #write(level, msg, meta) {
    if (LEVELS[level] < this.level) return;
    const extra = meta instanceof Error ? ` ${meta.stack || meta.message}` : meta ? ` ${safeJson(meta)}` : '';
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] [${this.scope}] ${msg}${extra}`;
    (level === 'error' ? console.error : console.log)(line);
    if (!this.file) return;
    try {
      this.#rotateIfNeeded();
      fs.appendFileSync(this.file, line + '\n', 'utf8');
    } catch {
      /* el logging nunca debe tirar abajo la app */
    }
  }

  #rotateIfNeeded() {
    try {
      if (fs.statSync(this.file).size > MAX_FILE_BYTES) {
        fs.renameSync(this.file, path.join(this.dir, 'app.old.log'));
      }
    } catch {
      /* archivo inexistente: nada que rotar */
    }
  }
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

module.exports = { Logger };
