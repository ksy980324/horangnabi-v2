import type { Recommendation } from './recommendations';

function sourceLanguage(name:string) {
  if(/[\u0e00-\u0e7f]/.test(name)) return 'th';
  if(/[\u3040-\u30ff]/.test(name)) return 'ja';
  if(/[\u4e00-\u9fff]/.test(name)) return 'zh';
  if(/[\u0400-\u04ff]/.test(name)) return 'ru';
  if(/[\u0600-\u06ff]/.test(name)) return 'ar';
  return 'en';
}
function pause(signal:AbortSignal) {
  return new Promise<void>(resolve=>{
    const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};
    const timer=setTimeout(done,300);signal.addEventListener('abort',done,{once:true});
    if(signal.aborted) done();
  });
}

/** Translate only this explicitly requested result list. No permanent cache or extra Google calls. */
export async function translateRecommendationNames(places:Recommendation[],signal:AbortSignal,onName:(id:string,name:string)=>void):Promise<void> {
  const batch=AbortSignal.any([signal,AbortSignal.timeout(15000)]);
  const translated=new Map<string,string>();
  for(const place of places.slice(0,6)) {
    if(batch.aborted) return;
    const text=place.name.trim();
    if(!text||/[가-힣]/.test(text)||new TextEncoder().encode(text).length>500) continue;
    const language=sourceLanguage(text), cacheKey=language+'|'+text;
    const cached=translated.get(cacheKey);
    if(cached) {onName(place.id,cached);continue;}
    try {
      const url=new URL('https://api.mymemory.translated.net/get');
      url.search=new URLSearchParams({q:text,langpair:language+'|ko'}).toString();
      const response=await fetch(url,{signal:AbortSignal.any([batch,AbortSignal.timeout(5000)]),cache:'no-store'});
      if(!response.ok) return;
      const data=await response.json() as {responseStatus?:number;quotaFinished?:boolean;responseData?:{translatedText?:string}};
      if(batch.aborted||data.responseStatus!==200||data.quotaFinished) return;
      const entities:Record<string,string>={'&amp;':'&','&quot;':'"','&#39;':"'",'&apos;':"'",'&lt;':'<','&gt;':'>'};
      const name=data.responseData?.translatedText?.replace(/&(?:amp|quot|#39|apos|lt|gt);/g,entity=>entities[entity]).normalize('NFKC').trim();
      if(name&&name.length<=200&&/[가-힣]/.test(name)) {translated.set(cacheKey,name);onName(place.id,name);}
    } catch {return;} // Keep all results usable if translation is unavailable or its free quota is exhausted.
    await pause(batch);
  }
}
