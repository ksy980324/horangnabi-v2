import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { collection, doc, getFirestore, runTransaction, serverTimestamp } from 'firebase/firestore';
import { parseDatabase, uid } from '../data';
import type { Trip } from '../types';
import { firebaseConfig } from './firebaseConfig';
import { nextSharedRevision, SharedTripConflict } from './sharedRevision';

const app = firebaseConfig ? initializeApp(firebaseConfig) : undefined;
export const auth = app && getAuth(app);
const firestore = app && getFirestore(app);

export function googleSignIn() {
  if (!auth) throw new Error('Firebase 설정을 확인해 주세요.');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

export function sharedReferences() {
  if (!firestore) throw new Error('Firebase 설정을 확인해 주세요.');
  return { members: doc(firestore, 'settings', 'members'), trips: collection(firestore, 'trips') };
}

function tripPayload(trip: Trip, revision: number, userId: string) {
  const clean = parseDatabase(JSON.parse(JSON.stringify({ version: 1, trips: [trip] })));
  return { trip: clean.trips[0], revision, updatedAt: serverTimestamp(), updatedBy: userId };
}

export async function writeSharedTrip(userId: string, tripId: string, expected: number | undefined, trip?: Trip) {
  if (!firestore || auth?.currentUser?.uid !== userId) throw new Error('다시 로그인해 주세요.');
  const ref = doc(sharedReferences().trips, tripId);
  await runTransaction(firestore, async transaction => {
    const current = await transaction.get(ref);
    const revision = nextSharedRevision(current.exists(), current.data()?.revision, expected);
    if (trip) transaction.set(ref, tripPayload(trip, revision, userId));
    else transaction.delete(ref);
  });
}

export async function importSharedTrips(userId: string, trips: Trip[]) {
  if (!firestore || auth?.currentUser?.uid !== userId) throw new Error('다시 로그인해 주세요.');
  if (trips.length > 100) throw new Error('공유 공간에는 한 번에 여행을 100개까지 가져올 수 있어요.');
  const { trips: collectionRef } = sharedReferences();
  const copies = trips.map(trip => {
    const copy = { ...trip, id: uid() };
    return { ref: doc(collectionRef, copy.id), payload: tripPayload(copy, 1, userId) };
  });
  await runTransaction(firestore, async transaction => {
    const existing = await Promise.all(copies.map(({ ref }) => transaction.get(ref)));
    if (existing.some(snapshot => snapshot.exists())) throw new SharedTripConflict();
    for (const { ref, payload } of copies) transaction.set(ref, payload);
  });
}
