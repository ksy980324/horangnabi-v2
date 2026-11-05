import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPlaces } from '../src/services/search.ts';
test('search caches queries, limits requests and reports service failures', async context => {
  let clock = 10_000, requests = 0;
  context.mock.method(Date, 'now', () => clock);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
  context.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return new Response(JSON.stringify({ features: [{ properties: { name: 'Osaka Castle', country: 'Japan', city: 'Osaka' }, geometry: { coordinates: [135.5262, 34.6873] } }] }), { status: 200 });
  });
  try {
    const result = await searchPlaces('Osaka Castle');
    assert.equal(result[0].lat, 34.6873);
    assert.equal(result[0].lng, 135.5262);
    assert.equal(result[0].address, '일본 오사카');
    assert.equal(result[0].originalAddress, 'Japan Osaka');
    assert.deepEqual(await searchPlaces(' osaka castle '), result);
    assert.equal(requests, 1);
    await assert.rejects(searchPlaces('Kyoto'), /2초/);
    await assert.rejects(searchPlaces('a'), /두 글자/);
    clock += 2100;
    await searchPlaces('Kyoto');
    assert.equal(requests, 2);
    clock += 2100;
    context.mock.method(globalThis, 'fetch', async () => new Response('', { status: 429 }));
    await assert.rejects(searchPlaces('Tokyo'), /검색 서버/);
  } finally { Reflect.deleteProperty(globalThis, 'window'); }
});

test('nearby search sends scope and address and filters distant, duplicate or invalid results', async context => {
  let clock = 100_000, requestedUrl = '';
  context.mock.method(Date, 'now', () => clock);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
  const feature = (name: string, lng: number, lat: number) => ({ properties: { name, country: 'Japan', state: 'Osaka', city: 'Osaka', district: 'Namba', street: 'Street', housenumber: '1', postcode: '542', osm_key: 'shop', osm_value: 'department_store' }, geometry: { coordinates: [lng, lat] } });
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ features: [feature('Far namesake', 127.44, 36.31), feature('Namba branch', 135.501, 34.669), feature('Namba branch', 135.501, 34.669), feature('Invalid', 135, 95), {}] }), { status: 200 });
  });
  const center = { lat: 34.6873, lng: 135.5262 };
  try {
    const results = await searchPlaces('Don Quijote', { area: 'Namba', center, radiusKm: 20 });
    const url = new URL(requestedUrl);
    assert.equal(url.searchParams.get('q'), 'Don Quijote Namba');
    assert.equal(url.searchParams.get('lat'), String(center.lat));
    assert.equal(url.searchParams.get('lon'), String(center.lng));
    assert.ok(url.searchParams.has('bbox'));
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Namba branch');
    assert.equal(results[0].address, '일본 오사카 난바 Street 1 542');
    assert.equal(results[0].originalAddress, 'Japan Osaka Namba Street 1 542');
    assert.ok(results[0].distanceKm! < 5);
    assert.equal(results[0].typeLabel, '백화점');
    clock += 2100;
    const global = await searchPlaces('Don Quijote', { area: 'Namba' });
    assert.equal(global.length, 2);
    assert.ok(!new URL(requestedUrl).searchParams.has('bbox'));
    clock += 2100;
    const empty = await searchPlaces('Don Quijote', { bounds: { west: 0, south: 0, east: 1, north: 1 } });
    assert.deepEqual(empty, []);
  } finally { Reflect.deleteProperty(globalThis, 'window'); }
});

test('Korean airport queries use real airport search, localized names and a shared alias cache', async context => {
  context.mock.method(Date, 'now', () => 1_000_000);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
  let requests = 0;
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    requests++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('q'), 'Osaka International Airport');
    assert.equal(url.searchParams.get('osm_tag'), 'aeroway:aerodrome');
    return new Response(JSON.stringify({ features: [{ properties: { name: 'Osaka Itami Airport', country: 'Japan', osm_key: 'aeroway', osm_value: 'aerodrome' }, geometry: { coordinates: [135.438, 34.785] } }] }));
  });
  try {
    const result = await searchPlaces('오사카 공항');
    assert.equal(result[0].name, '오사카 국제공항(이타미)');
    assert.equal(result[0].originalName, 'Osaka Itami Airport');
    assert.equal(result[0].typeLabel, '공항');
    assert.deepEqual(await searchPlaces('이타미 공항'), result);
    assert.equal(requests, 1);
  } finally { Reflect.deleteProperty(globalThis, 'window'); }
});

test('city search is country-filtered, excludes POIs and shares rate limits with place search', async context => {
  let clock = 2_000_000, requests = 0;
  context.mock.method(Date, 'now', () => clock);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    requests++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('countrycode'), 'JP');
    assert.deepEqual(url.searchParams.getAll('layer'), ['city', 'locality']);
    const feature = (name: string, countrycode: string, osm_key: string, osm_value: string) => ({ properties: { name, countrycode, osm_key, osm_value, type: 'locality' }, geometry: { coordinates: [133.33, 35.43] } });
    return new Response(JSON.stringify({ features: [feature('Yonago', 'JP', 'place', 'city'), feature('Small town', 'JP', 'place', 'town'), feature('Cafe', 'JP', 'amenity', 'cafe'), feature('Foreign namesake', 'US', 'place', 'city')] }));
  });
  try {
    const results = await searchPlaces('Yonago', { countryCode: 'JP', cityOnly: true });
    assert.deepEqual(results.map(result => result.name), ['요나고', 'Small town']);
    await assert.rejects(searchPlaces('Another place'), /2초/);
    assert.equal(requests, 1);
    clock += 2100;
    assert.deepEqual(await searchPlaces('Yonago', { countryCode: 'JP', cityOnly: true }), results);
    assert.equal(requests, 1);
  } finally { Reflect.deleteProperty(globalThis, 'window'); }
});
