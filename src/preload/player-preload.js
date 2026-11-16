'use strict';

/**
 * Puente mínimo para el reproductor de la TV: recibe playlist/órdenes y reporta qué se muestra.
 * Canales: ver src/shared/ipc-channels.js.
 */
const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel) => (callback) => {
  ipcRenderer.on(channel, (_event, payload) => callback(payload));
};

contextBridge.exposeInMainWorld('player', Object.freeze({
  ready: () => ipcRenderer.send('player:ready'),
  report: (state) => ipcRenderer.send('player:report', state),
  onPlaylist: subscribe('player:playlist'),
  onConfig: subscribe('player:config'),
  onCommand: subscribe('player:do'),
}));
