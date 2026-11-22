/*
 * data.js — data repository (localStorage, JSON import/export, seeding from data/*.json)
 */
(function (root, factory) {
  const geom = (typeof module === 'object' && module.exports)
    ? require('./geometry.js') : root.SO;
  const api = factory(geom);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SO = Object.assign(root.SO || {}, { data: api });
})(typeof globalThis !== 'undefined' ? globalThis : this, function (geom) {
  'use strict';

  // v2: starting fresh — old V1 seeded data (25 items / 45 boxes) is deliberately ignored.
  const KEYS = { objects: 'so.objects.v2', containers: 'so.containers.v2', settings: 'so.settings.v2' };

  // No starter data: the application starts with empty lists.
  const DEFAULT_OBJECTS = [];
  const DEFAULT_CONTAINERS = [];

  const DEFAULT_SETTINGS = {
    space: { length: 300, width: 200, height: 250, unit: 'cm' },
    mode: 'space',
    rotations: true,
    attempts: 12,
    selectedObjects: null,
    selectedContainers: null
  };

  const storage = (function () {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('__so_probe', '1');
        localStorage.removeItem('__so_probe');
        return localStorage;
      }
    } catch (e) { /* file:// or Node: in-memory storage */ }
    const mem = new Map();
    return {
      getItem: k => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: k => mem.delete(k)
    };
  })();

  const clone = value => JSON.parse(JSON.stringify(value));

  function read(key, fallback) {
    try {
      const raw = storage.getItem(key);
      if (!raw) return clone(fallback);
      const parsed = JSON.parse(raw);
      return Array.isArray(fallback) ? (Array.isArray(parsed) ? parsed : clone(fallback))
        : (parsed && typeof parsed === 'object' ? parsed : clone(fallback));
    } catch (e) {
      return clone(fallback);
    }
  }

  function write(key, value) {
    storage.setItem(key, JSON.stringify(value));
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('so:data-changed', { detail: { key } }));
  }

  const loadObjects = () => read(KEYS.objects, DEFAULT_OBJECTS);
  const saveObjects = list => write(KEYS.objects, list);
  const loadContainers = () => read(KEYS.containers, DEFAULT_CONTAINERS);
  const saveContainers = list => write(KEYS.containers, list);
  const loadSettings = () => Object.assign(clone(DEFAULT_SETTINGS), read(KEYS.settings, DEFAULT_SETTINGS));
  const saveSettings = settings => write(KEYS.settings, Object.assign(loadSettings(), settings));

  function resetAll() {
    saveObjects(DEFAULT_OBJECTS);
    saveContainers(DEFAULT_CONTAINERS);
    write(KEYS.settings, clone(DEFAULT_SETTINGS));
  }

  function newId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function totalVolume(items) {
    return items.reduce((sum, raw) => {
      try {
        const norm = geom.normalizeItem(raw);
        return sum + geom.volume(norm.size) * norm.quantity;
      } catch (e) { return sum; }
    }, 0);
  }

  function exportJSON() {
    return JSON.stringify({
      app: 'storage-optimizer', version: 1,
      exportedAt: new Date().toISOString(),
      objects: loadObjects(), containers: loadContainers()
    }, null, 2);
  }

  function importJSON(text) {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { throw new Error('error.invalidJson'); }
    const objects = parsed.objects || (Array.isArray(parsed) ? parsed : null);
    const containers = parsed.containers || [];
    if (!Array.isArray(objects)) throw new Error('error.missingObjects');
    if (!Array.isArray(containers)) throw new Error('error.missingContainers');
    const normalizedObjects = objects.map(obj => {
      const errors = geom.validateObject(obj);
      if (errors.length) throw new Error(`${obj.name || 'Item'} : ${errors.join(', ')}`);
      const resolved = geom.resolveDimensions(obj.dimensions, obj.type === 'cylinder' ? 'cylinder' : 'box');
      return Object.assign({}, obj, { dimensions: resolved.values, estimated: resolved.estimated });
    });
    const normalizedContainers = containers.map(c => {
      const errors = geom.validateObject(Object.assign({}, c, { type: 'box' }));
      if (errors.length) throw new Error(`${c.name || 'Box'} : ${errors.join(', ')}`);
      const resolved = geom.resolveDimensions(c.dimensions, 'box');
      return Object.assign({}, c, { dimensions: resolved.values, estimated: resolved.estimated });
    });
    saveObjects(normalizedObjects);
    saveContainers(normalizedContainers);
    return { objects: normalizedObjects.length, containers: normalizedContainers.length };
  }

  /** Seed from data/*.json only when no local data exists (HTTP only). */
  async function ensureSeeded() {
    if (typeof fetch !== 'function' || typeof location === 'undefined' ||
        location.protocol === 'file:') return false;
    const hasObjects = storage.getItem(KEYS.objects);
    const hasContainers = storage.getItem(KEYS.containers);
    if (hasObjects && hasContainers) return false;
    try {
      const [o, c] = await Promise.all([
        fetch('data/objects.json').then(r => r.ok ? r.json() : null),
        fetch('data/containers.json').then(r => r.ok ? r.json() : null)
      ]);
      if (Array.isArray(o) && !hasObjects) saveObjects(o);
      if (Array.isArray(c) && !hasContainers) saveContainers(c);
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    KEYS, DEFAULT_OBJECTS, DEFAULT_CONTAINERS, DEFAULT_SETTINGS,
    loadObjects, saveObjects, loadContainers, saveContainers,
    loadSettings, saveSettings, resetAll, newId, totalVolume,
    exportJSON, importJSON, ensureSeeded
  };
});
