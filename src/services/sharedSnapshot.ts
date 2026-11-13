import { parseDatabase } from '../data.ts';
import type { Database, Trip } from '../types';
import { parseTripAccess, type TripAccess } from './tripMembers.ts';

type TripDocument = { id: string; data: () => { trip?: unknown; revision?: unknown } };
export type SharedSnapshot = { db: Database; revisions: Map<string, number>; access: Map<string, TripAccess> };

/** One cache per subscription/account. Metadata acknowledgements keep object identities. */
export function createSharedSnapshotReader(userId?: string) {
  let previous: SharedSnapshot | undefined;
  return (documents: TripDocument[], changedIds: readonly string[]): SharedSnapshot => {
    if (documents.length > 1000) throw new Error('공유 여행 개수를 확인해 주세요.');
    const changed = new Set(changedIds);
    const existing = new Map(previous?.db.trips.map(trip => [trip.id, trip]));
    const revisions = new Map<string, number>();
    const access = new Map<string, TripAccess>();
    const trips = documents.map(document => {
      if (revisions.has(document.id)) throw new Error('중복된 공유 여행입니다.');
      const cached = existing.get(document.id);
      if (cached && !changed.has(document.id)) {
        revisions.set(document.id, previous!.revisions.get(document.id)!);
        if (userId) access.set(document.id, previous!.access.get(document.id)!);
        return cached;
      }
      const data = document.data();
      const { trip, revision } = data;
      if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) throw new Error('공유 여행 버전을 확인해 주세요.');
      const validated: Trip = parseDatabase({ version: 1, trips: [trip] }).trips[0];
      if (validated.id !== document.id) throw new Error('공유 여행 ID를 확인해 주세요.');
      revisions.set(document.id, revision);
      if (userId) {
        const membership = parseTripAccess(data);
        if (!membership.memberIds.includes(userId)) throw new Error('참여하지 않은 여행입니다.');
        access.set(document.id, membership);
      }
      return validated;
    });
    if (previous && trips.length === previous.db.trips.length && trips.every((trip, index) => trip === previous!.db.trips[index]
      && revisions.get(trip.id) === previous!.revisions.get(trip.id))) return previous;
    previous = { db: { version: 1, trips }, revisions, access };
    return previous;
  };
}
