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
