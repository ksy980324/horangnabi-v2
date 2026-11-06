import type { Trip } from '../types';

const storageKey = 'horangnabi-v2:offline-trip';
const cacheName = 'horangnabi-v2:offline-page-v1';
export const offlinePageUrl = () => new URL('offline.html', new URL(import.meta.env.BASE_URL, document.baseURI));

export function readOfflineTrip(): { tripId: string; owner?: string; name: string; savedAt: string } | undefined {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : undefined;
  } catch { return undefined; }
}

export function clearSharedOfflineTrip(userId?: string) {
  const saved = readOfflineTrip();
  if (saved?.owner && saved.owner !== userId) {
    try { localStorage.removeItem(storageKey); }
    catch { /* Signing out still works if browser storage is unavailable. */ }
  }
}

export async function saveOfflineTrip(trip: Trip, owner: string | undefined, signal: AbortSignal) {
  if (!('serviceWorker' in navigator) || !('caches' in window)) throw new Error('오프라인 저장은 HTTPS 또는 localhost에서 사용할 수 있어요.');
  const page = offlinePageUrl();
  const response = await fetch(page, { cache: 'reload', signal });
  if (!response.ok) throw new Error('오프라인 페이지를 준비하지 못했어요.');
  await (await caches.open(cacheName)).put(page, response);
  await navigator.serviceWorker.register(new URL('offline-worker.js', page));
  await navigator.serviceWorker.ready;
  signal.throwIfAborted();
  const { id: tripId, name, region, start, end, stops, reservations = [] } = trip;
  localStorage.setItem(storageKey, JSON.stringify({
    tripId, owner, name, region, start, end, savedAt: new Date().toISOString(),
    stops: stops.map(({ date, time, name, address, memo }) => ({ date, time, name, address, memo })),
    reservations: reservations.map(item => item.kind === 'stay'
      ? { name: item.name, times: [['체크인', item.checkIn], ['체크아웃', item.checkOut]], address: item.address }
      : { name: item.name, times: [['출발', item.departure], ['도착', item.arrival]], address: [item.departureAirport, item.arrivalAirport].filter(Boolean).join(' → ') }),
  }));
}
