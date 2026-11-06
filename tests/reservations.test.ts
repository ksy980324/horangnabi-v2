import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDatabase, sampleDatabase } from '../src/data';
import { removeReservation, saveReservation } from '../src/services/reservations';
import type { Reservation } from '../src/types';

test('flight and stay reservations round-trip through backups and preserve itinerary data', () => {
  const db = sampleDatabase();
  const trip = db.trips[0];
  const flight: Reservation = { id: 'flight', kind: 'flight', name: 'RS745', departure: '2026-11-21T12:00' };
  const stay: Reservation = { id: 'stay', kind: 'stay', name: '카스이테이', checkIn: '2026-11-21T15:00', checkOut: '2026-11-22T10:00', url: 'https://example.com/booking' };
  const next = saveReservation(saveReservation(trip, flight), stay);
  const updated = saveReservation(next, { ...flight, reference: 'ABC123' });
  assert.deepEqual(updated.stops.filter(stop => !stop.stayReservation), trip.stops);
  assert.equal(trip.reservations, undefined);
  assert.equal(updated.reservations?.length, 2);
  assert.deepEqual(parseDatabase(JSON.parse(JSON.stringify({ ...db, trips: [updated] }))).trips[0].reservations, updated.reservations);
  assert.deepEqual(parseDatabase(JSON.parse(JSON.stringify({ ...db, trips: [updated] }))).trips[0].stops, JSON.parse(JSON.stringify(updated.stops)));
});

test('stay creates timed check-in and checkout plus a first stop each morning', () => {
  const trip = sampleDatabase().trips[0];
  const stay: Reservation = {
    kind: 'stay', id: 'hotel', name: 'Hotel', address: 'Hotel address',
    checkIn: '2026-11-21T15:00', checkOut: '2026-11-23T10:00',
  };
  const saved = saveReservation(trip, stay);
  const day = (date: string) => saved.stops.filter(stop => stop.date === date);
  assert.equal(day('2026-11-21')[2].time, '15:00');
  assert.equal(day('2026-11-21')[2].name, 'Hotel 체크인');
  assert.equal(day('2026-11-22')[0].name, 'Hotel 출발');
  assert.equal(day('2026-11-22')[0].time, '');
  assert.equal(day('2026-11-23')[0].name, 'Hotel 체크아웃');
  assert.equal(day('2026-11-23')[0].time, '10:00');
  assert.equal(day('2026-11-23').filter(stop => stop.stayReservation).length, 1);
  assert.deepEqual(saveReservation(saved, stay), saved);

  const updated = saveReservation(saved, { ...stay, checkOut: '2026-11-22T09:30' });
  assert.deepEqual(updated.stops.filter(stop => stop.stayReservation).map(stop => [stop.date, stop.time]), [
    ['2026-11-21', '15:00'], ['2026-11-22', '09:30'],
  ]);
  assert.deepEqual(removeReservation(updated, stay.id).stops, trip.stops);
});

test('stay skips dates outside the trip and supports a checkout on the check-in date', () => {
  const trip = sampleDatabase().trips[0];
  const stay: Reservation = { kind: 'stay', id: 'hotel', name: 'Hotel', checkIn: '2026-11-20T15:00', checkOut: '2026-11-22T10:00' };
  const clipped = saveReservation(trip, stay);
  assert.deepEqual(clipped.stops.filter(stop => stop.stayReservation).map(stop => stop.stayReservation?.event), ['start', 'checkOut']);
  const sameDay = saveReservation(clipped, { ...stay, checkIn: '2026-11-22T08:00' });
  assert.deepEqual(sameDay.stops.filter(stop => stop.date === '2026-11-22').map(stop => stop.time), ['08:00', '10:00', '17:00']);
});

test('reservation backups reject duplicate IDs, invalid dates, and unsafe links', () => {
  const db = sampleDatabase();
  const item = { id: 'flight', kind: 'flight', name: 'RS745' };
  for (const reservations of [[item, item], [{ ...item, departure: '2026-02-30T12:00' }], [{ ...item, url: 'javascript:alert(1)' }], [{ ...item, kind: 'stay', checkIn: '2026-11-22T15:00', checkOut: '2026-11-21T10:00' }]]) {
    assert.throws(() => parseDatabase({ ...db, trips: [{ ...db.trips[0], reservations }] }));
  }
});

test('outbound flight creates a single arrival stop on the local arrival date and updates it on edit', () => {
  const db = sampleDatabase();
  const trip = db.trips[0];
  const booking: Reservation = {
    id: 'outbound', kind: 'flight', direction: 'outbound', name: 'RS471', departure: '2026-11-21T23:00',
    departureAirport: '인천국제공항 (ICN)', arrival: '2026-11-22T00:30', arrivalAirport: '요나고공항 (YGJ)',
  };
  const saved = saveReservation(trip, booking);
  const airport = saved.stops.find(stop => stop.flightReservationId === booking.id)!;
  assert.equal(airport.name, '요나고공항 (YGJ) 도착');
  assert.equal(airport.date, '2026-11-22');
  assert.equal(airport.time, '00:30');
  assert.deepEqual([airport.lat, airport.lng], [35.492199, 133.235992]);
  const updated = saveReservation(saved, { ...booking, arrival: '2026-11-23T13:10' });
  assert.equal(updated.stops.filter(stop => stop.flightReservationId === booking.id).length, 1);
  assert.equal(updated.stops.find(stop => stop.id === airport.id)?.date, '2026-11-23');
  assert.deepEqual(parseDatabase(JSON.parse(JSON.stringify({ ...db, trips: [updated] }))).trips[0].stops, updated.stops.map(stop => JSON.parse(JSON.stringify(stop))));
  assert.deepEqual(removeReservation(updated, booking.id).stops, trip.stops);
});

test('return flight uses the departure airport and time and skips events outside the trip', () => {
  const trip = sampleDatabase().trips[0];
  const booking: Reservation = {
    id: 'return', kind: 'flight', direction: 'return', name: 'RS472', departure: '2026-11-24T15:50',
    departureAirport: '요나고 공항', arrival: '2026-11-24T17:40', arrivalAirport: '인천국제공항 (ICN)',
  };
  const saved = saveReservation(trip, booking);
  const airport = saved.stops.find(stop => stop.flightReservationId === booking.id)!;
  assert.equal(airport.name, '요나고 공항 출발');
  assert.equal(airport.time, '15:50');
  assert.equal(airport.lat, 35.492199);
  assert.deepEqual(saveReservation(saved, { ...booking, departure: '2026-11-25T15:50' }).stops, trip.stops);
  assert.equal(saveReservation(trip, { ...booking, direction: 'outbound', arrival: undefined }).stops, trip.stops);
});
