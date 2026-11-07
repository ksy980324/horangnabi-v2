import type { Place } from '../types';
import { distanceKm, hasCoordinates, insideBounds, nearbyBounds, type GeoBounds, type GeoPoint } from './geo.ts';
import { resolveSearchQuery } from './searchQuery.ts';
import { localizePlace, textProperty } from './placeLocalization.ts';
export type SearchOptions = { area?: string; center?: GeoPoint; radiusKm?: number; bounds?: GeoBounds; countryCode?: string; cityOnly?: boolean; literalQuery?: boolean; waitForRateLimit?: boolean; signal?: AbortSignal };
export type SearchResult = Place & { resultId: string; typeLabel: string; distanceKm?: number; originalName?: string; originalAddress?: string; nameLocalized: boolean };
let lastRequest = 0;
let running = false;
const cache = new Map<string, SearchResult[]>();
const stationTags = new Set(['railway:station', 'railway:halt', 'public_transport:station', 'building:train_station']);
const labels: Record<string, string> = { aerodrome: '공항', terminal: '공항 터미널', restaurant: '음식점', fast_food: '간편식', cafe: '카페', hotel: '호텔', hostel: '호스텔', museum: '박물관', attraction: '관광 명소', castle: '성', station: '역', supermarket: '슈퍼마켓', convenience: '편의점', department_store: '백화점', mall: '쇼핑몰', park: '공원', city: '도시', bus_stop: '버스 정류장' };
export async function searchPlaces(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  options.signal?.throwIfAborted();
  const cleaned = query.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2) throw new Error('장소 이름을 두 글자 이상 입력해 주세요.');
  const center = options.center && hasCoordinates(options.center) ? options.center : undefined;
  const radius = options.radiusKm;
  if (radius !== undefined && (!center || !Number.isFinite(radius) || radius <= 0 || radius > 200)) throw new Error('검색 기준 위치와 반경을 확인해 주세요.');
  const bounds = options.bounds ?? (center && radius ? nearbyBounds(center, radius) : undefined);
  const resolved = resolveSearchQuery(cleaned);
  const stationQuery = options.literalQuery && /[가-힣]/.test(cleaned)
    && /(?:역|駅)$|\bstation$/i.test(cleaned) && !/\bbus\s+station$/i.test(cleaned);
  const params = new URLSearchParams({ q: [options.literalQuery ? cleaned : resolved.text, resolveSearchQuery(options.area ?? '').text].filter(Boolean).join(' '), limit: '12' });
  if (resolved.airport && !options.cityOnly) params.set('osm_tag', 'aeroway:aerodrome');
  const countryCode = options.countryCode?.toUpperCase();
  if (countryCode) params.set('countrycode', countryCode);
  if (options.cityOnly) { params.append('layer', 'city'); params.append('layer', 'locality'); }
  if (center) { params.set('lat', String(center.lat)); params.set('lon', String(center.lng)); params.set('zoom', '12'); params.set('location_bias_scale', '0.1'); }
  // Photon cannot represent a dateline-crossing box; enforce that box locally.
  if (bounds && bounds.west <= bounds.east) params.set('bbox', [bounds.west, bounds.south, bounds.east, bounds.north].join(','));
  const key = params.toString().toLocaleLowerCase() + JSON.stringify({ bounds, radius });
  if (cache.has(key)) return cache.get(key)!;
  const remaining = 2000 - (Date.now() - lastRequest);
  if (options.waitForRateLimit && !running && remaining > 0) {
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(new DOMException('검색을 취소했어요.', 'AbortError')); };
      const timer = setTimeout(() => { options.signal?.removeEventListener('abort', cancel); resolve(); }, remaining);
      options.signal?.addEventListener('abort', cancel, { once: true });
    });
    options.signal?.throwIfAborted();
  }
  if (running || Date.now() - lastRequest < 2000) throw new Error('잠시 기다린 후 검색해 주세요. 검색은 2초 간격으로 가능합니다.');
  running = true; lastRequest = Date.now();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error();
    const data = await response.json();
    options.signal?.throwIfAborted();
    if (!Array.isArray(data.features)) throw new Error();
    const seen = new Set<string>();
    const places: SearchResult[] = data.features.flatMap((feature: { properties?: Record<string, unknown>; geometry?: { coordinates?: number[] } }) => {
      const p = feature.properties ?? {}, [lng, lat] = feature.geometry?.coordinates ?? [];
      if (stationQuery && !options.cityOnly && !stationTags.has(`${textProperty(p, 'osm_key')}:${textProperty(p, 'osm_value')}`)) return [];
      if (countryCode && textProperty(p, 'countrycode').toUpperCase() !== countryCode) return [];
      if (options.cityOnly && !((textProperty(p, 'osm_key') === 'place' && ['city', 'town', 'village', 'hamlet', 'municipality', 'locality', 'suburb', 'island'].includes(textProperty(p, 'osm_value'))) || (textProperty(p, 'osm_key') === 'boundary' && textProperty(p, 'osm_value') === 'administrative' && textProperty(p, 'type') === 'city'))) return [];
      if (!hasCoordinates({ lat, lng })) return [];
      if (bounds && !insideBounds({ lat, lng }, bounds)) return [];
      const distance = center ? distanceKm(center, { lat, lng }) : undefined;
      if (radius && distance !== undefined && distance > radius) return [];
      const localized = localizePlace(p, cleaned);
      const { name } = localized;
      const resultId = `${name}:${lat.toFixed(5)}:${lng.toFixed(5)}`;
      if (seen.has(resultId)) return [];
      seen.add(resultId);
      const typeLabel = labels[textProperty(p, 'osm_value')] || ({ shop: '상점', tourism: '관광·숙박', railway: '철도 시설', amenity: '편의 시설', highway: '도로·교통' } as Record<string, string>)[textProperty(p, 'osm_key')] || '장소';
      return [{ ...localized, lat, lng, resultId, typeLabel, distanceKm: distance }];
    });
    // Preserve server relevance; the UI can sort nearby branches by distance.
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, places); return places;
  } catch {
    options.signal?.throwIfAborted();
    throw new Error('검색 서버에 연결하지 못했습니다. 잠시 후 다시 검색하거나 지도에서 위치를 선택해 주세요.');
  }
  finally { running = false; clearTimeout(timeout); options.signal?.removeEventListener('abort', cancel); }
}
