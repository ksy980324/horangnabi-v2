import { distanceKm, hasCoordinates, type GeoPoint } from './geo.ts';
import type { Place, Trip } from '../types';

export type WikimediaPhoto = { url: string; source: string; author: string; license: string; licenseUrl?: string };
type Article = { title: string; pageimage?: string; coordinates?: { lat: number; lon: number }[]; langlinks?: { title: string }[] };
type ImageInfo = { thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> };

const normalizeTitle = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\s_·・]/gu, '');
const wikiLanguage = (name: string) => /[가-힣]/u.test(name) ? 'ko' : /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(name) ? 'ja' : 'en';
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
  const articles = await wikiQuery<{ query?: { pages?: Article[] } }>(`${wikiLanguage(name)}.wikipedia.org`, {
    generator: 'geosearch', ggscoord: `${point.lat}|${point.lng}`, ggsradius: '1000', ggslimit: '30', ggsnamespace: '0',
    prop: 'pageimages', piprop: 'name', pilicense: 'free',
  });
  const file = matchingImage(articles.query?.pages ?? [], name);
  if (file) return findFilePhoto(file, '144');
}

async function findFilePhoto(file: string, width: string) {
  const files = await wikiQuery<{ query?: { pages?: { imageinfo?: ImageInfo[] }[] } }>('commons.wikimedia.org', {
    titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: width,
    iiextmetadatafilter: 'Artist|Attribution|LicenseShortName|LicenseUrl',
  });
  return photoFromFile(files.query?.pages?.[0]?.imageinfo?.[0]);
}

function cachedPhoto(key: string, lookup: () => Promise<WikimediaPhoto | undefined>) {
  const cached = cache.get(key);
  if (cached) return cached;
  const next = queue.then(lookup).catch(() => undefined);
  queue = next;
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, next);
  return next;
}

export function loadWikimediaPhoto(place: Pick<Place, 'name' | 'lat' | 'lng'>): Promise<WikimediaPhoto | undefined> {
  if (!place.name.trim() || !hasCoordinates(place)) return Promise.resolve(undefined);
  const point = { lat: Number(place.lat.toFixed(4)), lng: Number(place.lng.toFixed(4)) };
  return cachedPhoto(`${normalizeTitle(place.name)}:${point.lat}:${point.lng}`, () => findPhoto(place.name, point));
}

const representativePlaces = [
  { names: ['오사카', 'Osaka', '大阪'], name: '오사카성', file: 'Osaka Castle 02bs3200.jpg' },
  { names: ['요나고', 'Yonago', '米子'], name: '요나고성 터', file: 'Yonago castle.JPG' },
];

export function representativeTripPlace(trip: Pick<Trip, 'destination' | 'region'>) {
  const { destination, region } = trip;
  const city = destination?.countryCode === 'JP' ? destination.cityName : !destination ? /^일본\s*[·,]\s*(.+)$/.exec(region)?.[1] : undefined;
  if (!city) return;
  const title = normalizeTitle(city);
  return representativePlaces.find(place => place.names.some(name => normalizeTitle(name) === title));
}

export function loadTripCover(trip: Pick<Trip, 'destination' | 'region'>) {
  const featured = representativeTripPlace(trip);
  const city = trip.destination;
  if (featured) return cachedPhoto(`cover:${featured.file}`, () => findFilePhoto(featured.file, '640'));
  if (!city || !hasCoordinates(city)) return Promise.resolve(undefined);
  return cachedPhoto(`cover:${city.countryCode}:${city.cityName}:${city.lat}:${city.lng}`, async () => {
    const language = wikiLanguage(city.cityName);
    const article = await findCityArticle(language, city.cityName);
    const file = cityArticlePhoto(article, city);
    if (file) return findFilePhoto(file, '640');
    const englishTitle = article?.langlinks?.[0]?.title;
    if (language !== 'en' && englishTitle) {
      const fallback = cityArticlePhoto(await findCityArticle('en', englishTitle), city);
      if (fallback) return findFilePhoto(fallback, '640');
    }
  });
}

async function findCityArticle(language: string, title: string) {
  const articles = await wikiQuery<{ query?: { pages?: Article[] } }>(`${language}.wikipedia.org`, {
    titles: title, redirects: '1', prop: 'pageimages|coordinates|langlinks', piprop: 'name', pilicense: 'free', lllang: 'en',
  });
  return articles.query?.pages?.[0];
}

function cityArticlePhoto(article: Article | undefined, city: GeoPoint) {
  const file = article?.pageimage;
  if (!file || !/\.(?:jpe?g|png|webp)$/i.test(file) || /(?:^|[\s_.-])(?:map|flag|locator|location|logo)(?:[\s_.-]|$)/i.test(file)) return;
  const coordinate = article.coordinates?.[0];
  const point = { lat: coordinate?.lat, lng: coordinate?.lon };
  if (hasCoordinates(point) && distanceKm(city, point) <= 30) return file;
}
