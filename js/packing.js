/*
 * packing.js — heuristique de 3D bin packing (extreme points + essais aléatoires)
 * Dépend de geometry.js (namespace SO dans le navigateur, require en Node).
 */
(function (root, factory) {
  const geom = (typeof module === 'object' && module.exports)
    ? require('./geometry.js') : root.SO;
  const api = factory(geom);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SO = Object.assign(root.SO || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (geom) {
  'use strict';

  const DEFAULTS = { attempts: 12, rotations: true, maxPoints: 500, timeLimitMs: 4000 };
  const TOL = 1e-4;

  function optionsOf(options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    o.attempts = Math.max(1, Math.min(50, Math.floor(Number(o.attempts) || 1)));
    o.maxPoints = Math.max(50, Math.min(2000, Math.floor(Number(o.maxPoints) || 500)));
    return o;
  }

  /** Un objet avec quantity = N devient N objets distincts. */
  function expand(rawItems) {
    const out = [];
    for (const raw of rawItems || []) {
      const item = geom.normalizeItem(raw);
      for (let i = 0; i < item.quantity; i++) {
        out.push(Object.assign({}, item, {
          id: item.quantity > 1 ? `${item.id}#${i + 1}` : item.id,
          label: item.quantity > 1 ? `${item.name} #${i + 1}` : item.name,
          sourceId: item.id,
          quantity: 1
        }));
      }
    }
    return out;
  }

  function compareKeys(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] < b[i] - 1e-9) return -1;
      if (a[i] > b[i] + 1e-9) return 1;
    }
    return 0;
  }

  /** Points candidats = origine + sommets des boîtes déjà placées. */
  function cornerPoints(placements, bin, limit) {
    const seen = new Set();
    const pts = [];
    const add = (x, y, z) => {
      const p = { x: x, y: y, z: z };
      if (!geom.insideBounds(p, { l: 0, w: 0, h: 0 }, bin)) return;
      const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
      if (seen.has(key)) return;
      seen.add(key);
      pts.push(p);
    };
    add(0, 0, 0);
    for (const p of placements) {
      const x = p.position.x, y = p.position.y, z = p.position.z;
      const dx = p.size.l, dy = p.size.w, dz = p.size.h;
      add(x + dx, y, z); add(x, y + dy, z); add(x, y, z + dz);
      add(x + dx, y + dy, z); add(x + dx, y, z + dz); add(x, y + dy, z + dz);
      add(x + dx, y + dy, z + dz);
    }
    pts.sort((a, b) => (a.z + a.y + a.x) - (b.z + b.y + b.x));
    return pts.slice(0, limit || 500);
  }

  function close(a, b) { return Math.abs(a - b) <= TOL; }

  /** Nombre de faces en contact avec une paroi ou un autre objet. */
  function countContacts(placement, placements, bin) {
    const p = placement;
    let n = 0;
    if (close(p.position.x, 0)) n++;
    if (close(p.position.y, 0)) n++;
    if (close(p.position.z, 0)) n++;
    if (close(p.position.x + p.size.l, bin.length)) n++;
    if (close(p.position.y + p.size.w, bin.width)) n++;
    if (close(p.position.z + p.size.h, bin.height)) n++;
    for (const o of placements) {
      if (close(p.position.x, o.position.x + o.size.l) ||
          close(o.position.x, p.position.x + p.size.l)) n++;
      if (close(p.position.y, o.position.y + o.size.w) ||
          close(o.position.y, p.position.y + p.size.w)) n++;
      if (close(p.position.z, o.position.z + o.size.h) ||
          close(o.position.z, p.position.z + p.size.h)) n++;
    }
    return n;
  }

  /** Meilleur emplacement valide pour un objet dans un conteneur donné. */
  function findBestPlacement(item, bin, placements, opts) {
    const points = cornerPoints(placements, bin, (opts && opts.maxPoints) || 500);
    const rotationsAllowed = !opts || opts.rotations !== false;
    const modes = rotationsAllowed ? [item.rotations || 'allowed'] : ['none'];
    const sizes = [];
    for (const mode of modes) sizes.push.apply(sizes, geom.orientations(item.size, mode));

    let best = null;
    for (const point of points) {
      for (const size of sizes) {
        if (!geom.insideBounds(point, size, bin)) continue;
        const placement = {
          id: item.id,
          itemId: item.sourceId || item.id,
          label: item.label || item.name,
          color: item.color || null,
          isContainer: !!item.isContainer,
          contents: item.contents || [],
          position: { x: point.x, y: point.y, z: point.z },
          size: { l: size.l, w: size.w, h: size.h }
        };
        if (geom.collides(placement, placements)) continue;
        const contacts = countContacts(placement, placements, bin);
        const key = [point.z, point.y, point.x, -contacts];
        if (!best || compareKeys(key, best.key) < 0) best = { placement, key };
      }
    }
    return best ? best.placement : null;
  }

  function metrics(placements, bin, totalVolume) {
    let used = 0, maxX = 0, maxY = 0, maxZ = 0, sum = 0, contacts = 0;
    for (const p of placements) {
      used += geom.volume(p.size);
      maxX = Math.max(maxX, p.position.x + p.size.l);
      maxY = Math.max(maxY, p.position.y + p.size.w);
      maxZ = Math.max(maxZ, p.position.z + p.size.h);
      sum += p.position.x + p.position.y + p.position.z;
      contacts += countContacts(p, placements, bin);
    }
    const binVolume = geom.volume({ l: bin.length, w: bin.width, h: bin.height });
    return {
      placedCount: placements.length,
      usedVolume: used,
      totalVolume: totalVolume == null ? used : totalVolume,
      binVolume: binVolume,
      fillRate: binVolume > 0 ? used / binVolume : 0,
      usedHeight: maxZ,
      footprint: maxX * maxY,
      extent: { x: maxX, y: maxY, z: maxZ },
      compactness: sum,
      contacts: contacts
    };
  }

  function solutionKey(solution, bin) {
    const m = metrics(solution.placements, bin);
    return [solution.unplaced.length, m.usedHeight, m.footprint, m.compactness, -m.contacts];
  }

  function solveAttempt(items, bin, opts, rnd) {
    const jitter = opts._jitter || 0;
    const order = items.slice();
    if (jitter > 0) {
      order.sort((a, b) => {
        const va = geom.volume(a.size) * (1 + (rnd() - 0.5) * jitter);
        const vb = geom.volume(b.size) * (1 + (rnd() - 0.5) * jitter);
        return vb - va || rnd() - 0.5;
      });
    } else {
      order.sort((a, b) => geom.volume(b.size) - geom.volume(a.size) ||
        Math.max(b.size.l, b.size.w, b.size.h) - Math.max(a.size.l, a.size.w, a.size.h));
    }
    const placements = [];
    const unplaced = [];
    for (const item of order) {
      const p = findBestPlacement(item, bin, placements, opts);
      if (p) placements.push(p); else unplaced.push(item);
    }
    return { placements, unplaced, order };
  }

  function emptyResult(space, totalVolume, attempts, timeMs) {
    return {
      success: true,
      placed: [], unplaced: [],
      space: space,
      stats: Object.assign(metrics([], space, totalVolume), { attempts: attempts, timeMs: timeMs }),
      mode: 'space'
    };
  }

  /** Placement d'objets dans un seul espace. */
  function pack(rawItems, rawSpace, options) {
    const opts = optionsOf(options);
    const space = geom.normalizeSpace(rawSpace);
    const items = expand(rawItems || []);
    const started = Date.now();
    if (!items.length) return emptyResult(space, 0, 0, Date.now() - started);

    const rnd = opts.random || Math.random;
    let best = null; let bestKey = null; let usedAttempts = 0;
    for (let i = 0; i < opts.attempts; i++) {
      const attemptOpts = Object.assign({}, opts, { _jitter: i === 0 ? 0 : Math.min(0.7, 0.1 * i) });
      const solution = solveAttempt(items, space, attemptOpts, rnd);
      const key = solutionKey(solution, space);
      usedAttempts = i + 1;
      if (!best || compareKeys(key, bestKey) < 0) { best = solution; bestKey = key; }
      if (i >= 1 && Date.now() - started > opts.timeLimitMs) break;
    }

    const totalVolume = items.reduce((sum, it) => sum + geom.volume(it.size), 0);
    const stats = metrics(best.placements, space, totalVolume);
    stats.attempts = usedAttempts;
    stats.timeMs = Date.now() - started;
    return {
      success: best.unplaced.length === 0,
      placed: best.placements,
      unplaced: best.unplaced.map(u => ({ id: u.id, itemId: u.sourceId || u.id, name: u.label || u.name, size: u.size })),
      space: space,
      stats: stats,
      mode: 'space'
    };
  }

  /**
   * Mode cartons : on emballe d'abord les objets dans des cartons,
   * puis on place les cartons remplis dans l'espace disponible.
   */
  function packWithCartons(rawObjects, rawCartons, rawSpace, options) {
    const opts = optionsOf(options);
    const space = geom.normalizeSpace(rawSpace);
    const objects = expand(rawObjects || []);
    const containers = (rawCartons || []).map(geom.normalizeContainer)
      .sort((a, b) => geom.volume(a.size) - geom.volume(b.size));
    const started = Date.now();

    const budgets = containers.map(c => ({ container: c, remaining: c.quantity }));
    const usedCartons = [];
    const leftoverObjects = [];
    const byVolume = objects.slice().sort((a, b) => geom.volume(b.size) - geom.volume(a.size));

    for (const item of byVolume) {
      let placed = false;
      // 1) essayer les cartons déjà ouverts
      for (const carton of usedCartons) {
        const p = findBestPlacement(item, carton.bin, carton.placements, opts);
        if (p) {
          carton.placements.push(p);
          carton.contents.push({ id: item.id, name: item.label || item.name, color: item.color || null });
          placed = true;
          break;
        }
      }
      // 2) ouvrir un nouveau carton (le plus petit qui convient)
      if (!placed) {
        for (const budget of budgets) {
          if (budget.remaining <= 0) continue;
          const c = budget.container;
          const bin = { length: c.size.l, width: c.size.w, height: c.size.h };
          const p = findBestPlacement(item, bin, [], opts);
          if (!p) continue;
          budget.remaining--;
          usedCartons.push({
            bin, placements: [p], source: c,
            contents: [{ id: item.id, name: item.label || item.name, color: item.color || null }]
          });
          placed = true;
          break;
        }
      }
      if (!placed) leftoverObjects.push(item);
    }

    const boxItems = usedCartons.map((carton, i) => ({
      id: `carton-instance-${i + 1}`,
      sourceId: carton.source.id,
      name: `${carton.source.name} #${i + 1}`,
      label: `${carton.source.name} #${i + 1}`,
      type: 'box',
      size: carton.source.size,
      rotations: 'allowed',
      quantity: 1,
      isContainer: true,
      color: '#d97706',
      contents: carton.placements.map(p => ({
        id: p.id, name: p.label, position: p.position, size: p.size, color: p.color
      }))
    }));

    const outer = boxItems.length
      ? pack(boxItems, space, options)
      : emptyResult(space, 0, 0, Date.now() - started);

    const objectsVolume = objects.reduce((s, o) => s + geom.volume(o.size), 0);
    const cartonsVolume = boxItems.reduce((s, o) => s + geom.volume(o.size), 0);
    outer.mode = 'cartons';
    outer.cartons = boxItems;
    outer.leftoverObjects = leftoverObjects.map(o => ({ id: o.id, itemId: o.sourceId || o.id, name: o.label || o.name, size: o.size }));
    outer.unplaced = outer.unplaced.concat(outer.leftoverObjects);
    outer.success = outer.unplaced.length === 0;
    outer.stats.objectsVolume = objectsVolume;
    outer.stats.cartonsVolume = cartonsVolume;
    outer.stats.objectsCount = objects.length - leftoverObjects.length;
    outer.stats.cartonsCount = boxItems.length;
    outer.stats.timeMs = Date.now() - started;
    return outer;
  }

  return {
    DEFAULTS, expand, cornerPoints, findBestPlacement, metrics,
    solveAttempt, pack, packWithCartons, compareKeys
  };
});
