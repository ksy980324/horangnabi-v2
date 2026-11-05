import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleDatabase, parseDatabase } from '../src/data.ts';
import { scheduleSavedPlace } from '../src/services/savedPlaces.ts';
import type { SavedPlace } from '../src/types.ts';

const candidate: SavedPlace = { id: 'saved-cafe', name: '후보 카페', address: '오사카', lat: 34.67, lng: 135.50, category: '카페', memo: '비 오는 날 가기' };

test('old backups remain readable and saved places preserve all fields on round trip', () => {
  const db = sampleDatabase();
  assert.doesNotThrow(() => parseDatabase(db));
  db.trips[0].savedPlaces = [candidate, { ...candidate, id: 'no-location', lat: undefined, lng: undefined }];
  assert.deepEqual(parseDatabase(JSON.parse(JSON.stringify(db))), JSON.parse(JSON.stringify(db)));
});

test('saved place validation rejects invalid metadata, coordinates and IDs shared with scheduled stops', () => {
  for (const entry of [null, { ...candidate, name: ' ' }, { ...candidate, memo: 1 }, { ...candidate, category: 'invalid' }, { ...candidate, lat: 100 }, { ...candidate, lng: undefined }, { ...candidate, id: 'castle' }]) {
    const db = sampleDatabase();
    assert.throws(() => parseDatabase({ ...db, trips: [{ ...db.trips[0], savedPlaces: [entry] }] }));
  }
  const db = sampleDatabase();
  assert.throws(() => parseDatabase({ ...db, trips: [{ ...db.trips[0], savedPlaces: [candidate, candidate] }] }));
  assert.throws(() => parseDatabase({ ...db, trips: [{ ...db.trips[0], savedPlaces: {} }] }));
});

test('moving a candidate appends it on the selected day once, without mutating the trip or losing details', () => {
  const trip = { ...sampleDatabase().trips[0], savedPlaces: [candidate] };
  const moved = scheduleSavedPlace(trip, candidate.id, '2026-11-22');
  assert.deepEqual(moved.stops.at(-1), { ...candidate, date: '2026-11-22', time: '' });
  assert.deepEqual(moved.savedPlaces, []);
  assert.deepEqual(trip.savedPlaces, [candidate]);
  assert.equal(trip.stops.length, 5);
  assert.equal(scheduleSavedPlace(moved, candidate.id, '2026-11-22'), moved);
  assert.equal(scheduleSavedPlace(trip, candidate.id, '2026-12-01'), trip);
  assert.equal(scheduleSavedPlace(trip, 'missing', trip.start), trip);
  assert.doesNotThrow(() => parseDatabase({ version: 1, trips: [moved] }));
});

test('coordinate-free candidates can move to the last trip day', () => {
  const trip = { ...sampleDatabase().trips[0], savedPlaces: [{ ...candidate, lat: undefined, lng: undefined }] };
  const moved = scheduleSavedPlace(trip, candidate.id, trip.end);
  assert.equal(moved.stops.at(-1)?.lat, undefined);
  assert.equal(moved.stops.at(-1)?.date, trip.end);
});
