import { searchPlaces, type SearchOptions, type SearchResult } from './search';

type SearchResponse = { places: SearchResult[]; translatedQuery?: string; translationUnavailable?: boolean };

export async function searchWithEnglishFallback(
  query: string, options: SearchOptions, onProgress: (message: string) => void,
): Promise<SearchResponse> {
  const korean = /[가-힣]/.test(query);
  const places = await searchPlaces(query, { ...options, literalQuery: korean, waitForRateLimit: true });
  if (places.length || !korean) return { places };
  onProgress('한국어 검색 결과가 없어 영어 이름으로 바꾸고 있어요.');
  const { translatePlaceQuery } = await import('./translatePlaceQuery');
  let translatedQuery: string;
  try {
    translatedQuery = await translatePlaceQuery(query, options.signal);
  } catch {
    options.signal?.throwIfAborted();
    return { places, translationUnavailable: true };
  }
  if (translatedQuery === query.trim()) return { places };
  onProgress(`‘${translatedQuery}’로 다시 검색하고 있어요.`);
  return {
    places: await searchPlaces(translatedQuery, { ...options, literalQuery: false, waitForRateLimit: true }),
    translatedQuery,
  };
}
