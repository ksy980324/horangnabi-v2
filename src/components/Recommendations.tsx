import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal';
import { TravelMap } from './TravelMap';
import { datesBetween } from '../data';
import type { Trip } from '../types';
import { alreadyIncluded, recommendationAnchor, recommendationSearchDate, recommendationPage, type Recommendation } from '../services/recommendations';
import { loadRecommendationPhoto, searchGoogleRecommendations, type RecommendationKind } from '../services/googleRecommendations';
import { translateRecommendationNames } from '../services/translateRecommendationNames';
const mapConfigured=Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim());

function RecommendationPhoto({photo,name}:{photo:Recommendation['photo'];name:string}) {
  const ref=useRef<HTMLElement>(null);
  const [url,setUrl]=useState(''), [error,setError]=useState('');
  useEffect(()=>{
    if (!photo) return;
    const controller=new AbortController(); let objectUrl=''; let started=false;
    const load=()=>{ if(started) return; started=true; void loadRecommendationPhoto(photo.resource,controller.signal).then(value=>{if(controller.signal.aborted) URL.revokeObjectURL(value); else {objectUrl=value;setUrl(value);}}).catch(()=>{if(!controller.signal.aborted) setError('사진을 불러올 수 없어요. 사진 조회 한도에 도달했을 수 있어요.');}); };
    const observer=typeof IntersectionObserver==='undefined'?undefined:new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)) {load();observer?.disconnect();}}, {rootMargin:'100px'});
    if(observer && ref.current) observer.observe(ref.current); else load();
    return ()=>{controller.abort();observer?.disconnect();if(objectUrl) URL.revokeObjectURL(objectUrl);};
  },[photo]);
  return <figure ref={ref} className="recommendation-photo">{url?<><img src={url} alt={name}/><figcaption>{photo?.authors.map((author,index)=>author.url?<a key={index} href={author.url} target="_blank" rel="noopener noreferrer">{author.name}</a>:<span key={index}>{author.name}</span>)}{photo?.url&&<a href={photo.url} target="_blank" rel="noopener noreferrer">Google 지도에서 사진 보기</a>}</figcaption></>:<div className="recommendation-photo-placeholder">{error || (photo?'사진을 불러오는 중이에요.':'등록된 사진이 없어요.')}</div>}</figure>;
}

