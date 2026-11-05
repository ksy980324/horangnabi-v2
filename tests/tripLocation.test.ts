import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingCity, tripCenter } from '../src/services/tripLocation.ts';
import { parseDatabase, sampleDatabase } from '../src/data.ts';

test('city matching accepts native city suffixes but refuses unrelated or ambiguous matches', () => {
  const yonago = { name: '米子市', address: 'Japan', lat: 35.43, lng: 133.33 };
  assert.equal(matchingCity('JP', '요나고', [yonago]), yonago);
  assert.equal(matchingCity('JP', '요나고', [{ ...yonago, name: 'Osaka' }]), undefined);
  assert.equal(matchingCity('JP', '요나고', [yonago, { ...yonago, lat: 35.5 }]), undefined);
  assert.equal(matchingCity('JP', '요나고', [{ ...yonago, lat: 100 }]), undefined);
});

test('new trips use the selected city; legacy trips fall back to day or trip stops', () => {
  const trip = sampleDatabase().trips[0];
  assert.deepEqual(tripCenter(trip), { lat: trip.stops[0].lat, lng: trip.stops[0].lng });
  assert.deepEqual(tripCenter(trip, [trip.stops[3]]), { lat: trip.stops[3].lat, lng: trip.stops[3].lng });
  trip.destination = { countryCode: 'JP', cityName: '요나고', lat: 35.43, lng: 133.33 };
  assert.deepEqual(tripCenter(trip, [trip.stops[0]]), { lat: 35.43, lng: 133.33 });
  assert.equal(tripCenter({ ...trip, destination: undefined, stops: [] }), undefined);
});

test('city coordinates survive backup round trips; old backups and coordinate-free destinations remain valid', () => {
  const db = sampleDatabase();
  assert.doesNotThrow(() => parseDatabase(db));
  db.trips[0].destination = { countryCode: 'JP', cityName: '요나고', lat: 35.43, lng: 133.33 };
  assert.deepEqual(parseDatabase(JSON.parse(JSON.stringify(db))), db);
  for (const destination of [null, { countryCode: 1, cityName: 'test' }, { countryCode: 'jp', cityName: 'test' }, { countryCode: 'JP', cityName: ' ' }, { countryCode: 'JP', cityName: 'test', lat: 35 }, { countryCode: 'JP', cityName: 'test', lat: 35, lng: 200 }]) {
    assert.throws(() => parseDatabase({ version: 1, trips: [{ ...db.trips[0], destination }] }));
  }
  db.trips[0].destination = { countryCode: 'JP', cityName: '요나고' };
  assert.doesNotThrow(() => parseDatabase(db));
});
