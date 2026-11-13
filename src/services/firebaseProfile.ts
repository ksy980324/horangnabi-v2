import { collection, doc, FieldPath, getDocs, increment, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { session } from './firebaseClient';
import { normalizeNickname } from './userProfile';

export function profileReference(userId: string) {
  return doc(session(userId).firestore, 'profiles', userId);
}

/** Update only this user's display name, preserving simultaneous edits to trip data and membership. */
export async function syncOwnNickname(userId: string, value: string) {
  const nickname = normalizeNickname(value);
  const { firestore } = session(userId);
  const trips = await getDocs(query(collection(firestore, 'sharedTrips'), where('memberIds', 'array-contains', userId)));
  const pending = trips.docs.filter(trip => trip.data().memberNames?.[userId] !== nickname);
  for (let offset = 0; offset < pending.length; offset += 100) {
    const batch = writeBatch(firestore);
    for (const trip of pending.slice(offset, offset + 100)) {
      batch.update(trip.ref, new FieldPath('memberNames', userId), nickname, 'revision', increment(1), 'updatedAt', serverTimestamp(), 'updatedBy', userId);
    }
    await batch.commit();
  }
}

export async function saveNickname(userId: string, value: string) {
  const nickname = normalizeNickname(value);
  await setDoc(profileReference(userId), { nickname, updatedAt: serverTimestamp() });
  try { await syncOwnNickname(userId, nickname); }
  catch { throw new Error('닉네임은 저장했지만 일부 여행에 반영하지 못했어요. 연결을 확인한 뒤 다시 저장해 주세요.'); }
}
