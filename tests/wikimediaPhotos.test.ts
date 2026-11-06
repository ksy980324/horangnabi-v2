import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchingImage } from '../src/services/wikimediaPhotos';

test('only a uniquely matching nearby article supplies an automatic photo', () => {
  const articles = [{ title: '오사카성 공원', pageimage: 'Park.jpg' }, { title: '오사카성', pageimage: 'Castle.jpg' }];
  assert.equal(matchingImage(articles, '오사카 성'), 'Castle.jpg');
  assert.equal(matchingImage(articles, '우동 마르코'), undefined);
  assert.equal(matchingImage([...articles, { title: '오사카 성', pageimage: 'Another.jpg' }], '오사카성'), undefined);
});
