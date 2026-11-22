import { saveStopReview } from '../src/services/stopReviews.ts';
import { planReviewPhotoStorage, validatePhotoTransition } from '../src/services/reviewPhotoStorage.ts';
import { parseReviewPhotoReference } from '../src/services/reviewPhotoReferences.ts';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp, runTransaction } from 'firebase/firestore';
import { recordTripActivity } from '../src/services/activityLog.ts';
import { retryPackingRevisionRace } from '../src/services/sharedRevision.ts';

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

const inlinePhoto = 'data:image/jpeg;base64,/9j/AAAA';
const photoData = (actor, dataUrl = inlinePhoto) => ({ dataUrl, bytes: dataUrl.length, createdBy: actor, createdAt: serverTimestamp() });
const photoRef = (db, trip = 'trip-a', id = 'a'.repeat(32)) => doc(db, 'sharedTrips', trip, 'photos', id);
const nextPhotoId = () => { let id = 0; return () => (++id).toString(16).padStart(32, '0'); };
async function storePhotoPlan(db, actor, before, next) {
  const plan = planReviewPhotoStorage(next, nextPhotoId());
  const ref = doc(db, 'sharedTrips', before.trip.id);
  await runTransaction(db, async transaction => {
    await transaction.get(ref);
    const removed = validatePhotoTransition(before.trip, plan);
    transaction.set(ref, update(before, actor, { trip: plan.trip }));
    for (const item of plan.uploads.values()) transaction.set(photoRef(db, next.id, item.id), photoData(actor, item.dataUrl));
    for (const id of removed) transaction.delete(photoRef(db, next.id, id));
  });
  return plan;
}

test('separate photo documents migrate legacy photos, permit only participants and remain immutable', async () => {
  const before = await seed();
  const alice = client('alice'), bob = client('bob');
  before.trip.stops = [{ id: 'stop', date: before.trip.start, time: '', name: 'Photo place', category: '관광', address: '', memo: '', review: { text: 'Review', photos: [inlinePhoto] } }];
  await environment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'sharedTrips', 'trip-a'), before));
  const plan = await assertSucceeds(storePhotoPlan(alice, 'alice', before, before.trip));
  const id = [...plan.uploads.keys()][0];
  const root = (await getDoc(doc(bob, 'sharedTrips', 'trip-a'))).data();
  assert.ok(!JSON.stringify(root.trip).includes('data:image'));
  assert.equal((await assertSucceeds(getDoc(photoRef(bob, 'trip-a', id)))).data().dataUrl, inlinePhoto);
  assert.equal(parseReviewPhotoReference(root.trip.stops[0].review.photos[0]).bytes, inlinePhoto.length);
  await assertFails(getDoc(photoRef(client('charlie'), 'trip-a', id)));
  await assertFails(getDoc(photoRef(environment.unauthenticatedContext().firestore(), 'trip-a', id)));
  await seed('trip-b', 'charlie', ['charlie']);
  await assertFails(getDoc(photoRef(bob, 'trip-b', id)));
  await assertFails(updateDoc(photoRef(bob, 'trip-a', id), { dataUrl: inlinePhoto, bytes: inlinePhoto.length }));
  await assertFails(setDoc(photoRef(bob), photoData('bob')));
  await assertFails(deleteDoc(photoRef(bob, 'trip-a', id)));
});

test('new trips and photo documents commit atomically and malformed photos roll back every write', async () => {
  const alice = client('alice');
  const batch = writeBatch(alice);
  const value = payload();
  value.trip.stops = [{ id: 'stop', review: { text: '', photos: ['review-photo:' + 'a'.repeat(32) + ':' + inlinePhoto.length] } }];
  batch.set(doc(alice, 'sharedTrips', 'trip-a'), value);
  batch.set(photoRef(alice), photoData('alice'));
  await assertSucceeds(batch.commit());
  const current = (await getDoc(doc(alice, 'sharedTrips', 'trip-a'))).data();
  const invalid = writeBatch(alice);
  invalid.set(doc(alice, 'sharedTrips', 'trip-a'), update(current, 'alice'));
  invalid.set(photoRef(alice, 'trip-a', 'b'.repeat(32)), photoData('alice', 'data:image/svg+xml;base64,evil'));
  await assertFails(invalid.commit());
  assert.equal((await getDoc(doc(alice, 'sharedTrips', 'trip-a'))).data().revision, 1);
  assert.equal((await getDoc(photoRef(alice, 'trip-a', 'b'.repeat(32)))).exists(), false);
  await assertFails(setDoc(photoRef(client('charlie'), 'trip-a', 'c'.repeat(32)), photoData('charlie')));
});

