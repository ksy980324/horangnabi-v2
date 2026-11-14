import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translateRecommendationNames } from '../src/services/translateRecommendationNames';
import type { Recommendation } from '../src/services/recommendations';
const place=(id:string,name:string):Recommendation=>({id,name,address:'',lat:13.75,lng:100.5,category:'관광',mapUrl:'https://www.google.com/maps/search/?api=1&query_place_id='+id});

test('foreign recommendation names translate sequentially, preserve originals and reuse same-list translations',async context=>{
  const calls:string[]=[],names:Record<string,string>={};
  context.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{
    const url=new URL(String(input));assert.equal(url.origin,'https://api.mymemory.translated.net');calls.push(url.searchParams.get('langpair')!);
    assert.deepEqual([...url.searchParams.keys()].sort(),['langpair','q']);
    return Response.json({responseStatus:200,responseData:{translatedText:calls.length===1?'방콕 차이나타운':'태국 사원'}});
  });
  const original=[place('1','Chinatown Bangkok'),place('2','이미 한국어'),place('3','Chinatown Bangkok'),place('4','วัด')];
  await translateRecommendationNames(original,new AbortController().signal,(id,name)=>{names[id]=name;});
  assert.deepEqual(calls,['en|ko','th|ko']);assert.deepEqual(names,{'1':'방콕 차이나타운','3':'방콕 차이나타운','4':'태국 사원'});
  assert.equal(original[0].name,'Chinatown Bangkok');assert.equal(original[0].lat,13.75);
});
test('translation quota exhaustion stops further calls and leaves the result list intact',async context=>{
  const mock=context.mock.method(globalThis,'fetch',async()=>Response.json({responseStatus:200,quotaFinished:true,responseData:{translatedText:'잘못된 번역'}}));
  const names:string[]=[];await translateRecommendationNames([place('1','One'),place('2','Two')],new AbortController().signal,(_,name)=>names.push(name));
  assert.equal(mock.mock.callCount(),1);assert.deepEqual(names,[]);
});
test('closed or replaced recommendation searches cannot receive stale translations',async context=>{
  const controller=new AbortController();
  context.mock.method(globalThis,'fetch',async()=>{controller.abort();return Response.json({responseStatus:200,responseData:{translatedText:'이전 검색'}});});
  const names:string[]=[];await translateRecommendationNames([place('1','Old result')],controller.signal,(_,name)=>names.push(name));
  assert.deepEqual(names,[]);
});
test('translation failure falls back without throwing and already Korean or oversized names make no requests',async context=>{
  const mock=context.mock.method(globalThis,'fetch',async()=>new Response(null,{status:503}));
  const names:string[]=[];await translateRecommendationNames([place('1','한국어'),place('2','A'.repeat(501))],new AbortController().signal,(_,name)=>names.push(name));
  assert.equal(mock.mock.callCount(),0);
  await translateRecommendationNames([place('1','Unknown name'),place('2','Another')],new AbortController().signal,(_,name)=>names.push(name));
  assert.equal(mock.mock.callCount(),1);assert.deepEqual(names,[]);
});
