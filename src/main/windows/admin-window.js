'use strict';

const path = require('node:path');
const { BrowserWindow } = require('electron');
const { secureWebPreferences, lockDownNavigation } = require('./secure-web-preferences');

/** Ventana 1: launcher + inicio de sesión + panel de administración. */
function createAdminWindow({ iconPath }) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'OSF Señalética',
    backgroundColor: '#F4F7FB',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences(path.join(__dirname, '..', '..', 'preload', 'admin-preload.js')),
  });
  win.removeMenu();
  lockDownNavigation(win);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'admin', 'index.html'));
  return win;
}

module.exports = { createAdminWindow };
