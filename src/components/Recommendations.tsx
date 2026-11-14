import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { datesBetween } from '../data';
import type { Trip } from '../types';
import { alreadyIncluded, recommendationAnchor, type Recommendation } from '../services/recommendations';
import { loadRecommendationPhoto, searchGoogleRecommendations, type RecommendationKind } from '../services/googleRecommendations';

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
  const [date,setDate]=useState(initialDate), [kind,setKind]=useState<RecommendationKind>('tourism');
  const [places,setPlaces]=useState<Recommendation[]>([]), [message,setMessage]=useState(''), [loading,setLoading]=useState(false), [queried,setQueried]=useState(false);
  const controller=useRef<AbortController|null>(null), pending=useRef(false), lastSearch=useRef(0);
  const dates=datesBetween(trip.start,trip.end), target=dates.includes(date)?date:dates[0];
  const anchor=recommendationAnchor(trip,target), visible=places.filter(place=>!alreadyIncluded(trip,place));
  useEffect(()=>()=>controller.current?.abort(),[]);
  function reset() {controller.current?.abort();setPlaces([]);setMessage('');setQueried(false);}
  async function search() {
    if(pending.current || !anchor || anchor.lat===undefined || anchor.lng===undefined) return;
    if(Date.now()-lastSearch.current<2000) {setMessage('조회는 2초 간격으로 할 수 있어요. 잠시 후 다시 눌러 주세요.');return;}
    lastSearch.current=Date.now();
    pending.current=true; controller.current?.abort(); const request=new AbortController();controller.current=request;
    setLoading(true);setMessage('');setPlaces([]);setQueried(false);
    const timer=setTimeout(()=>request.abort(),15000);
    try {const found=await searchGoogleRecommendations({lat:anchor.lat,lng:anchor.lng},kind,request.signal);if(!request.signal.aborted){setPlaces(found);setQueried(true);}}
    catch(error){if(controller.current===request) setMessage(request.signal.aborted?'조회 시간이 초과됐어요. 다시 시도해 주세요.':error instanceof Error?error.message:'추천을 불러오지 못했어요.');}
    finally {clearTimeout(timer);pending.current=false;if(controller.current===request) setLoading(false);}
  }
  async function add(place:Recommendation,toDay:boolean) {setMessage('');if(await onAdd(place,toDay?target:undefined)) setMessage(place.name+'을 '+(toDay?'일정':'보관함')+'에 추가했어요.');}
  return <Modal title="어디를 더 가볼까요?" busy={busy} onClose={onClose}>
    <div className="recommendations">
      <p className="muted">선택한 날의 마지막 장소 또는 여행 도시 주변 5km에서 Google 인기도순으로 찾아요.</p>
      <div className="form-row"><label>추천 기준 날짜<select value={target} disabled={busy||loading} onChange={e=>{setDate(e.target.value);reset();}}>{dates.map((value,i)=><option key={value} value={value}>{i+1}일차 · {value}</option>)}</select></label><label>어떤 곳을 찾을까요?<select value={kind} disabled={busy||loading} onChange={e=>{setKind(e.target.value as RecommendationKind);reset();}}><option value="tourism">관광지</option><option value="restaurant">맛집</option><option value="cafe">카페</option></select></label></div>
      <button className="primary" disabled={busy||loading||!anchor} onClick={()=>void search()}>{loading?'장소를 찾고 있어요…':'주변 추천 찾기'}</button>
      {!anchor&&<p className="empty">여행 수정에서 도시 위치를 선택하거나, 위치가 있는 일정을 먼저 추가해 주세요.</p>}
      <p role="status">{status||message}</p>
      {visible.length>0&&<><p className="google-attribution">Google Maps</p><ol>{visible.map((place,index)=><li key={place.id}>
        <RecommendationPhoto photo={place.photo} name={place.name}/><span className="badge">추천 {index+1} · {place.category}</span><h3>{place.name}</h3>
        <p className="recommendation-reason">{place.rating!==undefined?'★ '+place.rating.toFixed(1)+' · 리뷰 '+(place.ratingCount??0).toLocaleString()+'개':'평점 정보 없음'} · Google 인기도순</p><p className="muted">{place.address}</p>
        <a href={place.mapUrl} target="_blank" rel="noopener noreferrer">Google 지도에서 확인</a><div className="recommendation-actions"><button className="secondary" disabled={busy||loading} onClick={()=>void add(place,false)}>보관함에 저장</button><button className="primary" disabled={busy||loading||!target} onClick={()=>void add(place,true)}>선택한 날에 추가</button></div>
      </li>)}</ol></>}
      {queried&&!visible.length&&<p className="empty">주변 추천 결과가 없거나 이미 담은 장소예요. 다른 분류나 날짜로 찾아보세요.</p>}
      <small className="muted">무료 운영을 위해 조회 횟수를 제한해요. 한도에 도달하면 추천·사진 조회만 쉬어가며 일정 편집은 계속할 수 있어요.</small>
      <a href={import.meta.env.BASE_URL+'places-terms.html'} target="_blank" rel="noopener noreferrer">추천 이용 안내·개인정보 처리</a>
    </div>
  </Modal>;
}
