'use strict';

const path = require('node:path');
const { app, BrowserWindow, screen, safeStorage } = require('electron');
const { config } = require('./config');
const { Logger } = require('./core/logger');
const { JsonFileStore } = require('./core/json-file-store');
const { createOsfApi } = require('./api/osf-api');
const { SessionStore } = require('./services/session-store');
const { AuthService } = require('./services/auth-service');
const { SettingsService } = require('./services/settings-service');
const { MediaCache } = require('./services/media-cache');
const { ContentService } = require('./services/content-service');
const { DisplayService } = require('./services/display-service');
const { UpdateService } = require('./services/update-service');
const { PlayerWindowController } = require('./windows/player-window');
const { createAdminWindow } = require('./windows/admin-window');
const { registerMediaSchemePrivileges, handleMediaScheme } = require('./media-protocol');
const { registerIpc } = require('./ipc-router');

app.setAppUserModelId('com.osfbroker.senaletica');

// Una sola instancia por equipo: si se abre otra vez, se enfoca la existente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerMediaSchemePrivileges(config.security.mediaScheme);
  app.whenReady().then(bootstrap);
}

/** Composition Root: acá se crean y conectan todas las dependencias (inyección de dependencias). */
function bootstrap() {
  const userData = app.getPath('userData');
  const logger = new Logger({ dir: path.join(userData, 'logs'), level: app.isPackaged ? 'info' : 'debug' });
  const log = (scope) => logger.child(scope);
  logger.info(`Iniciando OSF Señalética v${app.getVersion()} (API: ${config.api.mode})`);

  process.on('uncaughtException', (err) => logger.error('Excepción no controlada', err));
  process.on('unhandledRejection', (err) => logger.error('Promesa rechazada sin manejar', err));

  const api = createOsfApi(config.api, {
    samplesDir: path.join(app.getAppPath(), 'assets', 'samples'),
    defaultImageDurationMs: config.player.defaultImageDurationMs,
  });
  const settings = new SettingsService({ store: new JsonFileStore(path.join(userData, 'settings.json')) });
  const auth = new AuthService({
    api,
    sessionStore: new SessionStore({ dir: userData, safeStorage, logger: log('session') }),
    logger: log('auth'),
  });
  const cache = new MediaCache({ dir: path.join(userData, 'media'), logger: log('cache'), concurrency: config.sync.downloadConcurrency });
  const content = new ContentService({
    api,
    auth,
    cache,
    manifestStore: new JsonFileStore(path.join(userData, 'playlist.json')),
    mediaScheme: config.security.mediaScheme,
    syncConfig: config.sync,
    logger: log('content'),
    // Ajuste explícito > sucursal del usuario logueado > todas
    getBranch: () => settings.get().branch ?? auth.publicSession()?.user.branch ?? null,
  });
  settings.on('change', (_s, changes) => {
    if ('branch' in changes && auth.token) content.syncNow();
  });
  const displays = new DisplayService({ screen });
  const player = new PlayerWindowController({ displayService: displays, settingsService: settings, logger: log('player') });
  const updates = new UpdateService({ app, logger: log('updates'), checkIntervalMs: config.updates.checkIntervalMs });

  handleMediaScheme(config.security.mediaScheme, cache);

  let adminWindow = null;
  const iconFile = path.join(app.getAppPath(), 'build', 'icon.ico');
  const iconPath = require('node:fs').existsSync(iconFile) ? iconFile : undefined;
  const showAdmin = () => {
    if (!adminWindow || adminWindow.isDestroyed()) {
      adminWindow = createAdminWindow({ iconPath });
      adminWindow.on('closed', () => { adminWindow = null; });
    } else {
      if (adminWindow.isMinimized()) adminWindow.restore();
      adminWindow.focus();
    }
  };

  const startSession = () => {
    content.start();
    if (settings.get().autoOpenPlayer) player.open();
  };

  registerIpc({
    app,
    getAdminContents: () => (adminWindow && !adminWindow.isDestroyed() ? adminWindow.webContents : null),
    player,
    auth,
    content,
    settings,
    displays,
    updates,
    onLoggedIn: startSession,
  });

  auth.on('change', (session) => {
    if (!session) {
      content.stop();
      player.close();
    }
  });
  content.on('unauthorized', () => auth.logout('sesión rechazada por el servidor'));

  const applyLoginItem = (s) => {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.autoStartWithWindows });
  };
  applyLoginItem(settings.get());
  settings.on('change', applyLoginItem);

  app.on('second-instance', showAdmin);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) showAdmin(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => content.stop());

  showAdmin();
  updates.start();
  if (auth.restore()) startSession();
}
