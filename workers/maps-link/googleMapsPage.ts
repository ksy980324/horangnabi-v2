import { parseGoogleMapsShare } from '../../src/services/googleMapsLink.ts';
import { hasCoordinates, parseCoordinates, type GeoPoint } from '../../src/services/geo.ts';

export function googleMapsFeature(url: string) {
  const feature = new URL(url).pathname.replace(/%21/gi, '!').match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1];
  if (!feature) return;
  return { id: feature.toLowerCase(), cid: BigInt(feature.split(':')[1]).toString() };
}

export async function readGoogleMapsPage(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
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
  return new TextDecoder().decode(data);
}

export function parseGoogleMapsEmbed(html: string, featureId: string) {
  const source = html.match(/\binitEmbed\((\[[\s\S]*?\])\s*\);/)?.[1];
  if (!source) return;
  let data: unknown;
  try { data = JSON.parse(source); } catch { return; }
  // Only the selected place record can supply coordinates, never the map camera.
  function find(node: unknown, depth = 0): { name: string; address: string; point: GeoPoint } | undefined {
    if (!Array.isArray(node) || depth > 24) return;
    const marker = node[0];
    if (Array.isArray(marker) && typeof marker[0] === 'string' && marker[0].toLowerCase() === featureId.toLowerCase()
      && Array.isArray(marker[2])) {
      const point = { lat: marker[2][0], lng: marker[2][1] };
      if (hasCoordinates(point)) {
        const name = typeof node[1] === 'string' ? node[1] : typeof marker[1] === 'string' ? marker[1] : '';
        const address = Array.isArray(node[2]) ? node[2].filter(part => typeof part === 'string').join(' ') : '';
        return { name: name.slice(0, 150), address: address.slice(0, 500), point };
      }
    }
    for (const item of node) {
      const place = find(item, depth + 1);
      if (place) return place;
    }
  }
  return find(data);
}

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
