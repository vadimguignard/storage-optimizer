/*
 * geometry.js — pure geometry helpers (no browser dependency)
 * Internal axes: x = length, y = width, z = height. All internal sizes are cm.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SO = Object.assign(root.SO || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EPS = 1e-6;
  const UNIT_TO_CM = { mm: 0.1, cm: 1, m: 100 };
  const DIM_KEYS = ['length', 'width', 'height'];

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

  function optionalPositive(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error('error.invalidDimension');
    if (n <= 0) return null; // 0 is treated as a missing dimension
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

  /**
   * Resolve an object's dimensions. One missing dimension is estimated as the
   * smallest of the two known ones (e.g. 180 × 80 → 80).
   * For a cylinder, the missing value simply copies the known one.
   */
  function resolveDimensions(raw, type) {
    const d = raw || {};
    if (type === 'cylinder') {
      const diameter = optionalPositive(d.diameter);
      const height = optionalPositive(d.height);
      if (diameter != null && height != null) return { values: { diameter, height }, estimated: [] };
      if (diameter != null) return { values: { diameter, height: diameter }, estimated: ['height'] };
      if (height != null) return { values: { diameter: height, height }, estimated: ['diameter'] };
      throw new Error('error.needTwoDimensions');
    }
    const values = {};
    for (const key of DIM_KEYS) values[key] = optionalPositive(d[key]);
    const missing = DIM_KEYS.filter(key => values[key] == null);
    if (missing.length > 1) throw new Error('error.needTwoDimensions');
    const estimated = [];
    if (missing.length === 1) {
      const present = DIM_KEYS.filter(key => values[key] != null).map(key => values[key]);
      values[missing[0]] = Math.min.apply(null, present);
      estimated.push(missing[0]);
    }
    return { values, estimated };
  }

  /** Convert a raw JSON object into a normalized internal object (cm). */
  function normalizeItem(item) {
    if (!item || typeof item !== 'object') throw new Error('Objet invalide');
    const unit = item.unit || 'cm';
    let l, w, h, factor, estimated;
    if (item.size && typeof item.size === 'object') {
      // Already normalized (e.g. a carton coming from the first packing level)
      l = positive(item.size.l, 'Longueur');
      w = positive(item.size.w, 'Largeur');
      h = positive(item.size.h, 'Hauteur');
      factor = 1;
      estimated = item.estimated || [];
    } else {
      const type = item.type === 'cylinder' ? 'cylinder' : 'box';
      const resolved = resolveDimensions(item.dimensions, type);
      estimated = resolved.estimated;
      if (type === 'cylinder') {
        l = resolved.values.diameter; w = resolved.values.diameter; h = resolved.values.height;
      } else {
        l = resolved.values.length; w = resolved.values.width; h = resolved.values.height;
      }
      factor = UNIT_TO_CM[unit];
      if (!factor) throw new Error('error.invalidUnit');
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
      estimated: estimated.slice(),
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

  /** Axis-aligned orientations. 'upright' keeps the height vertical. */
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

  /** Is the placement entirely inside the space (boundaries included)? */
  function insideBounds(position, size, space, eps) {
    eps = eps == null ? EPS : eps;
    return position.x >= -eps && position.y >= -eps && position.z >= -eps &&
      position.x + size.l <= space.length + eps &&
      position.y + size.w <= space.width + eps &&
      position.z + size.h <= space.height + eps;
  }

  /** Two boxes touching face to face is not a collision. */
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

  /** Does an item fit in a container, taking its rotations into account? */
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

  /** Form validation. Returns i18n error keys. */
  function validateObject(obj) {
    const errors = [];
    if (!obj.name || !String(obj.name).trim()) errors.push('error.nameRequired');
    try {
      resolveDimensions(obj.dimensions, obj.type === 'cylinder' ? 'cylinder' : 'box');
    } catch (e) {
      errors.push(e.message === 'error.invalidDimension' ? 'error.invalidDimension' : 'error.needTwoDimensions');
    }
    if (!UNIT_TO_CM[obj.unit]) errors.push('error.invalidUnit');
    return errors;
  }

  return {
    EPS, UNIT_TO_CM, DIM_KEYS, number, positive, toCm, volume,
    resolveDimensions, normalizeItem, normalizeContainer, normalizeSpace, orientations,
    insideBounds, overlaps, collides, fitsIn, center, validateObject,
    units: Object.keys(UNIT_TO_CM)
  };
});
