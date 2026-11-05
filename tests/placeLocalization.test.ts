import test from 'node:test';
import assert from 'node:assert/strict';
import { localizePlace } from '../src/services/placeLocalization.ts';

test('provided Korean name takes priority and preserves the original below', () => {
  const result = localizePlace({ name: 'A Local Cafe', 'name:ko': '골목 카페', country: 'Japan', city: 'Osaka', street: 'Unknown Street', housenumber: '7' }, 'cafe');
  assert.equal(result.name, '골목 카페');
  assert.equal(result.originalName, 'A Local Cafe');
  assert.equal(result.address, '일본 오사카 Unknown Street 7');
  assert.equal(result.originalAddress, 'Japan Osaka Unknown Street 7');
  assert.equal(result.nameLocalized, true);
});
test('known landmarks and brands translate exactly while unknown branch names are preserved', () => {
  assert.equal(localizePlace({ name: 'Don Quijote' }, '').name, '돈키호테');
  assert.equal(localizePlace({ name: 'MEGA Don Quijote Fukaebashi' }, '').name, '메가 돈키호테 후카에바시점');
  assert.equal(localizePlace({ name: '大阪城' }, '').name, '오사카성');
  assert.equal(localizePlace({ name: 'Osaka Itami Airport', osm_value: 'aerodrome' }, '').name, '오사카 국제공항(이타미)');
  const unknown = localizePlace({ name: 'Don Quijote Unknown Branch' }, 'query');
  assert.equal(unknown.name, 'Don Quijote Unknown Branch');
  assert.equal(unknown.originalName, undefined);
  assert.equal(unknown.nameLocalized, false);
});
test('Korean nested fields, accented address names and already Korean names work', () => {
  const result = localizePlace({ name: 'Local Place', extra: { 'name:ko': '동네 명소' }, country: 'Japan', state: 'Osaka Prefecture', city: 'Osaka', district: 'Chūō Ward' }, 'place');
  assert.equal(result.name, '동네 명소');
  assert.equal(result.address, '일본 오사카부 오사카 주오구');
  assert.equal(localizePlace({ name: '원래 한글 이름' }, '').originalName, undefined);
  assert.equal(localizePlace({ name: 'Cafe', name_ko: '카페', address_ko: '일본 오사카 1번지', city: 'Osaka' }, '').address, '일본 오사카 1번지');
});
