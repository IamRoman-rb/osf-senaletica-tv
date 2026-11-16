'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Logger } = require('../src/main/core/logger');

test('Logger.child escribe con su propio scope en el mismo archivo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osf-log-'));
  const logger = new Logger({ dir, level: 'info' });
  const child = logger.child('updates');
  const detached = child.info; // electron-updater invoca los métodos sueltos
  assert.doesNotThrow(() => detached.call(child, 'hola'));
  assert.doesNotThrow(() => child.warn('cuidado', { a: 1 }));
  const content = fs.readFileSync(path.join(dir, 'app.log'), 'utf8');
  assert.match(content, /\[updates\] hola/);
  assert.match(content, /\[WARN\] \[updates\] cuidado/);
  fs.rmSync(dir, { recursive: true, force: true });
});
