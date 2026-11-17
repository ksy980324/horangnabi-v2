import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Expense } from '../src/types';
import { summarizeExpenses } from '../src/services/expenses';
import { createExchangeRateClient, parseWonRates, RATE_ENDPOINT, RATE_REFRESH_MS, summarizeWonExpenses } from '../src/services/exchangeRates';
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

test('rate client deduplicates concurrent requests, caches for a minute and requests no private data', async () => {
  let now = 0, calls = 0, resolve!: (value: Response) => void;
  const fetcher: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, RATE_ENDPOINT); assert.equal(options?.credentials, 'omit');
    assert.equal(options?.referrerPolicy, 'no-referrer'); assert.equal(options?.cache, 'no-store');
    assert.equal(options?.body, undefined); assert.equal(options?.headers, undefined);
    return new Promise<Response>(done => { resolve = done; });
  };
  const client = createExchangeRateClient(fetcher, () => now);
  const first = client.load(), concurrent = client.load();
  assert.equal(first, concurrent);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolve(Response.json(response)); const cached = await first;
  now = RATE_REFRESH_MS - 1;
  assert.equal(await client.load(), cached); assert.equal(calls, 1);
  now = RATE_REFRESH_MS;
  const next = client.load(); await Promise.resolve(); resolve(Response.json(response));
  assert.equal((await next).fetchedAt, now); assert.equal(calls, 2);
});

test('failed refresh preserves previous rates, throttles repeated errors and later recovers', async () => {
  let now = 0, calls = 0;
  const client = createExchangeRateClient(async () => {
    calls++; return calls === 2 ? new Response('', { status: 429 }) : Response.json(response);
  }, () => now);
  const saved = await client.load(); now = RATE_REFRESH_MS;
  await assert.rejects(client.load(), /제한/); assert.equal(client.peek(), saved);
  await assert.rejects(client.load(), /제한/); assert.equal(calls, 2);
  now += RATE_REFRESH_MS;
  assert.equal((await client.load()).fetchedAt, now); assert.equal(calls, 3);
});

test('invalid responses, synchronous network errors and timeouts do not poison pending requests', async () => {
  let now = 0, calls = 0;
  const client = createExchangeRateClient(() => {
    calls++; if (calls === 1) throw new Error('network');
    return Promise.resolve(Response.json(response));
  }, () => now);
  await assert.rejects(client.load(), /연결/); now += RATE_REFRESH_MS;
  assert.equal((await client.load()).fetchedAt, now);
  const invalid = createExchangeRateClient(async () => Response.json({ data: {} }));
  await assert.rejects(invalid.load(), /환율/);
  const timeout = createExchangeRateClient(async (_url, options) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }), Date.now, 5);
  await assert.rejects(timeout.load(), /시간이 초과/);
});

test('won total renders cumulative spending, yen per 100, lookup time, stale state and incomplete totals honestly', () => {
  const items = [expense('JPY', 1500), expense('USD', 123), expense('KRW', 12000)];
  const snapshot = parseWonRates(response, Date.UTC(2026, 10, 17, 0));
  const props = { items, snapshot, loading: false, error: '', now: snapshot.fetchedAt, onRefresh() {} };
  const markup = renderToStaticMarkup(createElement(WonExpenseSummary, props));
  for (const text of ['원화 환산 누적 지출', '27,722원', '100엔 =', '1 USD =', '환율 조회', 'Coinbase', '단순 기록용', '실제 환전·카드 청구액']) assert.ok(markup.includes(text), text);
  const stale = renderToStaticMarkup(createElement(WonExpenseSummary, { ...props, now: snapshot.fetchedAt + 300000, error: '연결 실패' }));
  assert.ok(stale.includes('이전 조회 환율 적용')); assert.ok(stale.includes('연결 실패')); assert.ok(stale.includes('27,722원'));
  const missing = renderToStaticMarkup(createElement(WonExpenseSummary, { ...props, snapshot: undefined }));
  assert.ok(missing.includes('전체 합계를 표시하지 않았어요')); assert.ok(!missing.includes('expense-won-amount">12,000원'));
  const won = renderToStaticMarkup(createElement(WonExpenseSummary, { ...props, items: [expense('KRW', 12000)], snapshot: undefined }));
  assert.ok(won.includes('12,000원')); assert.ok(!won.includes('환율 새로고침'));
});
