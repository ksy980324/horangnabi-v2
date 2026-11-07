import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { searchWithEnglishFallback } from '../src/services/searchWithEnglishFallback.ts';
import { translatePlaceQuery } from '../src/services/translatePlaceQuery.ts';
import { searchPlaces } from '../src/services/search.ts';

let clock = 5_000_000;
function setup(context: TestContext, respond: (url: URL) => Response) {
  clock += 100_000;
  context.mock.method(Date, 'now', () => clock);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
  context.after(() => Reflect.deleteProperty(globalThis, 'window'));
  const requests: URL[] = [];
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    clock += 2100;
    return respond(url);
  });
  return requests;
}
const places = (name?: string) => Response.json({ features: name ? [{
  properties: { name, osm_key: 'railway', osm_value: 'station' }, geometry: { coordinates: [134.1, 35.4] },
}] : [] });

test('Korean is searched first and an empty result retries Tottori Station in the same area', async context => {
  const requests = setup(context, url => url.searchParams.get('q') === 'Tottori Station' ? places('Tottori Station')
    : Response.json({ features: [{ properties: { name: '돗토리', osm_key: 'amenity', osm_value: 'restaurant' }, geometry: { coordinates: [126.7, 37.7] } }] }));
  const options = { center: { lat: 35.4, lng: 134.1 }, bounds: { west: 134, east: 135, south: 35, north: 36 } };
  const progress: string[] = [];
  const result = await searchWithEnglishFallback('돗토리역', options, text => progress.push(text));
  assert.deepEqual(requests.map(url => url.searchParams.get('q')), ['돗토리역', 'Tottori Station']);
  assert.ok(requests.every(url => url.searchParams.get('bbox') === '134,35,135,36'));
  assert.equal(result.places[0].name, 'Tottori Station');
  assert.equal(result.translatedQuery, 'Tottori Station');
  assert.ok(progress.some(text => text.includes('Tottori Station')));
  await searchWithEnglishFallback('돗토리역', options, () => {});
  assert.equal(requests.length, 2);
});

test('a Korean match stops the fallback and an English miss does not call translation', async context => {
  const requests = setup(context, url => places(url.searchParams.get('q') === '한국어 우선역' ? '한국어 우선역' : undefined));
  const korean = await searchWithEnglishFallback('한국어 우선역', {}, () => {});
  assert.equal(korean.translatedQuery, undefined);
  assert.equal(korean.places.length, 1);
  const english = await searchWithEnglishFallback('An unknown station', {}, () => {});
  assert.equal(english.places.length, 0);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(url => url.hostname === 'photon.komoot.io'));
});

test('unknown phrases use semantic translation while city names retain their registered spelling', async context => {
  const requests = setup(context, url => {
    assert.equal(url.hostname, 'api.mymemory.translated.net');
    assert.equal(url.searchParams.get('langpair'), 'ko|en');
    const protectedName = url.searchParams.get('q')!.match(/ZXQ\d+ZXQ/)![0];
    return Response.json({ responseStatus: 200, responseData: { translatedText: `A small garden near ${protectedName}` } });
  });
  assert.equal(await translatePlaceQuery('돗토리 근처의 작은 정원'), 'A small garden near Tottori');
  assert.equal(await translatePlaceQuery('돗토리 근처의 작은 정원'), 'A small garden near Tottori');
  assert.equal(requests.length, 1);
});

test('untranslated proper names are romanized and completed place terms keep their meaning', async context => {
  setup(context, () => Response.json({ responseStatus: 200, responseData: { translatedText: '하나비 Cafe' } }));
  assert.equal(await translatePlaceQuery('하나비 카페'), 'hanabi Cafe');
  assert.equal(await translatePlaceQuery('마쓰에 미술관'), 'Matsue Art Museum');
  assert.equal(await translatePlaceQuery('부산 중앙역'), 'Busan Central Station');
  assert.equal(await translatePlaceQuery('카스이테이'), 'Kasuitei');
});

test('translation quota failures keep the empty Korean result available for Google Maps handoff', async context => {
  const requests = setup(context, url => url.hostname === 'photon.komoot.io' ? places()
    : Response.json({ responseStatus: 429, quotaFinished: true, responseData: { translatedText: 'QUOTA EXCEEDED' } }));
  const result = await searchWithEnglishFallback('별빛정원 숙소 검색', {}, () => {});
  assert.deepEqual(result.places, []);
  assert.equal(result.translationUnavailable, true);
  assert.equal(requests.length, 2);
});

test('waiting for the search interval can be cancelled without issuing another request', async context => {
  const requests = setup(context, () => { clock -= 2100; return places(); });
  await searchPlaces('Interval seed');
  const controller = new AbortController();
  const pending = searchPlaces('Interval cancelled', { waitForRateLimit: true, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(requests.length, 1);
});
