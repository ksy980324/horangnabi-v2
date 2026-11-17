import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Expense } from '../src/types';
import { summarizeExpenses } from '../src/services/expenses';
import { createExchangeRateClient, parseWonRates, RATE_ENDPOINT, RATE_RETRY_MS, RATE_CACHE_KEY, nextRateUpdateAt, rateWindowStart, summarizeWonExpenses } from '../src/services/exchangeRates';
import { dailyRateFile, parseDailyWonRates, isCurrentRateWindow } from '../src/services/dailyExchangeRates';
import { prepareDailyRates } from '../scripts/update-exchange-rates';
import { readFileSync } from 'node:fs';
import { WonExpenseSummary } from '../src/components/ExpenseWonTotal';

const response = { data: { currency: 'USD', rates: { USD: '1.0', KRW: '1400', JPY: '150', EUR: '0.9', BTC: '0.00001' } } };
const expense = (currency: string, amount: number, extra: Partial<Expense> = {}): Expense => ({
  id: currency, name: '식사', date: '2026-11-17', currency, amount, paidBy: 'alice', shared: true, ...extra,
});

test('USD-base rates invert correctly for yen and keep KRW fixed without importing non-app currencies', () => {
  const rates = parseWonRates(response, 1_000);
  assert.equal(rates.wonPerUnit.USD, 1400);
  assert.equal(rates.wonPerUnit.JPY, 1400 / 150);
  assert.equal(rates.wonPerUnit.KRW, 1);
  assert.equal(rates.wonPerUnit.BTC, undefined);
  assert.equal(rates.fetchedAt, 1_000);
  for (const bad of [null, {}, { data: { currency: 'KRW', rates: response.data.rates } }, { data: { currency: 'USD', rates: [] } }, { data: { currency: 'USD', rates: { USD: '1', KRW: '0' } } }, { data: { currency: 'USD', rates: { USD: '2', KRW: '1400' } } }]) assert.throws(() => parseWonRates(bad, 1_000));
  for (const bad of ['NaN', '-1', '', 'Infinity', '1e309', null, true, ' 150 ']) {
    const value = { data: { currency: 'USD', rates: { ...response.data.rates, JPY: bad } } };
    assert.equal(parseWonRates(value, 1_000).wonPerUnit.JPY, undefined);
  }
  assert.throws(() => parseWonRates(response, -1));
});

test('yen, USD cents and won combine across shared, personal and record-only expenses without changing stored values or settlement', () => {
  const items = [
    expense('JPY', 1500), expense('USD', 123, { shared: false }),
    expense('KRW', 12000, { shared: false, recordOnly: true, paidBy: 'former' }),
  ];
  const original = JSON.stringify(items), settlement = summarizeExpenses(items, ['alice', 'bob']);
  const sum = summarizeWonExpenses(items, parseWonRates(response, 1_000));
  assert.equal(sum.totalWon, 27722);
  assert.deepEqual(sum.rows.map(row => row.won), [14000, 1722, 12000]);
  assert.deepEqual(sum.missingCurrencies, []);
  assert.equal(JSON.stringify(items), original);
  assert.deepEqual(summarizeExpenses(items, ['alice', 'bob']), settlement);
});

test('round only the final total, refuse incomplete and unsafe totals, and calculate all-KRW without rates', () => {
  assert.equal(summarizeWonExpenses([expense('JPY', 1), expense('JPY', 1, { id: 'second' })], { fetchedAt: 0, wonPerUnit: { JPY: 0.49 } }).totalWon, 1);
  assert.equal(summarizeWonExpenses([expense('KRW', 12000)]).totalWon, 12000);
  assert.equal(summarizeWonExpenses([]).totalWon, 0);
  const incomplete = summarizeWonExpenses([expense('KRW', 12000), expense('JPY', 100)]);
  assert.equal(incomplete.totalWon, undefined);
  assert.deepEqual(incomplete.missingCurrencies, ['JPY']);
  const unavailable = summarizeWonExpenses([expense('GBP', 10000)], parseWonRates(response, 100));
  assert.equal(unavailable.totalWon, undefined);
  assert.deepEqual(unavailable.missingCurrencies, ['GBP']);
  const huge = summarizeWonExpenses([expense('USD', 999999999999)], { fetchedAt: 0, wonPerUnit: { USD: 1e12 } });
  assert.equal(huge.overflow, true); assert.equal(huge.totalWon, undefined);
});


const daily = (at: number) => dailyRateFile({ ...parseWonRates(response, at), periodStart: rateWindowStart(at) });
const memoryStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

