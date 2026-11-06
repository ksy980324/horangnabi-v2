import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDatabase, sampleDatabase } from '../src/data';

test('optional itinerary photo URLs survive backup and require HTTPS', () => {
  const db = sampleDatabase();
  const stop = db.trips[0].stops[0];
  stop.photoUrl = 'https://example.com/osaka.jpg';
  assert.equal(parseDatabase(JSON.parse(JSON.stringify(db))).trips[0].stops[0].photoUrl, stop.photoUrl);
  stop.photoUrl = 'http://example.com/osaka.jpg';
  assert.throws(() => parseDatabase(db));
});
