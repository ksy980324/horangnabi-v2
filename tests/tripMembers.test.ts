import assert from 'node:assert/strict';
import test from 'node:test';
import { initialTripAccess, approveMember, removeMember, parseTripAccess, inviteTokenFromHash, inviteUrl } from '../src/services/tripMembers.ts';
import { createSharedSnapshotReader } from '../src/services/sharedSnapshot.ts';
import { sampleDatabase, parseDatabase } from '../src/data.ts';
import { setPackingCheckedBy, packingCompletedCount } from '../src/services/packing.ts';
import { summarizeExpenses } from '../src/services/expenses.ts';

test('only the trip owner can approve a request; leaving and removing never remove the owner', () => {
  const original = initialTripAccess('owner', ' Alice ');
  const request = { userId: 'friend', displayName: 'Bob', status: 'pending' as const };
  assert.throws(() => approveMember(original, 'outsider', request));
  assert.throws(() => approveMember(original, 'owner', { ...request, status: 'rejected' }));
  const joined = approveMember(original, 'owner', request);
  assert.deepEqual(original.memberIds, ['owner']);
  assert.equal(joined.memberNames.friend, 'Bob');
  assert.throws(() => approveMember(joined, 'owner', request));
  assert.throws(() => removeMember(joined, 'friend', 'owner'));
  assert.throws(() => removeMember(joined, 'stranger', 'friend'));
  assert.deepEqual(removeMember(joined, 'friend', 'friend'), original);
  assert.deepEqual(removeMember(joined, 'owner', 'friend'), original);
  assert.throws(() => parseTripAccess({ ...joined, memberIds: ['owner', 'owner'] }));
  assert.throws(() => parseTripAccess({ ...joined, memberIds: ['friend'] }));
  assert.throws(() => parseTripAccess({ ...joined, memberNames: { owner: 'Alice' } }));
});

test('invites preserve a Pages subpath and never accept arbitrary fragments as tokens', () => {
  const token = 'a'.repeat(64);
  const url = inviteUrl(token, 'https://example.test/horangnabi-v2/?old=1#previous');
  assert.equal(url, `https://example.test/horangnabi-v2/#invite=${token}`);
  assert.equal(inviteTokenFromHash(new URL(url).hash), token);
  assert.equal(inviteTokenFromHash('#invite=short'), undefined);
  assert.throws(() => inviteUrl('not-a-token', url));
});

test('each subscribed trip carries its own member list and unjoined trips are rejected', () => {
  const trip = sampleDatabase().trips[0];
  const read = createSharedSnapshotReader('owner');
  const document = { id: trip.id, data: () => ({ trip, revision: 1, ...initialTripAccess('owner') }) };
  const result = read([document], []);
  assert.deepEqual(result.access.get(trip.id)?.memberIds, ['owner']);
  assert.equal(read([document], []), result);
  assert.throws(() => createSharedSnapshotReader('outsider')([document], []));
});

test('group checklists finish only when every current member is checked, including solo trips', () => {
  const ids = ['a', 'b', 'c'];
  let item = { id: 'passport', name: 'Passport', completed: false };
  for (const id of ids) item = setPackingCheckedBy(item, ids, id, true);
  assert.equal(item.completed, true);
  assert.equal(packingCompletedCount(item, ids), 3);
  assert.equal(setPackingCheckedBy(item, [...ids, 'd'], 'd', false).completed, false);
  assert.equal(setPackingCheckedBy(item, ['a'], 'a', true).completed, true);
  const trip = { ...sampleDatabase().trips[0], packingItems: [item] };
  assert.doesNotThrow(() => parseDatabase({ version: 1, trips: [trip] }));
});

test('group settlements conserve integer units, separate currencies and never invent former member payments', () => {
  const expense = { id: 'meal', name: 'Meal', date: '2026-11-16', currency: 'JPY', amount: 10001, paidBy: 'a', shared: true };
  const summary = summarizeExpenses([expense], ['a', 'b', 'c'])[0];
  assert.deepEqual(summary.transfers, [{ from: 'b', to: 'a', amount: 3334 }, { from: 'c', to: 'a', amount: 3333 }]);
  assert.equal(summary.transfers.reduce((sum, transfer) => sum + transfer.amount, 0), 6667);
  assert.deepEqual(summarizeExpenses([expense], ['a'])[0].transfers, []);
  assert.deepEqual(summarizeExpenses([expense], ['b', 'c'])[0].transfers, []);
  assert.equal(summarizeExpenses([expense], ['b', 'c'])[0].formerMember, true);
});
