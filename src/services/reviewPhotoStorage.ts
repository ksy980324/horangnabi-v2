import type { Database, Trip } from '../types';
import { isReviewPhoto, ReviewCapacityError } from './stopReviews';
import { parseReviewPhotoReference } from './reviewPhotoReferences';

export const tripPhotoReferences = (trip?: Trip) => new Map((trip?.stops.flatMap(stop => stop.review?.photos ?? []) ?? []).flatMap(photo => {
  const ref = parseReviewPhotoReference(photo);
  return ref ? [[ref.id, photo] as const] : [];
}));

/** Stable IDs are allocated once before transaction retries. Never mutate the editor. */
export function planReviewPhotoStorage(trip: Trip, makeId: () => string) {
  const uploads = new Map<string, { id: string; dataUrl: string; bytes: number }>();
  const byValue = new Map<string, string>();
  const next: Trip = { ...trip, stops: trip.stops.map(stop => !stop.review ? stop : { ...stop, review: { ...stop.review, photos: stop.review.photos.map(photo => {
    if (!isReviewPhoto(photo)) return photo;
    const existing = byValue.get(photo);
    if (existing) return existing;
    const id = makeId().replaceAll('-', '');
    const reference = `review-photo:${id}:${photo.length}`;
    if (!parseReviewPhotoReference(reference) || uploads.has(id)) throw new Error('사진 식별자를 만들지 못했어요.');
    uploads.set(id, { id, dataUrl: photo, bytes: photo.length });
    byValue.set(photo, reference);
    return reference;
  }) } }) };
  return { trip: next, uploads };
}

export function validatePhotoTransition(before: Trip | undefined, plan: ReturnType<typeof planReviewPhotoStorage>) {
  const old = tripPhotoReferences(before), after = tripPhotoReferences(plan.trip);
  for (const [id, value] of after) {
    if (!plan.uploads.has(id) && old.get(id) !== value) throw new ReviewCapacityError('이 여행에서 확인되지 않은 사진이에요. 사진이 포함된 JSON 백업으로 가져와 주세요.');
  }
  return [...old.keys()].filter(id => !after.has(id));
}

/** Resolve every image before exporting; never produce a backup with missing pictures. */
export async function materializeReviewPhotos(db: Database, read: (tripId: string, photo: string) => Promise<string>): Promise<Database> {
  const trips: Trip[] = [];
  let bytes = 0;
  for (const trip of db.trips) {
    const sources = new Map<string, string>();
    for (const photo of trip.stops.flatMap(stop => stop.review?.photos ?? [])) {
      if (sources.has(photo)) continue;
      const source = await read(trip.id, photo);
      if (!isReviewPhoto(source)) throw new Error('사진을 모두 불러오지 못해 백업을 중단했어요.');
      bytes += source.length;
      if (bytes > 32 * 1024 * 1024) throw new Error('백업 사진이 32MB를 넘었어요. 여행별로 나누어 백업해 주세요.');
      sources.set(photo, source);
    }
    trips.push({ ...trip, stops: trip.stops.map(stop => stop.review ? { ...stop, review: { ...stop.review, photos: stop.review.photos.map(photo => sources.get(photo)!) } } : stop) });
  }
  return { ...db, trips };
}
