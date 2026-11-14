import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/offline-worker.js', import.meta.url), 'utf8');

test('offline worker uses the cached viewer at the deployed project path when the network fails', async () => {
  const scope = 'https://example.test/horangnabi-v2/';
  const page = new URL('offline.html', scope).href;
  const listeners = new Map<string, (event: unknown) => void>();
  let online = false;
  runInNewContext(source, {
    URL, Response,
    self: { registration: { scope }, addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener) },
    fetch: async () => { if (!online) throw new Error('offline'); return new Response('live'); },
    caches: { match: async (url: string) => url === page ? new Response('offline viewer') : undefined },
  });
  function request(url: string, mode = 'navigate') {
    let result: Promise<Response> | undefined;
    listeners.get('fetch')!({ request: { url, mode }, respondWith: (response: Promise<Response>) => { result = response; } });
    return result;
  }
  const redirect = await request(scope + '?open=1');
  assert.equal(redirect?.headers.get('location'), page);
  assert.equal(await (await request(page))?.text(), 'offline viewer');
  assert.equal(request(scope, 'cors'), undefined);
  assert.equal(request('https://example.test/other/'), undefined);
  online = true;
  assert.equal(await (await request(scope))?.text(), 'live');
});

function workerHarness() {
  const scope = 'https://example.test/horangnabi-v2/';
  const prefix = 'horangnabi-v2:app:/horangnabi-v2/:';
  const stores = new Map<string, Map<string, Response>>();
  const listeners = new Map<string, (event: unknown) => void>();
  const key = (request: string | { url: string }) => typeof request === 'string' ? request : request.url;
  let fetches = 0, skipped = 0, claimed = 0, online = true;
  const cacheFor = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (request: string | { url: string }) => store.get(key(request))?.clone(),
      put: async (request: string | { url: string }, response: Response) => { store.set(key(request), response); },
      addAll: async (urls: string[]) => { urls.forEach(url => store.set(url, new Response('precache'))); },
    };
  };
  runInNewContext(source.replace("const APP_VERSION = 'development';", "const APP_VERSION = 'test';")
    .replace('const APP_ASSETS = [];', 'const APP_ASSETS = ["offline.html", "assets/index-12345678.js"];'), {
    URL, Response,
    self: {
      registration: { scope }, addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
      skipWaiting: async () => { skipped++; }, clients: { claim: async () => { claimed++; } },
    },
    fetch: async () => { fetches++; if (!online) throw new Error('offline'); return new Response('live'); },
    caches: {
      open: cacheFor, keys: async () => [...stores.keys()], delete: async (name: string) => stores.delete(name),
      match: async (url: string, options: { cacheName: string }) => stores.get(options.cacheName)?.get(url)?.clone(),
    },
  });
  function event(type: string, extra = {}) {
    let result: Promise<Response> | undefined, waited: Promise<unknown> | undefined;
    listeners.get(type)!({ ...extra, respondWith: (value: Promise<Response>) => { result = value; }, waitUntil: (value: Promise<unknown>) => { waited = value; } });
    return { response: result, waited };
  }
  const request = (path: string, method = 'GET') => event('fetch', { request: { url: new URL(path, scope).href, mode: 'cors', method } }).response;
  return { scope, prefix, stores, event, request, setOnline: (value: boolean) => { online = value; }, counts: () => ({ fetches, skipped, claimed }) };
}
test('worker precaches relative assets and only applies updates by explicit message', async () => {
  const worker = workerHarness(); await worker.event('install').waited;
  assert.ok(worker.stores.get(worker.prefix + 'test')?.has(worker.scope + 'offline.html'));
  assert.equal(worker.counts().skipped, 0);
  worker.event('message', { data: { type: 'UNRELATED' } }); assert.equal(worker.counts().skipped, 0);
  await worker.event('message', { data: { type: 'SKIP_WAITING' } }).waited; assert.equal(worker.counts().skipped, 1);
});
test('worker caches hashed code once and never intercepts private or provider requests', async () => {
  const worker = workerHarness();
  assert.equal(await (await worker.request('assets/index-abcdefgh.js'))?.text(), 'live'); worker.setOnline(false);
  assert.equal(await (await worker.request('assets/index-abcdefgh.js'))?.text(), 'live'); assert.equal(worker.counts().fetches, 1);
  for (const path of ['assets/index-abcdefgh.js?token=private', 'assets/user.js', 'profile.json', '__/auth/handler', 'https://firestore.googleapis.com/v1/projects/example', 'https://maps.googleapis.com/maps/api/js', 'https://example.test/other/assets/index-abcdefgh.js']) assert.equal(worker.request(path), undefined, path);
  assert.equal(worker.request('assets/index-abcdefgh.js', 'POST'), undefined);
});
test('worker retains previous app version and existing offline trip viewer', async () => {
  const worker = workerHarness();
  for (const name of [worker.prefix + 'old1', worker.prefix + 'old2', 'horangnabi-v2:offline-page-v1', 'another-app', worker.prefix + 'test']) worker.stores.set(name, new Map());
  await worker.event('activate').waited;
  assert.equal(worker.stores.has(worker.prefix + 'old1'), false);
  for (const name of [worker.prefix + 'old2', 'horangnabi-v2:offline-page-v1', 'another-app', worker.prefix + 'test']) assert.ok(worker.stores.has(name), name);
  assert.equal(worker.counts().claimed, 1);
});
test('an open tab can read its previous cached build after an update', async () => {
  const worker = workerHarness(); worker.stores.set(worker.prefix + 'old', new Map([[worker.scope + 'assets/TripForm-abcdefgh.js', new Response('old tab')]]));
  worker.setOnline(false); assert.equal(await (await worker.request('assets/TripForm-abcdefgh.js'))?.text(), 'old tab'); assert.equal(worker.counts().fetches, 0);
});
test('install manifest keeps GitHub Pages paths and includes valid icon sizes', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.name, '호랑나비'); for (const name of ['id', 'start_url', 'scope']) assert.equal(manifest[name], './'); assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const png = readFileSync(new URL('../public/' + icon.src, import.meta.url)); const size = Number(icon.sizes.split('x')[0]);
    assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
  }
  assert.ok(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable'));
});
