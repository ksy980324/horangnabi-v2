import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleDatabase, parseDatabase } from '../src/data.ts';
import { savePackingItem, removePackingItem } from '../src/services/packing.ts';

test('old backups and completed checklist items remain compatible with version 1', () => {
  const db = sampleDatabase();
  assert.doesNotThrow(() => parseDatabase(db));
  db.trips[0].packingItems = [{ id: 'passport', name: '여권', completed: true }, { id: 'charger', name: '충전기', completed: false }];
  assert.deepEqual(parseDatabase(JSON.parse(JSON.stringify(db))), db);
});

test('checklist backups reject malformed arrays, empty fields, non-boolean checks and duplicate IDs', () => {
  const trip = sampleDatabase().trips[0];
  const item = { id: 'passport', name: '여권', completed: false };
  for (const packingItems of [null, {}, [null], [{ ...item, id: ' ' }], [{ ...item, name: ' ' }], [{ ...item, completed: 'false' }], [{ id: 'a', name: '여권' }], [item, item]]) {
    assert.throws(() => parseDatabase({ version: 1, trips: [{ ...trip, packingItems }] }));
  }
});

test('add, check, rename and remove preserve other trip data and do not mutate the original', () => {
  const trip = { ...sampleDatabase().trips[0], savedPlaces: [{ id: 'cafe', name: '카페', address: '', category: '카페' as const, memo: '' }] };
  const added = savePackingItem(trip, { id: 'passport', name: ' 여권 ', completed: false });
  const checked = savePackingItem(added, { ...added.packingItems![0], completed: true });
  const renamed = savePackingItem(checked, { ...checked.packingItems![0], name: '여권과 사본' });
  assert.deepEqual(renamed.packingItems, [{ id: 'passport', name: '여권과 사본', completed: true }]);
  assert.equal(trip.packingItems, undefined);
  assert.equal(added.packingItems![0].completed, false);
  assert.equal(renamed.stops, trip.stops);
  assert.equal(renamed.savedPlaces, trip.savedPlaces);
  assert.deepEqual(removePackingItem(renamed, 'passport').packingItems, []);
  assert.equal(removePackingItem(trip, 'missing'), trip);
  assert.equal(savePackingItem(trip, { id: 'blank', name: ' ', completed: false }), trip);
  assert.equal(savePackingItem(trip, { id: 'long', name: 'a'.repeat(151), completed: false }), trip);
});
