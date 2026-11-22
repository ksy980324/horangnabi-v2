import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseDatabase, sampleDatabase } from '../src/data';
import { planReviewPhotoStorage, validatePhotoTransition, materializeReviewPhotos } from '../src/services/reviewPhotoStorage';
import { ensureReviewCapacity, reviewLimits, saveStopReview, tripReviewPhotoBytes } from '../src/services/stopReviews';
import { parseReviewPhotoReference } from '../src/services/reviewPhotoReferences';
import { buildBlogMaterials } from '../src/services/blogMaterials';
import { createBlogArchive } from '../src/services/blogArchive';
import { tripChanges } from '../src/services/activityLog';
import { StopReviewPreview } from '../src/components/StopReviewPreview';
import { createSharedSnapshotReader } from '../src/services/sharedSnapshot';

const photo = 'data:image/jpeg;base64,/9j/AAAA';
const otherPhoto = 'data:image/jpeg;base64,/9j/BBBB';
const original = () => saveStopReview(sampleDatabase().trips[0], 'castle', { text: '좋았어요.', photos: [photo, otherPhoto] });
const makeIds = () => { let id = 0; return () => (++id).toString(16).padStart(32, '0'); };

test('legacy pictures move losslessly to immutable documents and only references remain in the trip', () => {
  const before = original(), copy = JSON.stringify(before);
  const plan = planReviewPhotoStorage(before, makeIds());
  assert.equal(plan.uploads.size, 2);
  assert.deepEqual([...plan.uploads.values()].map(item => item.dataUrl), [photo, otherPhoto]);
  assert.equal(JSON.stringify(before), copy);
  assert.ok(!JSON.stringify(plan.trip).includes('data:image'));
  assert.equal(tripReviewPhotoBytes(before), tripReviewPhotoBytes(plan.trip));
  assert.deepEqual(validatePhotoTransition(before, plan), []);
  assert.throws(() => parseDatabase({ version: 1, trips: [plan.trip] }), /백업/);
  assert.deepEqual(parseDatabase({ version: 1, trips: [plan.trip] }, true).trips[0], plan.trip);
  assert.equal(createSharedSnapshotReader()([{ id: plan.trip.id, data: () => ({ trip: plan.trip, revision: 2 }) }], [plan.trip.id]).db.trips[0], plan.trip);
});

test('other edits preserve photo references without uploads, and deleted references are explicitly cleaned up', () => {
  const first = planReviewPhotoStorage(original(), makeIds());
  const edited = { ...first.trip, name: '다른 이름' };
  const second = planReviewPhotoStorage(edited, () => { throw new Error('No new photo IDs expected'); });
  assert.equal(second.uploads.size, 0);
  assert.deepEqual(validatePhotoTransition(first.trip, second), []);
  const removed = saveStopReview(first.trip, 'castle', { text: '사진은 삭제', photos: [first.trip.stops[0].review!.photos[1]] });
  assert.deepEqual(validatePhotoTransition(first.trip, planReviewPhotoStorage(removed, makeIds())), [[...first.uploads.keys()][0]]);
  assert.equal(tripChanges(first.trip, edited, 'alice').length, 1);
  assert.deepEqual(tripChanges(original(), original(), 'alice'), [], 'storage migration is recorded after change detection');
});

test('references cannot be imported, borrowed from another trip or assigned a forged size', () => {
  const plan = planReviewPhotoStorage(original(), makeIds());
  assert.throws(() => validatePhotoTransition(undefined, { ...plan, uploads: new Map() }), /확인되지 않은/);
  const forged = structuredClone(plan.trip);
  forged.stops[0].review!.photos[0] = forged.stops[0].review!.photos[0].replace(/:[0-9]+$/, ':1');
  assert.throws(() => validatePhotoTransition(plan.trip, { trip: forged, uploads: new Map() }), /확인되지 않은/);
  for (const invalid of ['https://example.com/x', 'review-photo:../:10', 'review-photo:' + 'a'.repeat(32) + ':204801', 'review-photo:' + 'a'.repeat(32) + ':0']) assert.equal(parseReviewPhotoReference(invalid), undefined);
});

test('a trip can exceed the old 600KB budget while 8MiB and 100-photo safeguards still apply', () => {
  const trip = original(), template = trip.stops[0];
  const prefix = 'data:image/jpeg;base64,/9j/';
  const large = prefix + 'A'.repeat(Math.floor((reviewLimits.photoBytes - prefix.length) / 4) * 4);
  const many = { ...trip, stops: Array.from({ length: 20 }, (_, i) => ({ ...template, id: 'stop-' + i, review: { text: '', photos: [large] } })) };
  assert.ok(tripReviewPhotoBytes(many) > 600 * 1024);
  ensureReviewCapacity(many);
  const stored = planReviewPhotoStorage(many, makeIds());
  assert.equal(stored.uploads.size, 1, 'identical images are stored once per transaction');
  assert.ok(JSON.stringify(stored.trip).length < 10000);
  const countOverflow = { ...trip, stops: Array.from({ length: 101 }, (_, i) => ({ ...template, id: 'stop-' + i, review: { text: '', photos: [photo] } })) };
  assert.throws(() => ensureReviewCapacity(countOverflow), /100장/);
  const sizeOverflow = { ...many, stops: Array.from({ length: 50 }, (_, i) => ({ ...many.stops[0], id: 'stop-' + i })) };
  assert.throws(() => ensureReviewCapacity(sizeOverflow), /8MB/);
});

test('portable backups restore all photo bytes, preserve order and fail as a whole when any image is unavailable', async () => {
  const originalTrip = original(), plan = planReviewPhotoStorage(originalTrip, makeIds());
  const read = async (_tripId: string, reference: string) => plan.uploads.get(parseReviewPhotoReference(reference)!.id)!.dataUrl;
  const complete = await materializeReviewPhotos({ version: 1, trips: [plan.trip] }, read);
  assert.deepEqual(parseDatabase(JSON.parse(JSON.stringify(complete))).trips[0], originalTrip);
  await assert.rejects(materializeReviewPhotos({ version: 1, trips: [plan.trip] }, async () => { throw new Error('permission-denied'); }), /permission/);
  await assert.rejects(materializeReviewPhotos({ version: 1, trips: [plan.trip] }, async () => 'invalid'), /백업을 중단/);
});

test('blog counts and prompts retain reference photos but ZIP refuses unresolved references and UI never uses them as URLs', async () => {
  const plan = planReviewPhotoStorage(original(), makeIds());
  const options = { includeUnreviewed: false, includePhotos: true, tone: 'personal' as const };
  const materials = buildBlogMaterials(plan.trip, options);
  assert.equal(materials.photos.length, 2);
  assert.ok(!materials.prompt.includes('review-photo:'));
  assert.throws(() => createBlogArchive(materials), /불러온 뒤/);
  const complete = await materializeReviewPhotos({ version: 1, trips: [plan.trip] }, async (_id, reference) => plan.uploads.get(parseReviewPhotoReference(reference)!.id)!.dataUrl);
  assert.ok(createBlogArchive(buildBlogMaterials(complete.trips[0], options)).length > 0);
  const html = renderToStaticMarkup(createElement(StopReviewPreview, { review: plan.trip.stops[0].review! }));
  assert.ok(html.includes('사진을 불러오고'));
  assert.ok(!html.includes('src="review-photo:'));
});
