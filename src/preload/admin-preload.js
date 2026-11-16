'use strict';

/**
 * Puente seguro entre el panel de administración y el proceso principal.
 * Corre en sandbox: no puede importar archivos locales, por eso los canales
 * están escritos acá (deben coincidir con src/shared/ipc-channels.js).
 */
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const subscribe = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('osf', Object.freeze({
  app: { info: invoke('app:info') },
  auth: {
    session: invoke('auth:session'),
    login: invoke('auth:login'),
    logout: invoke('auth:logout'),
    onChange: subscribe('evt:session'),
  },
  content: {
    status: invoke('content:status'),
    items: invoke('content:items'),
    sync: invoke('content:sync'),
    onStatus: subscribe('evt:content-status'),
    onItems: subscribe('evt:content-items'),
  },
  player: {
    open: invoke('player:open'),
    close: invoke('player:close'),
    state: invoke('player:state'),
    command: invoke('player:command'),
    onState: subscribe('evt:player-state'),
  },
  displays: { list: invoke('displays:list'), onChange: subscribe('evt:displays') },
  settings: { get: invoke('settings:get'), update: invoke('settings:update') },
  updates: {
    status: invoke('update:status'),
    check: invoke('update:check'),
    install: invoke('update:install'),
    onStatus: subscribe('evt:update-status'),
  },
}));
