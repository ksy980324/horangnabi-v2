import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleDatabase } from '../src/data.ts';
import { createSharedSnapshotReader } from '../src/services/sharedSnapshot.ts';

test('metadata confirmations reuse validated trips and only changed documents are decoded', () => {
  const read = createSharedSnapshotReader();
  const source = sampleDatabase().trips[0];
  let reads = 0;
  const document = (id: string, revision = 1) => ({ id, data: () => { reads++; return { trip: { ...source, id }, revision }; } });
  const first = read([document('a'), document('b')], []);
  assert.equal(reads, 2); // Initial server response can have no changes after a skipped cache event.
  assert.equal(read([document('a'), document('b')], []), first);
  assert.equal(reads, 2);
  const updated = read([document('a', 2), document('b')], ['a']);
  assert.equal(reads, 3);
  assert.notEqual(updated.db.trips[0], first.db.trips[0]);
  assert.equal(updated.db.trips[1], first.db.trips[1]);
  assert.equal(updated.revisions.get('a'), 2);
  const removed = read([document('b')], ['a']);
  assert.deepEqual(removed.db.trips.map(trip => trip.id), ['b']);
  assert.equal(removed.revisions.has('a'), false);
  const recreated = read([document('a'), document('b')], ['a']);
  assert.equal(recreated.revisions.get('a'), 1);
  assert.notEqual(createSharedSnapshotReader()([document('a')], []), recreated);
});

test('changed shared documents remain validated and rejected snapshots cannot corrupt the cache', () => {
  const read = createSharedSnapshotReader();
  const source = sampleDatabase().trips[0];
  const doc = { id: source.id, data: () => ({ trip: source, revision: 1 }) };
  const first = read([doc], []);
  assert.throws(() => read([{ ...doc, data: () => ({ trip: { ...source, stops: null }, revision: 2 }) }], [doc.id]));
  assert.throws(() => read([{ ...doc, data: () => ({ trip: source, revision: 0 }) }], [doc.id]));
  assert.throws(() => read([{ ...doc, id: 'wrong-id' }], ['wrong-id']));
  assert.throws(() => read([doc, doc], []));
  assert.throws(() => read(Array.from({ length: 1001 }, () => doc), []));
  assert.equal(read([doc], []), first);
  const revisionOnly = read([{ ...doc, data: () => ({ trip: source, revision: 2 }) }], [doc.id]);
  assert.notEqual(revisionOnly, first);
  assert.equal(revisionOnly.revisions.get(doc.id), 2);
  assert.deepEqual(read([], [doc.id]).db.trips, []);
});
