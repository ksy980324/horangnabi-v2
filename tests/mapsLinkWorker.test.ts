import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../workers/maps-link/index.ts';
import { parseGoogleMapsPage } from '../workers/maps-link/googleMapsPage.ts';

const origin = 'https://ksy980324.github.io';
const shortUrl = 'https://maps.app.goo.gl/LzUxeeRnbzJS2knW9';
const longUrl = 'https://www.google.com/maps/place/Udon+Marco/data=!3d35.4263429!4d133.3340368';
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

test('mobile links can follow multiple Maps redirects and extract explicit place metadata', async context => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1) return Response.redirect('https://goo.gl/maps/abc');
    if (calls === 2) return Response.redirect('https://maps.google.com/?cid=123');
    return new Response('<meta content="Hotel &amp; Spa - Google Maps" property="og:title"><script type="application/ld+json">{"name":"Hotel","geo":{"latitude":35.4,"longitude":133.3},"address":{"addressLocality":"Yonago","streetAddress":"1-1"}}</script>');
  });
  const response = await worker.fetch(request(shortUrl));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: 'https://maps.google.com/?cid=123', name: 'Hotel & Spa', address: 'Yonago 1-1', point: { lat: 35.4, lng: 133.3 } });
  assert.equal(parseGoogleMapsPage('<meta property="og:image" content="https://maps.google.com/image?center=35.4,133.3">').point, undefined);
});
