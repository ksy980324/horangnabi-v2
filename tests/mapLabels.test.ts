import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { koreanLabel } from '../src/services/mapLabels.ts';

test('map labels use Korean, then English, then the original name', () => {
  const original = ['coalesce', ['get', 'name:latin'], ['get', 'name']];
  const compiled = createExpression(koreanLabel(original));
  assert.equal(compiled.result, 'success', JSON.stringify(compiled.value));
  if (compiled.result !== 'success') return;
  const label = (properties: Record<string, string>) => compiled.value.evaluate({ zoom: 12 }, { type: 'Point', properties });
  assert.equal(label({ 'name:ko': '오사카', name_ko: '오사카시', 'name:en': 'Osaka', name: '大阪市' }), '오사카');
  assert.equal(label({ name_ko: '오사카', name_en: 'Osaka', name: '大阪市' }), '오사카');
  assert.equal(label({ 'name:ko': '', name_ko: '', name_en: 'Osaka', name: '大阪市' }), 'Osaka');
  assert.equal(label({ name: '大阪市' }), '大阪市');
});

test('route numbers and house numbers retain their original label settings', () => {
  assert.equal(koreanLabel(['get', 'ref']), undefined);
  assert.equal(koreanLabel('{housenumber}'), undefined);
  assert.equal(koreanLabel(undefined), undefined);
  assert.ok(koreanLabel(['format', ['get', 'name'], {}]));
});

test('legacy label tokens still resolve when translated names are missing', () => {
  const compiled = createExpression(koreanLabel('{name} ({ref})'));
  assert.equal(compiled.result, 'success', JSON.stringify(compiled.value));
  if (compiled.result !== 'success') return;
  assert.equal(compiled.value.evaluate({ zoom: 12 }, { type: 'Point', properties: { name: '大阪', ref: '26' } }), '大阪 (26)');
});
