import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Stop, Trip } from '../src/types';
import { ACTIVITY_LIMIT, activityFields, activityLabel, recordTripActivity, tripChanges, validActivityLog } from '../src/services/activityLog';
import { parseDatabase } from '../src/data';
import { nextSharedRevision, SharedTripConflict } from '../src/services/sharedRevision';
import { saveReservation } from '../src/services/reservations';
const base:Trip={id:'trip',name:'함께 가는 여행',region:'일본',start:'2026-11-16',end:'2026-11-18',stops:[]};
const stamp=(id='event',actorId='alice')=>({id,actorId,actorName:actorId==='alice'?'나비':'호랑이',at:Date.parse('2026-11-14T06:00:00Z')});
const stop=(id:string,name=id,date=base.start):Stop=>({id,name,date,time:'',address:'주소',category:'관광',memo:'',lat:35,lng:133});

test('creation starts a new history and no-op saves preserve latest history rather than stale editor data',()=>{
  const created=recordTripActivity(undefined,base,stamp());
  assert.equal(created.activityLog?.[0].actorName,'나비');assert.equal(created.activityLog?.[0].changes[0].action,'create');
  const forged={...created,activityLog:[]};
  assert.equal(recordTripActivity(created,forged,stamp('no-op')).activityLog,created.activityLog);
  const changed=recordTripActivity(created,{...forged,name:'새 이름'},stamp('rename','bob'));
  assert.deepEqual(changed.activityLog?.map(entry=>entry.id),['rename','event']);
  assert.equal(created.name,base.name);assert.equal(created.activityLog?.length,1);
  const imported=recordTripActivity(undefined,{...changed,id:'new-trip'},stamp('import'));
  assert.deepEqual(imported.activityLog?.map(entry=>entry.id),['import']);
});

test('schedule changes distinguish edits, deletion, day changes and actual reordering without recording private contents',()=>{
  const before={...base,stops:[stop('a'),stop('b'),stop('c','다른 날',base.end)]};
  const edited={...before,stops:[{...before.stops[0],time:'12:00',memo:'private booking details'},before.stops[1],before.stops[2]]};
  const changes=tripChanges(before,edited,'alice');
  assert.equal(changes.length,1);assert.deepEqual(changes[0].fields,['time','memo']);
  assert.ok(!JSON.stringify(changes).includes('private booking details'));
  assert.equal(activityFields(changes[0]),'시간 · 메모');
  assert.equal(tripChanges(before,{...before,stops:[before.stops[1],before.stops[0],before.stops[2]]},'alice')[0].action,'reorder');
  assert.deepEqual(tripChanges(before,{...before,stops:[...before.stops,stop('d')]},'alice').map(change=>change.action),['create']);
  assert.equal(tripChanges(before,{...before,stops:before.stops.slice(1)},'alice')[0].action,'delete');
  const moved={...before,stops:[{...before.stops[0],date:base.end},...before.stops.slice(1)]};
  assert.ok(tripChanges(before,moved,'alice').some(change=>change.fields.includes('date')));
});

test('saved-place moves record one natural event and reservation-generated stops do not flood history',()=>{
  const saved={id:'a',name:'가고 싶은 곳',address:'',category:'관광' as const,memo:'',lat:35,lng:133};
  const before={...base,savedPlaces:[saved]};
  const scheduled={...before,savedPlaces:[],stops:[{...saved,date:base.start,time:''}]};
  assert.deepEqual(tripChanges(before,scheduled,'alice').map(change=>change.action),['move']);
  const stay=saveReservation(base,{id:'stay',kind:'stay',name:'숙소',checkIn:base.start+'T15:00',checkOut:base.end+'T10:00',lat:35,lng:133});
  const changes=tripChanges(base,stay,'alice');
  assert.equal(changes.length,1);assert.equal(changes[0].area,'reservation');
});

test('packing checks retain separate actors while expense updates log labels and changed fields only',()=>{
  const before={...base,packingItems:[{id:'p',name:'여권',completed:false,completedBy:[]}]};
  const alice=recordTripActivity(before,{...before,packingItems:[{...before.packingItems[0],completedBy:['alice']}]},stamp('alice'));
  const bob=recordTripActivity(alice,{...alice,packingItems:[{...alice.packingItems![0],completed:true,completedBy:['alice','bob']}]},stamp('bob','bob'));
  assert.deepEqual(bob.activityLog?.map(entry=>entry.actorId),['bob','alice']);
  assert.equal(bob.activityLog?.[0].changes[0].action,'check');
  const unchecked=recordTripActivity(bob,{...bob,packingItems:[{...bob.packingItems![0],completed:false,completedBy:['bob']}]},stamp('uncheck'));
  assert.equal(unchecked.activityLog?.[0].changes[0].action,'uncheck');
  const expense={id:'expense',name:'저녁 식사',date:base.start,currency:'JPY',amount:2000,paidBy:'alice',shared:true};
  const previous={...base,expenses:[expense]};
  const changes=tripChanges(previous,{...previous,expenses:[{...expense,amount:3000}]},'alice');
  assert.equal(changes[0].area,'expense');assert.deepEqual(changes[0].fields,['amount']);
  assert.equal(activityLabel(changes[0]),'지출 수정');assert.ok(!JSON.stringify(changes).includes('3000'));
});

test('history is bounded, bulk changes are summarized and old backups remain compatible',()=>{
  let trip=base;
  for(let i=0;i<60;i++) trip=recordTripActivity(i?trip:undefined,{...trip,name:'여행 '+i},stamp('event-'+i));
  assert.equal(trip.activityLog?.length,ACTIVITY_LIMIT);
  assert.equal(trip.activityLog?.[0].id,'event-59');
  const bulk=recordTripActivity(trip,{...trip,stops:Array.from({length:12},(_,i)=>stop('stop-'+i))},stamp('bulk'));
  assert.equal(bulk.activityLog?.[0].changes.length,5);assert.equal(bulk.activityLog?.[0].more,7);
  assert.equal(validActivityLog(bulk.activityLog),true);
  parseDatabase({version:1,trips:[bulk]});parseDatabase({version:1,trips:[base]});
  assert.deepEqual(recordTripActivity(bulk,{...bulk,name:'again'},stamp('bulk')).activityLog,bulk.activityLog);
});

test('invalid history data is rejected and conflicts produce no committed activity',()=>{
  const logged=recordTripActivity(undefined,base,stamp());
  for(const entries of [
    [...logged.activityLog!,...logged.activityLog!],
    [{...logged.activityLog![0],at:NaN}],
    [{...logged.activityLog![0],changes:[{area:'unknown',action:'create',label:'x',fields:[]}]}],
    [{...logged.activityLog![0],changes:[{area:'stop',action:'create',label:'x',fields:[],date:'2026-02-31'}]}],
  ]) assert.throws(()=>parseDatabase({version:1,trips:[{...base,activityLog:entries}]}),/백업/);
  assert.throws(()=>{nextSharedRevision(true,3,2);recordTripActivity(logged,{...logged,name:'lost'},stamp('lost'));},SharedTripConflict);
  assert.equal(logged.activityLog?.length,1);
  const reordered={...logged,destination:{lat:35,lng:133,cityName:'요나고',countryCode:'JP'}};
  assert.equal(tripChanges(reordered,{...reordered,destination:{countryCode:'JP',cityName:'요나고',lng:133,lat:35}},'alice').length,0);
});
