import type { Recommendation } from './recommendations';
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
  if (response.status === 429) throw new Error('무료 운영을 위한 오늘 또는 이번 달 조회 한도에 도달했어요. 일정 편집은 계속할 수 있어요.');
  if (response.status === 503 || response.status === 404) throw new Error('추천 서버 설정이 필요해요. Places API 키와 서버 배포를 확인해 주세요.');
  if (response.status === 401) throw new Error('로그인이 만료되었어요. 다시 로그인해 주세요.');
  if (!response.ok) throw new Error('Google 장소를 조회하지 못했어요. API 활성화·키 제한을 확인하거나 잠시 후 다시 시도해 주세요.');
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
