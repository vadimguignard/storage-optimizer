const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../js/geometry.js');
const d = require('../js/data.js');

test('jeux de données d’exemple valides', () => {
  for (const obj of d.DEFAULT_OBJECTS) {
    assert.deepEqual(g.validateObject(obj), [], obj.name);
    assert.ok(g.volume(g.normalizeItem(obj).size) > 0);
  }
  for (const c of d.DEFAULT_CONTAINERS) {
    assert.deepEqual(g.validateObject(Object.assign({}, c, { type: 'box' })), [], c.name);
  }
});

test('volume total compte la quantité et convertit les unités', () => {
  const items = [
    { type: 'box', unit: 'cm', quantity: 2, dimensions: { length: 10, width: 10, height: 10 } },
    { type: 'box', unit: 'm', quantity: 1, dimensions: { length: 1, width: 1, height: 1 } }
  ];
  assert.equal(d.totalVolume(items), 2000 + 1e6);
});

test('export puis import = aller-retour fidèle', () => {
  const original = d.exportJSON();
  const parsed = JSON.parse(original);
  assert.equal(parsed.app, 'storage-optimizer');
  assert.equal(parsed.objects.length, d.DEFAULT_OBJECTS.length);
  const report = d.importJSON(original);
  assert.equal(report.objects, d.DEFAULT_OBJECTS.length);
  assert.equal(report.containers, d.DEFAULT_CONTAINERS.length);
  assert.deepEqual(d.loadObjects(), d.DEFAULT_OBJECTS);
});

test('import refuse un JSON invalide ou des objets invalides', () => {
  assert.throws(() => d.importJSON('pas du json'), /JSON valide/);
  assert.throws(() => d.importJSON('{"containers":[]}'), /objects/);
  assert.throws(() => d.importJSON(JSON.stringify({
    objects: [{ id: 'bad', name: '', type: 'box', unit: 'cm', dimensions: { length: 0, width: 1, height: 1 } }],
    containers: []
  })), /nom|obligatoire|>/i);
});

test('réinitialisation restaure les exemples', () => {
  d.saveObjects([{ id: 'x', name: 'X', type: 'box', unit: 'cm', dimensions: { length: 1, width: 1, height: 1 } }]);
  assert.equal(d.loadObjects().length, 1);
  d.resetAll();
  assert.deepEqual(d.loadObjects(), d.DEFAULT_OBJECTS);
  assert.deepEqual(d.loadContainers(), d.DEFAULT_CONTAINERS);
});
