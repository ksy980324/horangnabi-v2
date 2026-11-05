import type { Place, Trip } from '../types';
import { hasCoordinates, type GeoPoint } from './geo';
import { filterCities } from './destinations';

// Match the selected city itself, never an arbitrary first geocoder result.
export function matchingCity<T extends Place & { originalName?: string }>(countryCode: string, cityName: string, results: T[]): T | undefined {
  const normalize = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f\s·.,'-]/g, '').toLowerCase().replace(/[市町村]$/, '');
  const catalog = filterCities(countryCode, cityName).find(city => city.name === cityName);
  const names = [cityName, ...(catalog ? [catalog.englishName, ...catalog.aliases] : [])].map(normalize);
  const matches = results.filter(result => hasCoordinates(result) && [result.name, result.originalName].some(name => name && names.includes(normalize(name))));
  // Same-name cities need the user's explicit choice from search results.
  return matches.length === 1 ? matches[0] : undefined;
}

export function tripCenter(trip: Trip | undefined, dayStops: Place[] = []): GeoPoint | undefined {
  const place = trip?.destination && hasCoordinates(trip.destination) ? trip.destination : dayStops.find(hasCoordinates) ?? trip?.stops.find(hasCoordinates);
  return place && hasCoordinates(place) ? { lat: place.lat, lng: place.lng } : undefined;
}
