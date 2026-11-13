import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTripName } from '../src/services/tripName.ts';

test('blank trip names use the selected city even without mapped coordinates', () => {
  assert.equal(resolveTripName('', '일본 · 도쿄', { countryCode: 'JP', cityName: '도쿄' }), '도쿄 여행');
  assert.equal(resolveTripName('   ', '일본 · 요나고'), '요나고 여행');
  assert.equal(resolveTripName('', '일본'), '일본 여행');
  assert.equal(resolveTripName('', '프랑스·이탈리아 여행'), '이탈리아 여행');
  assert.equal(resolveTripName('', ''), '새 여행');
  assert.equal(resolveTripName('  우리의 첫 여행  ', '일본 · 도쿄'), '우리의 첫 여행');
  assert.ok(resolveTripName('', '도'.repeat(100)).length <= 100);
});
