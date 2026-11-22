import type { StopReview, Trip } from '../types';
import { maxReviewPhotoBytes, parseReviewPhotoReference, reviewPhotoSize } from './reviewPhotoReferences';

export const reviewLimits = { text: 3000, photos: 3, photoBytes: maxReviewPhotoBytes, tripPhotos: 100, tripPhotoBytes: 8 * 1024 * 1024, tripBytes: 900 * 1024 };
export class ReviewCapacityError extends Error {}

export function isReviewPhoto(value: unknown): value is string {
  return typeof value === 'string' && value.length <= reviewLimits.photoBytes
    && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value)
    && (value.length - 'data:image/jpeg;base64,'.length) % 4 === 0;
}
export const isReviewPhotoValue = (value: unknown): value is string => isReviewPhoto(value) || !!parseReviewPhotoReference(value);
export function isStopReview(value: unknown, allowReferences = true): value is StopReview {
  if (!value || typeof value !== 'object') return false;
  const review = value as StopReview;
  return typeof review.text === 'string' && review.text.length <= reviewLimits.text
    && Array.isArray(review.photos) && review.photos.length <= reviewLimits.photos && review.photos.every(photo => allowReferences ? isReviewPhotoValue(photo) : isReviewPhoto(photo))
    && (!!review.text.trim() || review.photos.length > 0);
}
export function tripReviewPhotoBytes(trip: Trip): number {
  return trip.stops.reduce((total, stop) => total + (stop.review?.photos.reduce((size, photo) => size + reviewPhotoSize(photo), 0) ?? 0), 0);
}
export const tripReviewPhotoCount = (trip: Trip) => trip.stops.reduce((sum, stop) => sum + (stop.review?.photos.length ?? 0), 0);
// Firestore strings/field names use UTF-8 plus one byte, maps add 32 bytes.
// Reserve another 16 KiB for document identity, membership and write metadata.
function storedBytes(value: unknown): number {
  if (typeof value === 'string') return new TextEncoder().encode(value).length + 1;
  if (typeof value === 'number') return 8;
  if (value === null || typeof value === 'boolean') return 1;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + storedBytes(item), 0);
  if (value && typeof value === 'object') return 32 + Object.entries(value).reduce((sum, [key, item]) => sum + (item === undefined ? 0 : storedBytes(key) + storedBytes(item)), 0);
  return 0;
}
export function ensureReviewCapacity(trip: Trip): void {
  const photos = tripReviewPhotoBytes(trip);
  if (tripReviewPhotoCount(trip) > reviewLimits.tripPhotos) throw new ReviewCapacityError('사진은 여행당 최대 100장까지 저장할 수 있어요.');
  if (photos > reviewLimits.tripPhotoBytes) throw new ReviewCapacityError('여행의 후기 사진 용량이 8MB를 넘었어요. 사진을 줄인 뒤 다시 저장해 주세요.');
  const metadata = { ...trip, stops: trip.stops.map(stop => stop.review ? { ...stop, review: { ...stop.review, photos: stop.review.photos.map(() => 'review-photo:' + '0'.repeat(32) + ':204800') } } : stop) };
  if (photos && storedBytes(metadata) + 16 * 1024 > reviewLimits.tripBytes) throw new ReviewCapacityError('여행 일정과 후기 글의 저장 공간이 부족해요. 긴 메모나 후기 글을 줄인 뒤 다시 저장해 주세요.');
}
export function saveStopReview(trip: Trip, stopId: string, review: StopReview): Trip {
  if (!trip.stops.some(stop => stop.id === stopId)) throw new Error('이 일정이 삭제되었어요. 후기를 복사해 두고 최신 여행을 확인해 주세요.');
  const clean = { text: review.text.trim(), photos: [...review.photos] };
  const empty = !clean.text && !clean.photos.length;
  if (!empty && !isStopReview(clean)) throw new Error('후기는 3,000자, 사진은 최대 3장까지 저장할 수 있어요.');
  const next = { ...trip, stops: trip.stops.map(stop => {
    if (stop.id !== stopId) return stop;
    const { review: previous, ...rest } = stop;
    return empty ? rest : { ...rest, review: clean };
  }) };
  ensureReviewCapacity(next);
  return next;
}
