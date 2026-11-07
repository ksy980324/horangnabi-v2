import { isGoogleMapsLink, isShortGoogleMapsLink, parseGoogleMapsShare } from '../../src/services/googleMapsLink.ts';
import { googleMapsFeature, parseGoogleMapsEmbed, parseGoogleMapsPage, readGoogleMapsPage } from './googleMapsPage.ts';
import { flightDate, flightNumber } from '../../src/services/flightLookup.ts';
import { IncheonLookupError, lookupIncheonDepartures } from './incheonFlights.ts';

const allowedOrigins = new Set(['https://ksy980324.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']);
const mapsHeaders = { 'Accept-Language': 'ko,en;q=0.8', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' };

async function lookupEmbeddedPlace(feature: { id: string; cid: string }, signal: AbortSignal) {
  const embed = new URL('https://www.google.com/maps');
  embed.search = new URLSearchParams({ cid: feature.cid, output: 'embed', hl: 'ko' }).toString();
  let target = embed.href;
  for (let hop = 0; hop < 3; hop++) {
    const response = await fetch(target, { redirect: 'manual', signal, headers: mapsHeaders });
    const location = response.headers.get('Location');
    if (location && response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const next = new URL(location, target).href;
      if (!isGoogleMapsLink(next)) return;
      target = next;
    } else {
      if (response.ok) return parseGoogleMapsEmbed(await readGoogleMapsPage(response), feature.id);
      await response.body?.cancel();
      return;
    }
  }
}

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
        const feature = googleMapsFeature(target);
        if (feature && !share?.point) {
          const place = await lookupEmbeddedPlace(feature, signal);
          if (place) return reply({ url: target, ...place });
        }
        const response: Response = await fetch(target, { redirect: 'manual', signal, headers: mapsHeaders });
        const location = response.headers.get('Location');
        if (!location || response.status < 300 || response.status >= 400) {
          if (!response.ok || isShortGoogleMapsLink(target)) { await response.body?.cancel(); break; }
          const metadata = parseGoogleMapsPage(await readGoogleMapsPage(response));
          if (share?.name || metadata.name || metadata.point) return reply({ url: target, ...metadata });
          break;
        }
        await response.body?.cancel();
        const next: string = new URL(location, target).href;
        if (!isGoogleMapsLink(next)) break;
        target = next;
      }
    } catch { /* An unavailable Google response falls back to manual entry. */ }
    const partial = parseGoogleMapsShare(target);
    if (partial?.name || partial?.point) return reply({ url: target });
    return reply({}, 502);
  },
};
