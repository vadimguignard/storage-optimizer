const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../js/geometry.js');
const d = require('../js/data.js');

test('the application starts with no data at all', () => {
  assert.deepEqual(d.DEFAULT_OBJECTS, []);
  assert.deepEqual(d.DEFAULT_CONTAINERS, []);
  assert.deepEqual(d.loadObjects(), []);
  assert.deepEqual(d.loadContainers(), []);
});

test('total volume counts quantities and converts units', () => {
  const items = [
    { type: 'box', unit: 'cm', quantity: 2, dimensions: { length: 10, width: 10, height: 10 } },
    { type: 'box', unit: 'm', quantity: 1, dimensions: { length: 1, width: 1, height: 1 } }
  ];
  assert.equal(d.totalVolume(items), 2000 + 1e6);
});

test('export then import is a faithful round trip', () => {
  const original = d.exportJSON();
  const parsed = JSON.parse(original);
  assert.equal(parsed.app, 'storage-optimizer');
  assert.equal(parsed.objects.length, 0);
  assert.equal(parsed.containers.length, 0);
  const report = d.importJSON(original);
  assert.deepEqual(report, { objects: 0, containers: 0 });
  assert.deepEqual(d.loadObjects(), []);
  assert.deepEqual(d.loadContainers(), []);
});

test('import accepts two-dimension items and stores the estimated value', () => {
  const report = d.importJSON(JSON.stringify({
    objects: [{ id: 'a', name: 'Table', type: 'box', unit: 'cm', dimensions: { length: 180, width: 80 } }],
    containers: []
  }));
  assert.equal(report.objects, 1);
  const stored = d.loadObjects()[0];
  assert.deepEqual(stored.dimensions, { length: 180, width: 80, height: 80 });
  assert.deepEqual(stored.estimated, ['height']);
});

test('import rejects invalid JSON and invalid items with error keys', () => {
  assert.throws(() => d.importJSON('not json'), /error.invalidJson/);
  assert.throws(() => d.importJSON('{"containers":[]}'), /error.missingObjects/);
  assert.throws(() => d.importJSON(JSON.stringify({
    objects: [{ id: 'bad', name: '', type: 'box', unit: 'cm', dimensions: { length: 180, width: 80 } }],
    containers: []
  })), /error.nameRequired/);
  assert.throws(() => d.importJSON(JSON.stringify({
    objects: [],
    containers: [{ id: 'bad', name: 'Box', type: 'box', unit: 'cm', dimensions: { length: 10 } }]
  })), /error.needTwoDimensions/);
});

test('resetAll restores the empty dataset', () => {
  d.saveObjects([{ id: 'x', name: 'X', type: 'box', unit: 'cm', dimensions: { length: 1, width: 1, height: 1 } }]);
  assert.equal(d.loadObjects().length, 1);
  d.resetAll();
  assert.deepEqual(d.loadObjects(), d.DEFAULT_OBJECTS);
  assert.deepEqual(d.loadContainers(), d.DEFAULT_CONTAINERS);
});
