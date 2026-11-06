import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDatabase, sampleDatabase } from '../src/data.ts';
import { parseAmount, summarizeExpenses } from '../src/services/expenses.ts';
import type { Expense } from '../src/types.ts';

const expense: Expense = { id: 'meal', name: 'Meal', date: '2026-11-21', currency: 'JPY', amount: 4501, paidBy: 'first', shared: true };

test('expenses parse in integer minor units without silently rounding', () => {
  assert.equal(parseAmount('4501', 'JPY'), 4501);
  assert.equal(parseAmount('1.25', 'USD'), 125);
  assert.equal(parseAmount('1.2', 'USD'), 120);
  for (const value of ['0', '-1', '1.001', '1e2', '9999999999999']) assert.equal(parseAmount(value, 'USD'), undefined);
  assert.equal(parseAmount('1.5', 'JPY'), undefined);
});

test('settlement nets shared expenses by currency and ignores personal expenses', () => {
  const second = { ...expense, id: 'train', paidBy: 'second', amount: 2000 };
  const personal = { ...second, id: 'gift', amount: 3000, shared: false };
  const otherCurrency = { ...second, id: 'fee', amount: 1000, currency: 'USD' };
  const [yen, dollars] = summarizeExpenses([expense, second, personal, otherCurrency], ['first', 'second']);
  assert.deepEqual([yen.total, yen.shared, yen.amount, yen.from, yen.to], [9501, 6501, 1250, 'second', 'first']);
  assert.deepEqual([dollars.total, dollars.amount, dollars.from, dollars.to], [1000, 500, 'first', 'second']);
  assert.equal(summarizeExpenses([expense], ['second', 'new'])[0].formerMember, true);
});

test('shared trip and backup validation preserve expenses and reject malformed entries', () => {
  const db = sampleDatabase();
  const restore = (expenses: unknown) => parseDatabase({ ...db, trips: [{ ...db.trips[0], expenses }] }).trips[0];
  assert.equal(restore(undefined).expenses, undefined);
  assert.deepEqual(restore([expense]).expenses, [expense]);
  assert.throws(() => restore([expense, expense]));
  assert.throws(() => restore([{ ...expense, amount: 1.5 }]));
  assert.throws(() => restore([{ ...expense, date: '2026-02-30' }]));
});
