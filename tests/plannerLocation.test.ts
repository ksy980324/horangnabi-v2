import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { readPlannerLocation, savePlannerLocation, clearPlannerLocation } from '../src/services/plannerLocation';
import type { Database } from '../src/types';
const db:Database={version:1,trips:[{id:'trip',name:'여행',region:'방콕',start:'2026-11-16',end:'2026-11-18',stops:[]}]};
function useStorage(context:TestContext) {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:storage});
  context.after(()=>{if(previous) Object.defineProperty(globalThis,'sessionStorage',previous);else Reflect.deleteProperty(globalThis,'sessionStorage');});
  return {values,storage};
}
test('refresh restores only the current account visible trip, day and tab without storing travel content',context=>{
  const {values}=useStorage(context);
  savePlannerLocation({tripId:'trip',day:'2026-11-17',view:'saved',packingOpen:true},'user-a');
  assert.deepEqual(readPlannerLocation(db,'user-a'),{tripId:'trip',day:'2026-11-17',view:'saved',packingOpen:true});
  assert.deepEqual(readPlannerLocation(db,'user-b'),{});assert.deepEqual(readPlannerLocation({version:1,trips:[]},'user-a'),{});
  assert.ok(![...values.values()].join('').includes('방콕'));
  clearPlannerLocation('user-a');assert.deepEqual(readPlannerLocation(db,'user-a'),{});
});
test('invalid screen state and unavailable storage do not block opening the planner',context=>{
  const {values,storage}=useStorage(context);
  savePlannerLocation({tripId:'trip',day:'2026-11-17',view:'expenses'});
  assert.equal(readPlannerLocation(db).view,'schedule');
  const key=[...values.keys()][0];values.set(key,JSON.stringify({tripId:'trip',day:'bad',view:'unknown'}));
  assert.equal(readPlannerLocation(db).day,db.trips[0].start);assert.equal(readPlannerLocation(db).view,'schedule');
  values.set(key,'broken');assert.deepEqual(readPlannerLocation(db),{});
  context.mock.method(storage,'getItem',()=>{throw new Error('storage disabled');});
  context.mock.method(storage,'setItem',()=>{throw new Error('storage disabled');});
  assert.deepEqual(readPlannerLocation(db),{});assert.doesNotThrow(()=>savePlannerLocation({tripId:'trip'}));
});

test('souvenir view restores for a visible shared or device trip',context=>{
  useStorage(context);
  for(const user of ['user-a',undefined]) {
    savePlannerLocation({tripId:'trip',view:'souvenirs'},user);
    assert.equal(readPlannerLocation(db,user).view,'souvenirs');
  }
});
