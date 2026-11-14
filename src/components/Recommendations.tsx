import { useState } from 'react';
import { Modal } from './Modal';
import { datesBetween } from '../data';
import type { Category, Trip } from '../types';
import { rankRecommendations, type Recommendation } from '../services/recommendations';

export function Recommendations({trip,initialDate,busy,status,onClose,onAdd}:{trip:Trip;initialDate:string;busy:boolean;status:string;onClose:()=>void;onAdd:(place:Recommendation,date?:string)=>Promise<boolean>}) {
  const [date,setDate]=useState(initialDate), [preference,setPreference]=useState<Category|''>('');
  const [message,setMessage]=useState('');
  const dates=datesBetween(trip.start,trip.end), target=dates.includes(date)?date:dates[0];
  const ranked=rankRecommendations(trip,target,preference);
  async function add(place:Recommendation,toDay:boolean) { setMessage(''); if(await onAdd(place,toDay?target:undefined)) setMessage(`${place.name}을 ${toDay?'일정':'보관함'}에 추가했어요.`); }
  return <Modal title="어디를 더 가볼까요?" busy={busy} onClose={onClose}>
    <div className="recommendations">
      <p className="muted">요나고·오사카의 첫 추천 목록이에요. 관심 분류와 선택한 날 마지막 장소까지의 거리로 정렬하며, 이미 담은 장소는 제외해요. 실시간 평점 순위는 아니에요.</p>
      <div className="form-row"><label>추천 기준 날짜<select value={target} disabled={busy} onChange={e=>setDate(e.target.value)}>{dates.map((value,i)=><option key={value} value={value}>{i+1}일차 · {value}</option>)}</select></label><label>관심 분류<select value={preference} disabled={busy} onChange={e=>setPreference(e.target.value as Category|'')}><option value="">전체</option><option value="관광">관광</option><option value="맛집">먹거리</option></select></label></div>
      <p role="status">{status || message}</p>
      {ranked.length ? <ol>{ranked.map(({place,reason},index)=><li key={place.id}><span className="badge">추천 {index+1} · {place.category}</span><h3>{place.name}</h3><small className="muted">{place.localName}</small><p>{place.description}</p><p className="recommendation-reason">{reason}</p><a href={place.source} target="_blank" rel="noopener noreferrer">관광 안내 확인</a><div className="recommendation-actions"><button className="secondary" disabled={busy} onClick={()=>void add(place,false)}>보관함에 저장</button><button className="primary" disabled={busy || !target} onClick={()=>void add(place,true)}>선택한 날에 추가</button></div></li>)}</ol> : <p className="empty">아직 이 여행의 추천 목록이 없거나, 준비된 장소를 모두 담았어요. 일정 추가의 장소 검색은 그대로 사용할 수 있어요.</p>}
      <small className="muted">위치·거리는 지역 대표 지점 기준의 근사치입니다. 방문 전 공식 안내에서 운영 정보를 확인해 주세요. 목록 확인: 2026.11.14</small>
    </div>
  </Modal>;
}
