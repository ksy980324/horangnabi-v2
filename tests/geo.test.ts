import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, insideBounds, itineraryPath, nearbyBounds, parseCoordinates } from '../src/services/geo.ts';

test('pasted coordinates accept decimal degrees and reject invalid ranges and trailing data', () => {
  assert.deepEqual(parseCoordinates(' 35.4585, 133.3578 '), { lat: 35.4585, lng: 133.3578 });
  assert.deepEqual(parseCoordinates('-33.865，+151.209'), { lat: -33.865, lng: 151.209 });
  for (const value of ['91, 130', '35, 181', '35, 130, 2', '35', '35, NaN', '35, 130°']) {
    assert.equal(parseCoordinates(value), undefined);
  }
});

test('itinerary line follows list order, skips missing coordinates and updates after reorder', () => {
  const first = { lat: 34.6873, lng: 135.5262 }, last = { lat: 34.6687, lng: 135.5013 };
  const points = [first, {}, { lat: NaN, lng: 130 }, last];
  assert.deepEqual(itineraryPath(points), [first, last]);
  assert.deepEqual(itineraryPath([...points].reverse()), [last, first]);
  assert.deepEqual(itineraryPath([{}]), []);
  assert.deepEqual(itineraryPath([{ lat: 0, lng: 0 }]), [{ lat: 0, lng: 0 }]);
  assert.deepEqual(itineraryPath([{ lat: 91, lng: 0 }]), []);
});

test('nearby search excludes distant namesakes and handles dateline bounds', () => {
  const osaka = { lat: 34.6873, lng: 135.5262 }, namba = { lat: 34.6687, lng: 135.5013 }, daejeon = { lat: 36.3155, lng: 127.44078 };
  const box = nearbyBounds(osaka, 20);
  assert.ok(insideBounds(namba, box));
  assert.ok(!insideBounds(daejeon, box));
  assert.ok(distanceKm(osaka, namba) < 5);
  assert.ok(distanceKm(osaka, daejeon) > 700);
  assert.equal(distanceKm(osaka, osaka), 0);
  const crossing = nearbyBounds({ lat: 0, lng: 179.99 }, 20);
  assert.ok(crossing.west > crossing.east);
  assert.ok(insideBounds({ lat: 0, lng: -179.99 }, crossing));
});
