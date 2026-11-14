import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addRecommendation, alreadyIncluded, recommendationAnchor, type Recommendation } from '../src/services/recommendations';
import { parseDatabase } from '../src/data';
import type { Trip } from '../src/types';
const trip:Trip={id:'trip',name:'파리 여행',region:'프랑스 · 파리',destination:{countryCode:'FR',cityName:'파리',lat:48.85,lng:2.35},start:'2026-11-16',end:'2026-11-18',stops:[]};
const place:Recommendation={id:'abc',name:'에펠탑',address:'Paris',lat:48.858,lng:2.294,category:'관광',mapUrl:'https://www.google.com/maps/search/?api=1&query_place_id=abc',rating:4.7,ratingCount:100,photo:{resource:'places/abc/photos/xyz',authors:[{name:'Author'}]}};
test('recommendations work globally and use last located stop, city, then another trip stop',()=>{
  assert.equal(recommendationAnchor(trip,trip.start),trip.destination);
  const located={...trip,stops:[{id:'stop',name:'숙소',address:'',lat:48,lng:2,date:trip.start,time:'',category:'숙소' as const,memo:''}]};
  assert.equal(recommendationAnchor(located,trip.start),located.stops[0]);
  assert.equal(recommendationAnchor({...located,destination:undefined},trip.end),located.stops[0]);
  assert.equal(recommendationAnchor({...trip,destination:undefined},trip.start),undefined);
});
test('shared and device additions preserve travel data and exclude duplicate names or place links',()=>{
  const base={...trip,packingItems:[{id:'pack',name:'여권',completed:false}]};
  const next=addRecommendation(base,place,trip.start);
  assert.equal(base.stops.length,0);assert.equal(next.packingItems,base.packingItems);
  assert.equal(next.stops[0].date,trip.start);assert.equal(next.stops[0].time,'');
  assert.notEqual(next.stops[0].id,addRecommendation(base,place,trip.start).stops[0].id);
  assert.ok(alreadyIncluded(next,place));assert.ok(alreadyIncluded(next,{...place,name:'Eiffel Tower'}));
  assert.throws(()=>addRecommendation(next,place),/이미/);
  const saved=addRecommendation(trip,place);
  assert.equal(saved.savedPlaces?.length,1);parseDatabase({version:1,trips:[next]});parseDatabase({version:1,trips:[saved]});
  assert.equal('photo' in next.stops[0],false);assert.equal('rating' in next.stops[0],false);assert.equal('photoUrl' in next.stops[0],false);
});
test('recommendations reject invalid dates, coordinates and unsafe map links',()=>{
  for(const date of ['2026-12-01','2026-11-31','wrong']) assert.throws(()=>addRecommendation(trip,place,date),/날짜/);
  assert.throws(()=>addRecommendation(trip,{...place,lat:NaN}),/정보/);
  assert.throws(()=>addRecommendation(trip,{...place,mapUrl:'javascript:alert(1)'}),/정보/);
});
