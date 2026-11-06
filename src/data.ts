import { categories, type Database, type Trip } from './types.ts';
import { isGoogleMapsLink } from './services/googleMapsLink.ts';
import { isPhotoUrl } from './services/photoUrl.ts';
export const STORAGE_KEY = 'horangnabi-v2:data';
export function uid(): string {
  // LAN HTTP pages lack randomUUID; getRandomValues also works there.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function datesBetween(start: string, end: string): string[] {
  const a = Date.parse(start + 'T00:00:00Z'), b = Date.parse(end + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a || b - a > 365 * 86400000) return [];
  return Array.from({ length: Math.round((b - a) / 86400000) + 1 }, (_, i) => new Date(a + i * 86400000).toISOString().slice(0, 10));
}
export function moveStop(trip: Trip, date: string, id: string, direction: number): Trip {
  const stops = [...trip.stops];
  const indices = stops.flatMap((s, i) => s.date === date ? [i] : []);
  const index = indices.findIndex(i => stops[i].id === id), target = index + direction;
  if (index < 0 || target < 0 || target >= indices.length) return trip;
  [stops[indices[index]], stops[indices[target]]] = [stops[indices[target]], stops[indices[index]]];
  return { ...trip, stops };
}
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
export function parseDatabase(value: unknown): Database {
  const fail = () => { throw new Error('올바른 호랑나비 백업 파일이 아닙니다.'); };
  if (!value || typeof value !== 'object') return fail();
  const db = value as Database;
  if (db.version !== 1 || !Array.isArray(db.trips) || db.trips.length > 1000) return fail();
  const tripIds = new Set<string>();
  for (const t of db.trips) {
    if (!t || typeof t.id !== 'string' || tripIds.has(t.id) || typeof t.name !== 'string' || !t.name.trim() || typeof t.region !== 'string' || !isDate(t.start) || !isDate(t.end) || !datesBetween(t.start, t.end).length || !Array.isArray(t.stops)) return fail();
    tripIds.add(t.id);
    if (t.packingItems !== undefined) {
      if (!Array.isArray(t.packingItems)) return fail();
      const packingIds = new Set<string>();
      for (const item of t.packingItems) {
        if (!item || typeof item.id !== 'string' || !item.id.trim() || packingIds.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || typeof item.completed !== 'boolean') return fail();
        if (item.completedBy !== undefined && (!Array.isArray(item.completedBy) || item.completedBy.length > 2 || new Set(item.completedBy).size !== item.completedBy.length || item.completedBy.some(id => typeof id !== 'string' || !id.trim()))) return fail();
        packingIds.add(item.id);
      }
    }
    if (t.destination !== undefined) {
      const d = t.destination;
      if (!d || typeof d !== 'object' || typeof d.countryCode !== 'string' || !/^[A-Z]{2}$/.test(d.countryCode) || typeof d.cityName !== 'string' || !d.cityName.trim()) return fail();
      if ((d.lat === undefined) !== (d.lng === undefined)) return fail();
      if (d.lat !== undefined && (!Number.isFinite(d.lat) || Math.abs(d.lat) > 90 || !Number.isFinite(d.lng) || Math.abs(d.lng!) > 180)) return fail();
    }
    const ids = new Set<string>();
    if (t.savedPlaces !== undefined) {
      if (!Array.isArray(t.savedPlaces)) return fail();
      for (const p of t.savedPlaces) {
        if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || typeof p.address !== 'string' || !categories.includes(p.category) || typeof p.memo !== 'string') return fail();
        if (p.mapUrl !== undefined && !isGoogleMapsLink(p.mapUrl)) return fail();
        if (p.photoUrl !== undefined && !isPhotoUrl(p.photoUrl)) return fail();
        if ((p.lat === undefined) !== (p.lng === undefined)) return fail();
        if (p.lat !== undefined && (!Number.isFinite(p.lat) || Math.abs(p.lat) > 90 || !Number.isFinite(p.lng) || Math.abs(p.lng!) > 180)) return fail();
        ids.add(p.id);
      }
    }
    for (const s of t.stops) {
      if (!s || typeof s.id !== 'string' || ids.has(s.id) || typeof s.name !== 'string' || !s.name.trim() || typeof s.address !== 'string' || !isDate(s.date) || s.date < t.start || s.date > t.end || typeof s.time !== 'string' || (s.time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) || !categories.includes(s.category) || typeof s.memo !== 'string') return fail();
      if (s.mapUrl !== undefined && !isGoogleMapsLink(s.mapUrl)) return fail();
      if (s.photoUrl !== undefined && !isPhotoUrl(s.photoUrl)) return fail();
      if ((s.lat === undefined) !== (s.lng === undefined)) return fail();
      if (s.lat !== undefined && (!Number.isFinite(s.lat) || Math.abs(s.lat) > 90 || !Number.isFinite(s.lng) || Math.abs(s.lng!) > 180)) return fail();
      ids.add(s.id);
    }
  }
  return db;
}
export function sampleDatabase(): Database {
  return { version: 1, trips: [{ id: 'osaka', name: '우리 둘, 오사카', region: '일본 · 오사카', start: '2026-11-21', end: '2026-11-24', stops: [
    { id: 'castle', date: '2026-11-21', name: '오사카성', address: '일본 오사카시 주오구 오사카조 1-1', lat: 34.6873, lng: 135.5262, time: '10:00', category: '관광', memo: '천천히 성 주변 공원을 산책하고 사진 남기기.' },
    { id: 'market', date: '2026-11-21', name: '구로몬 시장', address: '일본 오사카시 주오구 닛폰바시 2', lat: 34.6653, lng: 135.5063, time: '13:00', category: '맛집', memo: '둘이 먹고 싶은 것 하나씩 골라 보기.' },
    { id: 'dotonbori', date: '2026-11-21', name: '도톤보리', address: '일본 오사카시 주오구 도톤보리', lat: 34.6687, lng: 135.5013, time: '18:00', category: '관광', memo: '글리코상 앞에서 사진! 저녁은 오코노미야키.' },
    { id: 'umeda', date: '2026-11-22', name: '우메다 스카이 빌딩', address: '일본 오사카시 기타구 오요도나카 1-1-88', lat: 34.7053, lng: 135.49, time: '17:00', category: '관광', memo: '노을 시간에 맞춰 전망대 올라가기.' },
    { id: 'free', date: '2026-11-23', name: '느긋하게 브런치', address: '', time: '', category: '맛집', memo: '숙소 근처에서 마음에 드는 곳 찾기.' }
  ] }] };
}
