import test from 'node:test';
import assert from 'node:assert/strict';
import { datesBetween, moveStop, parseDatabase, sampleDatabase } from '../src/data.ts';
test('dates span leap day and year boundary without timezone drift', () => {
  assert.deepEqual(datesBetween('2028-02-28', '2028-03-01'), ['2028-02-28', '2028-02-29', '2028-03-01']);
  assert.deepEqual(datesBetween('2026-12-31', '2027-01-01'), ['2026-12-31', '2027-01-01']);
  assert.deepEqual(datesBetween('2026-01-02', '2026-01-01'), []);
  assert.deepEqual(datesBetween('2026-01-01', '2030-01-01'), []);
});
test('reorder changes only the selected day and preserves immutable input', () => {
  const trip = sampleDatabase().trips[0], original = trip.stops.map(s => s.id);
  const moved = moveStop(trip, trip.start, 'market', -1);
  assert.deepEqual(moved.stops.slice(0, 3).map(s => s.id), ['market', 'castle', 'dotonbori']);
  assert.deepEqual(moved.stops.slice(3), trip.stops.slice(3));
  assert.deepEqual(trip.stops.map(s => s.id), original);
  assert.equal(moveStop(trip, trip.start, 'castle', -1), trip);
});
test('backup accepts missing coordinates and rejects invalid bounds, duplicate ids and dates', () => {
  assert.deepEqual(parseDatabase(JSON.parse(JSON.stringify(sampleDatabase()))), sampleDatabase());
  const invalidCoordinate = sampleDatabase(); invalidCoordinate.trips[0].stops[0].lat = 100;
  assert.throws(() => parseDatabase(invalidCoordinate));
  const invalidDate = sampleDatabase(); invalidDate.trips[0].stops[0].date = '2026-02-30';
  assert.throws(() => parseDatabase(invalidDate));
  const duplicate = sampleDatabase(); duplicate.trips[0].stops.push(duplicate.trips[0].stops[0]);
  assert.throws(() => parseDatabase(duplicate));
  const outside = sampleDatabase(); outside.trips[0].stops[0].date = '2026-01-01';
  assert.throws(() => parseDatabase(outside));
  assert.throws(() => parseDatabase({ version: 2, trips: [] }));
});
