import { cities } from './destinations';
import { englishPlaceAlias, resolveSearchQuery } from './searchQuery';

export const hasKorean = (text: string) => /[가-힣]/.test(text);
const cache = new Map<string, string>();
const properNames = cities.flatMap(city => [city.name, ...city.aliases].filter(hasKorean).map(name => [name, city.englishName] as const))
  .sort((a, b) => b[0].length - a[0].length);
const terms: [string, string][] = [
  ['국제공항', 'International Airport'], ['버스 정류장', 'Bus Stop'], ['버스정류장', 'Bus Stop'],
  ['중앙역', 'Central Station'],
  ['버스터미널', 'Bus Terminal'], ['기차역', 'Station'], ['철도역', 'Station'],
  ['음식점', 'Restaurant'], ['레스토랑', 'Restaurant'], ['식당', 'Restaurant'], ['커피숍', 'Cafe'], ['카페', 'Cafe'],
  ['박물관', 'Museum'], ['미술관', 'Art Museum'], ['전망대', 'Observation Deck'], ['쇼핑몰', 'Shopping Mall'],
  ['주차장', 'Parking'], ['편의점', 'Convenience Store'], ['백화점', 'Department Store'], ['도서관', 'Library'],
  ['호텔', 'Hotel'], ['료칸', 'Ryokan'], ['숙소', 'Accommodation'], ['온천', 'Onsen'],
  ['공항', 'Airport'], ['공원', 'Park'], ['시장', 'Market'], ['해변', 'Beach'], ['신사', 'Shrine'], ['사찰', 'Temple'],
  ['중앙', 'Central'], ['우동', 'Udon'], ['라멘', 'Ramen'], ['스시', 'Sushi'], ['역', 'Station'], ['성', 'Castle'],
].sort((a, b) => b[0].length - a[0].length) as [string, string][];

function romanize(word: string) {
  const initial = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
  const vowel = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
  const final = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 'h'];
  return [...word].map(letter => {
    const code = letter.charCodeAt(0) - 0xac00;
    return initial[Math.floor(code / 588)] + vowel[Math.floor(code / 28) % 21] + final[code % 28];
  }).join('');
}

function decodeText(text: string) {
  const entities: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>' };
  return text.replace(/&(?:amp|quot|#39|apos|lt|gt);/g, value => entities[value]);
}

export async function translatePlaceQuery(input: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const original = input.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (cache.has(original)) return cache.get(original)!;
  const alias = englishPlaceAlias(original);
  const resolved = alias || resolveSearchQuery(original).text;
  if (/[a-z]/i.test(resolved) && !/[가-힣ぁ-ヿ一-龯]/.test(resolved)) return resolved;

  let text = original;
  const protectedNames: string[] = [];
  for (const [name, english] of properNames) {
    if (!text.includes(name)) continue;
    const token = `ZXQ${protectedNames.length}ZXQ`;
    protectedNames.push(english);
    text = text.replaceAll(name, ` ${token} `);
  }
  for (const [term, english] of terms) {
    // Short suffixes must not change words such as 역사 (history).
    text = text.replace(new RegExp(term + '(?=$|[\\s()·,/-])', 'g'), ` ${english} `);
  }
  text = text.trim().replace(/\s+/g, ' ');
  if (hasKorean(text)) {
    if (new TextEncoder().encode(text).length > 500) throw new Error('검색어를 조금 짧게 입력해 주세요.');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(cancel, 8000);
    try {
      const params = new URLSearchParams({ q: text, langpair: 'ko|en' });
      const response = await fetch(`https://api.mymemory.translated.net/get?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error('영어 번역에 연결하지 못했어요.');
      const result = await response.json();
      if (result.responseStatus !== 200 || result.quotaFinished || typeof result.responseData?.translatedText !== 'string') throw new Error('영어 번역을 사용할 수 없어요.');
      text = decodeText(result.responseData.translatedText).trim();
      if (!text || text.length > 1000) throw new Error('영어 번역 결과를 확인하지 못했어요.');
      text = text.replace(/[가-힣]+/g, romanize);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
    }
  }
  signal?.throwIfAborted();
  for (const [index, name] of protectedNames.entries()) {
    const token = new RegExp(`ZXQ\\s*${index}\\s*ZXQ`, 'gi');
    if (!token.test(text)) throw new Error('번역에서 장소 이름을 확인하지 못했어요.');
    text = text.replace(token, name);
  }
  text = text.trim().replace(/\s+/g, ' ');
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(original, text);
  return text;
}
