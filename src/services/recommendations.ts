import { uid } from '../data';
import type { Category, Trip } from '../types';

type City = 'yonago' | 'osaka';
export type Recommendation = { id: string; city: City; name: string; localName: string; aliases: string[]; category: Category; description: string; lat: number; lng: number; source: string };
const yonagoSource = 'https://www.yonago-navi.jp/';
const osakaSource = 'https://osaka-info.jp/experience/ja/osaka/spot';
export const recommendationCatalog: Recommendation[] = [
  { id:'yonago-castle',city:'yonago',name:'요나고성 터',localName:'米子城跡',aliases:['요나고성','요나고성터','Yonago Castle'],category:'관광',description:'성터에 올라 요나고 시내와 나카우미를 둘러보는 전망 산책. 오르막이 있어 편한 신발을 준비해 주세요.',lat:35.4237,lng:133.3265,source:yonagoSource+'yonago/shitamachi/sightseeing/yonago-castle-trace/' },
  { id:'kaike-onsen',city:'yonago',name:'가이케 온천 거리',localName:'皆生温泉',aliases:['가이케온천','카이케온천','Kaike Onsen'],category:'관광',description:'온천 숙박 전후로 바닷가와 함께 둘러보기 좋은 온천 지역입니다.',lat:35.4575,lng:133.3602,source:yonagoSource+'yonago/kaike/sightseeing/kaikeonsen' },
  { id:'kaike-beach',city:'yonago',name:'가이케 해변',localName:'皆生温泉海遊ビーチ',aliases:['가이케해변','Kaike Beach'],category:'관광',description:'온천 거리 앞 바다를 따라 가볍게 산책할 수 있어요. 해수욕 운영은 계절별로 확인해 주세요.',lat:35.4600,lng:133.3610,source:yonagoSource+'yonago/kaike/experience-culture/beach-kaike' },
  { id:'osaka-castle',city:'osaka',name:'오사카성',localName:'大阪城',aliases:['Osaka Castle','오사카성천수각'],category:'관광',description:'성 주변 공원 산책과 역사 명소를 함께 둘러보기 좋은 장소입니다.',lat:34.6873,lng:135.5262,source:osakaSource },
  { id:'dotonbori',city:'osaka',name:'도톤보리',localName:'道頓堀',aliases:['Dotonbori'],category:'관광',description:'강변 산책과 큰 간판, 오사카의 번화한 거리 풍경을 함께 즐기는 지역입니다.',lat:34.6687,lng:135.5013,source:'https://www.osaka-info.jp/spot/dotonbori/' },
  { id:'kuromon',city:'osaka',name:'구로몬 시장',localName:'黒門市場',aliases:['쿠로몬시장','Kuromon Market'],category:'맛집',description:'여러 먹거리를 비교하며 둘러보는 시장입니다. 특정 식당의 평점 추천은 아니에요.',lat:34.6653,lng:135.5062,source:'https://osaka-info.jp/experience/ja/osaka/spot/208' },
  { id:'shinsekai',city:'osaka',name:'신세카이',localName:'新世界',aliases:['Shinsekai'],category:'관광',description:'쓰텐카쿠 주변의 거리 풍경과 먹거리를 함께 둘러보는 지역입니다.',lat:34.6520,lng:135.5063,source:osakaSource },
];
const normalize = (name: string) => name.normalize('NFKC').toLowerCase().replace(/[\s·・()_-]/g,'');
function cityOf(trip: Trip): City | undefined {
  if (trip.destination && trip.destination.countryCode !== 'JP') return;
  const name = normalize(trip.destination?.cityName ?? trip.region);
  if (/요나고|米子|yonago/.test(name)) return 'yonago';
  if (/오사카|大阪|osaka/.test(name)) return 'osaka';
}
export function alreadyIncluded(trip: Trip, place: Recommendation) {
  const names = [place.name,place.localName,...place.aliases].map(normalize);
  return [...trip.stops,...(trip.savedPlaces ?? [])].some(item => names.includes(normalize(item.name)) || item.mapUrl === mapLink(place));
}
function mapLink(place: Recommendation) { return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(place.localName+' Japan'); }
function distance(a: {lat:number;lng:number}, b:{lat:number;lng:number}) {
  const rad = Math.PI / 180;
  const d = Math.sin((b.lat-a.lat)*rad/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lng-a.lng)*rad/2)**2;
  return 6371*2*Math.asin(Math.sqrt(Math.min(1,d)));
}
export function rankRecommendations(trip: Trip, date: string, preference: Category | '') {
  const day = trip.stops.filter(stop => stop.date === date && stop.lat !== undefined && stop.lng !== undefined);
  const center = day.at(-1) ?? trip.destination;
  const anchor = center?.lat !== undefined && center.lng !== undefined ? {lat:center.lat,lng:center.lng} : undefined;
  return recommendationCatalog.filter(place => place.city === cityOf(trip) && !alreadyIncluded(trip,place)).map((place,index) => {
    const km = anchor ? distance(anchor,place) : undefined;
    const preferred = !!preference && place.category === preference;
    return {place,km,score:(preferred?30:0)+(km===undefined?0:30/(1+km))+1/(index+1),reason:[preferred?'선택한 관심 분류':undefined,km!==undefined?`${day.length?'선택한 날 마지막 장소':'여행 도시'}에서 직선 ${km.toFixed(1)}km`:'도시별 기본 추천'].filter(Boolean).join(' · ')};
  }).sort((a,b)=>b.score-a.score || a.place.id.localeCompare(b.place.id));
}
export function addRecommendation(trip: Trip, place: Recommendation, date?: string): Trip {
  if (place.city !== cityOf(trip)) throw new Error('이 여행의 추천 장소가 아니에요.');
  if (alreadyIncluded(trip,place)) throw new Error('이미 일정이나 보관함에 있는 장소예요.');
  if (date && (date < trip.start || date > trip.end || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)) throw new Error('여행 기간 안의 날짜를 선택해 주세요.');
  const saved = {id:uid(),name:place.name,address:place.localName,lat:place.lat,lng:place.lng,category:place.category,mapUrl:mapLink(place),memo:place.description+'\n지역 대표 지점입니다. 방문 전 위치와 운영 정보를 확인해 주세요.\n안내: '+place.source};
  return date ? {...trip,stops:[...trip.stops,{...saved,date,time:''}]} : {...trip,savedPlaces:[...(trip.savedPlaces??[]),saved]};
}
