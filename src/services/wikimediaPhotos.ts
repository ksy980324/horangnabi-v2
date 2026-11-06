import { hasCoordinates, type GeoPoint } from './geo.ts';
import type { Place } from '../types';

export type WikimediaPhoto = { url: string; source: string; author: string; license: string; licenseUrl?: string };
type Article = { title: string; pageimage?: string };
type ImageInfo = { thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> };

const normalizeTitle = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\s_·・]/gu, '');
export function matchingImage(articles: Article[], name: string): string | undefined {
  const matches = articles.filter(article => normalizeTitle(article.title) === normalizeTitle(name));
  return matches.length === 1 ? matches[0].pageimage : undefined;
}

const cache = new Map<string, Promise<WikimediaPhoto | undefined>>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;

async function wikiQuery<T>(host: string, options: Record<string, string>): Promise<T> {
  const pause = 500 - (Date.now() - lastRequest);
  if (pause > 0) await new Promise(resolve => setTimeout(resolve, pause));
  lastRequest = Date.now();
  const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...options });
  const response = await fetch(`https://${host}/w/api.php?${params}`, {
    headers: { 'Api-User-Agent': 'Horangnabi/1.0 (https://github.com/ksy980324/horangnabi-v2)' },
    signal: AbortSignal.timeout(8000),
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error('Wikimedia API request failed');
  return response.json() as Promise<T>;
}

function isHostedAt(value: string | undefined, host: string): value is string {
  if (!value) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === host; }
  catch { return false; }
}

export function photoFromFile(info: ImageInfo | undefined): WikimediaPhoto | undefined {
  if (!info || !isHostedAt(info.descriptionurl, 'commons.wikimedia.org')) return;
  const { thumburl } = info;
  if (!isHostedAt(thumburl, 'upload.wikimedia.org') && !isHostedAt(thumburl, 'thumb.wikimedia.org')) return;
  const metadata = info.extmetadata ?? {};
  const license = metadata.LicenseShortName?.value;
  const licenseUrl = metadata.LicenseUrl?.value?.replace(/^http:/, 'https:');
  if (!license) return;
  const requiresCredit = /^CC BY(?:-SA)? \d(?:\.\d+)?$/i.test(license);
  if (!requiresCredit && !/^(?:CC0|public domain)$/i.test(license)) return;
  const authorMarkup = metadata.Attribution?.value || metadata.Artist?.value || '';
  const authorText = authorMarkup.replace(/<[^>]*>/g, '').trim();
  const author = authorText.includes('&') ? new DOMParser().parseFromString(authorText, 'text/html').body.textContent?.trim() ?? '' : authorText;
  if (requiresCredit && (!author || !isHostedAt(licenseUrl, 'creativecommons.org'))) return;
  return { url: thumburl, source: info.descriptionurl, author, license, licenseUrl: isHostedAt(licenseUrl, 'creativecommons.org') ? licenseUrl : undefined };
}

async function findPhoto(name: string, point: GeoPoint) {
  const language = /[가-힣]/u.test(name) ? 'ko' : /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(name) ? 'ja' : 'en';
  const articles = await wikiQuery<{ query?: { pages?: Article[] } }>(`${language}.wikipedia.org`, {
    generator: 'geosearch', ggscoord: `${point.lat}|${point.lng}`, ggsradius: '1000', ggslimit: '30', ggsnamespace: '0',
    prop: 'pageimages', piprop: 'name', pilicense: 'free',
  });
  const file = matchingImage(articles.query?.pages ?? [], name);
  if (!file) return;
  const files = await wikiQuery<{ query?: { pages?: { imageinfo?: ImageInfo[] }[] } }>('commons.wikimedia.org', {
    titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '144',
    iiextmetadatafilter: 'Artist|Attribution|LicenseShortName|LicenseUrl',
  });
  return photoFromFile(files.query?.pages?.[0]?.imageinfo?.[0]);
}

export function loadWikimediaPhoto(place: Pick<Place, 'name' | 'lat' | 'lng'>): Promise<WikimediaPhoto | undefined> {
  if (!place.name.trim() || !hasCoordinates(place)) return Promise.resolve(undefined);
  const point = { lat: Number(place.lat.toFixed(4)), lng: Number(place.lng.toFixed(4)) };
  const key = `${normalizeTitle(place.name)}:${point.lat}:${point.lng}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const next = queue.then(() => findPhoto(place.name, point)).catch(() => undefined);
  queue = next;
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, next);
  return next;
}
