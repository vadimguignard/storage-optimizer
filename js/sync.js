/*
 * sync.js — synchronisation du dépôt de données via l'API GitHub.
 * Le code reste sur `main` (GitHub Pages) ; les données vivent dans une branche séparée.
 * Chaque appareil saisit son propre jeton, stocké uniquement dans son navigateur.
 */
(function (root) {
  'use strict';
  const SO = root.SO = root.SO || {};
  const CONFIG_KEY = 'so.sync.config.v1';
  const STATE_KEY = 'so.sync.state.v1';
  const DATA_PATH = 'data/store.json';
  const POLL_MS = 20000;

  const memory = new Map();
  const store = (typeof localStorage !== 'undefined') ? localStorage : {
    getItem: k => memory.has(k) ? memory.get(k) : null,
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: k => memory.delete(k)
  };

  function readJSON(key, fallback) {
    try {
      const raw = store.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  let config = readJSON(CONFIG_KEY, null);
  let state = Object.assign({ sha: null, lastUpdatedAt: 0, deviceId: null }, readJSON(STATE_KEY, {}));
  if (!state.deviceId) state.deviceId = Math.random().toString(36).slice(2, 10);
  let applyingRemote = false;
  let pushTimer = null;
  let pollTimer = null;
  let lastStatus = { status: config && config.enabled ? 'synced' : 'local' };
  const listeners = [];

  function saveConfig() { store.setItem(CONFIG_KEY, JSON.stringify(config)); }
  function saveState() { store.setItem(STATE_KEY, JSON.stringify(state)); }

  function emit(status, extra) {
    lastStatus = Object.assign({ status }, extra || {});
    listeners.forEach(fn => { try { fn(lastStatus); } catch (e) { /* ignore */ } });
  }

  function apiUrl() {
    return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${DATA_PATH}?ref=${encodeURIComponent(config.branch)}`;
  }

  function rawUrl() {
    return `https://raw.githubusercontent.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${encodeURIComponent(config.branch)}/${DATA_PATH}?t=${Date.now()}`;
  }

  function headers() {
    return {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
  }

  function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
  }

  function payload() {
    return {
      app: 'storage-optimizer',
      version: 1,
      updatedAt: Date.now(),
      deviceId: state.deviceId,
      objects: SO.data.loadObjects(),
      containers: SO.data.loadContainers()
    };
  }

  function isEnabled() { return !!(config && config.enabled && config.token); }
  function getConfig() { return config ? Object.assign({}, config) : null; }
  function getStatus() { return lastStatus; }
  function onStatus(fn) { listeners.push(fn); fn(lastStatus); return () => {
    const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1);
  }; }

  /** Download the remote store and apply it when it is newer. */
  async function pull() {
    if (!isEnabled()) return { changed: false };
    emit('syncing');
    try {
      const response = await fetch(rawUrl(), { cache: 'no-store' });
      if (response.status === 404) { emit('synced'); return { changed: false, missing: true }; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const remote = await response.json();
      if (!remote || !Array.isArray(remote.objects)) throw new Error('invalid payload');
      const updatedAt = Number(remote.updatedAt) || 0;
      if (state.lastUpdatedAt && updatedAt <= state.lastUpdatedAt) {
        emit('synced', { time: state.lastUpdatedAt });
        return { changed: false };
      }
      // Older payloads may contain only two dimensions: resolve them on arrival.
      const normalize = (list, isContainer) => (Array.isArray(list) ? list : []).map(raw => {
        try {
          const type = isContainer ? 'box' : (raw.type === 'cylinder' ? 'cylinder' : 'box');
          const resolved = SO.resolveDimensions(raw.dimensions, type);
          return Object.assign({}, raw, { dimensions: resolved.values, estimated: resolved.estimated });
        } catch (e) { return raw; }
      });
      applyingRemote = true;
      SO.data.saveObjects(normalize(remote.objects, false));
      SO.data.saveContainers(normalize(remote.containers, true));
      state.lastUpdatedAt = updatedAt;
      saveState();
      setTimeout(() => { applyingRemote = false; }, 0);
      emit('synced', { time: updatedAt });
      return { changed: true };
    } catch (e) {
      emit('error', { message: e.message });
      throw e;
    }
  }

  /** Upload the local store to the data branch. */
  async function push(retry) {
    if (!isEnabled()) return;
    emit('syncing');
    const data = payload();
    try {
      let sha = state.sha;
      if (!sha) {
        const current = await fetch(apiUrl(), { headers: headers() });
        if (current.ok) {
          const json = await current.json();
          sha = json.sha || null;
        } else if (current.status !== 404) {
          throw new Error(`HTTP ${current.status}`);
        }
      }
      const body = {
        message: `Update move data ${new Date(data.updatedAt).toISOString()}`,
        content: encodeBase64(JSON.stringify(data, null, 2)),
        branch: config.branch
      };
      if (sha) body.sha = sha;
      const response = await fetch(apiUrl(), { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
      if (response.status === 409 && !retry) {
        state.sha = null; saveState();
        return push(true);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      state.sha = (json.content && json.content.sha) || sha;
      state.lastUpdatedAt = data.updatedAt;
      saveState();
      emit('synced', { time: data.updatedAt });
    } catch (e) {
      emit('error', { message: e.message });
      if (root.SO.ui) root.SO.ui.toast(root.SO.i18n.t('sync.pushFailed', { msg: e.message }), 'error');
    }
  }

  function schedulePush() {
    if (!isEnabled() || applyingRemote) return;
    clearTimeout(pushTimer);
    emit('syncing');
    pushTimer = setTimeout(() => push(), 600);
  }

  function startPolling() {
    clearInterval(pollTimer);
    if (!isEnabled()) return;
    pollTimer = setInterval(() => { pull().catch(() => {}); }, POLL_MS);
  }

  function enable(next) {
    config = Object.assign({}, next, { branch: next.branch || 'sync', enabled: true });
    state.sha = null;
    saveConfig(); saveState();
    startPolling();
    return pull().catch(() => {}).then(() => push());
  }

  function disable() {
    config = null;
    store.removeItem(CONFIG_KEY);
    clearInterval(pollTimer);
    clearTimeout(pushTimer);
    emit('disabled');
  }

  async function syncNow() {
    if (!isEnabled()) return;
    try {
      const result = await pull();
      await push();
      return result;
    } catch (e) {
      if (root.SO.ui) root.SO.ui.toast(root.SO.i18n.t('sync.pullFailed'), 'error');
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('so:data-changed', e => {
      // Settings changes are local to each device: do not create Git commits for them.
      if (e.detail && e.detail.key === SO.data.KEYS.settings) return;
      schedulePush();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && isEnabled()) pull().catch(() => {});
    });
    if (config && config.enabled) startPolling();
  }

  SO.sync = { enable, disable, syncNow, pull, push, isEnabled, getConfig, getStatus, onStatus };
})(typeof globalThis !== 'undefined' ? globalThis : this);
