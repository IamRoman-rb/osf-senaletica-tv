'use strict';

/**
 * Panel de administración (ventana 1).
 * Sólo habla con el proceso principal a través de window.osf (preload).
 */
(() => {
  const api = window.osf;
  const $ = (id) => document.getElementById(id);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const state = {
    items: [],
    player: { open: false, current: null, index: -1, total: 0, paused: false },
    displays: [],
    settings: null,
  };

  // ---------------- Utilidades de UI ----------------
  const timeFormat = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  const formatDate = (iso) => (iso ? timeFormat.format(new Date(iso)) : 'Nunca');
  const formatDuration = (item) => (item.durationMs ? `${Math.round(item.durationMs / 1000)} s` : 'Completo');

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value);
    });
    children.forEach((child) => node.append(child));
    return node;
  }

  function mediaElement(item, { controls = false } = {}) {
    if (item.type === 'video') {
      const video = el('video', { src: item.src, preload: 'metadata' });
      video.muted = true;
      video.controls = controls;
      return video;
    }
    return el('img', { src: item.src, alt: '' });
  }

  // ---------------- Vistas ----------------
  function showView(session) {
    $('view-login').hidden = Boolean(session);
    $('view-app').hidden = !session;
    if (session) {
      $('user-name').textContent = `usuario: ${session.user.username}`;
      $('user-branch').textContent = session.user.branch || session.user.displayName;
      refreshAll();
    } else {
      $('login-pass').value = '';
      $('login-user').focus();
    }
  }

  $$('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      $$('[data-nav]').forEach((b) => b.classList.toggle('is-active', b === button));
      $$('[data-view]').forEach((view) => { view.hidden = view.dataset.view !== button.dataset.nav; });
    });
  });

  // ---------------- Login ----------------
  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = $('login-error');
    const submit = $('login-submit');
    errorBox.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Ingresando…';
    try {
      const result = await api.auth.login({
        username: $('login-user').value,
        password: $('login-pass').value,
        remember: $('login-remember').checked,
      });
      if (!result.ok) {
        errorBox.textContent = result.message;
        errorBox.hidden = false;
      }
    } finally {
      submit.disabled = false;
      submit.textContent = 'Ingresar';
    }
  });

  $('logout-btn').addEventListener('click', () => api.auth.logout());

  // ---------------- Contenido ----------------
  function renderContentStatus(status) {
    const map = {
      idle: ['—', ''],
      syncing: [status.progress ? `Descargando ${status.progress.done}/${status.progress.total}` : 'Sincronizando…', 'state-warn'],
      ok: ['● En línea', 'state-ok'],
      offline: ['● Sin conexión (usando caché)', 'state-warn'],
      error: ['● Error', 'state-error'],
    };
    const [label, cls] = map[status.state] ?? map.idle;
    const conn = $('stat-connection');
    conn.textContent = label;
    conn.className = cls;
    $('stat-last-sync').textContent = formatDate(status.lastSyncAt);
    $('stat-count').textContent = String(status.itemCount);
    const message = $('sync-message');
    message.textContent = status.message ?? '';
    message.hidden = !status.message;
    $('sync-btn').disabled = status.state === 'syncing';
  }

  function renderSequence() {
    const list = $('sequence');
    const currentId = state.player.current?.id;
    list.replaceChildren(
      ...state.items.map((item, i) => {
        const thumb = mediaElement(item);
        thumb.className = 'sequence__thumb';
        const li = el('li', {}, [
          el('span', { className: 'sequence__n', text: String(i + 1) }),
          thumb,
          el('div', { className: 'sequence__info' }, [
            el('strong', { text: item.type === 'video' ? 'Video' : 'Imagen' }),
            el('span', { text: item.id }),
          ]),
          el('span', { className: 'pill', text: formatDuration(item) }),
        ]);
        if (item.id === currentId) li.classList.add('is-current');
        return li;
      }),
    );
    $('sequence-empty').hidden = state.items.length > 0;
  }

  $('sync-btn').addEventListener('click', () => api.content.sync());

  // ---------------- Reproductor ----------------
  function renderPlayer() {
    const { open, current, paused } = state.player;
    $('player-toggle').textContent = open ? 'Apagar TV' : 'Abrir en la TV';
    $('player-toggle').className = open ? 'btn btn--ghost' : 'btn btn--primary';
    $('cmd-pause').textContent = paused ? 'Reanudar' : 'Pausar';
    ['cmd-prev', 'cmd-pause', 'cmd-next'].forEach((id) => { $(id).disabled = !open; });

    const preview = $('preview');
    const shownSrc = preview.dataset.src || '';
    const nextSrc = open && current ? current.src : '';
    if (shownSrc !== nextSrc) {
      preview.dataset.src = nextSrc;
      if (nextSrc) {
        const media = mediaElement(current);
        if (current.type === 'video') { media.autoplay = true; media.loop = true; }
        preview.replaceChildren(media);
      } else {
        preview.replaceChildren(el('span', { className: 'muted', text: open ? 'Esperando contenido…' : 'La TV está apagada' }));
      }
    }
    renderSequence();
  }

  $('player-toggle').addEventListener('click', () => (state.player.open ? api.player.close() : api.player.open()));
  $('cmd-prev').addEventListener('click', () => api.player.command('previous'));
  $('cmd-next').addEventListener('click', () => api.player.command('next'));
  $('cmd-pause').addEventListener('click', () => api.player.command(state.player.paused ? 'resume' : 'pause'));

  // ---------------- Pantallas y ajustes ----------------
  function renderDisplays() {
    const select = $('display-select');
    const selected = state.settings?.displayId ?? '';
    select.replaceChildren(
      el('option', { value: '', text: 'Automático (primer monitor secundario)' }),
      ...state.displays.map((d) =>
        el('option', { value: String(d.id), text: `${d.label} · ${d.width}×${d.height}${d.isPrimary ? ' (principal)' : ''}` })),
    );
    select.value = String(selected);
    const target = state.displays.find((d) => d.id === state.settings?.displayId)
      ?? state.displays.find((d) => !d.isPrimary) ?? state.displays[0];
    const portrait = isPortrait(target);
    $('stat-display').textContent = target
      ? `${target.isPrimary ? 'Principal' : 'TV'} · ${portrait ? 'Vertical' : 'Horizontal'}`
      : '—';
    $('preview').classList.toggle('preview--portrait', portrait);
  }

  /** La TV se ve vertical si se rota el contenido 90°/270° o si Windows ya la tiene en vertical. */
  function isPortrait(display) {
    const rotation = state.settings?.rotation ?? 0;
    const displayPortrait = display ? display.height > display.width : false;
    return (rotation === 90 || rotation === 270) !== displayPortrait;
  }

  function renderSettings() {
    const s = state.settings;
    $('fit-select').value = s.fitMode;
    $('rotation-select').value = String(s.rotation);
    $('rotation-label').textContent = ROTATION_LABELS[s.rotation] ?? `${s.rotation}°`;
    $('set-autostart').checked = s.autoStartWithWindows;
    $('set-autoplayer').checked = s.autoOpenPlayer;
    $('set-mute').checked = s.muteVideos;
    renderBranch(s.branch);
    renderDisplays();
  }

  function renderBranch(branch) {
    const select = $('branch-select');
    const known = Array.from(select.options).map((o) => o.value);
    let value;
    if (branch === null) value = '__user__';
    else if (known.includes(branch)) value = branch;
    else value = '__other__';
    select.value = value;
    $('branch-other-wrap').hidden = value !== '__other__';
    if (value === '__other__' && document.activeElement !== $('branch-other')) $('branch-other').value = branch;
  }

  async function saveSettings(partial) {
    state.settings = await api.settings.update(partial);
    renderSettings();
  }

  $('display-select').addEventListener('change', (e) => saveSettings({ displayId: e.target.value === '' ? null : Number(e.target.value) }));
  $('branch-select').addEventListener('change', (e) => {
    const value = e.target.value;
    if (value === '__other__') {
      $('branch-other-wrap').hidden = false;
      $('branch-other').focus();
      return;
    }
    saveSettings({ branch: value === '__user__' ? null : value });
  });
  $('branch-other').addEventListener('change', (e) => {
    const name = e.target.value.trim();
    if (name) saveSettings({ branch: name });
  });
  $('rotation-select').addEventListener('change', (e) => saveSettings({ rotation: Number(e.target.value) }));

  const ROTATION_LABELS = { 0: '0° · Horizontal', 90: '90° · Vertical', 180: '180° · Invertida', 270: '270° · Vertical' };
  const rotateBy = (delta) => saveSettings({ rotation: ((state.settings?.rotation ?? 0) + delta + 360) % 360 });
  $('rotate-left').addEventListener('click', () => rotateBy(-90));
  $('rotate-right').addEventListener('click', () => rotateBy(90));
  $('fit-select').addEventListener('change', (e) => saveSettings({ fitMode: e.target.value }));
  $('set-autostart').addEventListener('change', (e) => saveSettings({ autoStartWithWindows: e.target.checked }));
  $('set-autoplayer').addEventListener('change', (e) => saveSettings({ autoOpenPlayer: e.target.checked }));
  $('set-mute').addEventListener('change', (e) => saveSettings({ muteVideos: e.target.checked }));

  // ---------------- Actualizaciones ----------------
  function renderUpdates(status) {
    const titles = {
      disabled: 'Modo desarrollo',
      idle: 'Esperando…',
      checking: 'Buscando actualizaciones…',
      available: `Actualización ${status.newVersion} disponible`,
      downloading: `Descargando ${status.newVersion ?? ''}`.trim(),
      ready: `Versión ${status.newVersion} lista para instalar`,
      'up-to-date': 'Estás usando la última versión',
      error: 'No se pudo comprobar',
    };
    $$('[data-update-title]').forEach((n) => { n.textContent = titles[status.state] ?? status.state; });
    $$('[data-update-percent]').forEach((n) => { n.textContent = status.percent != null ? `${status.percent}%` : ''; });
    $$('[data-update-bar-wrap]').forEach((n) => { n.hidden = !['downloading', 'ready'].includes(status.state); });
    $$('[data-update-bar]').forEach((n) => { n.style.width = `${status.percent ?? 0}%`; });
    $$('[data-update-meta]').forEach((n) => {
      n.textContent = status.message ?? `Instalada: v${status.currentVersion}${status.state === 'ready' ? ' · Se aplicará al reiniciar' : ''}`;
    });
    $$('[data-update-install]').forEach((n) => { n.hidden = status.state !== 'ready'; });
    $('upd-current').textContent = `v${status.currentVersion}`;
  }

  $$('[data-update-install]').forEach((b) => b.addEventListener('click', () => api.updates.install()));
  $('update-check').addEventListener('click', () => api.updates.check());

  // ---------------- Carga inicial y suscripciones ----------------
  async function refreshAll() {
    const [status, items, player, displays, settings] = await Promise.all([
      api.content.status(), api.content.items(), api.player.state(), api.displays.list(), api.settings.get(),
    ]);
    state.items = items;
    state.player = player;
    state.displays = displays;
    state.settings = settings;
    renderContentStatus(status);
    renderSettings();
    renderPlayer();
  }

  api.auth.onChange(showView);
  api.content.onStatus(renderContentStatus);
  api.content.onItems((items) => { state.items = items; renderSequence(); });
  api.player.onState((player) => { state.player = player; renderPlayer(); });
  api.displays.onChange((displays) => { state.displays = displays; renderDisplays(); });
  api.updates.onStatus(renderUpdates);

  (async () => {
    const [info, session, updates] = await Promise.all([api.app.info(), api.auth.session(), api.updates.status()]);
    $('login-version').textContent = `v${info.version}`;
    $('login-api-mode').textContent = info.apiMode === 'mock' ? 'Modo demo (datos de prueba)' : 'Servidor: OSF';
    renderUpdates(updates);
    showView(session);
  })();
})();
