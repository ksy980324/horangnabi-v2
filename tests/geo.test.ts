import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, insideBounds, itineraryPath, nearbyBounds } from '../src/services/geo.ts';

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
