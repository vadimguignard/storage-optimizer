/*
 * sync.js — synchronisation via un Cloudflare Worker.
 * Le code reste sur `main` (GitHub Pages) ; les données vivent dans une branche séparée.
 * Le token GitHub est stocké UNIQUEMENT comme secret Cloudflare. Le navigateur
 * n'a aucun token à saisir : il appelle ce proxy, qui ajoute l'autorisation côté serveur.
 */
(function (root) {
  'use strict';
  const SO = root.SO = root.SO || {};
  const CONFIG_KEY = 'so.sync.config.v1';
  const STATE_KEY = 'so.sync.state.v1';
  // Public Worker URL. The GitHub token is a Cloudflare secret, never stored here.
  const PROXY_URL = 'https://storage-optimizer-sync.vadim-guignard.workers.dev';
  // Short interval so a change made on one device appears almost immediately on the others.
  // Conditional GETs (ETag) keep this cheap and below GitHub's rate limit.
  const POLL_MS = 2000;

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

  // Auto-enabled: no token, no setup. A stored opt-out ({ enabled: false }) is respected.
  let config = readJSON(CONFIG_KEY, { enabled: true });
  if (!config) config = { enabled: true };
  if (config.token || config.owner || config.repo || config.branch) {
    // Remove credentials/old settings left by the previous version.
    config = { enabled: config.enabled !== false };
  }
  let state = Object.assign({ sha: null, etag: null, lastUpdatedAt: 0, deviceId: null }, readJSON(STATE_KEY, {}));
  if (!state.deviceId) state.deviceId = Math.random().toString(36).slice(2, 10);
  let applyingRemote = false;
  let pushInFlight = false;
  let pushQueued = false;
  let pollTimer = null;
  let lastStatus = { status: config && config.enabled ? 'synced' : 'local' };
  const listeners = [];

  function saveConfig() { store.setItem(CONFIG_KEY, JSON.stringify(config)); }
  function saveState() { store.setItem(STATE_KEY, JSON.stringify(state)); }

  // Persist the credential-free config (and migrate old token-based config).
  saveConfig();

  function emit(status, extra) {
    lastStatus = Object.assign({ status }, extra || {});
    listeners.forEach(fn => { try { fn(lastStatus); } catch (e) { /* ignore */ } });
  }

  function apiUrl() {
    return PROXY_URL;
  }

  function headers(extra) {
    const result = {
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };
    // Conditional GET: a 304 response does not consume the GitHub API rate limit.
    if (extra && extra.ifNoneMatch) result['If-None-Match'] = extra.ifNoneMatch;
    return result;
  }

  function responseEtag(response) {
    return (response.headers && typeof response.headers.get === 'function')
      ? response.headers.get('etag') : null;
  }

  function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
  }

  function decodeBase64(text) {
    const binary = atob(String(text).replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
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

  function isEnabled() { return !!(config && config.enabled); }
  function getConfig() { return { enabled: isEnabled() }; }
  function getStatus() { return lastStatus; }
  function onStatus(fn) { listeners.push(fn); fn(lastStatus); return () => {
    const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1);
  }; }

  /** Resolve two-dimension records that may come from an older payload. */
  function normalizeList(list, isContainer) {
    return (Array.isArray(list) ? list : []).map(raw => {
      try {
        const type = isContainer ? 'box' : (raw.type === 'cylinder' ? 'cylinder' : 'box');
        const resolved = SO.resolveDimensions(raw.dimensions, type);
        return Object.assign({}, raw, { dimensions: resolved.values, estimated: resolved.estimated });
      } catch (e) { return raw; }
    });
  }

  /** Download the remote store via the Contents API and apply it when newer. */
  async function pull(quiet) {
    if (!isEnabled()) return { changed: false };
    if (!quiet) emit('syncing');
    try {
      const response = await fetch(apiUrl(), {
        headers: headers({ ifNoneMatch: state.etag }),
        cache: 'no-store'
      });
      if (response.status === 304) {
        emit('synced', { time: state.lastUpdatedAt });
        return { changed: false };
      }
      if (response.status === 404) {
        state.etag = null; saveState();
        emit('synced'); return { changed: false, missing: true };
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const file = await response.json();
      if (!file.content) throw new Error('missing content');
      const remote = JSON.parse(decodeBase64(file.content));
      if (!remote || !Array.isArray(remote.objects)) throw new Error('invalid payload');

      if (file.sha) state.sha = file.sha;
      // The proxy may not expose GitHub's ETag header; GitHub accepts the file sha as one.
      state.etag = responseEtag(response) || (file.sha ? `"${file.sha}"` : null);
      saveState();
      const updatedAt = Number(remote.updatedAt) || 0;
      if (state.lastUpdatedAt && updatedAt <= state.lastUpdatedAt) {
        emit('synced', { time: state.lastUpdatedAt });
        return { changed: false };
      }
      applyingRemote = true;
      try {
        SO.data.saveObjects(normalizeList(remote.objects, false));
        SO.data.saveContainers(normalizeList(remote.containers, true));
      } finally {
        applyingRemote = false;
      }
      state.lastUpdatedAt = updatedAt;
      saveState();
      emit('synced', { time: updatedAt });
      if (root.SO.ui && root.SO.i18n) {
        root.SO.ui.toast(root.SO.i18n.t('sync.remoteNewer'), 'success');
      }
      return { changed: true };
    } catch (e) {
      emit('error', { message: e.message });
      throw e;
    }
  }

  /** Upload the local store to the data branch. */
  async function push(retry, notify) {
    if (!isEnabled()) return;
    emit('syncing');
    const data = payload();
    try {
      let sha = state.sha;
      if (!sha) {
        const current = await fetch(apiUrl(), { headers: headers(), cache: 'no-store' });
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
      const response = await fetch(apiUrl().split('?')[0], {
        method: 'PUT', headers: headers(), body: JSON.stringify(body)
      });
      if (response.status === 409 && !retry) {
        state.sha = null; saveState();
        return push(true, notify);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      state.sha = (json.content && json.content.sha) || sha;
      state.etag = responseEtag(response) || (state.sha ? `"${state.sha}"` : null);
      state.lastUpdatedAt = data.updatedAt;
      saveState();
      emit('synced', { time: data.updatedAt });
      if (notify && root.SO.ui && root.SO.i18n) {
        root.SO.ui.toast(root.SO.i18n.t('sync.pushed'), 'success');
      }
    } catch (e) {
      emit('error', { message: e.message });
      if (root.SO.ui) root.SO.ui.toast(root.SO.i18n.t('sync.pushFailed', { msg: e.message }), 'error');
    }
  }

  /** Push immediately on confirmation; coalesce overlapping saves into one follow-up. */
  async function schedulePush() {
    if (!isEnabled() || applyingRemote) return;
    emit('syncing');
    if (pushInFlight) { pushQueued = true; return; }
    pushInFlight = true;
    try {
      do {
        pushQueued = false;
        await push(false, true);
      } while (pushQueued && isEnabled());
    } finally {
      pushInFlight = false;
    }
  }

  function startPolling() {
    clearInterval(pollTimer);
    if (!isEnabled()) return;
    pollTimer = setInterval(() => { pull(true).catch(() => {}); }, POLL_MS);
  }

  function enable() {
    config = { enabled: true };
    state.sha = null;
    state.etag = null;
    state.lastUpdatedAt = 0;
    saveConfig(); saveState();
    startPolling();
    return pull(false).catch(() => {}).then(() => push(false, false));
  }

  function disable() {
    config = { enabled: false };
    saveConfig();
    clearInterval(pollTimer);
    emit('disabled');
  }

  async function syncNow() {
    if (!isEnabled()) return;
    try {
      const result = await pull();
      await push(false, false);
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
      if (!document.hidden && isEnabled()) pull(true).catch(() => {});
    });
    if (config && config.enabled) {
      startPolling();
      // Check immediately on load; background checks then run every POLL_MS.
      pull(true).catch(() => {});
    }
  }

  SO.sync = { enable, disable, syncNow, pull, push, isEnabled, getConfig, getStatus, onStatus };
})(typeof globalThis !== 'undefined' ? globalThis : this);