test('daily client deduplicates and persists a current period across reopening without provider requests', async () => {
  let now = Date.UTC(2026, 10, 16, 23, 5), calls = 0, resolve!: (value: Response) => void;
  const storage = memoryStorage();
  const fetcher: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, RATE_ENDPOINT + '?day=' + rateWindowStart(now));
    assert.equal(options?.credentials, 'omit'); assert.equal(options?.referrerPolicy, 'no-referrer');
    assert.equal(options?.body, undefined); assert.equal(options?.headers, undefined);
    assert.ok(!String(url).includes('coinbase.com'));
    return new Promise<Response>(done => { resolve = done; });
  };
  const client = createExchangeRateClient(fetcher, () => now, 8000, storage);
  const first = client.load(), concurrent = client.load();
  assert.equal(first, concurrent); await Promise.resolve(); assert.equal(calls, 1);
  resolve(Response.json(daily(now))); const cached = await first;
  now += 5 * 3600000;
  assert.equal(await client.load(), cached); assert.equal(calls, 1);
  const reopened = createExchangeRateClient(fetcher, () => now, 8000, storage);
  assert.deepEqual(await reopened.load(), cached); assert.equal(calls, 1);
  assert.equal(JSON.parse(storage.getItem(RATE_CACHE_KEY)!).source, 'coinbase');
  now = nextRateUpdateAt(now);
  const next = reopened.load(); await Promise.resolve(); resolve(Response.json(daily(now)));
  assert.equal((await next).fetchedAt, now); assert.equal(calls, 2);
});

test('failed daily refresh preserves previous rates, throttles retries and later recovers', async () => {
  let now = Date.UTC(2026, 10, 16, 23, 5), calls = 0;
  const client = createExchangeRateClient(async () => {
    calls++; return calls === 2 ? new Response('', { status: 503 }) : Response.json(daily(now));
  }, () => now, 8000, memoryStorage());
  const saved = await client.load(); now = nextRateUpdateAt(now);
  await assert.rejects(client.load(), /환율/); assert.equal(client.peek(), saved);
  await assert.rejects(client.load(), /환율/); assert.equal(calls, 2);
  now += RATE_RETRY_MS;
  assert.equal((await client.load()).fetchedAt, now); assert.equal(calls, 3);
});

test('invalid files, synchronous network errors and timeouts do not poison daily pending requests', async () => {
  let now = Date.UTC(2026, 10, 16, 23, 5), calls = 0;
  const client = createExchangeRateClient(() => {
    calls++; if (calls === 1) throw new Error('network');
    return Promise.resolve(Response.json(daily(now)));
  }, () => now, 8000, memoryStorage());
  await assert.rejects(client.load(), /연결/); now += RATE_RETRY_MS;
  assert.equal((await client.load()).fetchedAt, now);
  await assert.rejects(createExchangeRateClient(async () => Response.json({ data: {} }), Date.now, 8000, memoryStorage()).load(), /환율/);
  const timeout = createExchangeRateClient(async (_url, options) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }), Date.now, 5, memoryStorage());
  await assert.rejects(timeout.load(), /시간이 초과/);
});

test('daily UI labels 08:00 KST, hides needless refresh and clearly marks previous-day and incomplete totals', () => {
  const items = [expense('JPY', 1500), expense('USD', 123), expense('KRW', 12000)];
  const snapshot = parseWonRates(response, Date.UTC(2026, 10, 17, 0));
  const props = { items, snapshot, loading: false, error: '', now: snapshot.fetchedAt, onRefresh() {} };
  const markup = renderToStaticMarkup(createElement(WonExpenseSummary, props));
  for (const text of ['원화 환산 누적 지출', '27,722원', '100엔 =', '1 USD =', '환율 갱신', 'Coinbase', '단순 기록용', '매일 오전 8시', '실제 환전·카드 청구액']) assert.ok(markup.includes(text), text);
  assert.ok(!markup.includes('다시 확인'));
  const stale = renderToStaticMarkup(createElement(WonExpenseSummary, { ...props, now: nextRateUpdateAt(snapshot.fetchedAt) }));
  for (const text of ['이전 조회 환율 적용', '갱신을 기다리고', '27,722원', '다시 확인']) assert.ok(stale.includes(text));
  const failed = renderToStaticMarkup(createElement(WonExpenseSummary, { ...props, error: '연결 실패' }));
  assert.ok(failed.includes('연결 실패')); assert.ok(failed.includes('이전 조회 환율 적용'));
  const missing = renderToStaticMarkup(createElement(WonExpenseSummary, { ...props, snapshot: undefined }));
  assert.ok(missing.includes('전체 합계를 표시하지 않았어요')); assert.ok(!missing.includes('expense-won-amount">12,000원'));
  const won = renderToStaticMarkup(createElement(WonExpenseSummary, { ...props, items: [expense('KRW', 12000)], snapshot: undefined }));
  assert.ok(won.includes('12,000원')); assert.ok(!won.includes('다시 확인'));
});

