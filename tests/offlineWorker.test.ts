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
