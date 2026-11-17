import type { Expense } from '../types';
import { amountInput, currencies } from './expenses';

export type WonRates = { fetchedAt: number; wonPerUnit: Partial<Record<string, number>> };
export const RATE_REFRESH_MS = 60_000;
export const RATE_STALE_MS = 5 * 60_000;
export const RATE_ENDPOINT = 'https://api.coinbase.com/v2/exchange-rates';
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

/** Public rates only. Never send an amount, trip ID, Firebase token or account data. */
export function createExchangeRateClient(fetcher: typeof fetch = fetch, clock: () => number = Date.now, timeoutMs = 8000) {
  let cached: WonRates | undefined, pending: Promise<WonRates> | undefined;
  let lastAttempt = -Infinity, lastFailure = '';
  return {
    peek: () => cached,
    load(): Promise<WonRates> {
      if (pending) return pending;
      if (clock() - lastAttempt < RATE_REFRESH_MS) {
        if (lastFailure) return Promise.reject(new Error(lastFailure));
        if (cached) return Promise.resolve(cached);
      }
      lastAttempt = clock();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      pending = Promise.resolve().then(async () => {
        try {
          const response = await fetcher(RATE_ENDPOINT, {
            signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', mode: 'cors',
          });
          if (!response.ok) throw new Error(response.status === 429 ? '환율 요청이 잠시 제한됐어요. 1분 뒤 다시 시도해 주세요.' : '최신 환율을 불러오지 못했어요.');
          const snapshot = parseWonRates(await response.json(), clock());
          cached = snapshot; lastFailure = '';
          return snapshot;
        } catch (cause) {
          lastFailure = controller.signal.aborted ? '환율 조회 시간이 초과됐어요. 다시 시도해 주세요.'
            : cause instanceof Error && cause.message.includes('환율') ? cause.message : '최신 환율을 불러오지 못했어요. 연결을 확인해 주세요.';
          throw new Error(lastFailure);
        } finally { clearTimeout(timer); pending = undefined; }
      });
      return pending;
    },
  };
}
export const exchangeRateClient = createExchangeRateClient();

export function summarizeWonExpenses(items: Expense[], snapshot?: WonRates) {
  const grouped = new Map<string, number>();
  for (const item of items) grouped.set(item.currency, (grouped.get(item.currency) ?? 0) + item.amount);
  let sum = 0, overflow = false;
  const missingCurrencies: string[] = [];
  const rows = [...grouped].map(([currency, amount]) => {
    const candidate = currency === 'KRW' ? 1 : snapshot?.wonPerUnit[currency];
    const rate = candidate !== undefined && Number.isFinite(candidate) && candidate > 0 ? candidate : undefined;
    if (rate === undefined) missingCurrencies.push(currency);
    const rawWon = rate === undefined ? undefined : Number(amountInput(amount, currency)) * rate;
    if (rawWon !== undefined) {
      if (!Number.isFinite(rawWon) || !Number.isSafeInteger(Math.round(rawWon))) overflow = true;
      else sum += rawWon;
    }
    return { currency, amount, rate, won: rawWon === undefined ? undefined : Math.round(rawWon) };
  });
  if (!Number.isFinite(sum) || !Number.isSafeInteger(Math.round(sum))) overflow = true;
  return { rows, missingCurrencies, overflow, totalWon: missingCurrencies.length || overflow ? undefined : Math.round(sum) };
}
