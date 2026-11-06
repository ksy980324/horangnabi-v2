import type { Reservation, Trip } from '../types';

export const reservationLimits = { name: 150, reference: 100, url: 2048, address: 500 };

export function isReservationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > reservationLimits.url) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

function optionalText(value: unknown, max: number) {
  return value === undefined || typeof value === 'string' && value.length <= max;
}

function optionalDateTime(value: unknown) {
  if (value === undefined) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
  const date = new Date(`${value}Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value;
}

export function isReservation(value: unknown): value is Reservation {
  if (!value || typeof value !== 'object') return false;
  const item = value as Reservation;
  if (typeof item.id !== 'string' || !item.id.trim() || typeof item.name !== 'string' || !item.name.trim() || item.name.length > reservationLimits.name) return false;
  if (!optionalText(item.reference, reservationLimits.reference) || (item.url !== undefined && !isReservationUrl(item.url))) return false;
  if (item.kind === 'flight') return optionalDateTime(item.departure);
  return item.kind === 'stay' && optionalText(item.address, reservationLimits.address)
    && optionalDateTime(item.checkIn) && optionalDateTime(item.checkOut)
    && (!item.checkIn || !item.checkOut || item.checkIn <= item.checkOut);
}

export function saveReservation(trip: Trip, reservation: Reservation): Trip {
  const reservations = trip.reservations ?? [];
  return { ...trip, reservations: reservations.some(item => item.id === reservation.id)
    ? reservations.map(item => item.id === reservation.id ? reservation : item)
    : [...reservations, reservation] };
}
