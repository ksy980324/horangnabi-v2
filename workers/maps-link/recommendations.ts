import type { Recommendation } from '../../src/services/recommendations.ts';
import { safeProviderReason } from '../../src/services/recommendationErrors.ts';

type Counter = { day:string; month:string; daily:number; monthly:number };
export type BudgetStorage = {
  get<T>(key:string):Promise<T|undefined>; put(key:string,value:unknown):Promise<void>;
  transaction<T>(callback:(storage:BudgetStorage)=>Promise<T>):Promise<T>;
};
export type RecommendationEnv = {
  GOOGLE_PLACES_API_KEY?:string; FIREBASE_PROJECT_ID?:string;
  RECOMMENDATION_BUDGET?: {idFromName(name:string):unknown; get(id:unknown):{fetch(request:Request):Promise<Response>}};
};
export const DAILY_LIMIT=25, MONTHLY_LIMIT=800;
export async function reserveBudget(storage:BudgetStorage,kind:'search'|'photo',now=new Date()) {
  return storage.transaction(async tx=>{
    const day=now.toISOString().slice(0,10), month=day.slice(0,7);
    const previous=await tx.get<Counter>(kind);
    const counter:Counter={day,month,daily:previous?.day===day?previous.daily:0,monthly:previous?.month===month?previous.monthly:0};
    if(counter.daily>=DAILY_LIMIT || counter.monthly>=MONTHLY_LIMIT) return false;
    counter.daily++;counter.monthly++;await tx.put(kind,counter);return true;
  });
}
// A single namespace ID serializes reservations across all users and Worker instances.
// Never rename the class/ID or remove storage: doing so resets the cost guard.
export class RecommendationBudget {
  constructor(private state:{storage:BudgetStorage}) {}
  async fetch(request:Request) {
    const kind=new URL(request.url).pathname.slice(1);
    if(request.method!=='POST' || (kind!=='search'&&kind!=='photo')) return new Response(null,{status:400});
    return new Response(null,{status:await reserveBudget(this.state.storage,kind)?204:429});
  }
}
const decode=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
let jwks:{expires:number;keys:(JsonWebKey&{kid?:string})[]}|undefined;
export async function verifyFirebaseToken(token:string,project:string):Promise<boolean> {
  try {
    const parts=token.split('.');if(parts.length!==3 || token.length>10000) return false;
    const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))) as {alg?:string;kid?:string};
    const claims=JSON.parse(new TextDecoder().decode(decode(parts[1]))) as {aud?:string;iss?:string;sub?:string;exp?:number;iat?:number};
    const now=Date.now()/1000;
    if(header.alg!=='RS256'||!header.kid||claims.aud!==project||claims.iss!=='https://securetoken.google.com/'+project||!claims.sub||claims.sub.length>128||typeof claims.exp!=='number'||!Number.isFinite(claims.exp)||claims.exp<=now||typeof claims.iat!=='number'||!Number.isFinite(claims.iat)||claims.iat>now+60) return false;
    if(!jwks || jwks.expires<Date.now()) {
      const response=await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',{signal:AbortSignal.timeout(5000)});
      if(!response.ok) return false;
      const body=await response.json() as {keys:(JsonWebKey&{kid?:string})[]};
      jwks={keys:body.keys,expires:Date.now()+3600000};
    }
    const raw=jwks.keys.find(key=>key.kid===header.kid);if(!raw) return false;
    const key=await crypto.subtle.importKey('jwk',raw,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  } catch {return false;}
}
export function recommendationQuery(url:URL) {
  const latText=url.searchParams.get('lat'),lngText=url.searchParams.get('lng'),kind=url.searchParams.get('kind');
  const lat=Number(latText),lng=Number(lngText);
  if(!latText?.trim()||!lngText?.trim()||!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180||!['tourism','restaurant','cafe'].includes(kind??'')) return;
  return {lat,lng,kind:kind as 'tourism'|'restaurant'|'cafe'};
}
const photoResource=/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
function safeLink(value:unknown) {
  if(typeof value!=='string') return;
  try {const url=new URL(value);if(url.protocol==='https:'&&(['google.com','www.google.com','maps.google.com'].includes(url.hostname))) return url.href;}catch{/* omit */}
}
export function parseGooglePlaces(value:unknown,kind:'tourism'|'restaurant'|'cafe'):Recommendation[] {
  const root=value as {places?:Record<string,unknown>[]};
  if(!Array.isArray(root?.places)) return [];
  return root.places.flatMap(p=>{
    const point=p.location as {latitude?:number;longitude?:number}|undefined;
    const name=(p.displayName as {text?:string}|undefined)?.text;
    if(typeof p.id!=='string'||!/^[A-Za-z0-9_-]+$/.test(p.id)||!name||typeof point?.latitude!=='number'||typeof point.longitude!=='number'||!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude)||Math.abs(point.latitude)>90||Math.abs(point.longitude)>180) return [];
    const photo=(p.photos as {name?:string;authorAttributions?:{displayName?:string;uri?:string}[];googleMapsUri?:string}[]|undefined)?.[0];
    return [{
      id:p.id,name,address:typeof p.formattedAddress==='string'?p.formattedAddress:'',
      lat:point.latitude,lng:point.longitude,category:kind==='restaurant'?'맛집':kind==='cafe'?'카페':'관광',
      mapUrl:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(name)+'&query_place_id='+encodeURIComponent(p.id),
      rating:typeof p.rating==='number'&&p.rating>=0&&p.rating<=5?p.rating:undefined,
      ratingCount:typeof p.userRatingCount==='number'&&Number.isInteger(p.userRatingCount)&&p.userRatingCount>=0?p.userRatingCount:undefined,
      photo:photo?.name&&photoResource.test(photo.name)?{resource:photo.name,authors:(photo.authorAttributions??[]).map(a=>({name:a.displayName??'사진 제공자',url:safeLink(a.uri)})),url:safeLink(photo.googleMapsUri)}:undefined,
    } satisfies Recommendation];
  }).slice(0,20);
}
export async function googleFailure(response:Response) {
  // Google messages/metadata may contain identifiers. Return only an allowlisted reason and HTTP status.
  const body=await response.json().catch(()=>null) as {error?:{details?:{reason?:unknown}[]}}|null;
  const details=body?.error?.details;
  const providerCode=Array.isArray(details)?details.map(detail=>safeProviderReason(detail?.reason)).find(Boolean):undefined;
  return {reason:'google',providerStatus:response.status,...(providerCode?{providerCode}:{})};
}
export async function handleRecommendations(request:Request,env:RecommendationEnv,headers:Record<string,string>) {
  headers={...headers,'X-Horangnabi-Recommendations':'4'};
  const reply=(body:object,status=200)=>Response.json(body,{status,headers});
  if(!env.GOOGLE_PLACES_API_KEY?.trim()||!env.FIREBASE_PROJECT_ID||!env.RECOMMENDATION_BUDGET) return reply({reason:'setup'},503);
  const endpoint=new URL(request.url), photo=endpoint.pathname==='/recommendation-photo';
  const query=photo?undefined:recommendationQuery(endpoint);
  const resource=endpoint.searchParams.get('resource')??'';
  if(photo?!photoResource.test(resource)||resource.length>4000:!query) return reply({reason:'input'},400);
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')??'';
  if(!await verifyFirebaseToken(token,env.FIREBASE_PROJECT_ID)) return reply({reason:'auth'},401);
  let stage:'budget'|'google'='budget';
  try {
    const budget=env.RECOMMENDATION_BUDGET.get(env.RECOMMENDATION_BUDGET.idFromName('global-v1'));
    // Reserve BEFORE the external call, including failed requests. Never retry/refund automatically.
    const allowance=await budget.fetch(new Request('https://budget/'+(photo?'photo':'search'),{method:'POST'}));
    if(!allowance.ok) return reply({reason:allowance.status===429?'quota':'budget-unavailable'},allowance.status===429?429:503);
    stage='google';
    const key=env.GOOGLE_PLACES_API_KEY.trim(), signal=AbortSignal.timeout(10000);
    if(photo) {
      const url=new URL('https://places.googleapis.com/v1/'+resource+'/media');
      url.search=new URLSearchParams({maxWidthPx:'640',skipHttpRedirect:'true'}).toString();
      const response=await fetch(url,{headers:{'X-Goog-Api-Key':key},signal,redirect:'manual',cache:'no-store'});
      if(!response.ok) return reply(await googleFailure(response),response.status===429?429:502);
      const data=await response.json() as {photoUri?:string};
      const image=data.photoUri?new URL(data.photoUri):undefined;
      if(!image||image.protocol!=='https:'||!(image.hostname==='googleusercontent.com'||image.hostname.endsWith('.googleusercontent.com'))) return reply({reason:'photo'},502);
      const result=await fetch(image,{signal,redirect:'manual',cache:'no-store'});
      if(!result.ok||!result.headers.get('Content-Type')?.startsWith('image/')) {await result.body?.cancel();return reply({reason:'photo'},502);}
      return new Response(result.body,{headers:{...headers,'Content-Type':result.headers.get('Content-Type')!,'X-Content-Type-Options':'nosniff'}});
    }
    const response=await fetch('https://places.googleapis.com/v1/places:searchNearby',{
      // Workers rejects redirect:'error' before network I/O. Manual mode leaves 3xx
      // responses to the existing !ok check and never forwards our key to redirects.
      method:'POST',signal,redirect:'manual',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,
        'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.photos'},
      body:JSON.stringify({includedTypes:[query!.kind==='tourism'?'tourist_attraction':query!.kind],maxResultCount:20,rankPreference:'POPULARITY',languageCode:'ko',locationRestriction:{circle:{center:{latitude:query!.lat,longitude:query!.lng},radius:5000}}}),
    });
    if(!response.ok) return reply(await googleFailure(response),response.status===429?429:502);
    return reply({places:parseGooglePlaces(await response.json(),query!.kind)});
  } catch {return reply({reason:stage==='budget'?'budget-unavailable':'google-unavailable'},stage==='budget'?503:502);}
}
