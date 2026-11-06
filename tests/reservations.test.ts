import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDatabase, sampleDatabase } from '../src/data';
import { saveReservation } from '../src/services/reservations';
import type { Reservation } from '../src/types';

test('flight and stay reservations round-trip through backups and preserve itinerary data', () => {
  const db = sampleDatabase();
  const trip = db.trips[0];
  const flight: Reservation = { id: 'flight', kind: 'flight', name: 'RS745', departure: '2026-11-21T12:00' };
  const stay: Reservation = { id: 'stay', kind: 'stay', name: '카스이테이', checkIn: '2026-11-21T15:00', checkOut: '2026-11-22T10:00', url: 'https://example.com/booking' };
  const next = saveReservation(saveReservation(trip, flight), stay);
  const updated = saveReservation(next, { ...flight, reference: 'ABC123' });
  assert.equal(updated.stops, trip.stops);
  assert.equal(trip.reservations, undefined);
  assert.equal(updated.reservations?.length, 2);
  assert.deepEqual(parseDatabase(JSON.parse(JSON.stringify({ ...db, trips: [updated] }))).trips[0].reservations, updated.reservations);
});

test('reservation backups reject duplicate IDs, invalid dates, and unsafe links', () => {
  const db = sampleDatabase();
  const item = { id: 'flight', kind: 'flight', name: 'RS745' };
  for (const reservations of [[item, item], [{ ...item, departure: '2026-02-30T12:00' }], [{ ...item, url: 'javascript:alert(1)' }], [{ ...item, kind: 'stay', checkIn: '2026-11-22T15:00', checkOut: '2026-11-21T10:00' }]]) {
    assert.throws(() => parseDatabase({ ...db, trips: [{ ...db.trips[0], reservations }] }));
  }
});
