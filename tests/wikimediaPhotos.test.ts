import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchingImage, photoFromFile, representativeTripPlace } from '../src/services/wikimediaPhotos';

test('curated trip covers follow the destination and support legacy Japan trips', () => {
  assert.equal(representativeTripPlace({ region: '일본 · 오사카' })?.name, '오사카성');
  assert.equal(representativeTripPlace({ region: '일본 · 요나고', destination: { countryCode: 'JP', cityName: 'Yonago' } })?.name, '요나고성 터');
  assert.equal(representativeTripPlace({ region: '일본 · 요나고', destination: { countryCode: 'US', cityName: 'Yonago' } }), undefined);
});

test('only a uniquely matching nearby article supplies an automatic photo', () => {
  const articles = [{ title: '오사카성 공원', pageimage: 'Park.jpg' }, { title: '오사카성', pageimage: 'Castle.jpg' }];
  assert.equal(matchingImage(articles, '오사카 성'), 'Castle.jpg');
  assert.equal(matchingImage(articles, '우동 마르코'), undefined);
  assert.equal(matchingImage([...articles, { title: '오사카 성', pageimage: 'Another.jpg' }], '오사카성'), undefined);
});

test('Commons Osaka Castle metadata accepts the Wikimedia thumbnail host and preserves credit', () => {
  const info = {
    thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e4/Osaka_Castle_02bs3200.jpg/250px-Osaka_Castle_02bs3200.jpg',
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Osaka_Castle_02bs3200.jpg',
    extmetadata: {
      Artist: { value: '<a href="https://ja.wikipedia.org/wiki/user:663highland">663highland</a>' },
      LicenseShortName: { value: 'CC BY 2.5' },
      LicenseUrl: { value: 'https://creativecommons.org/licenses/by/2.5' },
    },
  };
  assert.deepEqual(photoFromFile(info), {
    url: info.thumburl, source: info.descriptionurl, author: '663highland', license: 'CC BY 2.5', licenseUrl: 'https://creativecommons.org/licenses/by/2.5',
  });
  assert.equal(photoFromFile({ ...info, thumburl: 'https://thumb.wikimedia.org.example.com/image.jpg' }), undefined);
});
