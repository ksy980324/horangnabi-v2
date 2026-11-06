import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../workers/maps-link/index.ts';

const origin = 'https://ksy980324.github.io';
const shortUrl = 'https://maps.app.goo.gl/LzUxeeRnbzJS2knW9';
const longUrl = 'https://www.google.com/maps/place/Udon+Marco';
const request = (url: string, sender = origin) => new Request(`https://example.workers.dev/resolve?${new URLSearchParams({ url })}`, { headers: { Origin: sender } });

test('the maps link worker returns the Maps destination without fetching the final page', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => Response.redirect(longUrl));
  const response = await worker.fetch(request(shortUrl));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.deepEqual(await response.json(), { url: longUrl });
  assert.equal(fetch.mock.callCount(), 1);
});

test('the maps link worker rejects unrelated origins, URLs and redirect targets', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => Response.redirect('https://example.org/'));
  assert.equal((await worker.fetch(request(shortUrl, 'https://example.org'))).status, 403);
  assert.equal((await worker.fetch(request('https://example.org/'))).status, 400);
  assert.equal((await worker.fetch(request(shortUrl))).status, 502);
  assert.equal(fetch.mock.callCount(), 1);
});
