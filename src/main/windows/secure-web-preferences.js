'use strict';

/**
 * Endurecimiento común para todas las ventanas (recomendaciones de seguridad de Electron).
 */
function secureWebPreferences(preloadPath) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: false,
    devTools: !require('electron').app.isPackaged,
  };
}

/** Bloquea navegación y ventanas emergentes no previstas. */
function lockDownNavigation(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
}

module.exports = { secureWebPreferences, lockDownNavigation };
