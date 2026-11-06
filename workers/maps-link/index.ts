import { isGoogleMapsLink, isShortGoogleMapsLink } from '../../src/services/googleMapsLink.ts';

const allowedOrigins = new Set(['https://ksy980324.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']);

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (!origin || !allowedOrigins.has(origin)) return new Response(null, { status: 403 });
    const headers = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'no-store' };
    const reply = (body: object, status = 200) => Response.json(body, { status, headers });
    const endpoint = new URL(request.url);
    if (endpoint.pathname !== '/resolve' || request.method !== 'GET') return reply({}, 404);
    let target = endpoint.searchParams.get('url');
    if (!target || !isShortGoogleMapsLink(target)) return reply({}, 400);

    try {
      const signal = AbortSignal.timeout(5000);
      for (let hop = 0; hop < 3; hop++) {
        const response: Response = await fetch(target, { redirect: 'manual', signal });
        await response.body?.cancel();
        const location = response.headers.get('Location');
        if (!location || response.status < 300 || response.status >= 400) break;
        const next: string = new URL(location, target).href;
        if (!isGoogleMapsLink(next)) break;
        if (!isShortGoogleMapsLink(next)) return reply({ url: next });
        target = next;
      }
    } catch { /* An unavailable Google response falls back to manual entry. */ }
    return reply({}, 502);
  },
};
