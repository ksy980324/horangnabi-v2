import { flightDate, flightNumber, type FlightLookupErrorReason, type FlightSchedule } from '../../src/services/flightLookup.ts';

const source = 'https://apis.data.go.kr/B551177/statusOfSPaxFlt4TripPlatform/getSPaxFlt4TripPlatformDepartures';
const weekdays = ['ynSun', 'ynMon', 'ynTue', 'ynWed', 'ynThu', 'ynFri', 'ynSat'];
const schedules = new Map<string, { expires: number; response: Promise<FlightSchedule[]> }>();

type ScheduleBody = { items?: Record<string, unknown>[] | { item?: Record<string, unknown> | Record<string, unknown>[] } };
type ScheduleResponse = {
  response?: { header?: { resultCode?: string | number }; body?: ScheduleBody };
  OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnReasonCode?: string | number } };
};

export class IncheonLookupError extends Error {
  constructor(readonly reason: FlightLookupErrorReason, readonly providerCode?: string, readonly providerStatus?: number) { super(reason); }
}

async function readScheduleResponse(upstream: Response): Promise<ScheduleResponse> {
  const body = await upstream.text();
  let payload: ScheduleResponse | undefined;
  try { payload = JSON.parse(body) as ScheduleResponse; } catch { /* Gateway errors can also be XML. */ }
  const code = String(payload?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode
    ?? payload?.response?.header?.resultCode
    ?? body.match(/<(?:returnReasonCode|resultCode)>\s*(\d{1,2})\s*<\//)?.[1] ?? '');
  if (/^0?3$/.test(code)) return { response: { header: { resultCode: '03' } } };
  const providerCode = /^\d{1,2}$/.test(code) ? code : undefined;
  if (code === '22' || upstream.status === 429) throw new IncheonLookupError('quota', providerCode, upstream.status);
  if (['20', '30', '31', '32'].includes(code) || upstream.status === 401 || upstream.status === 403) throw new IncheonLookupError('authorization', providerCode, upstream.status);
  if (!upstream.ok || !payload || !/^0+$/.test(code)) throw new IncheonLookupError('upstream', providerCode, upstream.status);
  return payload;
}

export function incheonDepartures(payload: ScheduleResponse, number: string, date: string): FlightSchedule[] {
  const requestedDay = flightDate(date);
  const code = String(payload.response?.header?.resultCode ?? '');
  if (code === '03') return [];
  if (!requestedDay || !/^0+$/.test(code) || !payload.response?.body) throw new Error('Invalid Incheon schedule response');
  const entries = payload.response.body.items;
  const items = Array.isArray(entries) ? entries : entries?.item;
  const rows = Array.isArray(items) ? items : items ? [items] : [];
  const matches = new Map<string, FlightSchedule>();
  const day = date.replaceAll('-', '');
  for (const row of rows) {
    if (typeof row?.flightId !== 'string' || flightNumber(row.flightId) !== number) continue;
    const start = String(row.firstdate ?? '').replaceAll('-', '');
    const end = String(row.lastdate ?? '').replaceAll('-', '');
    if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end) || day < start || day > end) continue;
    if (!/^(?:y|1|true)$/i.test(String(row[weekdays[requestedDay.getUTCDay()]] ?? '').trim())) continue;
    const time = String(row.st ?? '').trim().replace(':', '').padStart(4, '0');
    if (!/^(?:[01]\d|2[0-3])[0-5]\d$/.test(time) || !String(row.st ?? '').trim()) continue;
    const airportCode = String(row.airportCode ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(airportCode)) continue;
    const airport = typeof row.airport === 'string' ? row.airport.trim().slice(0, 120) : '';
    const departure = `${date}T${time.slice(0, 2)}:${time.slice(2)}`;
    matches.set(`${departure}:${airportCode}`, { departure, departureAirport: '인천국제공항 (ICN)', arrivalAirport: airport ? `${airport} (${airportCode})` : airportCode });
  }
  return [...matches.values()].sort((a, b) => a.departure.localeCompare(b.departure));
}

export function lookupIncheonDepartures(number: string, date: string, serviceKey: string) {
  const cacheKey = `${number}:${date}`;
  const existing = schedules.get(cacheKey);
  if (existing && existing.expires > Date.now()) return existing.response;
  const url = new URL(source);
  url.search = new URLSearchParams({ serviceKey, pageNo: '1', numOfRows: '100', type: 'json', flightId: number }).toString();
  const signal = AbortSignal.timeout(10000);
  const response = fetch(url, { redirect: 'manual', signal }).then(async upstream => {
    const payload = await readScheduleResponse(upstream);
    try { return incheonDepartures(payload, number, date); }
    catch { throw new IncheonLookupError('upstream', undefined, upstream.status); }
  }).catch((error: unknown) => {
    schedules.delete(cacheKey);
    if (signal.aborted) throw new IncheonLookupError('timeout');
    throw error instanceof IncheonLookupError ? error : new IncheonLookupError('network');
  });
  if (schedules.size >= 100) schedules.delete(schedules.keys().next().value!);
  schedules.set(cacheKey, { response, expires: Date.now() + 600_000 });
  return response;
}
