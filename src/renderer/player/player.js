'use strict';

/**
 * Reproductor de la TV.
 * - Dos capas que se alternan para hacer un fundido sin parpadeos.
 * - Estrategia por tipo de medio (imagen / video) — patrón Strategy.
 * - Si una pieza falla, pasa a la siguiente; nunca queda trabado.
 */
(() => {
  const TRANSITION_MS = 600;
  const ERROR_BACKOFF_MS = 5000;

  const layers = [document.getElementById('layer-a'), document.getElementById('layer-b')];
  let activeLayer = 0;
  let items = [];
  let index = -1;
  let timer = null;
  let paused = false;
  let consecutiveErrors = 0;
  let config = { fitMode: 'contain', muteVideos: true, rotation: 0 };
  let loadToken = 0;

  const strategies = {
    image: {
      create(item) {
        const img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.src = item.src;
        return img;
      },
      whenReady(el) {
        return el.decode();
      },
      start(el, item) {
        schedule(item.durationMs);
      },
    },
    video: {
      create(item) {
        const video = document.createElement('video');
        video.src = item.src;
        video.muted = config.muteVideos;
        video.playsInline = true;
        video.preload = 'auto';
        return video;
      },
      whenReady(el) {
        return new Promise((resolve, reject) => {
          el.addEventListener('canplay', resolve, { once: true });
          el.addEventListener('error', () => reject(new Error('video error')), { once: true });
        });
      },
      start(el, item) {
        el.addEventListener('ended', next, { once: true });
        el.play().catch(() => next());
        if (item.durationMs) schedule(item.durationMs);
      },
    },
  };

  function schedule(ms) {
    clearTimeout(timer);
    if (!paused) timer = setTimeout(next, ms);
  }

  async function show(newIndex) {
    clearTimeout(timer);
    if (!items.length) {
      clearLayers();
      report();
      return;
    }
    index = ((newIndex % items.length) + items.length) % items.length;
    const item = items[index];
    const strategy = strategies[item.type];
    const token = ++loadToken;
    const target = layers[1 - activeLayer];
    const element = strategy.create(item);
    target.replaceChildren(element);

    try {
      await strategy.whenReady(element);
    } catch {
      if (token !== loadToken) return;
      consecutiveErrors += 1;
      target.replaceChildren();
      const wait = consecutiveErrors >= items.length ? ERROR_BACKOFF_MS : 0;
      timer = setTimeout(next, wait);
      return;
    }
    if (token !== loadToken) return;
    consecutiveErrors = 0;

    const previous = layers[activeLayer];
    target.classList.add('is-visible');
    previous.classList.remove('is-visible');
    activeLayer = 1 - activeLayer;
    setTimeout(() => {
      if (token === loadToken) disposeLayer(previous);
    }, TRANSITION_MS + 50);

    strategy.start(element, item);
    report();
  }

  function next() {
    show(index + 1);
  }

  function previous() {
    show(index - 1);
  }

  function disposeLayer(layer) {
    const video = layer.querySelector('video');
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    layer.replaceChildren();
  }

  function clearLayers() {
    layers.forEach((layer) => {
      layer.classList.remove('is-visible');
      disposeLayer(layer);
    });
  }

  function setPaused(value) {
    paused = value;
    const video = layers[activeLayer].querySelector('video');
    if (video) value ? video.pause() : video.play().catch(() => {});
    if (value) clearTimeout(timer);
    else if (items[index]?.type === 'image') schedule(items[index].durationMs);
    report();
  }

  function report() {
    const current = items[index];
    window.player.report({
      current: current ? { id: current.id, type: current.type, src: current.src } : null,
      index,
      total: items.length,
      paused,
    });
  }

  window.player.onConfig((cfg) => {
    config = { ...config, ...cfg };
    document.body.classList.toggle('fit-cover', config.fitMode === 'cover');
    [90, 180, 270].forEach((deg) => document.body.classList.toggle(`rot-${deg}`, config.rotation === deg));
  });

  window.player.onPlaylist((newItems) => {
    const currentId = items[index]?.id;
    items = Array.isArray(newItems) ? newItems : [];
    const keep = items.findIndex((i) => i.id === currentId);
    if (keep >= 0) {
      index = keep; // sigue la pieza actual; los cambios se ven en la próxima vuelta
      report();
    } else {
      show(0);
    }
  });

  window.player.onCommand((command) => {
    if (command === 'next') next();
    else if (command === 'previous') previous();
    else if (command === 'pause') setPaused(true);
    else if (command === 'resume') setPaused(false);
  });

  window.player.ready();
})();
