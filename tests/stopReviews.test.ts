import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { copyStop, parseDatabase, sampleDatabase } from '../src/data';
import { ensureReviewCapacity, isStopReview, isReviewPhoto, reviewLimits, saveStopReview, tripReviewPhotoBytes } from '../src/services/stopReviews';
import { activityFields, recordTripActivity } from '../src/services/activityLog';
import { saveReservation } from '../src/services/reservations';
import { StopReviewForm } from '../src/components/StopReview';
import { StopReviewPreview } from '../src/components/StopReviewPreview';
import { compressReviewPhoto } from '../src/services/reviewPhotos';

const photo = 'data:image/jpeg;base64,/9j/AAAA';
const review = { text: '풍경이 좋아요.\n아침에 방문 추천!', photos: [photo] };

test('review saves separately from transport memo, edits and removes without altering unrelated data', () => {
  const trip = sampleDatabase().trips[0], stop = trip.stops[0];
  const next = saveStopReview(trip, stop.id, { ...review, text: ` ${review.text} ` });
  assert.deepEqual(next.stops[0].review, review);
  assert.equal(next.stops[0].memo, stop.memo);
  assert.equal(trip.stops[0].review, undefined);
  assert.equal(next.stops[1], trip.stops[1]);
  const removed = saveStopReview(next, stop.id, { text: ' ', photos: [] });
  assert.equal('review' in removed.stops[0], false);
  assert.deepEqual(next.stops[0].review, review);
  assert.throws(() => saveStopReview(trip, 'deleted-stop', review), /삭제/);
  assert.equal(saveStopReview(trip, stop.id, { text: '', photos: [photo] }).stops[0].review?.text, '');
});

test('old backups remain valid; reviews round-trip and reject invalid photos and limits', () => {
  const db = sampleDatabase();
  assert.equal(parseDatabase(db).trips[0].stops[0].review, undefined);
  const trip = saveStopReview(db.trips[0], 'castle', review);
  assert.deepEqual(parseDatabase(JSON.parse(JSON.stringify({ version: 1, trips: [trip] }))).trips[0], trip);
  for (const invalid of [null, { text: '', photos: [] }, { text: 'a'.repeat(3001), photos: [] }, { text: '', photos: [photo, photo, photo, photo] }, { text: 'hello', photos: ['javascript:alert(1)'] }]) {
    assert.equal(isStopReview(invalid), false);
    assert.throws(() => parseDatabase({ version: 1, trips: [{ ...trip, stops: [{ ...trip.stops[0], review: invalid }] }] }));
  }
  for (const invalid of ['https://example.com/photo.jpg', 'data:image/svg+xml;base64,/9j/AAAA', 'data:image/jpeg;base64,/9j/AA', photo + '!', 'data:image/jpeg;base64,/9j/' + 'A'.repeat(reviewLimits.photoBytes)]) assert.equal(isReviewPhoto(invalid), false);
});

test('photo budget applies across all stops and document capacity leaves room for membership and history', () => {
  const trip = sampleDatabase().trips[0];
  const prefix = 'data:image/jpeg;base64,';
  const bigPhoto = prefix + '/9j/' + 'A'.repeat(Math.floor((reviewLimits.photoBytes - prefix.length) / 4) * 4 - 4);
  assert.equal(isReviewPhoto(bigPhoto), true);
  const full = { ...trip, stops: trip.stops.map(stop => ({ ...stop, review: { text: '', photos: [bigPhoto] } })) };
  assert.equal(tripReviewPhotoBytes(full), bigPhoto.length * full.stops.length);
  ensureReviewCapacity(full);
  const overflowing = { ...full, stops: Array.from({ length: 50 }, (_, index) => ({ ...full.stops[0], id: 'photo-' + index })) };
  assert.throws(() => saveStopReview(overflowing, overflowing.stops[0].id, review), /사진 용량/);
  assert.throws(() => parseDatabase({ version: 1, trips: [overflowing] }));
  const crowded = { ...full, name: '한'.repeat(350000) };
  assert.throws(() => ensureReviewCapacity(crowded), /저장 공간/);
  // Removing all photos remains possible even for a large legacy trip.
  ensureReviewCapacity({ ...crowded, stops: trip.stops });
});

