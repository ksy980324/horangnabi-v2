import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../workers/maps-link/index.ts';
import { googleMapsFeature, parseGoogleMapsEmbed, parseGoogleMapsPage } from '../workers/maps-link/googleMapsPage.ts';

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

test('an Android share without URL coordinates resolves the exact selected hotel marker', async context => {
  const feature = '0x3556f77896297979:0x91037cd27feae498';
  const destination = `https://www.google.com/maps/place/Hotel/data=!4m2!3m1!1s${feature}!18m1!1e1?g_st=ac`;
  const place = [[feature, 'Hotel address', [35.4242275, 133.3354615], '10449332803960759448'], 'Hotel', ['125 Meijicho', 'Yonago']];
  const html = `<script>initEmbed(${JSON.stringify([[[133, 35]], place])});</script>`;
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    if (String(input).includes('maps.app.goo.gl')) return Response.redirect(destination);
    const embed = new URL(String(input));
    assert.equal(embed.hostname, 'www.google.com');
    assert.equal(embed.searchParams.get('cid'), '10449332803960759448');
    assert.equal(embed.searchParams.get('output'), 'embed');
    if (embed.pathname === '/maps') return Response.redirect(new URL('/maps/embed' + embed.search, embed), 301);
    return new Response(html);
  });
  const response = await worker.fetch(request('https://maps.app.goo.gl/Zb1AvZ6S7AfsLVCZA?g_st=ac'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: destination, name: 'Hotel', address: '125 Meijicho Yonago', point: { lat: 35.4242275, lng: 133.3354615 } });
  assert.equal(googleMapsFeature(destination)?.cid, '10449332803960759448');
  assert.equal(parseGoogleMapsEmbed(html, '0x1:0x2'), undefined);
});

test('a failed location lookup still returns the place name already obtained from the redirect', async context => {
  const destination = 'https://www.google.com/maps/place/Hotel/data=!1s0x1:0x2';
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => {
    if (++calls === 1) return Response.redirect(destination);
    throw new Error('upstream unavailable');
  });
  const response = await worker.fetch(request(shortUrl));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: destination });
});
