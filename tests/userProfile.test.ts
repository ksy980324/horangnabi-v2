import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeNickname, parseUserProfile } from '../src/services/userProfile.ts';

test('nickname input trims spacing, normalizes Korean and preserves chosen letters and emoji', () => {
  assert.equal(normalizeNickname('  여행   나비  '), '여행 나비');
  assert.equal(normalizeNickname('나비'), '나비');
  assert.equal(normalizeNickname('나비 🦋'), '나비 🦋');
  assert.equal(normalizeNickname('준'), '준');
  for (const value of ['', '   ', 'a'.repeat(21), 'bad\nname', 'bad\u0000name']) assert.throws(() => normalizeNickname(value));
});

test('only a valid saved nickname is accepted as a user profile', () => {
  assert.deepEqual(parseUserProfile({ nickname: '나비', updatedAt: 'server-time' }), { nickname: '나비' });
  for (const value of [undefined, null, {}, { nickname: 123 }, { nickname: ' ' }, { nickname: ' nickname ' }, { nickname: 'a'.repeat(21) }]) assert.throws(() => parseUserProfile(value));
});
