import test from 'node:test';
import assert from 'node:assert/strict';
import { findReadingStop } from '../src/services/scrollSelection.ts';

test('scroll selects the card below a pinned mobile map, not hidden cards', () => {
  const cards = [{ id: 'first', top: 180, bottom: 290 }, { id: 'second', top: 310, bottom: 440 }, { id: 'third', top: 460, bottom: 580 }];
  assert.equal(findReadingStop(cards, 300, 800), 'second');
  assert.equal(findReadingStop(cards.map(c => ({ ...c, top: c.top - 150, bottom: c.bottom - 150 })), 300, 800), 'third');
});
test('scroll handles upward movement, tall cards, short screens and end of list', () => {
  assert.equal(findReadingStop([{ id: 'expanded', top: -50, bottom: 600 }, { id: 'next', top: 620, bottom: 750 }], 280, 800), 'expanded');
  assert.equal(findReadingStop([{ id: 'first', top: 40, bottom: 180 }, { id: 'last', top: 200, bottom: 330 }], 24, 800, true), 'last');
  assert.equal(findReadingStop([{ id: 'first', top: 310, bottom: 360 }, { id: 'last', top: 380, bottom: 430 }], 300, 450), 'first');
  assert.equal(findReadingStop([{ id: 'first', top: 40, bottom: 180 }, { id: 'last', top: 200, bottom: 330 }], 24, 800), 'first');
});
test('scroll does not select anything outside the viewport', () => {
  assert.equal(findReadingStop([], 300, 800), undefined);
  assert.equal(findReadingStop([{ id: 'hidden', top: 100, bottom: 200 }, { id: 'below', top: 900, bottom: 1000 }], 300, 800), undefined);
});
