const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../js/geometry.js');

test('conversion des unités vers le cm', () => {
  assert.equal(g.toCm(2, 'm'), 200);
  assert.equal(g.toCm(250, 'mm'), 25);
  assert.equal(g.toCm(180, 'cm'), 180);
  assert.throws(() => g.toCm(1, 'pouce'));
});

test('volume et normalisation', () => {
  assert.equal(g.volume({ l: 2, w: 3, h: 4 }), 24);
  const item = g.normalizeItem({
    id: 'x', name: 'X', type: 'box',
    dimensions: { length: 1.8, width: 0.8, height: 0.75 }, unit: 'm', rotations: 'none', quantity: 2
  });
  assert.deepEqual(item.size, { l: 180, w: 80, h: 75 });
  assert.equal(item.quantity, 2);
  assert.equal(item.unit, 'cm');
});

test('cylindre = boîte englobante diamètre × diamètre × hauteur', () => {
  const item = g.normalizeItem({ type: 'cylinder', dimensions: { diameter: 40, height: 100 }, unit: 'cm' });
  assert.deepEqual(item.size, { l: 40, w: 40, h: 100 });
});

test('orientations : 6 au maximum, 1 pour un cube, 2 debout', () => {
  assert.equal(g.orientations({ l: 1, w: 2, h: 3 }, 'allowed').length, 6);
  assert.equal(g.orientations({ l: 2, w: 2, h: 2 }, 'allowed').length, 1);
  assert.equal(g.orientations({ l: 1, w: 2, h: 3 }, 'none').length, 1);
  const upright = g.orientations({ l: 1, w: 2, h: 3 }, 'upright');
  assert.equal(upright.length, 2);
  assert.ok(upright.every(s => s.h === 3));
});

test('limites : frontière incluse, dépassement refusé', () => {
  const space = { length: 100, width: 50, height: 40 };
  const size = { l: 40, w: 50, h: 40 };
  assert.equal(g.insideBounds({ x: 60, y: 0, z: 0 }, size, space), true);
  assert.equal(g.insideBounds({ x: 60.1, y: 0, z: 0 }, size, space), false);
  assert.equal(g.insideBounds({ x: -0.1, y: 0, z: 0 }, size, space), false);
});

test('collisions : contact de faces autorisé, chevauchement détecté', () => {
  const a = { position: { x: 0, y: 0, z: 0 }, size: { l: 10, w: 10, h: 10 } };
  const touching = { position: { x: 10, y: 0, z: 0 }, size: { l: 10, w: 10, h: 10 } };
  const overlapping = { position: { x: 9, y: 0, z: 0 }, size: { l: 10, w: 10, h: 10 } };
  assert.equal(g.overlaps(a, touching), false);
  assert.equal(g.overlaps(a, overlapping), true);
  assert.equal(g.collides(a, [touching, overlapping]), true);
});

test('fitsIn : la rotation peut être nécessaire', () => {
  const container = { id: 'c', name: 'C', type: 'box', dimensions: { length: 5, width: 10, height: 5 }, unit: 'cm' };
  const item = { id: 'i', name: 'I', type: 'box', dimensions: { length: 10, width: 5, height: 5 }, unit: 'cm', rotations: 'allowed' };
  assert.equal(g.fitsIn(item, container, true), true);
  assert.equal(g.fitsIn(Object.assign({}, item, { rotations: 'none' }), container, false), false);
});

test('validation des formulaires', () => {
  assert.deepEqual(g.validateObject({ name: 'Test', type: 'box', unit: 'cm', dimensions: { length: 10, width: 5, height: 2 } }), []);
  const errors = g.validateObject({ name: '', type: 'box', unit: 'cm', dimensions: { length: 0, width: 5, height: 2 } });
  assert.ok(errors.length >= 2);
});
