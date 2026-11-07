import { isGoogleMapsLink, isShortGoogleMapsLink, parseGoogleMapsShare } from '../../src/services/googleMapsLink.ts';
import { parseGoogleMapsPage } from './googleMapsPage.ts';
import { flightDate, flightNumber } from '../../src/services/flightLookup.ts';
import { IncheonLookupError, lookupIncheonDepartures } from './incheonFlights.ts';

const allowedOrigins = new Set(['https://ksy980324.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']);

export default {
  async fetch(request: Request, env?: { INCHEON_FLIGHT_SERVICE_KEY?: string }): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (!origin || !allowedOrigins.has(origin)) return new Response(null, { status: 403 });
    const headers = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'no-store' };
    const reply = (body: object, status = 200) => Response.json(body, { status, headers });
    const endpoint = new URL(request.url);
    if (request.method !== 'GET') return reply({}, 404);
    if (endpoint.pathname === '/flight') {
      const number = flightNumber(endpoint.searchParams.get('number') ?? '');
      const date = endpoint.searchParams.get('date') ?? '';
      if (!number || !flightDate(date)) return reply({}, 400);
      const serviceKey = env?.INCHEON_FLIGHT_SERVICE_KEY?.trim();
      if (!serviceKey) return reply({}, 503);
      try { return reply({ flights: await lookupIncheonDepartures(number, date, serviceKey) }); }
      catch (error) {
        if (error instanceof IncheonLookupError) return reply({ reason: error.reason, providerCode: error.providerCode, providerStatus: error.providerStatus }, 502);
        return reply({ reason: 'upstream' }, 502);
      }
    }
    if (endpoint.pathname !== '/resolve') return reply({}, 404);
    let target = endpoint.searchParams.get('url');
    if (!target || !isGoogleMapsLink(target)) return reply({}, 400);

    try {
      const signal = AbortSignal.timeout(12000);
      for (let hop = 0; hop < 6; hop++) {
        const share = parseGoogleMapsShare(target);
        if (share?.name && share.point) return reply({ url: target });
        const response: Response = await fetch(target, { redirect: 'manual', signal, headers: { 'Accept-Language': 'ko,en;q=0.8', 'User-Agent': 'Mozilla/5.0' } });
        const location = response.headers.get('Location');
        if (!location || response.status < 300 || response.status >= 400) {
          if (!response.ok || isShortGoogleMapsLink(target)) { await response.body?.cancel(); break; }
          const reader = response.body?.getReader();
          if (!reader) break;
          const chunks: Uint8Array[] = [];
          let length = 0;
          while (length < 1_000_000) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = value.subarray(0, 1_000_000 - length);
            chunks.push(chunk);
            length += chunk.length;
          }
          await reader.cancel();
          const data = new Uint8Array(length);
          let offset = 0;
          for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
          const metadata = parseGoogleMapsPage(new TextDecoder().decode(data));
          if (share?.name || metadata.name || metadata.point) return reply({ url: target, ...metadata });
          break;
        }
        await response.body?.cancel();
        const next: string = new URL(location, target).href;
        if (!isGoogleMapsLink(next)) break;
        target = next;
      }
    } catch { /* An unavailable Google response falls back to manual entry. */ }
    return reply({}, 502);
  },
};