test('photo access follows removal immediately and owner deletion can clean up the last photo', async () => {
  const before = await seed();
  const alice = client('alice'), bob = client('bob');
  const batch = writeBatch(alice);
  batch.set(doc(alice, 'sharedTrips', 'trip-a'), update(before, 'alice'));
  batch.set(photoRef(alice), photoData('alice'));
  await assertSucceeds(batch.commit());
  const current = (await getDoc(doc(alice, 'sharedTrips', 'trip-a'))).data();
  await assertSucceeds(setDoc(doc(alice, 'sharedTrips', 'trip-a'), update(current, 'alice', { memberIds: ['alice'], memberNames: { alice: 'alice' } })));
  await assertFails(getDoc(photoRef(bob)));
  const remove = writeBatch(alice);
  remove.delete(photoRef(alice)); remove.delete(doc(alice, 'sharedTrips', 'trip-a'));
  await assertSucceeds(remove.commit());
  await environment.withSecurityRulesDisabled(async context => assert.equal((await getDoc(photoRef(context.firestore()))).exists(), false));
});

test('more than 600KB of photos store outside the trip and stale revisions cannot leave orphan photos', async () => {
  const before = await seed();
  const alice = client('alice'), bob = client('bob');
  const large = 'data:image/jpeg;base64,/9j/' + 'A'.repeat(200000);
  const batch = writeBatch(alice);
  batch.set(doc(alice, 'sharedTrips', 'trip-a'), update(before, 'alice'));
  for (let i = 1; i <= 5; i++) batch.set(photoRef(alice, 'trip-a', i.toString(16).padStart(32, '0')), photoData('alice', large));
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(photoRef(bob, 'trip-a', '1'.padStart(32, '0')))).data().dataUrl, large);
  const stale = writeBatch(bob);
  stale.set(doc(bob, 'sharedTrips', 'trip-a'), update(before, 'bob'));
  stale.set(photoRef(bob, 'trip-a', 'f'.repeat(32)), photoData('bob'));
  await assertFails(stale.commit());
  assert.equal((await getDoc(photoRef(alice, 'trip-a', 'f'.repeat(32)))).exists(), false);
});

test('activity commits with the trip, retains concurrent packing actors and follows membership access', async () => {
  await seed();
  const alice = client('alice'), bob = client('bob');
  const ref = db => doc(db, 'sharedTrips', 'trip-a');
  const initialStamp = { id: 'add-items', actorId: 'alice', actorName: 'alice', at: Date.now() };
  await assertSucceeds(runTransaction(alice, async transaction => {
    const current = (await transaction.get(ref(alice))).data();
    const next = { ...current.trip, packingItems: [{ id: 'passport', name: 'Passport', completed: false, completedBy: [] }], souvenirs:[{id:'gift',name:'Cookies',recipient:'Family',quantity:2,memo:'Airport',purchased:false}], expenses: [{id:'record',name:'Travel cost',date:'2026-11-16',currency:'KRW',amount:12000,paidBy:'alice',shared:false,recordOnly:true}] };
    transaction.set(ref(alice), update(current, 'alice', { trip: recordTripActivity(current.trip, next, initialStamp) }));
  })).catch(error => { throw new Error('Initial activity transaction: ' + error.message, { cause: error }); });
  await Promise.all([['alice', alice], ['bob', bob]].map(async ([actor, db]) => {
    const stamp = { id: 'check-' + actor, actorId: actor, actorName: actor, at: Date.now() };
    await assertSucceeds(retryPackingRevisionRace(observe=>runTransaction(db, async transaction => {
      const current = (await transaction.get(ref(db))).data();
      observe(current.revision);
      const item = current.trip.packingItems[0];
      const completedBy = [...new Set([...item.completedBy, actor])];
      const next = { ...current.trip, packingItems: [{ ...item, completedBy, completed: current.memberIds.every(id => completedBy.includes(id)) }] };
      transaction.set(ref(db), update(current, actor, { trip: recordTripActivity(current.trip, next, stamp) }));
    }),async()=>{
      const latest=(await getDoc(ref(db))).data();
      return latest.memberIds.includes(actor)?latest.revision:undefined;
    })).catch(error => { throw new Error('Concurrent activity transaction for ' + actor + ': ' + error.message, { cause: error }); });
  }));
  const latest = (await assertSucceeds(getDoc(ref(bob)))).data();
  assert.equal(latest.trip.activityLog.length, 3);
  assert.equal(latest.trip.souvenirs[0].name, 'Cookies');
  assert.equal(latest.trip.souvenirs[0].quantity, 2);
  assert.equal(latest.trip.expenses[0].recordOnly, true);
  assert.equal(latest.trip.expenses[0].currency, 'KRW');
  assert.equal(latest.trip.expenses[0].amount, 12000);
  assert.deepEqual(new Set(latest.trip.activityLog.slice(0, 2).map(entry => entry.actorId)), new Set(['alice', 'bob']));
  assert.ok(latest.trip.activityLog.slice(0, 2).every(entry => entry.changes[0].action === 'check'));
  assert.deepEqual(new Set(latest.trip.packingItems[0].completedBy), new Set(['alice', 'bob']));
  assert.equal(latest.trip.packingItems[0].completed, true);
  await assertFails(getDoc(ref(client('charlie'))));
  await assertSucceeds(setDoc(ref(alice), update(latest, 'alice', { memberIds: ['alice'], memberNames: { alice: 'alice' } }))).catch(error => { throw new Error('Remove member preserving activity: ' + error.message, { cause: error }); });
  await assertFails(getDoc(ref(bob)));
  assert.deepEqual((await getDoc(ref(alice))).data().trip.activityLog, latest.trip.activityLog);
});
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

