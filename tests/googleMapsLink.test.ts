import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDatabase, sampleDatabase } from '../src/data';
import { googleMapsDirections, isGoogleMapsLink, parseGoogleMapsShare } from '../src/services/googleMapsLink';

test('directions pass the saved destination and let Google Maps choose the origin', () => {
  const place = { name: '우동 마르코', address: '鳥取県米子市日野町55' };
  const url = new URL(googleMapsDirections({ ...place, lat: 35.4263429, lng: 133.3340368 })!);
  assert.equal(url.pathname, '/maps/dir/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('destination'), '35.4263429,133.3340368');
  assert.equal(url.searchParams.has('origin'), false);
  assert.equal(new URL(googleMapsDirections(place)!).searchParams.get('destination'), '우동 마르코 鳥取県米子市日野町55');
  assert.equal(googleMapsDirections({ ...place, address: ' ' }), undefined);
});

test('map share text and place URLs supply a name without treating the map camera as a pin', () => {
  const short = 'https://maps.app.goo.gl/abc';
  assert.deepEqual(parseGoogleMapsShare(`우동 마르코\n${short}`), { url: short, name: '우동 마르코', point: undefined });
  assert.equal(parseGoogleMapsShare(short)?.name, '');
  const place = `https://www.google.com/maps/place/${encodeURIComponent('うどんマルコ')}/@35.4,133.3,15z`;
  assert.deepEqual(parseGoogleMapsShare(place), { url: place, name: 'うどんマルコ', point: undefined });
  assert.equal(parseGoogleMapsShare('https://www.google.com/maps/place/Udon+Marco')?.name, 'Udon Marco');
  assert.equal(parseGoogleMapsShare('https://www.google.com/maps/search/Udon+Marco/')?.name, 'Udon Marco');
  assert.equal(parseGoogleMapsShare('https://www.google.com/maps/search/?api=1&query=Udon+Marco')?.name, 'Udon Marco');
  assert.equal(parseGoogleMapsShare('https://maps.google.com/?q=Udon+Marco')?.name, 'Udon Marco');
  assert.equal(parseGoogleMapsShare('https://www.google.com/maps/search/@35.4,133.3,15z')?.name, '');
  assert.deepEqual(parseGoogleMapsShare('https://www.google.com/maps/search/?api=1&query=35.4%2C133.3')?.point, { lat: 35.4, lng: 133.3 });
  assert.equal(parseGoogleMapsShare('Fake\nhttps://maps.app.goo.gl.example.com/abc'), undefined);
});

test('a Google Maps place link uses the explicit place pin instead of the camera position', () => {
  const url = 'https://www.google.com/maps/place/Udon+Marco/@35.5,133.5,17z/data=!3m5!1splace!8m2!3d35.4263429!4d133.3340368!16splace';
  assert.deepEqual(parseGoogleMapsShare(url)?.point, { lat: 35.4263429, lng: 133.3340368 });
  assert.deepEqual(parseGoogleMapsShare(url.replaceAll('!', '%21'))?.point, { lat: 35.4263429, lng: 133.3340368 });
  const explicit = parseGoogleMapsShare('https://www.google.com/maps/place/Udon+Marco?q=35.4263429,133.3340368');
  assert.equal(explicit?.name, 'Udon Marco');
  assert.deepEqual(explicit?.point, { lat: 35.4263429, lng: 133.3340368 });
});

test('Google Maps share links accept short and full URLs and reject lookalikes', () => {
  assert.equal(isGoogleMapsLink('https://maps.app.goo.gl/abc'), true);
  assert.equal(isGoogleMapsLink('https://www.google.com/maps/place/Example'), true);
  assert.equal(isGoogleMapsLink('https://maps.google.com/?q=Example'), true);
  for (const url of ['javascript:alert(1)', 'https://maps.app.goo.gl.example.com/abc', 'https://www.google.com/url?q=example.com', 'https://user@maps.app.goo.gl/abc']) {
    assert.equal(isGoogleMapsLink(url), false);
  }
});

test('mobile shares accept trailing text, query parameters and alternate explicit pin layouts', () => {
  const link = 'https://maps.app.goo.gl/abc?g_st=ic';
  assert.equal(parseGoogleMapsShare(`${link}\n우동 마르코`)?.name, '우동 마르코');
  assert.equal(parseGoogleMapsShare(`우동 마르코\n${link}\nGoogle Maps에서 보기`)?.url, link);
  assert.equal(parseGoogleMapsShare(`[우동 마르코](${link})`)?.name, '우동 마르코');
  assert.deepEqual(parseGoogleMapsShare('https://www.google.com/maps/place/Hotel/data=!3m1!3d35.4!4d133.3')?.point, { lat: 35.4, lng: 133.3 });
  assert.equal(parseGoogleMapsShare('https://www.google.com/maps/place/Hotel/@35.4,133.3,17z')?.point, undefined);
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
