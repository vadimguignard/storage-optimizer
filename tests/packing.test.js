const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../js/geometry.js');
const p = require('../js/packing.js');

const box = (id, l, w, h, rotations = 'allowed', quantity = 1) => ({
  id, name: id, type: 'box', unit: 'cm', rotations, quantity,
  dimensions: { length: l, width: w, height: h }
});

function assertValid(result) {
  for (const placement of result.placed) {
    assert.equal(g.insideBounds(placement.position, placement.size, result.space), true,
      `${placement.label} dépasse l'espace`);
    assert.equal(g.collides(placement, result.placed.filter(x => x !== placement)), false,
      `${placement.label} collide`);
  }
}

test('cas 1 : un objet dans un espace suffisant', () => {
  const r = p.pack([box('a', 30, 20, 10)], { length: 100, width: 100, height: 100 }, { attempts: 1 });
  assert.equal(r.success, true);
  assert.equal(r.placed.length, 1);
  assertValid(r);
});

test('cas 2 : objet trop grand', () => {
  const r = p.pack([box('gros', 300, 200, 200)], { length: 100, width: 100, height: 100 }, { attempts: 2 });
  assert.equal(r.success, false);
  assert.equal(r.placed.length, 0);
  assert.equal(r.unplaced.length, 1);
});

test('cas 3 : plusieurs objets sans collision', () => {
  const items = [box('a', 20, 20, 20), box('b', 30, 20, 20), box('c', 10, 10, 10)];
  const r = p.pack(items, { length: 100, width: 100, height: 100 }, { attempts: 6 });
  assert.equal(r.success, true);
  assert.equal(r.placed.length, 3);
  assertValid(r);
});

test('cas 4 : volume suffisant mais disposition géométriquement impossible', () => {
  const r = p.pack([box('a', 6, 6, 10), box('b', 6, 6, 10)],
    { length: 10, width: 10, height: 10 }, { attempts: 6 });
  assert.equal(r.stats.totalVolume, 720);
  assert.equal(r.stats.binVolume, 1000);
  assert.equal(r.success, false);
  assertValid(r);
});

test('cas 5 : rotation nécessaire', () => {
  const space = { length: 5, width: 10, height: 10 };
  const item = box('long', 10, 5, 5, 'allowed');
  assert.equal(p.pack([item], space, { attempts: 1 }).success, true);
  const blocked = p.pack([Object.assign({}, item, { rotations: 'none' })], space, { attempts: 1 });
  assert.equal(blocked.success, false);
  assert.equal(p.pack([item], space, { attempts: 1, rotations: false }).success, false);
});

test('quantity génère un objet physique par exemplaire', () => {
  const r = p.pack([box('lot', 10, 10, 10, 'allowed', 3)], { length: 40, width: 40, height: 40 }, { attempts: 1 });
  assert.equal(r.placed.length, 3);
  assert.deepEqual(r.placed.map(x => x.id).sort(), ['lot#1', 'lot#2', 'lot#3']);
  assertValid(r);
});

test('résultat déterministe avec un seul essai', () => {
  const items = [box('a', 20, 10, 10), box('b', 15, 15, 15), box('c', 5, 5, 5)];
  const space = { length: 50, width: 50, height: 50 };
  const a = p.pack(items, space, { attempts: 1 });
  const b = p.pack(items, space, { attempts: 1 });
  assert.deepEqual(a.placed.map(x => [x.id, x.position, x.size]), b.placed.map(x => [x.id, x.position, x.size]));
});

test('mode cartons : objets emballés puis cartons placés dans l’espace', () => {
  const objects = [box('livre1', 40, 30, 30), box('livre2', 40, 30, 30)];
  const containers = [{ id: 'c', name: 'Carton', type: 'box', unit: 'cm', quantity: 2,
    dimensions: { length: 60, width: 40, height: 40 } }];
  const r = p.packWithCartons(objects, containers, { length: 200, width: 100, height: 100 }, { attempts: 3 });
  assert.equal(r.success, true);
  assert.equal(r.stats.objectsCount, 2);
  assert.equal(r.placed.length, 1);
  assert.ok(r.placed[0].isContainer);
  assert.equal(r.placed[0].contents.length, 2);
  assertValid(r);
});
