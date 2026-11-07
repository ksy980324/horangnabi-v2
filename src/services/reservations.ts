import type { Reservation, StayEvent, Stop, Trip } from '../types';
import { airportCoordinates } from './airportCoordinates.ts';
import { hasCoordinates } from './geo.ts';
import { isGoogleMapsLink } from './googleMapsLink.ts';

export const reservationLimits = { name: 150, reference: 100, url: 2048, address: 500, airport: 150 };

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
  if (item.kind === 'flight') return (item.direction === undefined || item.direction === 'outbound' || item.direction === 'return')
    && optionalDateTime(item.departure) && optionalDateTime(item.arrival)
    && optionalText(item.departureAirport, reservationLimits.airport) && optionalText(item.arrivalAirport, reservationLimits.airport);
  return item.kind === 'stay' && optionalText(item.address, reservationLimits.address)
    && (item.lat === undefined && item.lng === undefined || hasCoordinates(item))
    && (item.mapUrl === undefined || isGoogleMapsLink(item.mapUrl))
    && optionalDateTime(item.checkIn) && optionalDateTime(item.checkOut)
    && (!item.checkIn || !item.checkOut || item.checkIn <= item.checkOut);
}

export function saveReservation(trip: Trip, reservation: Reservation): Trip {
  const reservations = trip.reservations ?? [];
  const previous = reservations.find(item => item.id === reservation.id);
  const base = previous && previous.kind !== reservation.kind ? removeReservation(trip, reservation.id) : trip;
  const stops = reservation.kind === 'stay' ? syncStayStops(base, reservation, previous) : syncFlightStop(base, reservation, previous);
  return { ...trip, stops, reservations: previous
    ? reservations.map(item => item.id === reservation.id ? reservation : item)
    : [...reservations, reservation] };
}

export function removeReservation(trip: Trip, id: string): Trip {
  return { ...trip, reservations: (trip.reservations ?? []).filter(item => item.id !== id), stops: trip.stops.filter(stop => stop.flightReservationId !== id && stop.stayReservation?.id !== id) };
}

function flightEvent(reservation: Reservation | undefined) {
  if (reservation?.kind !== 'flight' || !reservation.direction) return;
  const outbound = reservation.direction === 'outbound';
  const airport = outbound ? reservation.arrivalAirport : reservation.departureAirport;
  const datetime = outbound ? reservation.arrival : reservation.departure;
  if (airport?.trim() && datetime && optionalDateTime(datetime)) return { airport: airport.trim(), date: datetime.slice(0, 10), time: datetime.slice(11), outbound };
}

function syncFlightStop(trip: Trip, reservation: Reservation, previous?: Reservation): Stop[] {
  const linked = trip.stops.find(stop => stop.flightReservationId === reservation.id);
  const event = flightEvent(reservation);
  if (!event || event.date < trip.start || event.date > trip.end) {
    return linked ? trip.stops.filter(stop => stop.flightReservationId !== reservation.id) : trip.stops;
  }
  const id = linked?.id ?? reservationStopId(trip, `flight:${reservation.id}`);
  const sameAirport = linked && flightEvent(previous)?.airport === event.airport;
  const position = sameAirport && linked.lat !== undefined && linked.lng !== undefined ? { lat: linked.lat, lng: linked.lng } : airportCoordinates(event.airport);
  const stop: Stop = {
    id, name: `${event.airport.slice(0, 147)} ${event.outbound ? '도착' : '출발'}`, address: sameAirport ? linked.address : '',
    mapUrl: sameAirport ? linked.mapUrl : undefined, photoUrl: sameAirport ? linked.photoUrl : undefined,
    date: event.date, time: event.time, category: '이동', memo: linked?.memo ?? '', flightReservationId: reservation.id, ...position,
  };
  if (linked?.date === stop.date) return trip.stops.map(item => item.id === linked.id ? stop : item);
  const stops = linked ? trip.stops.filter(item => item.flightReservationId !== reservation.id) : [...trip.stops];
  const later = stops.findIndex(item => item.date === stop.date && (item.time ? item.time >= stop.time : event.outbound));
  if (later >= 0) stops.splice(later, 0, stop);
  else stops.push(stop);
  return stops;
}

function reservationStopId(trip: Trip, prefix: string) {
  let id = prefix;
  for (let suffix = 1; trip.stops.some(stop => stop.id === id) || trip.savedPlaces?.some(place => place.id === id); suffix++) id = `${prefix}:${suffix}`;
  return id;
}

type StayReservation = Extract<Reservation, { kind: 'stay' }>;

function syncStayStops(trip: Trip, reservation: StayReservation, previous?: Reservation): Stop[] {
  const checkIn = reservation.checkIn?.slice(0, 10);
  const checkOut = reservation.checkOut?.slice(0, 10);
  const linked = trip.stops.filter(stop => stop.stayReservation?.id === reservation.id);
  if (!checkIn && !checkOut && !linked.length) return trip.stops;
  const stops = trip.stops.filter(stop => stop.stayReservation?.id !== reservation.id);
  const sameStay = previous?.kind === 'stay' && previous.name === reservation.name && previous.address === reservation.address;
  const pinned = (sameStay ? linked.find(hasCoordinates) : undefined) ?? [...stops, ...(trip.savedPlaces ?? [])].find(stop => stop.name.trim() === reservation.name
    && (!reservation.address || stop.address.trim() === reservation.address) && hasCoordinates(stop));

  function add(event: StayEvent, date: string, time: string, first: boolean) {
    if (date < trip.start || date > trip.end) return;
    const old = linked.find(stop => stop.stayReservation?.event === event && (event !== 'start' || stop.date === date));
    const position = hasCoordinates(reservation) ? reservation : sameStay && old && hasCoordinates(old) ? old : pinned;
    const label = { checkIn: '체크인', start: '출발', checkOut: '체크아웃' }[event];
    const stop: Stop = {
      id: old?.id ?? reservationStopId(trip, `stay:${reservation.id}:${event}${event === 'start' ? `:${date}` : ''}`),
      name: `${reservation.name.slice(0, 145)} ${label}`, address: reservation.address ?? (sameStay ? old?.address : undefined) ?? '',
      date, time, category: '숙소', memo: old?.memo ?? '', stayReservation: { id: reservation.id, event },
      lat: position?.lat, lng: position?.lng,
      mapUrl: reservation.mapUrl ?? (sameStay ? old?.mapUrl : undefined), photoUrl: sameStay ? old?.photoUrl : undefined,
    };
    const before = stops.findIndex(item => item.date === date && (first || !!item.time && item.time > time));
    if (before >= 0) stops.splice(before, 0, stop);
    else stops.push(stop);
  }

  if (checkIn && reservation.checkIn) add('checkIn', checkIn, reservation.checkIn.slice(11), false);
  if (checkIn && checkOut) {
    const dayMs = 86_400_000;
    const firstMorning = Math.max(Date.parse(checkIn) + dayMs, Date.parse(trip.start));
    const lastMorning = Math.min(Date.parse(checkOut) - dayMs, Date.parse(trip.end));
    for (let day = firstMorning; day <= lastMorning; day += dayMs) add('start', new Date(day).toISOString().slice(0, 10), '', true);
  }
  if (checkOut && reservation.checkOut) add('checkOut', checkOut, reservation.checkOut.slice(11), checkOut !== checkIn);
  return stops;
}
