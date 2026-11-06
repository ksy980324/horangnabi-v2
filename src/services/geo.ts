import type { Place } from '../types';
export type GeoPoint = { lat: number; lng: number };
export type GeoBounds = { west: number; south: number; east: number; north: number };
export type MapView = { center: GeoPoint; bounds: GeoBounds };
export function hasCoordinates<T extends Pick<Place, 'lat' | 'lng'>>(place: T): place is T & GeoPoint {
  return Number.isFinite(place.lat) && Number.isFinite(place.lng) && Math.abs(place.lat!) <= 90 && Math.abs(place.lng!) <= 180;
}
export function parseCoordinates(value: string): GeoPoint | undefined {
  const match = value.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*[,，]\s*([+-]?\d+(?:\.\d+)?)$/);
  if (!match) return;
  const point = { lat: Number(match[1]), lng: Number(match[2]) };
  if (hasCoordinates(point)) return point;
}
export function itineraryPath(points: Pick<Place, 'lat' | 'lng'>[]): GeoPoint[] {
  return points.filter(hasCoordinates).map(({ lat, lng }) => ({ lat, lng }));
}
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function nearbyBounds(center: GeoPoint, radiusKm: number): GeoBounds {
  const latitude = radiusKm / 111.195;
  const longitude = Math.min(180, latitude / Math.max(0.001, Math.cos(center.lat * Math.PI / 180)));
  const wrap = (lng: number) => ((lng + 540) % 360) - 180;
  return { west: wrap(center.lng - longitude), east: wrap(center.lng + longitude), south: Math.max(-90, center.lat - latitude), north: Math.min(90, center.lat + latitude) };
}
export function insideBounds(point: GeoPoint, bounds: GeoBounds): boolean {
  return point.lat >= bounds.south && point.lat <= bounds.north && (bounds.west <= bounds.east
    ? point.lng >= bounds.west && point.lng <= bounds.east
    : point.lng >= bounds.west || point.lng <= bounds.east);
}
