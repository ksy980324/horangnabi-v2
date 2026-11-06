import { parseCoordinates } from './geo.ts';

export const MAX_MAP_LINK_LENGTH = 2048;

export function isGoogleMapsLink(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_MAP_LINK_LENGTH) return false;
  try {
    const { protocol, hostname, pathname, username, password, port } = new URL(value);
    if (protocol !== 'https:' || username || password || port) return false;
    if (hostname === 'maps.app.goo.gl') return pathname.length > 1;
    if (hostname === 'goo.gl') return pathname.startsWith('/maps/');
    if (hostname === 'maps.google.com') return pathname === '/' || /^\/maps(?:\/|$)/.test(pathname);
    return ['www.google.com', 'google.com', 'www.google.co.jp', 'www.google.co.kr'].includes(hostname) && /^\/maps(?:\/|$)/.test(pathname);
  } catch { return false; }
}

export function parseGoogleMapsShare(value: string) {
  const match = value.trim().match(/^(?:(.*?)\s+)?(https:\/\/\S+)$/s);
  if (!match || !isGoogleMapsLink(match[2])) return;
  const [, title, url] = match;
  const parsed = new URL(url);
  const placeSegment = parsed.pathname.match(/^\/maps\/(?:place|search)\/([^/@][^/]*)/)?.[1];
  let place = '';
  try { if (placeSegment) place = decodeURIComponent(placeSegment.replace(/\+/g, ' ')); } catch { /* Keep the link if its name cannot be decoded. */ }
  const query = parsed.searchParams.get('query') || parsed.searchParams.get('q') || '';
  const location = place || query;
  const point = parseCoordinates(location);
  const name = (title || (point ? '' : location)).trim().replace(/\s+/g, ' ').slice(0, 150);
  return { url, name, point };
}
