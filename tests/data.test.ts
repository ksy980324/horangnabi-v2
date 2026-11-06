import test from 'node:test';
import assert from 'node:assert/strict';
import { datesBetween, moveStop, parseDatabase, reorderStop, sampleDatabase } from '../src/data.ts';

test('dragging across multiple stops inserts the item without changing other days', () => {
  const trip = sampleDatabase().trips[0];
  const [first, second, third, otherDay, ...rest] = trip.stops;
  const interleaved = { ...trip, stops: [first, otherDay, second, third, ...rest] };
  const moved = reorderStop(interleaved, first.date, first.id, 2);
  assert.deepEqual(moved.stops, [second, otherDay, third, first, ...rest]);
  assert.deepEqual(reorderStop(moved, first.date, first.id, 0).stops, interleaved.stops);
  assert.equal(reorderStop(interleaved, first.date, first.id, 0), interleaved);
  assert.equal(reorderStop(interleaved, first.date, first.id, 3), interleaved);
  assert.equal(reorderStop(interleaved, first.date, otherDay.id, 0), interleaved);
});
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
