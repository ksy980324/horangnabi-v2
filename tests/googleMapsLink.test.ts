import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDatabase, sampleDatabase } from '../src/data';
import { isGoogleMapsLink } from '../src/services/googleMapsLink';

test('Google Maps share links accept short and full URLs and reject lookalikes', () => {
  assert.equal(isGoogleMapsLink('https://maps.app.goo.gl/abc'), true);
  assert.equal(isGoogleMapsLink('https://www.google.com/maps/place/Example'), true);
  assert.equal(isGoogleMapsLink('https://maps.google.com/?q=Example'), true);
  for (const url of ['javascript:alert(1)', 'https://maps.app.goo.gl.example.com/abc', 'https://www.google.com/url?q=example.com', 'https://user@maps.app.goo.gl/abc']) {
    assert.equal(isGoogleMapsLink(url), false);
  }
});

test('trip backups preserve optional map links and reject unsupported URLs', () => {
  const db = sampleDatabase();
  const stop = db.trips[0].stops[0];
  assert.doesNotThrow(() => parseDatabase(db));
  stop.mapUrl = 'https://maps.app.goo.gl/abc';
  assert.equal(parseDatabase(JSON.parse(JSON.stringify(db))).trips[0].stops[0].mapUrl, stop.mapUrl);
  stop.mapUrl = 'https://example.com';
  assert.throws(() => parseDatabase(db));
});
