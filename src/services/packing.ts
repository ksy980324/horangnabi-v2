import type { PackingItem, Trip } from '../types';

export const SHARED_PACKING_PARTICIPANTS = 2;

export function packingMembers(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > SHARED_PACKING_PARTICIPANTS) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && !!id.trim()))];
}

export function packingCompletedCount(item: PackingItem, memberIds: readonly string[]) {
  return item.completedBy?.filter(id => memberIds.includes(id)).length ?? 0;
}

export function packingCheckedBy(item: PackingItem, userId: string) {
  return item.completedBy?.includes(userId) ?? false;
}

export function setPackingCheckedBy(item: PackingItem, memberIds: readonly string[], userId: string, checked: boolean): PackingItem {
  if (!memberIds.includes(userId)) return item;
  const completedBy = (item.completedBy ?? []).filter(id => memberIds.includes(id) && id !== userId);
  if (checked) completedBy.push(userId);
  return { ...item, completedBy, completed: completedBy.length === SHARED_PACKING_PARTICIPANTS };
}

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
