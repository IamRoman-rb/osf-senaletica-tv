'use strict';

const { ipcMain } = require('electron');
const { IPC } = require('../shared/ipc-channels');

/**
 * Registra los handlers IPC (patrón Facade: la UI sólo ve estas operaciones).
 * Cada handler verifica que el mensaje venga de la ventana correcta.
 */
function registerIpc({ app, getAdminContents, player, auth, content, settings, displays, updates, machine, onLoggedIn }) {
  const fromAdmin = (handler) => async (event, ...args) => {
    if (event.sender !== getAdminContents()) throw new Error('Origen IPC no autorizado');
    return handler(...args);
  };
  const fromPlayer = (handler) => (event, ...args) => {
    if (event.sender !== player.webContents) return;
    handler(...args);
  };

  let playerState = { open: false, current: null, index: -1, total: 0, paused: false };

  ipcMain.handle(IPC.APP_INFO, fromAdmin(() => ({
    version: app.getVersion(),
    apiMode: require('./config').config.api.mode,
    machineId: machine.id,
    machineName: machine.name,
  })));

  ipcMain.handle(IPC.AUTH_SESSION, fromAdmin(() => auth.publicSession()));
  ipcMain.handle(IPC.AUTH_LOGIN, fromAdmin(async (payload) => {
    try {
      const session = await auth.login(payload?.username, payload?.password, { remember: payload?.remember !== false });
      onLoggedIn();
      return { ok: true, session };
    } catch (err) {
      return { ok: false, message: err.message || 'No se pudo iniciar sesión' };
    }
  }));
  ipcMain.handle(IPC.AUTH_LOGOUT, fromAdmin(() => {
    auth.logout();
    return true;
  }));

  ipcMain.handle(IPC.CONTENT_STATUS, fromAdmin(() => content.getStatus()));
  ipcMain.handle(IPC.CONTENT_ITEMS, fromAdmin(() => content.playerItems()));
  ipcMain.handle(IPC.CONTENT_SYNC, fromAdmin(async () => {
    await content.syncNow();
    return content.getStatus();
  }));

  ipcMain.handle(IPC.PLAYER_OPEN, fromAdmin(() => player.open()));
  ipcMain.handle(IPC.PLAYER_CLOSE, fromAdmin(() => player.close()));
  ipcMain.handle(IPC.PLAYER_STATE, fromAdmin(() => playerState));
  ipcMain.handle(IPC.PLAYER_COMMAND, fromAdmin((command) => {
    if (['next', 'previous', 'pause', 'resume'].includes(command)) player.send(IPC.PLAYER_DO, command);
  }));

  ipcMain.handle(IPC.DISPLAYS_LIST, fromAdmin(() => displays.list()));
  ipcMain.handle(IPC.SETTINGS_GET, fromAdmin(() => settings.get()));
  ipcMain.handle(IPC.SETTINGS_UPDATE, fromAdmin((partial) => settings.update(partial)));

  ipcMain.handle(IPC.UPDATE_STATUS, fromAdmin(() => updates.getStatus()));
  ipcMain.handle(IPC.UPDATE_CHECK, fromAdmin(() => updates.check()));
  ipcMain.handle(IPC.UPDATE_INSTALL, fromAdmin(() => updates.installNow()));

  // Mensajes del reproductor
  const sendPlayerConfig = () => {
    const s = settings.get();
    player.send(IPC.PLAYER_CONFIG, { fitMode: s.fitMode, muteVideos: s.muteVideos, rotation: s.rotation });
  };
  ipcMain.on(IPC.PLAYER_READY, fromPlayer(() => {
    sendPlayerConfig();
    player.send(IPC.PLAYER_PLAYLIST, content.playerItems());
  }));
  ipcMain.on(IPC.PLAYER_REPORT, fromPlayer((report) => {
    playerState = {
      open: true,
      current: report?.current ?? null,
      index: Number(report?.index ?? -1),
      total: Number(report?.total ?? 0),
      paused: Boolean(report?.paused),
    };
    emitToAdmin(IPC.EVT_PLAYER_STATE, playerState);
  }));

  // Eventos main -> ventanas
  function emitToAdmin(channel, payload) {
    const wc = getAdminContents();
    if (wc && !wc.isDestroyed()) wc.send(channel, payload);
  }

  auth.on('change', (session, reason, message) => {
    emitToAdmin(IPC.EVT_SESSION, session);
    if (reason === 'expired') emitToAdmin(IPC.EVT_AUTH_NOTICE, message);
  });
  content.on('status', (status) => emitToAdmin(IPC.EVT_CONTENT_STATUS, status));
  content.on('playlist', (items) => {
    player.send(IPC.PLAYER_PLAYLIST, items);
    emitToAdmin(IPC.EVT_CONTENT_ITEMS, items);
  });
  settings.on('change', sendPlayerConfig);
  displays.on('change', () => emitToAdmin(IPC.EVT_DISPLAYS, displays.list()));
  updates.on('status', (status) => emitToAdmin(IPC.EVT_UPDATE_STATUS, status));
  player.on('opened', () => {
    playerState = { ...playerState, open: true };
    emitToAdmin(IPC.EVT_PLAYER_STATE, playerState);
  });
  player.on('closed', () => {
    playerState = { open: false, current: null, index: -1, total: 0, paused: false };
    emitToAdmin(IPC.EVT_PLAYER_STATE, playerState);
  });
}

module.exports = { registerIpc };
