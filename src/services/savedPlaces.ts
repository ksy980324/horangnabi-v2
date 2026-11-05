import type { Trip } from '../types';
import { datesBetween } from '../data';

export function scheduleSavedPlace(trip: Trip, id: string, date: string): Trip {
  const place = trip.savedPlaces?.find(place => place.id === id);
  if (!place || trip.stops.some(stop => stop.id === id) || !datesBetween(trip.start, trip.end).includes(date)) return trip;
  return {
    ...trip,
    savedPlaces: trip.savedPlaces!.filter(place => place.id !== id),
    stops: [...trip.stops, { ...place, date, time: '' }],
  };
}
