import { isGoogleMapsLink, parseGoogleMapsShare } from './googleMapsLink';
import { hasCoordinates } from './geo';

export const mapsLinkResolverUrl = import.meta.env.VITE_MAPS_LINK_RESOLVER_URL?.trim();

export async function resolveGoogleMapsLink(link: string, signal: AbortSignal) {
  if (!mapsLinkResolverUrl || !isGoogleMapsLink(link)) return;
  const endpoint = new URL(mapsLinkResolverUrl);
  endpoint.pathname = '/resolve';
  endpoint.searchParams.set('url', link);
  const response = await fetch(endpoint, { signal });
  if (!response.ok) throw new Error('공유 링크를 열지 못했어요.');
  const { url, name, point, address } = await response.json();
  const share = typeof url === 'string' ? parseGoogleMapsShare(url) : undefined;
  if (share) {
    if (typeof name === 'string' && !share.name) share.name = name.slice(0, 150);
    if (point && hasCoordinates(point) && !share.point) share.point = point;
    if (typeof address === 'string') share.address = address.slice(0, 500);
  }
  if (!share?.name && !share?.point) throw new Error('공유 링크에서 장소를 읽지 못했어요.');
  return share;
}
