import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

let environment;
before(async () => { environment = await initializeTestEnvironment({ projectId: 'demo-horangnabi', firestore: { rules: readFileSync('firestore.rules', 'utf8') } }); });
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [id, nickname] of Object.entries({ alice: 'alice', bob: 'Friend', charlie: 'Friend', dana: 'Friend' })) {
      await setDoc(doc(db, 'profiles', id), { nickname, updatedAt: serverTimestamp() });
    }
  });
});
after(async () => environment?.cleanup());
const client = uid => environment.authenticatedContext(uid).firestore();
const payload = (id = 'trip-a', ownerId = 'alice', memberIds = [ownerId]) => ({
  trip: { id, name: 'Private trip', region: 'Japan', start: '2026-11-16', end: '2026-11-18', stops: [] },
  revision: 1, updatedAt: serverTimestamp(), updatedBy: ownerId, ownerId, memberIds,
  memberNames: Object.fromEntries(memberIds.map(id => [id, id])), inviteToken: '',
});
const update = (value, actor, extra = {}) => ({ ...value, revision: value.revision + 1, updatedAt: serverTimestamp(), updatedBy: actor, ...extra });
const seed = async (id = 'trip-a', owner = 'alice', members = ['alice', 'bob'], token = '') => {
  const value = { ...payload(id, owner, members), inviteToken: token };
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'sharedTrips', id), value);
    if (token) await setDoc(doc(db, 'tripInvites', token), { tripId: id, ownerId: owner, tripName: 'Private trip', createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 86400000) });
  });
  return value;
};
const token = 'a'.repeat(64);
const request = (uid = 'charlie', inviteToken = token) => ({ userId: uid, displayName: 'Friend', status: 'pending', inviteToken, createdAt: serverTimestamp() });

test('signed-in people create their own trips; anonymous users and forged initial participants cannot', async () => {
  const alice = client('alice');
  await assertSucceeds(getDoc(doc(alice, 'sharedTrips', 'missing')));
  await assertSucceeds(setDoc(doc(alice, 'sharedTrips', 'trip-a'), payload()));
  await assertFails(setDoc(doc(client('bob'), 'sharedTrips', 'forged'), payload('forged', 'alice')));
  await assertFails(setDoc(doc(client('bob'), 'sharedTrips', 'two'), payload('two', 'bob', ['bob', 'charlie'])));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'sharedTrips', 'trip-a')));
});

test('two groups stay isolated; list queries must filter by the authenticated member', async () => {
  await seed(); await seed('trip-b', 'charlie', ['charlie', 'dana']);
  const alice = client('alice');
  const visible = await assertSucceeds(getDocs(query(collection(alice, 'sharedTrips'), where('memberIds', 'array-contains', 'alice'))));
  assert.deepEqual(visible.docs.map(document => document.id), ['trip-a']);
  await assertFails(getDocs(collection(alice, 'sharedTrips')));
  await assertFails(getDocs(query(collection(alice, 'sharedTrips'), where('memberIds', 'array-contains', 'charlie'))));
  await assertFails(getDoc(doc(alice, 'sharedTrips', 'trip-b')));
  await assertFails(setDoc(doc(alice, 'sharedTrips', 'trip-b'), update(payload('trip-b', 'charlie'), 'alice')));
});

test('members edit content with revision checks; ownership, participant changes and deletion are protected', async () => {
  const original = await seed();
  const bob = client('bob'); const ref = doc(bob, 'sharedTrips', 'trip-a');
  const edited = update(original, 'bob', { trip: { ...original.trip, name: 'Updated' } });
  await assertSucceeds(setDoc(ref, edited));
  await assertFails(setDoc(ref, edited));
  await assertFails(setDoc(ref, update(edited, 'bob', { ownerId: 'bob' })));
  await assertFails(setDoc(ref, update(edited, 'bob', { memberIds: ['alice', 'bob', 'charlie'], memberNames: { alice: 'A', bob: 'B', charlie: 'C' } })));
  await assertFails(deleteDoc(ref));
  await assertSucceeds(deleteDoc(doc(client('alice'), 'sharedTrips', 'trip-a')));
});

test('only the owner rotates invite links; possession grants preview, never itinerary access', async () => {
  const original = await seed(); const alice = client('alice');
  const invitation = { tripId: 'trip-a', ownerId: 'alice', tripName: 'Private trip', createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 6 * 86400000) };
  const batch = writeBatch(alice);
  batch.set(doc(alice, 'sharedTrips', 'trip-a'), update(original, 'alice', { inviteToken: token }));
  batch.set(doc(alice, 'tripInvites', token), invitation);
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(client('charlie'), 'tripInvites', token)));
  await assertFails(getDoc(doc(client('charlie'), 'sharedTrips', 'trip-a')));
  await assertFails(getDocs(collection(client('charlie'), 'tripInvites')));
  await assertFails(setDoc(doc(client('bob'), 'tripInvites', 'b'.repeat(64)), invitation));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'tripInvites', token)));
});

