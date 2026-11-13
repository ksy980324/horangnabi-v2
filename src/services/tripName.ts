import type { TripDestination } from '../types';

export function resolveTripName(name: string, region: string, destination?: TripDestination) {
  if (name.trim()) return name.trim();
  const place = destination?.cityName.trim() || region.split('·').map(part => part.trim()).filter(Boolean).at(-1);
  if (!place) return '새 여행';
  if (place.endsWith('여행')) return place.slice(0, 100);
  return `${place.slice(0, 97).trimEnd()} 여행`;
}