export function Recommendations({trip,initialDate,busy,status,onClose,onAdd}:{trip:Trip;initialDate:string;busy:boolean;status:string;onClose:()=>void;onAdd:(place:Recommendation,date?:string)=>Promise<boolean>}) {
  const [kind,setKind]=useState<RecommendationKind>('tourism');
  const [names,setNames]=useState<Record<string,string>>({});
  const namesRef=useRef(names);namesRef.current=names;
  const [places,setPlaces]=useState<Recommendation[]>([]), [message,setMessage]=useState(''), [loading,setLoading]=useState(false), [queried,setQueried]=useState(false);
  const [pageIndex,setPageIndex]=useState(0), [visited,setVisited]=useState([0]), [selected,setSelected]=useState<string>(), [queryVersion,setQueryVersion]=useState(0);
  const initialAnchor=recommendationAnchor(trip,recommendationSearchDate());
  const [center,setCenter]=useState(initialAnchor?.lat!==undefined&&initialAnchor.lng!==undefined?{lat:initialAnchor.lat,lng:initialAnchor.lng}:undefined);
  const mapRef=useRef<HTMLDivElement>(null), cards=useRef(new Map<string,HTMLLIElement>());
  const controller=useRef<AbortController|null>(null), pending=useRef(false), lastSearch=useRef(0);
  const dates=datesBetween(trip.start,trip.end), target=dates.includes(initialDate)?initialDate:dates[0];
  const page=useMemo(()=>recommendationPage(places,pageIndex),[places,pageIndex]);
  const pageKey=queryVersion+':'+page.items.map(place=>place.id).join(',');
  const points=useMemo(()=>page.items.map((place,index)=>({...place,name:names[place.id]??place.name,number:page.start+index+1})),[page,names]);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{
    const translation=new AbortController();
    void translateRecommendationNames(page.items.filter(place=>!namesRef.current[place.id]),translation.signal,(id,name)=>{
      if(!translation.signal.aborted) setNames(previous=>({...previous,[id]:name}));
    });
    return ()=>translation.abort();
    // The page identity owns this translation job; translated titles must not restart it.
  },[pageKey]);
  function reset() {controller.current?.abort();setPlaces([]);setNames({});setSelected(undefined);setPageIndex(0);setVisited([0]);setMessage('');setQueried(false);}
  async function search() {
    const anchor=recommendationAnchor(trip,recommendationSearchDate());
    if(pending.current || !anchor || anchor.lat===undefined || anchor.lng===undefined) return;
    if(Date.now()-lastSearch.current<2000) {setMessage('조회는 2초 간격으로 할 수 있어요. 잠시 후 다시 눌러 주세요.');return;}
    lastSearch.current=Date.now();
    pending.current=true;controller.current?.abort();const request=new AbortController();controller.current=request;
    setLoading(true);setMessage('');setPlaces([]);setNames({});setPageIndex(0);setVisited([0]);setSelected(undefined);setQueried(false);
    setCenter({lat:anchor.lat,lng:anchor.lng});
    const timer=setTimeout(()=>request.abort(),15000);
    try {
      const found=await searchGoogleRecommendations({lat:anchor.lat,lng:anchor.lng},kind,request.signal);
      if(!request.signal.aborted) {setPlaces(found.filter(place=>!alreadyIncluded(trip,place)));setQueryVersion(value=>value+1);setQueried(true);}
    } catch(error) {
      if(controller.current===request) setMessage(request.signal.aborted?'조회 시간이 초과됐어요. 다시 시도해 주세요.':error instanceof Error?error.message:'추천을 불러오지 못했어요.');
    } finally {clearTimeout(timer);pending.current=false;if(controller.current===request) setLoading(false);}
  }
  function goToPage(index:number) {
    const next=recommendationPage(places,index).index;
    setPageIndex(next);setVisited(previous=>previous.includes(next)?previous:[...previous,next]);setSelected(undefined);
    mapRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function add(place:Recommendation,toDay:boolean) {
    const chosen={...place,name:names[place.id]??place.name};setMessage('');
    if(await onAdd(chosen,toDay?target:undefined)) setMessage(chosen.name+'을 '+(toDay?'일정':'보관함')+'에 추가했어요.');
  }
  return <Modal title="어디를 더 가볼까요?" busy={busy} onClose={onClose}>
    <div className="recommendations">
      <div ref={mapRef} className="recommendation-map">
        {center&&mapConfigured?<TravelMap points={points} selected={selected} initialCenter={center} fitKey={queryVersion+':'+page.index} onSelect={id=>{setSelected(id);cards.current.get(id)?.scrollIntoView({behavior:'smooth',block:'nearest'});}}/>:<p className="empty">{!center?'여행 도시 위치를 먼저 선택해 주세요.':'Google 지도 설정 후 추천 위치를 볼 수 있어요.'}</p>}
      </div>
      <p className="muted">오늘 일정의 마지막 장소 또는 여행 도시 주변 5km에서 Google 인기도순으로 찾아요.</p>
      <label>어떤 곳을 찾을까요?<select value={kind} disabled={busy||loading} onChange={e=>{setKind(e.target.value as RecommendationKind);reset();}}><option value="tourism">관광지</option><option value="restaurant">맛집</option><option value="cafe">카페</option></select></label>
      <button className="primary" disabled={busy||loading||initialAnchor?.lat===undefined||initialAnchor.lng===undefined} onClick={()=>void search()}>{loading?'장소를 찾고 있어요…':'주변 추천 찾기'}</button>
      <p role="status">{status||message}</p>
      {places.length>0&&<><p className="google-attribution">Google Maps</p>{visited.map(index=>{
        const shown=recommendationPage(places,index);
        return <section key={index} className="recommendation-page" hidden={shown.index!==page.index}><ol>{shown.items.map((place,i)=>{
          const included=alreadyIncluded(trip,place), title=names[place.id]??place.name;
          return <li key={place.id} className={selected===place.id?'selected':''} ref={node=>{if(node) cards.current.set(place.id,node);else cards.current.delete(place.id);}}>
            <RecommendationPhoto photo={place.photo} name={title}/><span className="badge">추천 {shown.start+i+1} · {place.category}</span>
            <h3><button className="recommendation-title" aria-label={title+' 지도에서 위치 보기'} onClick={()=>{setSelected(place.id);mapRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});}}>{title}</button></h3>
            {names[place.id]&&names[place.id]!==place.name&&<small className="muted">{place.name} · 자동 번역</small>}
            <p className="recommendation-reason">{place.rating!==undefined?'★ '+place.rating.toFixed(1)+' · 리뷰 '+(place.ratingCount??0).toLocaleString()+'개':'평점 정보 없음'} · Google 인기도순</p>
            <a href={place.mapUrl} target="_blank" rel="noopener noreferrer">Google 지도에서 확인</a>
            {included?<p className="recommendation-reason">일정 또는 보관함에 추가했어요.</p>:<div className="recommendation-actions"><button className="secondary" disabled={busy||loading} onClick={()=>void add(place,false)}>보관함에 저장</button><button className="primary" disabled={busy||loading||!target} onClick={()=>void add(place,true)}>{target?.slice(5).replace('-','.')} 일정에 추가</button></div>}
          </li>;
        })}</ol></section>;
      })}
      {page.count>1&&<nav className="recommendation-pagination" aria-label="추천 결과 페이지"><button className="secondary" disabled={busy||loading||page.index===0} onClick={()=>goToPage(page.index-1)}>이전</button><span aria-live="polite">{page.index+1} / {page.count}</span><button className="secondary" disabled={busy||loading||page.index===page.count-1} onClick={()=>goToPage(page.index+1)}>{page.index===page.count-1?'다음':'다음 '+Math.min(6,places.length-(page.index+1)*6)+'곳'}</button></nav>}
      </>}
      {queried&&!places.length&&<p className="empty">주변 추천 결과가 없거나 이미 담은 장소예요. 다른 분류로 찾아보세요.</p>}
      {queried&&places.length>0&&<small className="muted">이번 조회에서 최대 20곳까지 찾아요. 다른 장소를 찾으려면 분류를 바꿔보세요.</small>}
      <small className="muted">무료 운영을 위해 조회 횟수를 제한해요. 한도에 도달하면 추천·사진 조회만 쉬어가며 일정 편집은 계속할 수 있어요.</small>
      <a href={import.meta.env.BASE_URL+'places-terms.html'} target="_blank" rel="noopener noreferrer">추천 이용 안내·개인정보 처리</a>
    </div>
  </Modal>;
}
