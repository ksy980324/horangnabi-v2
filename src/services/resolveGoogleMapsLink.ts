import { isShortGoogleMapsLink, parseGoogleMapsShare } from './googleMapsLink';

export const mapsLinkResolverUrl = import.meta.env.VITE_MAPS_LINK_RESOLVER_URL?.trim();

export async function resolveGoogleMapsLink(shortUrl: string, signal: AbortSignal) {
  if (!mapsLinkResolverUrl || !isShortGoogleMapsLink(shortUrl)) return;
  const endpoint = new URL(mapsLinkResolverUrl);
  endpoint.searchParams.set('url', shortUrl);
  const response = await fetch(endpoint, { signal });
  if (!response.ok) throw new Error('공유 링크를 열지 못했어요.');
  const { url } = await response.json();
  const share = typeof url === 'string' && !isShortGoogleMapsLink(url) ? parseGoogleMapsShare(url) : undefined;
  if (!share?.name && !share?.point) throw new Error('공유 링크에서 장소를 읽지 못했어요.');
  return share;
}
