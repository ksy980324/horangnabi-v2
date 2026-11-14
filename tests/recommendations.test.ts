import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addRecommendation, rankRecommendations, recommendationCatalog } from '../src/services/recommendations';
import { parseDatabase } from '../src/data';
import type { Trip } from '../src/types';
const trip: Trip = {id:'trip',name:'오사카 여행',region:'일본 · 오사카',destination:{countryCode:'JP',cityName:'오사카'},start:'2026-11-16',end:'2026-11-18',stops:[]};
test('recommendations prioritize interests and the selected day location without changing trip order',()=>{
  const food=rankRecommendations(trip,trip.start,'맛집'); assert.equal(food[0].place.id,'kuromon');
  const located:Trip={...trip,stops:[{id:'stop',name:'숙소',address:'',lat:34.6687,lng:135.5013,date:trip.start,time:'',category:'숙소',memo:''}]};
  assert.equal(rankRecommendations(located,trip.start,'')[0].place.id,'dotonbori');
  assert.equal(located.stops[0].id,'stop');
  assert.equal(rankRecommendations({...trip,destination:{countryCode:'US',cityName:'Osaka'}},trip.start,'').length,0);
  assert.equal(rankRecommendations({...trip,region:'일본 · 요나고',destination:undefined},trip.start,'').length,3);
});
test('saved and scheduled recommendations are excluded including native name aliases',()=>{
  const place=recommendationCatalog.find(p=>p.id==='osaka-castle')!;
  const saved=addRecommendation(trip,place); assert.equal(saved.savedPlaces?.length,1);
  assert.ok(!rankRecommendations(saved,trip.start,'').some(p=>p.place.id===place.id));
  const scheduled=addRecommendation(trip,place,trip.start); scheduled.stops[0].name='大阪城';
  assert.ok(!rankRecommendations(scheduled,trip.start,'').some(p=>p.place.id===place.id));
  assert.throws(()=>addRecommendation(saved,place),/이미/);
});
test('recommendation additions preserve other travel data, use new IDs and validate backups',()=>{
  const place=recommendationCatalog.find(p=>p.id==='dotonbori')!;
  const base={...trip,packingItems:[{id:'packing',name:'여권',completed:false}]};
  const next=addRecommendation(base,place,trip.end);
  assert.equal(base.stops.length,0); assert.equal(next.packingItems,base.packingItems);
  assert.equal(next.stops[0].time,''); assert.equal(next.stops[0].date,trip.end);
  assert.notEqual(next.stops[0].id,addRecommendation(base,place,trip.end).stops[0].id);
  parseDatabase({version:1,trips:[next]});
  assert.throws(()=>addRecommendation(base,place,'2026-12-01'),/날짜/);
  assert.throws(()=>addRecommendation(base,recommendationCatalog[0]),/여행/);
});