test('requests require a valid invite for that trip; applicants cannot approve themselves or inspect others', async () => {
  await seed('trip-a', 'alice', ['alice', 'bob'], token);
  await seed('trip-b', 'dana', ['dana']);
  const charlie = client('charlie'); const ref = doc(charlie, 'sharedTrips', 'trip-a', 'requests', 'charlie');
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(setDoc(ref, request()));
  await assertSucceeds(getDoc(ref));
  await assertFails(updateDoc(ref, { status: 'approved' }));
  await assertFails(getDoc(doc(client('bob'), 'sharedTrips', 'trip-a', 'requests', 'charlie')));
  await assertFails(getDocs(collection(charlie, 'sharedTrips', 'trip-a', 'requests')));
  await assertFails(setDoc(doc(charlie, 'sharedTrips', 'trip-b', 'requests', 'charlie'), request()));
  await assertFails(setDoc(doc(charlie, 'sharedTrips', 'trip-a', 'requests', 'fake'), request('fake')));
});

test('approval and membership are atomic; pending requests can be rejected by the owner', async () => {
  const original = await seed('trip-a', 'alice', ['alice', 'bob'], token);
  const charlie = client('charlie'); await setDoc(doc(charlie, 'sharedTrips', 'trip-a', 'requests', 'charlie'), request());
  const alice = client('alice'); const ref = doc(alice, 'sharedTrips', 'trip-a');
  const approved = update(original, 'alice', { memberIds: ['alice', 'bob', 'charlie'], memberNames: { alice: 'alice', bob: 'bob', charlie: 'Friend' } });
  await assertFails(setDoc(ref, approved));
  await assertFails(updateDoc(doc(alice, 'sharedTrips', 'trip-a', 'requests', 'charlie'), { status: 'approved' }));
  const batch = writeBatch(alice); batch.set(ref, approved); batch.update(doc(alice, 'sharedTrips', 'trip-a', 'requests', 'charlie'), { status: 'approved' });
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(charlie, 'sharedTrips', 'trip-a')));
  const dana = client('dana'); await setDoc(doc(dana, 'sharedTrips', 'trip-a', 'requests', 'dana'), request('dana'));
  await assertSucceeds(updateDoc(doc(alice, 'sharedTrips', 'trip-a', 'requests', 'dana'), { status: 'rejected' }));
  await assertFails(getDoc(doc(dana, 'sharedTrips', 'trip-a')));
});

test('members can leave only themselves; owners can remove members and removed accounts lose access', async () => {
  const original = await seed(); const bob = client('bob');
  await assertFails(setDoc(doc(bob, 'sharedTrips', 'trip-a'), update(original, 'bob', { memberIds: ['bob'], memberNames: { bob: 'bob' } })));
  const left = update(original, 'bob', { memberIds: ['alice'], memberNames: { alice: 'alice' } });
  await assertSucceeds(setDoc(doc(bob, 'sharedTrips', 'trip-a'), left));
  await assertFails(getDoc(doc(bob, 'sharedTrips', 'trip-a')));
  await assertSucceeds(getDoc(doc(client('alice'), 'sharedTrips', 'trip-a')));
});

test('expired or revoked invites cannot be used for new requests', async () => {
  const original = await seed('trip-a', 'alice', ['alice'], token);
  await environment.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'tripInvites', token), { expiresAt: Timestamp.fromMillis(Date.now() - 1000) }));
  await assertFails(getDoc(doc(client('bob'), 'tripInvites', token)));
  await assertFails(setDoc(doc(client('bob'), 'sharedTrips', 'trip-a', 'requests', 'bob'), request('bob')));
  const alice = client('alice'); const batch = writeBatch(alice);
  batch.delete(doc(alice, 'tripInvites', token)); batch.set(doc(alice, 'sharedTrips', 'trip-a'), update(original, 'alice', { inviteToken: '' }));
  await assertSucceeds(batch.commit());
  await assertFails(setDoc(doc(client('bob'), 'sharedTrips', 'trip-a', 'requests', 'bob'), request('bob')));
});

test('legacy migration copies exactly the original trip and member list in one atomic operation', async () => {
  const original = payload();
  const legacy = { trip: original.trip, revision: 7, updatedAt: serverTimestamp(), updatedBy: 'bob' };
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore(); await setDoc(doc(db, 'settings', 'members'), { uids: ['alice', 'bob'] }); await setDoc(doc(db, 'trips', 'trip-a'), legacy);
  });
  const alice = client('alice');
  const value = payload('trip-a', 'alice', ['alice', 'bob']);
  await assertFails(updateDoc(doc(alice, 'trips', 'trip-a'), { migratedTo: 'trip-a' }));
  await assertFails(setDoc(doc(alice, 'sharedTrips', 'trip-a'), value));
  const batch = writeBatch(alice); batch.set(doc(alice, 'sharedTrips', 'trip-a'), value); batch.update(doc(alice, 'trips', 'trip-a'), { migratedTo: 'trip-a' });
  await assertSucceeds(batch.commit());
  assert.deepEqual((await getDoc(doc(alice, 'trips', 'trip-a'))).data().trip, original.trip);
  await assertSucceeds(getDoc(doc(client('bob'), 'sharedTrips', 'trip-a')));
  await assertFails(getDoc(doc(client('charlie'), 'trips', 'trip-a')));
  await assertFails(updateDoc(doc(alice, 'trips', 'trip-a'), { migratedTo: 'again' }));
});

