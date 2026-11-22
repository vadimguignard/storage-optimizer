const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../js/geometry.js');

test('unit conversion to centimetres', () => {
  assert.equal(g.toCm(2, 'm'), 200);
  assert.equal(g.toCm(250, 'mm'), 25);
  assert.equal(g.toCm(180, 'cm'), 180);
  assert.throws(() => g.toCm(1, 'inch'));
});

test('volume and normalisation', () => {
  assert.equal(g.volume({ l: 2, w: 3, h: 4 }), 24);
  const item = g.normalizeItem({
    id: 'x', name: 'X', type: 'box',
    dimensions: { length: 1.8, width: 0.8, height: 0.75 }, unit: 'm', rotations: 'none', quantity: 2
  });
  assert.deepEqual(item.size, { l: 180, w: 80, h: 75 });
  assert.equal(item.quantity, 2);
  assert.equal(item.unit, 'cm');
});

test('cylinder uses its bounding box diameter × diameter × height', () => {
  const item = g.normalizeItem({ type: 'cylinder', dimensions: { diameter: 40, height: 100 }, unit: 'cm' });
  assert.deepEqual(item.size, { l: 40, w: 40, h: 100 });
});

test('resolveDimensions: the missing dimension is the smallest known one', () => {
  const result = g.resolveDimensions({ length: 180, width: 80 }, 'box');
  assert.deepEqual(result.values, { length: 180, width: 80, height: 80 });
  assert.deepEqual(result.estimated, ['height']);

  const other = g.resolveDimensions({ length: 180, height: 75 }, 'box');
  assert.deepEqual(other.values, { length: 180, width: 75, height: 75 });
  assert.deepEqual(other.estimated, ['width']);

  const full = g.resolveDimensions({ length: 10, width: 20, height: 30 }, 'box');
  assert.deepEqual(full.estimated, []);

  // A zero is treated as a missing dimension.
  const zero = g.resolveDimensions({ length: 10, width: 0, height: 30 }, 'box');
  assert.equal(zero.values.width, 10);
  assert.deepEqual(zero.estimated, ['width']);
});

test('resolveDimensions rejects less than two known dimensions', () => {
  assert.throws(() => g.resolveDimensions({ length: 10 }, 'box'), /error.needTwoDimensions/);
  assert.throws(() => g.resolveDimensions({}, 'box'), /error.needTwoDimensions/);
  assert.throws(() => g.resolveDimensions({ length: 'abc', width: 10 }, 'box'), /error.invalidDimension/);
});

test('resolveDimensions for cylinders copies the single known value', () => {
  assert.deepEqual(g.resolveDimensions({ diameter: 40 }, 'cylinder'), {
    values: { diameter: 40, height: 40 }, estimated: ['height']
  });
  assert.deepEqual(g.resolveDimensions({ height: 90 }, 'cylinder'), {
    values: { diameter: 90, height: 90 }, estimated: ['diameter']
  });
});

test('normalizeItem keeps the estimated fields after unit conversion', () => {
  const item = g.normalizeItem({
    type: 'box', unit: 'm', dimensions: { length: 1.8, width: 0.8 }
  });
  assert.deepEqual(item.size, { l: 180, w: 80, h: 80 });
  assert.deepEqual(item.estimated, ['height']);
});

test('orientations: at most 6, 1 for a cube, 2 upright', () => {
  assert.equal(g.orientations({ l: 1, w: 2, h: 3 }, 'allowed').length, 6);
  assert.equal(g.orientations({ l: 2, w: 2, h: 2 }, 'allowed').length, 1);
  assert.equal(g.orientations({ l: 1, w: 2, h: 3 }, 'none').length, 1);
  const upright = g.orientations({ l: 1, w: 2, h: 3 }, 'upright');
  assert.equal(upright.length, 2);
  assert.ok(upright.every(s => s.h === 3));
});

test('bounds: boundary included, overflow rejected', () => {
  const space = { length: 100, width: 50, height: 40 };
  const size = { l: 40, w: 50, h: 40 };
  assert.equal(g.insideBounds({ x: 60, y: 0, z: 0 }, size, space), true);
  assert.equal(g.insideBounds({ x: 60.1, y: 0, z: 0 }, size, space), false);
  assert.equal(g.insideBounds({ x: -0.1, y: 0, z: 0 }, size, space), false);
});

test('collisions: face contact allowed, overlap detected', () => {
  const a = { position: { x: 0, y: 0, z: 0 }, size: { l: 10, w: 10, h: 10 } };
  const touching = { position: { x: 10, y: 0, z: 0 }, size: { l: 10, w: 10, h: 10 } };
  const overlapping = { position: { x: 9, y: 0, z: 0 }, size: { l: 10, w: 10, h: 10 } };
  assert.equal(g.overlaps(a, touching), false);
  assert.equal(g.overlaps(a, overlapping), true);
  assert.equal(g.collides(a, [touching, overlapping]), true);
});

test('fitsIn: rotation may be required, and two dimensions are enough', () => {
  const container = { id: 'c', name: 'C', type: 'box', dimensions: { length: 5, width: 10, height: 5 }, unit: 'cm' };
  const item = { id: 'i', name: 'I', type: 'box', dimensions: { length: 10, width: 5, height: 5 }, unit: 'cm', rotations: 'allowed' };
  assert.equal(g.fitsIn(item, container, true), true);
  assert.equal(g.fitsIn(Object.assign({}, item, { rotations: 'none' }), container, false), false);

  const partial = { id: 'c2', name: 'C2', type: 'box', dimensions: { length: 10, width: 5 }, unit: 'cm' };
  assert.equal(g.fitsIn(item, partial, true), true);
});

test('validateObject returns translatable error keys', () => {
  assert.deepEqual(g.validateObject({ name: 'Test', type: 'box', unit: 'cm', dimensions: { length: 10, width: 5, height: 2 } }), []);
  assert.deepEqual(
    g.validateObject({ name: '', type: 'box', unit: 'cm', dimensions: { length: 180, width: 80 } }),
    ['error.nameRequired']
  );
  assert.deepEqual(
    g.validateObject({ name: 'Test', type: 'box', unit: 'cm', dimensions: { length: 10 } }),
    ['error.needTwoDimensions']
  );
  assert.deepEqual(
    g.validateObject({ name: 'Test', type: 'box', unit: 'lightyears', dimensions: { length: 10, width: 5 } }),
    ['error.invalidUnit']
  );
});
