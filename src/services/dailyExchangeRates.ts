import { currencies } from './expenses.ts';

export type WonRates = { fetchedAt: number; wonPerUnit: Partial<Record<string, number>> };
export type DailyWonRates = WonRates & { periodStart: number };
export const RATE_DAY_MS = 86_400_000;
// 08:00 Asia/Seoul = 23:00 UTC on the preceding date. Independent of device timezone.
export const rateWindowStart = (now: number) => Math.floor((now + 3_600_000) / RATE_DAY_MS) * RATE_DAY_MS - 3_600_000;
export const nextRateUpdateAt = (now: number) => rateWindowStart(now) + RATE_DAY_MS;
export const isCurrentRateWindow = (snapshot: WonRates, now: number) => rateWindowStart(snapshot.fetchedAt) === rateWindowStart(now);

const numberRate = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value) || value.length > 80) return;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 1e12 ? number : undefined;
};

export function parseWonRates(value: unknown, fetchedAt: number): WonRates {
  const data = (value as { data?: { currency?: unknown; rates?: Record<string, unknown> } } | null)?.data;
  if (!data || data.currency !== 'USD' || !data.rates || typeof data.rates !== 'object' || Array.isArray(data.rates)
    || !Number.isSafeInteger(fetchedAt) || fetchedAt < 0 || fetchedAt > 8640000000000000) throw new Error('환율 응답을 확인하지 못했어요.');
  const krw = numberRate(data.rates.KRW);
  if (!krw || numberRate(data.rates.USD) !== 1) throw new Error('원화 환율을 확인하지 못했어요.');
  const wonPerUnit: WonRates['wonPerUnit'] = { KRW: 1 };
  for (const currency of currencies) {
    if (currency === 'KRW') continue;
    const rate = numberRate(data.rates[currency]);
    if (rate && Number.isFinite(krw / rate) && krw / rate > 0) wonPerUnit[currency] = krw / rate;
  }
  return { fetchedAt, wonPerUnit };
}


export function parseDailyWonRates(value: unknown, now: number): DailyWonRates {
  if (!value || typeof value !== 'object') throw new Error('하루 환율 파일을 읽지 못했어요.');
  const item = value as { version?: unknown; source?: unknown; periodStart?: unknown; fetchedAt?: unknown; wonPerUnit?: Record<string, unknown> };
  if (item.version !== 1 || item.source !== 'coinbase' || typeof item.fetchedAt !== 'number'
    || !Number.isSafeInteger(item.fetchedAt) || item.fetchedAt < 0 || item.fetchedAt > now + 60_000
    || item.fetchedAt > 8640000000000000 || item.periodStart !== rateWindowStart(item.fetchedAt)
    || typeof item.periodStart !== 'number' || item.periodStart > rateWindowStart(now)
    || !item.wonPerUnit || typeof item.wonPerUnit !== 'object' || Array.isArray(item.wonPerUnit)
    || item.wonPerUnit.KRW !== 1) throw new Error('하루 환율 파일을 확인하지 못했어요.');
  const wonPerUnit: WonRates['wonPerUnit'] = {};
  for (const currency of currencies) {
    const rate = item.wonPerUnit[currency];
    if (rate === undefined) continue;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || rate > 1e12) throw new Error('하루 환율 값을 확인하지 못했어요.');
    wonPerUnit[currency] = rate;
  }
  if (!wonPerUnit.USD || !wonPerUnit.JPY) throw new Error('달러·엔화 환율을 확인하지 못했어요.');
  return { fetchedAt: item.fetchedAt, periodStart: item.periodStart as number, wonPerUnit };
}

export function dailyRateFile(snapshot: DailyWonRates) {
  return { version: 1 as const, source: 'coinbase' as const, ...snapshot };
}
