/*
 * geometry.js — calculs géométriques pure (aucune dépendance navigateur)
 * Axes internes : x = longueur, y = largeur, z = hauteur.
 * Toutes les dimensions internes sont en cm.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SO = Object.assign(root.SO || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EPS = 1e-6;
  const UNIT_TO_CM = { mm: 0.1, cm: 1, m: 100 };

  function number(value, label) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) throw new Error(`${label || 'Dimension'} invalide`);
    return n;
  }

  function positive(value, label) {
    const n = number(value, label);
    if (n <= 0) throw new Error(`${label || 'Dimension'} doit être > 0`);
    return n;
  }

  function toCm(value, unit) {
    const factor = UNIT_TO_CM[unit || 'cm'];
    if (!factor) throw new Error(`Unité inconnue : ${unit}`);
    return number(value, 'Dimension') * factor;
  }

  function volume(size) {
    return size.l * size.w * size.h;
  }

  /** Convertit un objet brut (JSON) en objet interne normalisé (cm). */
  function normalizeItem(item) {
    if (!item || typeof item !== 'object') throw new Error('Objet invalide');
    const d = item.dimensions || {};
    const unit = item.unit || 'cm';
    let l, w, h, factor;
    if (item.size && typeof item.size === 'object') {
      // Objet déjà normalisé (par exemple un carton issu du premier niveau de packing)
      l = positive(item.size.l, 'Longueur');
      w = positive(item.size.w, 'Largeur');
      h = positive(item.size.h, 'Hauteur');
      factor = 1;
    } else {
      if (item.type === 'cylinder') {
        const diameter = positive(d.diameter, 'Diamètre');
        l = diameter; w = diameter; h = positive(d.height, 'Hauteur');
      } else {
        l = positive(d.length, 'Longueur');
        w = positive(d.width, 'Largeur');
        h = positive(d.height, 'Hauteur');
      }
      factor = UNIT_TO_CM[unit];
      if (!factor) throw new Error(`Unité inconnue : ${unit}`);
    }
    const rotations = ['allowed', 'upright', 'none'].includes(item.rotations)
      ? item.rotations : 'allowed';
    const qty = Math.max(1, Math.floor(item.quantity == null ? 1 : Number(item.quantity) || 1));
    return {
      id: item.id || `objet-${Math.random().toString(36).slice(2, 9)}`,
      name: item.name || 'Objet',
      type: item.type === 'cylinder' ? 'cylinder' : 'box',
      size: { l: l * factor, w: w * factor, h: h * factor },
      unit: 'cm',
      rotations,
      quantity: qty,
      color: item.color || null,
      isContainer: !!item.isContainer,
      contents: Array.isArray(item.contents) ? item.contents.slice() : []
    };
  }

  function normalizeContainer(container) {
    const item = normalizeItem(Object.assign({}, container, { type: 'box' }));
    item.rotations = 'none';
    item.quantity = Math.max(1, Math.floor(container.quantity == null ? 1 : Number(container.quantity) || 1));
    item.isContainer = true;
    return item;
  }

  function normalizeSpace(space) {
    return {
      length: positive(space.length, 'Longueur de l’espace'),
      width: positive(space.width, 'Largeur de l’espace'),
      height: positive(space.height, 'Hauteur de l’espace')
    };
  }

  /** Orientations axiales possibles. 'upright' garde la hauteur verticale. */
  function orientations(size, mode) {
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    let candidates;
    if (mode === 'none') candidates = [perms[0]];
    else if (mode === 'upright') candidates = [perms[0], perms[2]];
    else candidates = perms;
    const seen = new Set();
    const result = [];
    for (const p of candidates) {
      const dims = [size.l, size.w, size.h];
      const s = { l: dims[p[0]], w: dims[p[1]], h: dims[p[2]] };
      const key = `${s.l.toFixed(4)}|${s.w.toFixed(4)}|${s.h.toFixed(4)}`;
      if (!seen.has(key)) { seen.add(key); result.push(s); }
    }
    return result;
  }

  /** Le placement est-il entièrement dans l'espace (frontières incluses) ? */
  function insideBounds(position, size, space, eps) {
    eps = eps == null ? EPS : eps;
    return position.x >= -eps && position.y >= -eps && position.z >= -eps &&
      position.x + size.l <= space.length + eps &&
      position.y + size.w <= space.width + eps &&
      position.z + size.h <= space.height + eps;
  }

  /** Deux boîtes se touchent face contre face : pas une collision. */
  function overlaps(a, b, eps) {
    eps = eps == null ? EPS : eps;
    return a.position.x < b.position.x + b.size.l - eps &&
      a.position.x + a.size.l > b.position.x + eps &&
      a.position.y < b.position.y + b.size.w - eps &&
      a.position.y + a.size.w > b.position.y + eps &&
      a.position.z < b.position.z + b.size.h - eps &&
      a.position.z + a.size.h > b.position.z + eps;
  }

  function collides(placement, placements, eps) {
    for (const other of placements) {
      if (overlaps(placement, other, eps)) return true;
    }
    return false;
  }

  /** Un objet tient-il dans un conteneur (en tenant compte de ses rotations) ? */
  function fitsIn(item, container, rotationsEnabled) {
    const box = container.size ? container : normalizeContainer(container);
    const space = { length: box.size.l, width: box.size.w, height: box.size.h };
    const modes = rotationsEnabled === false ? ['none'] : [item.rotations || 'allowed'];
    for (const mode of modes) {
      for (const size of orientations(item.size || normalizeItem(item).size, mode)) {
        if (insideBounds({ x: 0, y: 0, z: 0 }, size, space)) return true;
      }
    }
    return false;
  }

  function center(placement) {
    return {
      x: placement.position.x + placement.size.l / 2,
      y: placement.position.y + placement.size.w / 2,
      z: placement.position.z + placement.size.h / 2
    };
  }

  /** Validation utilisée par les formulaires. */
  function validateObject(obj) {
    const errors = [];
    if (!obj.name || !String(obj.name).trim()) errors.push('Le nom est obligatoire.');
    const d = obj.dimensions || {};
    if (obj.type === 'cylinder') {
      if (!(Number(d.diameter) > 0)) errors.push('Le diamètre doit être > 0.');
      if (!(Number(d.height) > 0)) errors.push('La hauteur doit être > 0.');
    } else {
      for (const key of ['length', 'width', 'height']) {
        if (!(Number(d[key]) > 0)) errors.push(`${key} doit être > 0.`);
      }
    }
    if (!UNIT_TO_CM[obj.unit]) errors.push('Unité inconnue.');
    return errors;
  }

  return {
    EPS, UNIT_TO_CM, number, positive, toCm, volume,
    normalizeItem, normalizeContainer, normalizeSpace, orientations,
    insideBounds, overlaps, collides, fitsIn, center, validateObject,
    units: Object.keys(UNIT_TO_CM)
  };
});
