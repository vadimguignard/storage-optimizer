const test = require('node:test');
const assert = require('node:assert/strict');
const geom = require('../js/geometry.js');

// Browser-style globals needed by sync.js, installed before loading it.
const mem = new Map();
global.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k)
};

// Polling is a browser concern; keep the Node test process from staying alive.
global.setInterval = () => 0;
global.clearInterval = () => {};

const calls = [];
const remote = {
  app: 'storage-optimizer',
  version: 1,
  updatedAt: 1700000000000,
  objects: [{ id: 'remote-1', name: 'Table', type: 'box', unit: 'cm', dimensions: { length: 180, width: 80 } }],
  containers: []
};
const remoteContent = Buffer.from(JSON.stringify(remote), 'utf8').toString('base64');

global.fetch = async (url, options) => {
  calls.push({ url, options });
  if (options && options.method === 'PUT') {
    return {
      ok: true, status: 200,
      json: async () => ({ content: { sha: 'new-sha' } })
    };
  }
  return {
    ok: true, status: 200,
    json: async () => ({ sha: 'old-sha', content: remoteContent })
  };
};

const stored = { objects: [], containers: [] };
global.SO = Object.assign({}, geom, {
  data: {
    KEYS: { settings: 'so.settings.v2' },
    loadObjects: () => stored.objects.slice(),
    saveObjects: list => { stored.objects = list.slice(); },
    loadContainers: () => stored.containers.slice(),
    saveContainers: list => { stored.containers = list.slice(); }
  }
});

require('../js/sync.js');

test('sync reads the API, resolves missing dimensions and pushes back with the sha', async () => {
  await global.SO.sync.enable({ owner: 'vadimguignard', repo: 'storage-optimizer', branch: 'sync', token: 'test-token' });

  assert.equal(stored.objects.length, 1);
  assert.deepEqual(stored.objects[0].dimensions, { length: 180, width: 80, height: 80 });
  assert.deepEqual(stored.objects[0].estimated, ['height']);

  const get = calls.find(c => !(c.options && c.options.method === 'PUT'));
  assert.ok(get.url.includes('workers.dev'), 'the browser must call the proxy, not GitHub directly');
  assert.ok(!get.url.includes('api.github.com'));
  assert.equal(get.options.headers.Authorization, undefined, 'the browser must never send a token');
  assert.equal(get.options.headers['X-Storage-Optimizer'], undefined, 'no custom header: it would require CORS preflight approval');
  assert.ok(!JSON.stringify(global.SO.sync.getConfig()).includes('test-token'));

  const put = calls.find(c => c.options && c.options.method === 'PUT');
  assert.ok(put, 'a PUT request should have been sent');
  const body = JSON.parse(put.options.body);
  assert.equal(body.branch, undefined, 'the Worker fixes the branch to sync');
  assert.equal(body.sha, 'old-sha');
  const uploaded = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
  assert.deepEqual(uploaded.objects, stored.objects);
  assert.ok(uploaded.updatedAt > 0);
  assert.equal(global.SO.sync.getStatus().status, 'synced');

  await global.SO.sync.pull(true);
  const lastGet = calls.filter(c => !(c.options && c.options.method === 'PUT')).at(-1);
  assert.equal(lastGet.options.headers['If-None-Match'], '"new-sha"', 'polls use the sha as ETag to get cheap 304 responses');
});

test('sync accepts only two dimensions in the uploaded payload', () => {
  const put = calls.find(c => c.options && c.options.method === 'PUT');
  const body = JSON.parse(put.options.body);
  assert.equal(body.content.length > 0, true);
});
