import type { Recommendation } from './recommendations';
import { recommendationErrorMessage } from './recommendationErrors';
export type RecommendationKind = 'tourism' | 'restaurant' | 'cafe';
export function recommendationsEndpoint() {
  const value = import.meta.env?.VITE_MAPS_LINK_RESOLVER_URL?.trim();
  if (!value) throw new Error('추천 서버가 아직 연결되지 않았어요. 설정 안내를 확인해 주세요.');
  const url = new URL(value); url.pathname = '/recommendations'; url.search = ''; url.hash = '';
  return url;
}
async function authorizedFetch(url: URL, signal: AbortSignal) {
  const { auth } = await import('./firebaseClient');
  if (!auth?.currentUser) throw new Error('Google 로그인 후 공유 여행에서 추천을 이용해 주세요.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(url, { headers: { Authorization: 'Bearer '+token }, signal, cache:'no-store' });
  if (!response.ok) throw new Error(recommendationErrorMessage(response.status,await response.json().catch(()=>null)));
  return response;
}
export async function searchGoogleRecommendations(point: {lat:number;lng:number}, kind: RecommendationKind, signal: AbortSignal): Promise<Recommendation[]> {
  const url = recommendationsEndpoint();
  url.search = new URLSearchParams({ lat:String(point.lat), lng:String(point.lng), kind }).toString();
  const response = await authorizedFetch(url, AbortSignal.any([signal,AbortSignal.timeout(15000)]));
  return (await response.json() as {places:Recommendation[]}).places;
}
export async function loadRecommendationPhoto(resource: string, signal: AbortSignal) {
  const url = recommendationsEndpoint(); url.pathname = '/recommendation-photo';
  url.searchParams.set('resource',resource);
  const response = await authorizedFetch(url, AbortSignal.any([signal,AbortSignal.timeout(15000)]));
  if (!response.headers.get('Content-Type')?.startsWith('image/')) throw new Error('사진을 불러오지 못했어요.');
  return URL.createObjectURL(await response.blob());
}