test('activity records the review field without copying private text or image data, including removal', () => {
  const trip = sampleDatabase().trips[0];
  const next = saveStopReview(trip, 'castle', review);
  const stamp = { id: 'review-add', actorId: 'alice', actorName: '나비', at: Date.now() };
  const recorded = recordTripActivity(trip, next, stamp);
  assert.equal(activityFields(recorded.activityLog![0].changes[0]), '후기·사진');
  assert.ok(!JSON.stringify(recorded.activityLog).includes(photo));
  assert.ok(!JSON.stringify(recorded.activityLog).includes(review.text));
  const removed = recordTripActivity(recorded, saveStopReview(recorded, 'castle', { text: '', photos: [] }), { ...stamp, id: 'review-remove' });
  assert.equal(activityFields(removed.activityLog![0].changes[0]), '후기·사진');
});

test('copied schedules start without a visit review and reservation edits retain an existing visit review', () => {
  const trip = saveStopReview(sampleDatabase().trips[0], 'castle', review);
  const copy = copyStop(trip.stops[0]);
  assert.equal(copy.review, undefined);
  assert.deepEqual(trip.stops[0].review, review);
  const stay = { kind: 'stay' as const, id: 'hotel', name: '숙소', checkIn: '2026-11-21T15:00', checkOut: '2026-11-22T10:00' };
  const reserved = saveReservation(trip, stay);
  const stop = reserved.stops.find(stop => stop.stayReservation?.event === 'checkIn')!;
  const reviewed = saveStopReview(reserved, stop.id, review);
  assert.deepEqual(saveReservation(reviewed, { ...stay, checkIn: '2026-11-21T16:00' }).stops.find(item => item.id === stop.id)?.review, review);
});

test('review UI escapes content, shows photos, sharing and limits, and keeps original content with save errors', () => {
  const trip = sampleDatabase().trips[0], stop = { ...trip.stops[0], review: { ...review, text: '<script>private</script>' } };
  const preview = renderToStaticMarkup(createElement(StopReviewPreview, { review: stop.review }));
  assert.ok(preview.includes('&lt;script&gt;private&lt;/script&gt;'));
  assert.ok(!preview.includes('<script>'));
  assert.ok(preview.includes('후기 사진 1 확대'));
  const form = renderToStaticMarkup(createElement(StopReviewForm, { stop, trip, busy: false, status: '저장 실패', shared: true, onClose() {}, onSave() {} }));
  for (const label of ['여행 참여자 모두', '교통편 메모', '3,000자', '1/3', '200KB', '100장', '/8MB', '저장 실패', '&lt;script&gt;private&lt;/script&gt;']) assert.ok(form.includes(label), label);
});

test('photo compressor refuses non-photos and oversized originals before decoding', async () => {
  await assert.rejects(compressReviewPhoto(new File(['svg'], 'image.svg', { type: 'image/svg+xml' })), /사진 파일/);
  await assert.rejects(compressReviewPhoto({ type: 'image/jpeg', size: 26 * 1024 * 1024 } as File), /25MB/);
});

test('photo compression downsizes locally, retries quality and always releases the original object URL', async () => {
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  const revoked: string[] = [], draws: number[][] = [], encodings: unknown[][] = [];
  let failDecode = false;
  class MockImage {
    naturalWidth = 4000; naturalHeight = 3000;
    onload?: () => void; onerror?: () => void;
    set src(_value: string) { queueMicrotask(() => failDecode ? this.onerror?.() : this.onload?.()); }
  }
  const canvas = { width: 0, height: 0, getContext: () => ({ fillStyle: '', fillRect() {}, drawImage() { draws.push([canvas.width, canvas.height]); } }), toDataURL(...args: unknown[]) { encodings.push(args); return encodings.length === 1 ? 'x'.repeat(reviewLimits.photoBytes + 1) : photo; } };
  try {
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: MockImage });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => canvas } });
    URL.createObjectURL = () => 'blob:local-original';
    URL.revokeObjectURL = url => { revoked.push(url); };
    assert.equal(await compressReviewPhoto(new File(['photo'], 'original.jpg', { type: 'image/jpeg' })), photo);
    assert.deepEqual(draws, [[1280, 960]]);
    assert.deepEqual(encodings, [['image/jpeg', 0.8], ['image/jpeg', 0.65]]);
    assert.deepEqual(revoked, ['blob:local-original']);
    failDecode = true;
    await assert.rejects(compressReviewPhoto(new File(['bad'], 'broken.jpg', { type: 'image/jpeg' })), /읽지 못/);
    assert.equal(revoked.length, 2);
  } finally {
    if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage); else Reflect.deleteProperty(globalThis, 'Image');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document');
    URL.createObjectURL = create; URL.revokeObjectURL = revoke;
  }
});
