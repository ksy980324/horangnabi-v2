export type FlightSchedule = { departure: string; departureAirport: string; arrivalAirport: string };
export type FlightLookupErrorReason = 'authorization' | 'quota' | 'timeout' | 'network' | 'upstream';

export function flightNumber(value: string) {
  const normalized = value.toUpperCase().replace(/\s+/g, '');
  return /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(normalized) ? normalized : undefined;
}

export function flightDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : undefined;
}
