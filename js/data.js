/*
 * data.js — dépôt de données (localStorage, import/export JSON, amorçage depuis data/*.json)
 */
(function (root, factory) {
  const geom = (typeof module === 'object' && module.exports)
    ? require('./geometry.js') : root.SO;
  const api = factory(geom);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SO = Object.assign(root.SO || {}, { data: api });
})(typeof globalThis !== 'undefined' ? globalThis : this, function (geom) {
  'use strict';

  const KEYS = { objects: 'so.objects.v1', containers: 'so.containers.v1', settings: 'so.settings.v1' };

  const DEFAULT_OBJECTS = [
    { id: 'table-001', name: 'Table à manger', type: 'box', dimensions: { length: 180, width: 80, height: 75 }, unit: 'cm', rotations: 'allowed', quantity: 1, color: '#3b82f6' },
    { id: 'canape-001', name: 'Canapé', type: 'box', dimensions: { length: 220, width: 95, height: 85 }, unit: 'cm', rotations: 'allowed', quantity: 1, color: '#8b5cf6' },
    { id: 'lit-001', name: 'Lit double', type: 'box', dimensions: { length: 200, width: 160, height: 50 }, unit: 'cm', rotations: 'allowed', quantity: 1, color: '#ec4899' },
    { id: 'armoire-001', name: 'Armoire', type: 'box', dimensions: { length: 120, width: 60, height: 200 }, unit: 'cm', rotations: 'none', quantity: 1, color: '#f97316' },
    { id: 'frigo-001', name: 'Réfrigérateur', type: 'box', dimensions: { length: 70, width: 70, height: 180 }, unit: 'cm', rotations: 'none', quantity: 1, color: '#14b8a6' },
    { id: 'lave-linge-001', name: 'Lave-linge', type: 'box', dimensions: { length: 60, width: 60, height: 85 }, unit: 'cm', rotations: 'none', quantity: 1, color: '#0ea5e9' },
    { id: 'bureau-001', name: 'Bureau', type: 'box', dimensions: { length: 140, width: 70, height: 75 }, unit: 'cm', rotations: 'allowed', quantity: 1, color: '#6366f1' },
    { id: 'chaise-001', name: 'Chaise', type: 'box', dimensions: { length: 45, width: 50, height: 90 }, unit: 'cm', rotations: 'allowed', quantity: 4, color: '#eab308' },
    { id: 'carton-livres', name: 'Carton de livres', type: 'box', dimensions: { length: 40, width: 30, height: 30 }, unit: 'cm', rotations: 'allowed', quantity: 8, color: '#a16207' },
    { id: 'carton-vaisselle', name: 'Carton de vaisselle', type: 'box', dimensions: { length: 50, width: 40, height: 40 }, unit: 'cm', rotations: 'allowed', quantity: 4, color: '#d97706' },
    { id: 'lampe-001', name: 'Lampadaire', type: 'cylinder', dimensions: { diameter: 35, height: 160 }, unit: 'cm', rotations: 'upright', quantity: 1, color: '#facc15' },
    { id: 'plante-001', name: 'Grande plante', type: 'cylinder', dimensions: { diameter: 50, height: 120 }, unit: 'cm', rotations: 'upright', quantity: 1, color: '#22c55e' }
  ];

  const DEFAULT_CONTAINERS = [
    { id: 'carton-standard', name: 'Carton standard', type: 'box', dimensions: { length: 60, width: 40, height: 40 }, unit: 'cm', quantity: 20, color: '#d97706', contents: [] },
    { id: 'carton-renforce', name: 'Carton renforcé', type: 'box', dimensions: { length: 50, width: 40, height: 50 }, unit: 'cm', quantity: 10, color: '#b45309', contents: [] },
    { id: 'carton-livres-type', name: 'Carton à livres', type: 'box', dimensions: { length: 32, width: 27, height: 30 }, unit: 'cm', quantity: 15, color: '#92400e', contents: [] }
  ];

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
    } catch (e) { /* file:// ou Node : stockage mémoire */ }
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
      try { return sum + geom.volume(geom.normalizeItem(raw).size) * Math.max(1, Number(raw.quantity) || 1); }
      catch (e) { return sum; }
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
    catch (e) { throw new Error('Le fichier n’est pas un JSON valide.'); }
    const objects = parsed.objects || (Array.isArray(parsed) ? parsed : null);
    const containers = parsed.containers || [];
    if (!Array.isArray(objects)) throw new Error('Clé "objects" absente ou invalide.');
    if (!Array.isArray(containers)) throw new Error('Clé "containers" absente ou invalide.');
    for (const obj of objects) {
      const errors = geom.validateObject(obj);
      if (errors.length) throw new Error(`${obj.name || 'Objet'} : ${errors.join(' ')}`);
    }
    for (const c of containers) {
      const errors = geom.validateObject(Object.assign({}, c, { type: 'box' }));
      if (errors.length) throw new Error(`${c.name || 'Carton'} : ${errors.join(' ')}`);
    }
    saveObjects(objects);
    saveContainers(containers);
    return { objects: objects.length, containers: containers.length };
  }

  /** Amorce depuis data/*..json si aucune donnée locale n'existe (serveur HTTP uniquement). */
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
