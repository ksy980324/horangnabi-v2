import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextSharedRevision, SharedTripConflict } from '../src/services/sharedRevision';

test('shared edits require the revision seen when editing began', () => {
  assert.equal(nextSharedRevision(false, undefined, undefined), 1);
  assert.equal(nextSharedRevision(true, 1, 1), 2);
  assert.throws(() => nextSharedRevision(true, 2, 1), SharedTripConflict);
  assert.throws(() => nextSharedRevision(true, 1, undefined), SharedTripConflict);
  assert.throws(() => nextSharedRevision(false, undefined, 1), SharedTripConflict);
});
