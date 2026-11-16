import { ensureReviewCapacity } from './stopReviews';
import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { parseDatabase, uid } from '../data';
import type { Trip } from '../types';
import { profileReference } from './firebaseProfile';
import { parseUserProfile } from './userProfile';
import { session } from './firebaseClient';
import { nextSharedRevision, retryPackingRevisionRace, SharedTripConflict } from './sharedRevision';
import { packingMembers, savePackingItem, setPackingCheckedBy } from './packing';
import { approveMember, initialTripAccess, parseTripAccess, removeMember, type JoinRequest, type TripAccess } from './tripMembers';
import { recordTripActivity } from './activityLog';

export function sharedReferences(userId: string) {
  const { firestore } = session(userId);
  const trips = collection(firestore, 'sharedTrips');
  return { trips, visibleTrips: query(trips, where('memberIds', 'array-contains', userId)) };
}

export function sharingReferences(userId: string, tripId: string) {
  const { firestore } = session(userId);
  return { trip: doc(firestore, 'sharedTrips', tripId), requests: collection(firestore, 'sharedTrips', tripId, 'requests') };
}

function tripPayload(trip: Trip, revision: number, userId: string, access: TripAccess) {
  ensureReviewCapacity(trip);
  const clean = parseDatabase(JSON.parse(JSON.stringify({ version: 1, trips: [trip] })));
  return { trip: clean.trips[0], revision, updatedAt: serverTimestamp(), updatedBy: userId, ...access };
}

export async function writeSharedTrip(userId: string, tripId: string, expected: number | undefined, trip?: Trip) {
  const { firestore } = session(userId);
  const ref = doc(sharedReferences(userId).trips, tripId);
  const stamp={id:uid(),actorId:userId,at:Date.now()};
  await runTransaction(firestore, async transaction => {
    const current = await transaction.get(ref);
    const revision = nextSharedRevision(current.exists(), current.data()?.revision, expected);
    const access = current.exists() ? parseTripAccess(current.data()) : initialTripAccess(userId, parseUserProfile((await transaction.get(profileReference(userId))).data()).nickname);
    if (trip) transaction.set(ref, tripPayload(recordTripActivity(current.data()?.trip,trip,{...stamp,actorName:access.memberNames[userId]}), revision, userId, access));
    else {
      if (access.ownerId !== userId) throw new Error('여행장만 여행을 삭제할 수 있어요.');
      if (access.inviteToken) transaction.delete(doc(firestore, 'tripInvites', access.inviteToken));
      transaction.delete(ref);
    }
  });
}

export async function importSharedTrips(userId: string, trips: Trip[]) {
  const { firestore } = session(userId);
  if (trips.length > 100) throw new Error('한 번에 여행을 100개까지 가져올 수 있어요.');
  const refs = sharedReferences(userId);
  const copies = trips.map(trip => ({ ...trip, id: uid() }));
  const stamps=copies.map(()=>({id:uid(),actorId:userId,at:Date.now()}));
  await runTransaction(firestore, async transaction => {
    const nickname = parseUserProfile((await transaction.get(profileReference(userId))).data()).nickname;
    const documents = await Promise.all(copies.map(trip => transaction.get(doc(refs.trips, trip.id))));
    if (documents.some(snapshot => snapshot.exists())) throw new SharedTripConflict();
    for (const [index,trip] of copies.entries()) transaction.set(doc(refs.trips, trip.id), tripPayload(recordTripActivity(undefined,trip,{...stamps[index],actorName:nickname}), 1, userId, initialTripAccess(userId, nickname)));
  });
}

/** Retain originals and mark them atomically so a deleted new trip is never re-imported. */
export async function migrateLegacyTrips(userId: string) {
  const { firestore } = session(userId);
  const legacyMembers = doc(firestore, 'settings', 'members');
  let members;
  try { members = await getDoc(legacyMembers); }
  catch (error) {
    if ((error as { code?: string }).code === 'permission-denied') return;
    throw error;
  }
  const ids = packingMembers(members.data()?.uids);
  if (!ids.includes(userId) || ids.length > 2) return;
  const legacy = await getDocs(collection(firestore, 'trips'));
  for (const document of legacy.docs) {
    if (document.data().migratedTo) continue;
    const target = doc(firestore, 'sharedTrips', document.id);
    await runTransaction(firestore, async transaction => {
      const [source, destination, currentMembers, profile] = await Promise.all([transaction.get(document.ref), transaction.get(target), transaction.get(legacyMembers), transaction.get(profileReference(userId))]);
      if (!source.exists() || source.data().migratedTo) return;
      if (destination.exists()) throw new Error('기존 여행 ID가 겹쳐 자동 전환하지 못했어요.');
      const memberIds = packingMembers(currentMembers.data()?.uids);
      if (!memberIds.includes(userId) || memberIds.length > 2) throw new Error('기존 공유 계정을 확인해 주세요.');
      const trip = parseDatabase({ version: 1, trips: [source.data().trip] }).trips[0];
      const access = parseTripAccess({ ownerId: userId, memberIds,
        memberNames: Object.fromEntries(memberIds.map(id => [id, id === userId ? parseUserProfile(profile.data()).nickname : '동행인'])), inviteToken: '' });
      transaction.set(target, tripPayload(trip, 1, userId, access));
      transaction.update(document.ref, { migratedTo: document.id });
    });
  }
}

