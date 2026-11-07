import { parseGoogleMapsShare } from '../../src/services/googleMapsLink.ts';
import { hasCoordinates, parseCoordinates, type GeoPoint } from '../../src/services/geo.ts';

function decodeEntities(value: string) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi, entity => {
    const names: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (names[entity]) return names[entity];
    const code = entity.toLowerCase().startsWith('&#x') ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10);
    return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

export function parseGoogleMapsPage(html: string) {
  let name = '', address = '', point: GeoPoint | undefined;
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map([...match[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(item => [item[1].toLowerCase(), decodeEntities(item[3])]));
    const property = attributes.get('property') || attributes.get('itemprop');
    const content = attributes.get('content') ?? '';
    if (property === 'og:title') name = content.replace(/\s*[-–—|]\s*Google (?:Maps|지도).*$/i, '').trim();
    if (property === 'og:url') {
      const share = parseGoogleMapsShare(content);
      if (share?.point) point = share.point;
      if (share?.name) name = share.name;
    }
    if (property === 'og:image') {
      try {
        const image = new URL(content);
        const marker = image.searchParams.get('markers')?.split('|').at(-1);
        if (marker) point ??= parseCoordinates(marker);
      } catch { /* Metadata images can be omitted. */ }
    }
  }
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const root = JSON.parse(match[1]);
      const nodes = Array.isArray(root) ? root : Array.isArray(root?.['@graph']) ? root['@graph'] : [root];
      for (const node of nodes) {
        if (node?.geo?.latitude == null || node?.geo?.longitude == null
          || String(node.geo.latitude).trim() === '' || String(node.geo.longitude).trim() === '') continue;
        const geo = { lat: Number(node?.geo?.latitude), lng: Number(node?.geo?.longitude) };
        if (!node?.geo || !hasCoordinates(geo)) continue;
        point ??= geo;
        if (typeof node.name === 'string') name ||= node.name;
        const source = node.address;
        if (typeof source === 'string') address = source;
        else if (source) address = [source.addressCountry, source.addressRegion, source.addressLocality, source.streetAddress, source.postalCode].filter(value => typeof value === 'string').join(' ');
      }
    } catch { /* Malformed optional metadata cannot supply a place. */ }
  }
  if (/^Google (?:Maps|지도)$/i.test(name)) name = '';
  return { name: name.slice(0, 150), address: address.slice(0, 500), point };
}
