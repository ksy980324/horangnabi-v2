import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextSharedRevision, retryPackingRevisionRace, SharedTripConflict } from '../src/services/sharedRevision';

test('shared edits require the revision seen when editing began', () => {
  assert.equal(nextSharedRevision(false, undefined, undefined), 1);
  assert.equal(nextSharedRevision(true, 1, 1), 2);
  assert.throws(() => nextSharedRevision(true, 2, 1), SharedTripConflict);
  assert.throws(() => nextSharedRevision(true, 1, undefined), SharedTripConflict);
  assert.throws(() => nextSharedRevision(false, undefined, 1), SharedTripConflict);
});

test('packing checks replay only a verified revision race, with bounded retries and no success-path extra read',async()=>{
  const denied=Object.assign(new Error('denied'),{code:'permission-denied'});
  let calls=0,reads=0;
  await retryPackingRevisionRace(async observe=>{observe(2);if(++calls===1)throw denied;},async()=>{reads++;return 3;});
  assert.equal(calls,2);assert.equal(reads,1);
  await retryPackingRevisionRace(async observe=>{observe(4);},async()=>{throw new Error('unnecessary read');});
  for(const latest of [2,undefined]) {
    calls=0;
    await assert.rejects(retryPackingRevisionRace(async observe=>{observe(2);calls++;throw denied;},async()=>latest),error=>error===denied);
    assert.equal(calls,1);
  }
  calls=0;
  await assert.rejects(retryPackingRevisionRace(async observe=>{observe(++calls);throw denied;},async()=>calls+1),error=>error===denied);
  assert.equal(calls,3);
  await assert.rejects(retryPackingRevisionRace(async()=>{throw denied;},async()=>{throw new Error('must not read without a snapshot');}),error=>error===denied);
  const offline=Object.assign(new Error('offline'),{code:'unavailable'});
  await assert.rejects(retryPackingRevisionRace(async observe=>{observe(2);throw offline;},async()=>{throw new Error('must not retry network errors');}),error=>error===offline);
  await assert.rejects(retryPackingRevisionRace(async observe=>{observe(2);throw denied;},async()=>{throw denied;}),error=>error===denied);
});
