import type { Place, Trip } from '../types';
import { hasCoordinates, type GeoPoint } from './geo';

export function tripCenter(trip: Trip | undefined, dayStops: Place[] = []): GeoPoint | undefined {
  const place = trip?.destination && hasCoordinates(trip.destination) ? trip.destination : dayStops.find(hasCoordinates) ?? trip?.stops.find(hasCoordinates);
  return place && hasCoordinates(place) ? { lat: place.lat, lng: place.lng } : undefined;
}