test('leaving cannot rename others or reuse an old approval to silently rejoin', async () => {
  const original = await seed(); const alice = client('alice'); const bob = client('bob');
  await environment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'sharedTrips', 'trip-a', 'requests', 'bob'), { ...request('bob'), status: 'approved' }));
  await assertFails(setDoc(doc(bob, 'sharedTrips', 'trip-a'), update(original, 'bob', { memberIds: ['alice'], memberNames: { alice: 'Impersonated' } })));
  const left = update(original, 'bob', { memberIds: ['alice'], memberNames: { alice: 'alice' } });
  await assertSucceeds(setDoc(doc(bob, 'sharedTrips', 'trip-a'), left));
  await assertFails(setDoc(doc(alice, 'sharedTrips', 'trip-a'), update(left, 'alice', { memberIds: ['alice', 'bob'], memberNames: { alice: 'alice', bob: 'bob' } })));
});

test('member caps are enforced even if an owner forges a client that ignores the UI limit', async () => {
  const ids = ['alice', ...Array.from({ length: 19 }, (_, i) => `friend-${i}`)];
  const original = await seed('trip-a', 'alice', ids, token);
  const charlie = client('charlie'); await setDoc(doc(charlie, 'sharedTrips', 'trip-a', 'requests', 'charlie'), request());
  const alice = client('alice'); const batch = writeBatch(alice);
  batch.set(doc(alice, 'sharedTrips', 'trip-a'), update(original, 'alice', { memberIds: [...ids, 'charlie'], memberNames: { ...original.memberNames, charlie: 'Friend' } }));
  batch.update(doc(alice, 'sharedTrips', 'trip-a', 'requests', 'charlie'), { status: 'approved' });
  await assertFails(batch.commit());
});

test('nicknames are private per-user profiles; invalid names and extra account data are rejected', async () => {
  const alice = client('alice');
  await assertSucceeds(getDoc(doc(alice, 'profiles', 'alice')));
  await assertFails(getDoc(doc(client('bob'), 'profiles', 'alice')));
  await assertFails(getDocs(collection(alice, 'profiles')));
  await assertFails(setDoc(doc(client('bob'), 'profiles', 'alice'), { nickname: 'Stolen', updatedAt: serverTimestamp() }));
  for (const nickname of ['', ' ', ' leading', 'trailing ', 'a'.repeat(21), 'line\nbreak', 'bad\u0000name']) {
    await assertFails(setDoc(doc(alice, 'profiles', 'alice'), { nickname, updatedAt: serverTimestamp() }));
  }
  await assertFails(setDoc(doc(alice, 'profiles', 'alice'), { nickname: 'Alice', email: 'private@example.test', updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(alice, 'profiles', 'alice'), { nickname: '여행 나비', updatedAt: serverTimestamp() }));
});

test('a member updates only their own trip nickname to the saved profile without changing permissions or content', async () => {
  const original = await seed(); const bob = client('bob'); const ref = doc(bob, 'sharedTrips', 'trip-a');
  const renamed = update(original, 'bob', { memberNames: { alice: 'alice', bob: 'Friend' } });
  await assertSucceeds(setDoc(ref, renamed));
  await assertFails(setDoc(ref, update(renamed, 'bob', { memberNames: { alice: 'alice', bob: 'Not saved' } })));
  await assertFails(setDoc(ref, update(renamed, 'bob', { memberNames: { alice: 'Impersonated', bob: 'Friend' } })));
  await assertFails(setDoc(doc(client('alice'), 'sharedTrips', 'trip-a'), update(renamed, 'alice', { memberNames: { alice: 'alice', bob: 'Impersonated' } })));
  await assertFails(setDoc(ref, update(renamed, 'bob', { memberNames: renamed.memberNames, memberIds: ['bob'], ownerId: 'bob' })));
});

test('a trip creator and join applicant must use their saved nickname', async () => {
  const alice = client('alice');
  await assertFails(setDoc(doc(alice, 'sharedTrips', 'trip-a'), { ...payload(), memberNames: { alice: 'Other identity' } }));
  await seed('trip-a', 'alice', ['alice'], token);
  await assertFails(setDoc(doc(client('charlie'), 'sharedTrips', 'trip-a', 'requests', 'charlie'), { ...request(), displayName: 'Other identity' }));
  await assertSucceeds(setDoc(doc(client('charlie'), 'sharedTrips', 'trip-a', 'requests', 'charlie'), request()));
});
