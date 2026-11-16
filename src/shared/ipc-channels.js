'use strict';

/**
 * Nombres de canales IPC (fuente única de verdad para el proceso principal).
 * Los preloads corren en sandbox y no pueden importar archivos locales,
 * por eso repiten estas cadenas: si cambiás una acá, cambiala también en src/preload/.
 */
const IPC = Object.freeze({
  // Admin -> Main (invoke)
  APP_INFO: 'app:info',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_SESSION: 'auth:session',
  CONTENT_STATUS: 'content:status',
  CONTENT_SYNC: 'content:sync',
  CONTENT_ITEMS: 'content:items',
  PLAYER_OPEN: 'player:open',
  PLAYER_CLOSE: 'player:close',
  PLAYER_COMMAND: 'player:command',
  PLAYER_STATE: 'player:state',
  DISPLAYS_LIST: 'displays:list',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  UPDATE_STATUS: 'update:status',
  UPDATE_CHECK: 'update:check',
  UPDATE_INSTALL: 'update:install',

  // Main -> Admin (eventos)
  EVT_SESSION: 'evt:session',
  EVT_AUTH_NOTICE: 'evt:auth-notice',
  EVT_CONTENT_STATUS: 'evt:content-status',
  EVT_CONTENT_ITEMS: 'evt:content-items',
  EVT_PLAYER_STATE: 'evt:player-state',
  EVT_UPDATE_STATUS: 'evt:update-status',
  EVT_DISPLAYS: 'evt:displays',

  // Main <-> Player
  PLAYER_PLAYLIST: 'player:playlist',
  PLAYER_CONFIG: 'player:config',
  PLAYER_DO: 'player:do',
  PLAYER_REPORT: 'player:report',
  PLAYER_READY: 'player:ready',
});

module.exports = { IPC };
