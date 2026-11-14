import { uid } from '../data';
import type { Category, Trip } from '../types';
import { hasCoordinates } from './geo';

export type Recommendation = {
  id: string; name: string; address: string; category: Category; lat: number; lng: number;
  mapUrl: string; rating?: number; ratingCount?: number;
  photo?: { resource: string; authors: { name: string; url?: string }[]; url?: string };
};
export function recommendationSearchDate(now=new Date()) {
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
}
export function recommendationAnchor(trip: Trip, date: string) {
  return trip.stops.filter(s => s.date === date && hasCoordinates(s)).at(-1)
    ?? (trip.destination && hasCoordinates(trip.destination) ? trip.destination : trip.stops.find(hasCoordinates));
}
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\s·・()_-]/g, '');
export function alreadyIncluded(trip: Trip, place: Recommendation) {
  return [...trip.stops, ...(trip.savedPlaces ?? [])].some(item =>
    normalize(item.name) === normalize(place.name) || item.mapUrl === place.mapUrl || samePlaceId(item.mapUrl,place.id));
}
function samePlaceId(url:string|undefined,id:string) {
  try {const parsed=new URL(url??'');return /^(www\.)?google\.com$/.test(parsed.hostname)&&parsed.searchParams.get('query_place_id')===id;} catch {return false;}
}
export function addRecommendation(trip: Trip, place: Recommendation, date?: string): Trip {
  if (!place.name.trim() || !hasCoordinates(place) || !/^https:\/\/(www\.)?google\.com\/maps[/?]/.test(place.mapUrl)) throw new Error('장소 정보를 다시 조회해 주세요.');
  if (alreadyIncluded(trip, place)) throw new Error('이미 일정이나 보관함에 있는 장소예요.');
  if (date && (date < trip.start || date > trip.end || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10) !== date)) throw new Error('여행 기간 안의 날짜를 선택해 주세요.');
  // Never persist Google photos, ratings or response payloads.
  const saved = { id: uid(), name: place.name, address: place.address, lat: place.lat, lng: place.lng, category: place.category, mapUrl: place.mapUrl, memo: '' };
  return date ? {...trip, stops:[...trip.stops,{...saved,date,time:''}]} : {...trip, savedPlaces:[...(trip.savedPlaces??[]),saved]};
}