test('trip members create, purchase, edit and delete souvenirs without losing expenses; outsiders cannot read them', async () => {
  await seed();
  let sequence=0;
  const write=async(actor,change)=>{
    const db=client(actor),ref=doc(db,'sharedTrips','trip-a');
    const stamp={id:'souvenir-'+(++sequence),actorId:actor,actorName:actor,at:Date.now()};
    await assertSucceeds(runTransaction(db,async transaction=>{
      const current=(await transaction.get(ref)).data();
      transaction.set(ref,update(current,actor,{trip:recordTripActivity(current.trip,change(current.trip),stamp)}));
    }));
  };
  const item={id:'gift',name:'Cookies',recipient:'Family',quantity:2,memo:'Airport',purchased:false};
  await write('alice',trip=>({...trip,souvenirs:[item],expenses:[{id:'meal',name:'Lunch',date:trip.start,currency:'KRW',amount:12000,paidBy:'alice',shared:true}]}));
  await write('bob',trip=>({...trip,souvenirs:trip.souvenirs.map(item=>({...item,purchased:true}))}));
  const bought=(await getDoc(doc(client('alice'),'sharedTrips','trip-a'))).data();
  assert.equal(bought.trip.souvenirs[0].purchased,true);
  assert.equal(bought.trip.activityLog[0].changes[0].action,'check');
  await write('alice',trip=>({...trip,souvenirs:trip.souvenirs.map(item=>({...item,quantity:3,recipient:'Friend'}))}));
  assert.equal((await getDoc(doc(client('bob'),'sharedTrips','trip-a'))).data().trip.souvenirs[0].quantity,3);
  await assertFails(getDoc(doc(client('charlie'),'sharedTrips','trip-a')));
  await write('bob',trip=>({...trip,souvenirs:[]}));
  const deleted=(await getDoc(doc(client('alice'),'sharedTrips','trip-a'))).data();
  assert.deepEqual(deleted.trip.souvenirs,[]);
  assert.equal(deleted.trip.expenses[0].amount,12000);
  assert.equal(deleted.trip.activityLog[0].changes[0].action,'delete');
});


test('shared visit reviews retain photos and transport memos; stale, anonymous and removed members cannot overwrite them', async () => {
  await seed();
  const alice=client('alice'),bob=client('bob');
  const ref=db=>doc(db,'sharedTrips','trip-a');
  const initial=(await getDoc(ref(alice))).data();
  const stop={id:'place',name:'Palace',address:'',date:initial.trip.start,time:'',category:'관광',memo:'Bus 12'};
  await assertSucceeds(setDoc(ref(alice),update(initial,'alice',{trip:{...initial.trip,stops:[stop]}})));
  const stale=(await getDoc(ref(bob))).data();
  const photo='data:image/jpeg;base64,/9j/AAAA';
  const review={text:'A good morning visit',photos:[photo]};
  const stamp={id:'review-save',actorId:'alice',actorName:'alice',at:Date.now()};
  await assertSucceeds(runTransaction(alice,async transaction=>{
    const current=(await transaction.get(ref(alice))).data();
    const trip=saveStopReview(current.trip,'place',review);
    transaction.set(ref(alice),update(current,'alice',{trip:recordTripActivity(current.trip,trip,stamp)}));
  }));
  const saved=(await assertSucceeds(getDoc(ref(bob)))).data();
  assert.deepEqual(saved.trip.stops[0].review,review);
  assert.equal(saved.trip.stops[0].memo,'Bus 12');
  assert.deepEqual(saved.trip.activityLog[0].changes[0].fields,['review']);
  await assertFails(setDoc(ref(bob),update(stale,'bob',{trip:saveStopReview(stale.trip,'place',{text:'stale',photos:[]})})));
  assert.deepEqual((await getDoc(ref(alice))).data().trip.stops[0].review,review);
  await assertFails(getDoc(ref(client('charlie'))));
  await assertFails(getDoc(ref(environment.unauthenticatedContext().firestore())));
  const edited=saveStopReview(saved.trip,'place',{text:'Updated by a companion',photos:[photo]});
  await assertSucceeds(setDoc(ref(bob),update(saved,'bob',{trip:edited})));
  const current=(await getDoc(ref(alice))).data();
  await assertSucceeds(setDoc(ref(alice),update(current,'alice',{memberIds:['alice'],memberNames:{alice:'alice'}})));
  await assertFails(getDoc(ref(bob)));
  const removed=(await getDoc(ref(alice))).data();
  await assertFails(setDoc(ref(bob),update(removed,'bob',{trip:saveStopReview(removed.trip,'place',{text:'no access',photos:[]})})));
  await assertSucceeds(setDoc(ref(alice),update(removed,'alice',{trip:saveStopReview(removed.trip,'place',{text:'',photos:[]})})));
  const cleared=(await getDoc(ref(alice))).data();
  assert.equal('review' in cleared.trip.stops[0],false);
  assert.equal(cleared.trip.stops[0].memo,'Bus 12');
});