test('Korean 08:00 boundaries are exact across UTC midnight, month, year and leap days', () => {
  for (const date of ['2026-11-16', '2026-12-31', '2028-02-28', '2028-02-29']) {
    const boundary = Date.parse(date + 'T23:00:00Z');
    assert.equal(rateWindowStart(boundary - 1), boundary - 86400000);
    assert.equal(nextRateUpdateAt(boundary - 1), boundary);
    assert.equal(rateWindowStart(boundary), boundary);
    assert.equal(nextRateUpdateAt(boundary), boundary + 86400000);
    assert.equal(rateWindowStart(boundary + 8 * 3600000), boundary);
    assert.equal(isCurrentRateWindow(parseWonRates(response, boundary), boundary + 86399999), true);
    assert.equal(isCurrentRateWindow(parseWonRates(response, boundary), boundary + 86400000), false);
  }
});

test('daily cache validation tolerates damaged or disabled storage and rejects malformed future rates', async () => {
  const now = Date.UTC(2026, 10, 16, 23, 5), file = daily(now);
  assert.deepEqual(parseDailyWonRates(file, now).wonPerUnit, file.wonPerUnit);
  for (const invalid of [null, { ...file, version: 2 }, { ...file, source: 'unknown' }, { ...file, periodStart: 1 },
    { ...file, fetchedAt: now + 86400000 }, { ...file, wonPerUnit: { ...file.wonPerUnit, JPY: -1 } },
    { ...file, wonPerUnit: { KRW: 1, USD: 1400 } }]) assert.throws(() => parseDailyWonRates(invalid, now));
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json(file); };
  const corrupt = memoryStorage(); corrupt.setItem(RATE_CACHE_KEY, '{invalid');
  assert.equal((await createExchangeRateClient(fetcher, () => now, 8000, corrupt).load()).fetchedAt, now);
  const disabled = { getItem(): string | null { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); } };
  assert.equal((await createExchangeRateClient(fetcher, () => now, 8000, disabled).load()).fetchedAt, now);
  assert.equal(calls, 2);
});

test('deployment prepares a shared daily file and reuses a current published file without another provider call', async () => {
  const now = Date.UTC(2026, 10, 16, 23, 5), urls: string[] = [];
  const fresh = await prepareDailyRates(async (url, options) => {
    urls.push(String(url)); assert.equal(options?.credentials, 'omit');
    return urls.length === 1 ? new Response('', { status: 404 }) : Response.json(response);
  }, () => now);
  assert.equal(fresh.status, 'updated'); assert.equal(fresh.snapshot?.periodStart, rateWindowStart(now));
  assert.ok(urls[1].includes('api.coinbase.com'));
  const reusedUrls: string[] = [];
  const reused = await prepareDailyRates(async url => { reusedUrls.push(String(url)); return Response.json(dailyRateFile(fresh.snapshot!)); }, () => now + 3600000);
  assert.equal(reused.status, 'reused'); assert.equal(reused.snapshot?.fetchedAt, now); assert.equal(reusedUrls.length, 1);
  assert.ok(!reusedUrls[0].includes('api.coinbase.com'));
});

test('provider failures retain the previous actual timestamp and explicitly mark first-deployment unavailability', async () => {
  const now = Date.UTC(2026, 10, 17, 23, 5), previous = daily(now - 86400000);
  let calls = 0;
  const fallback = await prepareDailyRates(async () => {
    calls++; return calls === 1 ? Response.json(previous) : new Response('', { status: 503 });
  }, () => now);
  assert.equal(fallback.status, 'previous'); assert.equal(fallback.snapshot?.fetchedAt, previous.fetchedAt);
  assert.equal(isCurrentRateWindow(fallback.snapshot!, now), false);
  const first = await prepareDailyRates(async () => new Response('', { status: 503 }), () => now);
  assert.equal(first.status, 'unavailable'); assert.equal(first.snapshot, undefined);
});

test('deployment schedules 23:00 UTC and prepares public rates before the existing Pages build', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
  assert.ok(workflow.includes("cron: '0 23 * * *'"));
  assert.ok(workflow.indexOf('run: node scripts/update-exchange-rates.ts') < workflow.indexOf('run: npm run build'));
  assert.ok(workflow.includes('branches: [main]'));
  assert.ok(!readFileSync('public/offline-worker.js', 'utf8').includes('exchange-rates.json'));
});
