import test from 'node:test';
import assert from 'node:assert/strict';
import { countries, cities, filterCities, citySearchQuery, parseDestination, popularCountryCodes } from '../src/services/destinations.ts';

test('country selection covers unique ISO country/territory codes and catalog references are valid', () => {
  assert.equal(countries.length, 249);
  assert.equal(new Set(countries.map(country => country.code)).size, 249);
  for (const country of countries) assert.ok(country.name.length > 0);
  for (const code of popularCountryCodes) assert.ok(countries.some(country => country.code === code));
  for (const city of cities) assert.ok(countries.some(country => country.code === city.countryCode));
  assert.equal(new Set(cities.map(city => `${city.countryCode}:${city.englishName}`)).size, cities.length);
});
test('offline city search includes major and small destinations in Korean, English and local names', () => {
  assert.equal(filterCities('JP', '오사카')[0].name, '오사카');
  assert.equal(filterCities('JP', '요나고')[0].englishName, 'Yonago');
  assert.equal(filterCities('JP', '米子')[0].name, '요나고');
  assert.equal(filterCities('JP', 'yUfUiN')[0].name, '유후인');
  assert.equal(filterCities('FR', 'Colmar')[0].name, '콜마르');
  assert.equal(filterCities('JP', '콜마르').length, 0);
  assert.equal(citySearchQuery('JP', '요나고'), 'Yonago');
  assert.equal(citySearchQuery('JP', 'Unlisted town'), 'Unlisted town');
});
test('existing region strings remain editable without changing stored trip schema', () => {
  assert.deepEqual(parseDestination('일본 · 오사카'), { countryCode: 'JP', cityName: '오사카', manual: false });
  assert.deepEqual(parseDestination('한국 · 단양'), { countryCode: 'KR', cityName: '단양', manual: false });
  assert.deepEqual(parseDestination('유럽 여러 나라 여행'), { countryCode: '', cityName: '', manual: true });
  assert.deepEqual(parseDestination(''), { countryCode: '', cityName: '', manual: false });
});
