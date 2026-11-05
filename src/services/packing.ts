import type { PackingItem, Trip } from '../types';

export function savePackingItem(trip: Trip, item: PackingItem): Trip {
  const name = item.name.trim();
  if (!name || name.length > 150) return trip;
  const items = trip.packingItems ?? [];
  const next = { ...item, name };
  return { ...trip, packingItems: items.some(existing => existing.id === item.id)
    ? items.map(existing => existing.id === item.id ? next : existing)
    : [...items, next] };
}

export function removePackingItem(trip: Trip, id: string): Trip {
  if (!trip.packingItems?.some(item => item.id === id)) return trip;
  return { ...trip, packingItems: trip.packingItems.filter(item => item.id !== id) };
}
