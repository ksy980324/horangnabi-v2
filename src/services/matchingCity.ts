import type { Place } from '../types';
import { hasCoordinates } from './geo.ts';
import { filterCities } from './destinations.ts';

// Keep the destination catalog in the editor chunk, away from startup/map centering.
export function matchingCity<T extends Place & { originalName?: string }>(countryCode: string, cityName: string, results: T[]): T | undefined {
  const normalize = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f\s·.,'-]/g, '').toLowerCase().replace(/[市町村]$/, '');
  const catalog = filterCities(countryCode, cityName).find(city => city.name === cityName);
  const names = [cityName, ...(catalog ? [catalog.englishName, ...catalog.aliases] : [])].map(normalize);
  const matches = results.filter(result => hasCoordinates(result) && [result.name, result.originalName].some(name => name && names.includes(normalize(name))));
  return matches.length === 1 ? matches[0] : undefined;
}
