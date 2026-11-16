'use strict';

const { EventEmitter } = require('node:events');

/**
 * Detecta monitores y elige en cuál va la TV.
 * Emite 'change' cuando se conecta/desconecta un monitor o cambia la resolución.
 */
class DisplayService extends EventEmitter {
  constructor({ screen }) {
    super();
    this.screen = screen;
    const notify = () => this.emit('change');
    screen.on('display-added', notify);
    screen.on('display-removed', notify);
    screen.on('display-metrics-changed', notify);
  }

  list() {
    const primaryId = this.screen.getPrimaryDisplay().id;
    return this.screen.getAllDisplays().map((d, index) => ({
      id: d.id,
      label: d.label || `Pantalla ${index + 1}`,
      width: Math.round(d.size.width * d.scaleFactor),
      height: Math.round(d.size.height * d.scaleFactor),
      isPrimary: d.id === primaryId,
    }));
  }

  /** Monitor elegido; si no existe, el primer secundario; si no hay, el principal. */
  resolveTarget(preferredId) {
    return pickTargetDisplay(this.screen.getAllDisplays(), this.screen.getPrimaryDisplay().id, preferredId);
  }
}

/** Lógica de selección pura (testeable sin Electron). */
function pickTargetDisplay(displays, primaryId, preferredId) {
  if (preferredId != null) {
    const preferred = displays.find((d) => d.id === preferredId);
    if (preferred) return preferred;
  }
  return displays.find((d) => d.id !== primaryId) ?? displays.find((d) => d.id === primaryId) ?? displays[0];
}

module.exports = { DisplayService, pickTargetDisplay };