export async function checkSharedPackingItem(userId: string, tripId: string, itemId: string, checked: boolean) {
  const { firestore } = session(userId);
  const ref = doc(sharedReferences(userId).trips, tripId);
  const stamp={id:uid(),actorId:userId,at:Date.now()};
  await retryPackingRevisionRace(observe=>runTransaction(firestore, async transaction => {
    const current = await transaction.get(ref);
    if (!current.exists()) throw new SharedTripConflict();
    const { trip, revision } = current.data();
    const access = parseTripAccess(current.data());
    const validated = parseDatabase({ version: 1, trips: [trip] }).trips[0];
    const item = validated.packingItems?.find(entry => entry.id === itemId);
    if (!item || !access.memberIds.includes(userId) || !Number.isSafeInteger(revision)) throw new SharedTripConflict();
    observe(revision);
    const next=savePackingItem(validated, setPackingCheckedBy(item, access.memberIds, userId, checked));
    transaction.set(ref, tripPayload(recordTripActivity(validated,next,{...stamp,actorName:access.memberNames[userId]}), revision + 1, userId, access));
  }),async()=>{
    const latest=await getDoc(ref);
    return latest.exists()&&parseTripAccess(latest.data()).memberIds.includes(userId)?latest.data().revision:undefined;
  });
}

export async function changeTripMember(userId: string, tripId: string, targetId: string, approve = false) {
  const { firestore } = session(userId);
  const refs = sharingReferences(userId, tripId);
  await runTransaction(firestore, async transaction => {
    const current = await transaction.get(refs.trip);
    if (!current.exists()) throw new SharedTripConflict();
    const access = parseTripAccess(current.data());
    let next: TripAccess;
    if (approve) {
      const requestRef = doc(refs.requests, targetId);
      const request = await transaction.get(requestRef);
      if (!request.exists()) throw new SharedTripConflict();
      next = approveMember(access, userId, request.data() as JoinRequest);
      transaction.update(requestRef, { status: 'approved' });
    } else next = removeMember(access, userId, targetId);
    transaction.set(refs.trip, tripPayload(current.data().trip, current.data().revision + 1, userId, next));
  });
}

export async function rejectJoinRequest(userId: string, tripId: string, targetId: string) {
  const { firestore } = session(userId);
  const refs = sharingReferences(userId, tripId);
  await runTransaction(firestore, async transaction => {
    const current = await transaction.get(refs.trip);
    const requestRef = doc(refs.requests, targetId);
    const request = await transaction.get(requestRef);
    if (current.data()?.ownerId !== userId || request.data()?.status !== 'pending') throw new SharedTripConflict();
    transaction.update(requestRef, { status: 'rejected' });
  });
}

export async function rotateTripInvite(userId: string, tripId: string, enable: boolean) {
  const { firestore } = session(userId);
  const refs = sharingReferences(userId, tripId);
  const token = enable ? uid().replaceAll('-', '') + uid().replaceAll('-', '') : '';
  await runTransaction(firestore, async transaction => {
    const current = await transaction.get(refs.trip);
    if (!current.exists() || current.data().ownerId !== userId) throw new Error('여행장만 초대 링크를 관리할 수 있어요.');
    const access = parseTripAccess(current.data());
    if (access.inviteToken) transaction.delete(doc(firestore, 'tripInvites', access.inviteToken));
    if (token) transaction.set(doc(firestore, 'tripInvites', token), {
      tripId, ownerId: userId, tripName: current.data().trip.name,
      createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000),
    });
    transaction.set(refs.trip, tripPayload(current.data().trip, current.data().revision + 1, userId, { ...access, inviteToken: token }));
  });
  return token;
}

export async function loadTripInvite(userId: string, token: string) {
  const { firestore } = session(userId);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('올바른 초대 링크가 아니에요.');
  const snapshot = await getDoc(doc(firestore, 'tripInvites', token));
  if (!snapshot.exists() || !(snapshot.data().expiresAt instanceof Timestamp) || snapshot.data().expiresAt.toMillis() <= Date.now()) throw new Error('초대 링크가 만료되었거나 취소됐어요. 새 링크를 받아 주세요.');
  return snapshot.data() as { tripId: string; tripName: string; expiresAt: Timestamp };
}

export function joinRequestReference(userId: string, tripId: string) {
  return doc(sharingReferences(userId, tripId).requests, userId);
}

export async function requestTripJoin(userId: string, token: string) {
  const { firestore } = session(userId);
  const invitation = await loadTripInvite(userId, token);
  const ref = joinRequestReference(userId, invitation.tripId);
  await runTransaction(firestore, async transaction => {
    const [current, profile] = await Promise.all([transaction.get(ref), transaction.get(profileReference(userId))]);
    const nickname = parseUserProfile(profile.data()).nickname;
    if (current.data()?.status === 'pending' && current.data()?.displayName === nickname) return;
    transaction.set(ref, { userId, displayName: nickname, inviteToken: token, status: 'pending', createdAt: serverTimestamp() });
  });
}
