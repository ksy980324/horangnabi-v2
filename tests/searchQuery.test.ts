import test from 'node:test';
import assert from 'node:assert/strict';
import { koreanAirportName, resolveSearchQuery } from '../src/services/searchQuery.ts';
import { localizePlace } from '../src/services/placeLocalization.ts';

test('Yonago Kasuitei uses the indexed Japanese name without matching similar hotels', () => {
  for (const query of ['카스이테이', '요나고 카수이테이', '카스이테이 료칸', 'Kasuitei', '華水亭']) {
    assert.equal(resolveSearchQuery(query).text, '皆生温泉 華水亭');
    assert.equal(resolveSearchQuery(query).airport, false);
  }
  assert.equal(resolveSearchQuery('Kasuitei Ooya').text, 'Kasuitei Ooya');
  const result = localizePlace({ name: '皆生グランドホテル 華水亭' }, '카스이테이');
  assert.equal(result.name, '카스이테이');
  assert.equal(result.originalName, '皆生グランドホテル 華水亭');
});

test('Korean Osaka airport names resolve to Itami, with Kansai as a distinct choice', () => {
  for (const query of ['오사카 공항', '오사카공항', '오사카 국제공항', '이타미 공항', 'ITM']) {
    assert.equal(resolveSearchQuery(query).text, 'Osaka International Airport');
    assert.equal(resolveSearchQuery(query).airport, true);
  }
  assert.deepEqual(resolveSearchQuery('오사카 공항').alternatives, ['이타미 공항', '간사이 공항']);
  assert.equal(resolveSearchQuery('간사이 공항').text, 'Kansai International Airport');
  assert.equal(resolveSearchQuery('KIX').text, 'Kansai International Airport');
});

test('common travel terms are expanded without treating airport cafes as airports', () => {
  assert.equal(resolveSearchQuery('오사카 성').text, 'Osaka Castle');
  assert.equal(resolveSearchQuery('오사카성').text, 'Osaka Castle');
  assert.equal(resolveSearchQuery('후쿠오카 공항').text, 'Fukuoka Airport');
  assert.equal(resolveSearchQuery('오사카 공항 카페').airport, false);
  assert.equal(resolveSearchQuery('Don Quijote Namba').text, 'Don Quijote Namba');
  assert.equal(resolveSearchQuery('Osaka International Airport').expanded, false);
});

test('Yonago airport aliases and its shared airfield name resolve consistently', () => {
  for (const query of ['요나고 공항', '요나고 기타로 공항', '요나고 키타로 공항', 'YGJ', '米子空港', 'Miho-Yonago Airport']) {
    assert.equal(resolveSearchQuery(query).text, 'Yonago Airport');
    assert.equal(resolveSearchQuery(query).airport, true);
    assert.equal(resolveSearchQuery(query).label, '요나고 기타로 공항');
  }
  assert.equal(koreanAirportName('美保飛行場'), '요나고 기타로 공항');
  assert.equal(resolveSearchQuery('요나고 호텔').text, 'Yonago 호텔');
});
