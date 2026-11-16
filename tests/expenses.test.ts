import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExpenseForm, Expenses } from '../src/components/Expenses';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDatabase, sampleDatabase } from '../src/data.ts';
import { amountInput, currencies, currencyName, formatAmount, parseAmount, summarizeExpenses } from '../src/services/expenses.ts';
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

test('KRW accepts whole won only and displays an explicit won unit', () => {
  assert.ok(currencies.includes('KRW'));
  assert.equal(currencyName('KRW'), '원화');
  assert.equal(parseAmount('12000', 'KRW'), 12000);
  assert.equal(parseAmount('12000.5', 'KRW'), undefined);
  assert.equal(formatAmount(12000, 'KRW'), '12,000원');
  assert.equal(amountInput(12000, 'KRW'), '12000');
});

test('record-only expenses survive shared-trip decoding and never affect settlements', () => {
  const record = { ...expense, id: 'record', currency: 'KRW', amount: 12000, paidBy: 'former', shared: false, recordOnly: true };
  const restore = (value: unknown) => parseDatabase({ version: 1, trips: [{ ...sampleDatabase().trips[0], expenses: value }] }).trips[0].expenses!;
  const shared = { ...expense, currency: 'KRW', amount: 10000 };
  const items = restore(JSON.parse(JSON.stringify([shared, record])));
  assert.deepEqual(items[1], record);
  const summary = summarizeExpenses(items, ['first', 'second'])[0];
  assert.equal(summary.total, 22000);
  assert.equal(summary.shared, 10000);
  assert.equal(summary.formerMember, false);
  assert.deepEqual(summary.transfers, [{from: 'second', to: 'first', amount: 5000}]);
  assert.deepEqual(summarizeExpenses([record], ['first','second'])[0].transfers, []);
  assert.throws(() => restore([{...record, shared: true}]));
  assert.throws(() => restore([{...record, recordOnly: 'yes'}]));
  assert.equal(restore([{...record, recordOnly: undefined}])[0].shared, false);
  assert.equal(summarizeExpenses(restore([{...record, recordOnly: undefined, shared: true, paidBy: 'first'}]), ['first','second'])[0].amount, 6000);
});

test('record-only forms hide payer selection and expense lists clearly label records', () => {
  const item = {...expense, currency:'KRW', shared:false, recordOnly:true};
  const members = {userId:'first', memberIds:['first','second'], memberNames:{first:'나비',second:'호랑이'}};
  const form = renderToStaticMarkup(createElement(ExpenseForm, {item,members,defaultCurrency:'JPY',busy:false,onClose:()=>{},onSave:()=>{}}));
  assert.ok(form.includes('단순 기록용'));
  assert.ok(form.includes('기록 날짜'));
  assert.ok(!form.includes('결제한 사람'));
  assert.match(form, /value="record" selected=""/);
  const list = renderToStaticMarkup(createElement(Expenses,{items:[item],members,busy:false,onAdd:()=>{},onEdit:()=>{},onDelete:()=>{}}));
  assert.ok(list.includes('단순 기록용 · 정산 제외'));
  assert.ok(list.includes('4,501원'));
});
