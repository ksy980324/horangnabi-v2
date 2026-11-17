import type { Expense } from '../types';
import { amountInput } from './expenses';
import { dailyRateFile, isCurrentRateWindow, parseDailyWonRates, rateWindowStart, type DailyWonRates, type WonRates } from './dailyExchangeRates';

export { parseWonRates, rateWindowStart, nextRateUpdateAt, isCurrentRateWindow } from './dailyExchangeRates';
export type { WonRates } from './dailyExchangeRates';
export const RATE_RETRY_MS = 5 * 60_000;
export const RATE_ENDPOINT = (import.meta.env?.BASE_URL ?? './') + 'exchange-rates.json';
export const RATE_CACHE_KEY = 'horangnabi-v2:daily-exchange-rates:v1';
type RateStorage = Pick<Storage, 'getItem' | 'setItem'>;
const browserStorage: RateStorage = {
  getItem(key) { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } },
  setItem(key, value) { try { globalThis.localStorage?.setItem(key, value); } catch { /* Public-rate cache is optional. */ } },
};

/** The app reads the common daily file, never the external provider or private trip data. */
export function createExchangeRateClient(fetcher: typeof fetch = fetch, clock: () => number = Date.now, timeoutMs = 8000, storage: RateStorage = browserStorage) {
  let cached: DailyWonRates | undefined, pending: Promise<DailyWonRates> | undefined;
  let lastAttempt = -Infinity, lastFailure = '';
  function peek() {
    if (cached && cached.periodStart > rateWindowStart(clock())) cached = undefined;
    try {
      const raw = storage.getItem(RATE_CACHE_KEY);
      const restored = raw ? parseDailyWonRates(JSON.parse(raw), clock()) : undefined;
      if (restored && (!cached || restored.fetchedAt > cached.fetchedAt)) cached = restored;
    } catch { /* Malformed/disabled storage must not block the ledger. */ }
    return cached;
  }
  return {
    peek,
    load(): Promise<DailyWonRates> {
      peek();
      if (cached && isCurrentRateWindow(cached, clock())) return Promise.resolve(cached);
      if (pending) return pending;
      if (rateWindowStart(lastAttempt) === rateWindowStart(clock()) && clock() - lastAttempt < RATE_RETRY_MS) {
        if (lastFailure) return Promise.reject(new Error(lastFailure));
        if (cached) return Promise.resolve(cached);
      }
      lastAttempt = clock();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      pending = Promise.resolve().then(async () => {
        try {
          const url = RATE_ENDPOINT + '?day=' + rateWindowStart(clock());
          const response = await fetcher(url, {
            signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
          });
          if (!response.ok) throw new Error('오늘의 환율 파일을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.');
          const snapshot = parseDailyWonRates(await response.json(), clock());
          peek();
          const latest = cached && cached.fetchedAt > snapshot.fetchedAt ? cached : snapshot;
          cached = latest; lastFailure = '';
          try { storage.setItem(RATE_CACHE_KEY, JSON.stringify(dailyRateFile(latest))); } catch { /* Keep working in memory. */ }
          return latest;
        } catch (cause) {
          lastFailure = controller.signal.aborted ? '환율 조회 시간이 초과됐어요. 다시 시도해 주세요.'
            : cause instanceof Error && cause.message.includes('환율') ? cause.message : '오늘의 환율을 불러오지 못했어요. 연결을 확인해 주세요.';
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
