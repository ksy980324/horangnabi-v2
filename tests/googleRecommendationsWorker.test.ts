import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../workers/maps-link/index.ts';
import { DAILY_LIMIT, MONTHLY_LIMIT, RecommendationBudget, reserveBudget, parseGooglePlaces, recommendationQuery, verifyFirebaseToken, type BudgetStorage } from '../workers/maps-link/recommendations.ts';

function storage():BudgetStorage {
  const values=new Map<string,unknown>(); let queue:Promise<unknown>=Promise.resolve();
  const store:BudgetStorage={async get<T>(key:string){return values.get(key) as T|undefined;},async put(key,value){values.set(key,value);},transaction(callback){const result=queue.then(()=>callback(store));queue=result.catch(()=>{});return result;}};
  return store;
}
const origin='https://ksy980324.github.io';
const makeRequest=(path:string,token?:string)=>new Request('https://example.workers.dev'+path,{headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{})}});
const env={GOOGLE_PLACES_API_KEY:'fake-key',FIREBASE_PROJECT_ID:'test-project',RECOMMENDATION_BUDGET:{idFromName:()=>'',get:()=>({fetch:async()=>new Response(null,{status:204})})}};
test('global quota reserves atomically across concurrent users and separates search and photos',async()=>{
  const store=storage(),now=new Date('2026-11-14T00:00:00Z');
  const results=await Promise.all(Array.from({length:40},()=>reserveBudget(store,'search',now)));
  assert.equal(results.filter(Boolean).length,DAILY_LIMIT);
  assert.equal(await reserveBudget(store,'photo',now),true);
  assert.equal(await reserveBudget(store,'search',new Date('2026-11-15')),true);
  await store.put('search',{day:'2026-11-15',month:'2026-11',daily:0,monthly:MONTHLY_LIMIT});
  assert.equal(await reserveBudget(store,'search',new Date('2026-11-15')),false);
  assert.equal(await reserveBudget(store,'search',new Date('2026-12-01')),true);
  const object=new RecommendationBudget({storage:store});
  assert.equal((await object.fetch(new Request('https://budget/search',{method:'POST'}))).status,204);
  assert.equal((await object.fetch(new Request('https://budget/search'))).status,400);
});
test('worker fails closed without setup or valid authentication, before consuming quota or calling paid APIs',async context=>{
  const mock=context.mock.method(globalThis,'fetch',async()=>{throw new Error('must not call');});
  assert.equal((await worker.fetch(makeRequest('/recommendations?lat=35&lng=133&kind=cafe'))).status,503);
  assert.equal((await worker.fetch(makeRequest('/recommendations?lat=35&lng=133&kind=cafe'),env)).status,401);
  assert.equal((await worker.fetch(makeRequest('/recommendation-photo?resource=https://evil.test'),env)).status,400);
  assert.equal(await verifyFirebaseToken('invalid','test-project'),false);
  assert.equal(mock.mock.callCount(),0);
  const preflight=await worker.fetch(new Request('https://example.workers.dev/recommendations',{method:'OPTIONS',headers:{Origin:origin}}),env);
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Headers'),'Authorization');
});
test('recommendation input and Google responses validate coordinates, photo resources and attribution links',()=>{
  assert.equal(recommendationQuery(new URL('https://example.test/?lat=&lng=0&kind=cafe')),undefined);
  assert.equal(recommendationQuery(new URL('https://example.test/?lat=91&lng=0&kind=cafe')),undefined);
  assert.equal(recommendationQuery(new URL('https://example.test/?lat=1&lng=2&kind=anything')),undefined);
  const places=parseGooglePlaces({places:[{id:'abc',displayName:{text:'카페'},formattedAddress:'Paris',location:{latitude:48,longitude:2},rating:4.5,userRatingCount:10,photos:[{name:'places/abc/photos/xyz',authorAttributions:[{displayName:'Author',uri:'javascript:alert(1)'},{displayName:'Other',uri:'https://www.google.com/maps/contrib/123'}]}]}]},'cafe');
  assert.equal(places[0].category,'카페');assert.equal(places[0].photo?.authors[0].url,undefined);
  assert.equal(places[0].photo?.authors[1].url,'https://www.google.com/maps/contrib/123');
  assert.equal(places[0].rating,4.5);assert.deepEqual(parseGooglePlaces({places:[{id:'bad'}]},'tourism'),[]);
  assert.equal(parseGooglePlaces({places:Array.from({length:25},(_,i)=>({id:'place'+i,displayName:{text:'Place '+i},location:{latitude:13.75,longitude:100.5}}))},'tourism').length,20);
});
async function signedToken() {
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({aud:'test-project',iss:'https://securetoken.google.com/test-project',sub:'uid',exp:Date.now()/1000+3600,iat:Date.now()/1000})).toString('base64url');
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(header+'.'+payload));
  return {token:header+'.'+payload+'.'+Buffer.from(signature).toString('base64url'),jwk:{...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'test-key'}};
}
test('authenticated requests use exact fields and bounded requests; denied quotas never reach Google',async context=>{
  const {token,jwk}=await signedToken();let googleCalls=0,deny=false,googleFails=false,budgetFails=false,redirectSearch=false,redirectPhoto=false,redirectImage=false;
  context.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    if(url.includes('service_accounts')) return Response.json({keys:[jwk]});
    googleCalls++;
    assert.equal(init?.redirect,'manual','all Places and photo requests must use a Workers-supported redirect mode');
    if(url.includes('/photos/')) return redirectPhoto?Response.redirect('https://untrusted.example/'):Response.json({photoUri:'https://lh3.googleusercontent.com/photo'});
    if(url.startsWith('https://lh3.googleusercontent.com/')) {
      assert.equal(new Headers(init?.headers).has('X-Goog-Api-Key'),false);
      return redirectImage?Response.redirect('https://untrusted.example/'):new Response('image-bytes',{headers:{'Content-Type':'image/jpeg'}});
    }
    if(redirectSearch) return Response.redirect('https://untrusted.example/');
    if(googleFails) return new Response(null,{status:429});
    assert.equal(url,'https://places.googleapis.com/v1/places:searchNearby');
    assert.equal((init?.headers as Record<string,string>)['X-Goog-Api-Key'],'fake-key');
    const body=JSON.parse(init?.body as string);
    assert.equal(body.maxResultCount,20);assert.equal(body.rankPreference,'POPULARITY');assert.equal(body.locationRestriction.circle.radius,5000);
    assert.equal(body.languageCode,'ko');assert.ok(!(init?.headers as Record<string,string>)['X-Goog-FieldMask'].includes('*'));
    return Response.json({places:[]});
  });
  const configured={...env,RECOMMENDATION_BUDGET:{idFromName:()=>'',get:()=>({fetch:async()=>{if(budgetFails) throw new Error('private infrastructure detail');return new Response(null,{status:deny?429:204});}})}};
  const request=()=>makeRequest('/recommendations?lat=35&lng=133&kind=cafe',token);
  const result=await worker.fetch(request(),configured);
  assert.equal(result.status,200);assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(googleCalls,1);
  deny=true;assert.equal((await worker.fetch(request(),configured)).status,429);assert.equal(googleCalls,1);
  deny=false;
  const photo=await worker.fetch(makeRequest('/recommendation-photo?resource=places/abc/photos/xyz',token),configured);
  assert.equal(photo.status,200);assert.equal(photo.headers.get('Cache-Control'),'no-store');assert.equal(photo.headers.get('Content-Type'),'image/jpeg');
  assert.equal(googleCalls,3);
  googleFails=true;assert.equal((await worker.fetch(request(),configured)).status,429);assert.equal(googleCalls,4);
  googleFails=false;redirectSearch=true;
  const redirected=await worker.fetch(request(),configured);
  assert.equal(redirected.status,502);assert.deepEqual(await redirected.json(),{reason:'google',providerStatus:302});assert.equal(googleCalls,5);
  redirectPhoto=true;
  assert.equal((await worker.fetch(makeRequest('/recommendation-photo?resource=places/abc/photos/xyz',token),configured)).status,502);assert.equal(googleCalls,6);
  redirectPhoto=false;redirectImage=true;
  assert.equal((await worker.fetch(makeRequest('/recommendation-photo?resource=places/abc/photos/xyz',token),configured)).status,502);assert.equal(googleCalls,8);
  budgetFails=true;const unavailable=await worker.fetch(request(),configured);
  assert.equal(unavailable.status,503);assert.deepEqual(await unavailable.json(),{reason:'budget-unavailable'});assert.equal(googleCalls,8);
  assert.equal(await verifyFirebaseToken(token,'another-project'),false);
  assert.equal(await verifyFirebaseToken(token.slice(0,-10)+'tampered','test-project'),false);
});
