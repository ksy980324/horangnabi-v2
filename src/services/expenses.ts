import type { Expense } from '../types';

export const currencies = ['KRW', 'JPY', 'USD', 'EUR', 'TWD', 'THB', 'VND', 'CNY', 'HKD', 'SGD', 'GBP', 'AUD', 'CAD', 'NZD', 'PHP', 'MYR', 'IDR', 'CHF'] as const;
export const expenseLimit = 500;
const maxAmount = 999_999_999_999;
const currencyNames = new Intl.DisplayNames('ko', { type: 'currency' });
export const currencyName = (currency: string) => currencyNames.of(currency);
const formatters = new Map(currencies.map(currency => [currency, new Intl.NumberFormat('ko-KR', { style: 'currency', currency, currencyDisplay: 'code' })]));
const formatter = (currency: string) => formatters.get(currency as typeof currencies[number]);

export function formatAmount(amount: number, currency: string) {
  const format = formatter(currency)!;
  return format.format(amount / 10 ** format.resolvedOptions().maximumFractionDigits!);
}

export function parseAmount(value: string, currency: string) {
  const digits = formatter(currency)?.resolvedOptions().maximumFractionDigits;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match || digits === undefined || (match[2]?.length ?? 0) > digits) return;
  const amount = Number(match[1] + (match[2] ?? '').padEnd(digits, '0'));
  if (Number.isSafeInteger(amount) && amount > 0 && amount <= maxAmount) return amount;
}

export function amountInput(amount: number, currency: string) {
  return String(amount / 10 ** formatter(currency)!.resolvedOptions().maximumFractionDigits!);
}

export function isExpense(value: unknown): value is Expense {
  if (!value || typeof value !== 'object') return false;
  const item = value as Expense;
  const validText = (text: unknown, max: number) => typeof text === 'string' && !!text.trim() && text.length <= max;
  return validText(item.id, 128) && validText(item.name, 100) && validText(item.paidBy, 128)
    && typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
    && Number.isFinite(Date.parse(item.date)) && new Date(item.date).toISOString().slice(0, 10) === item.date
    && !!formatter(item.currency) && Number.isSafeInteger(item.amount) && item.amount > 0 && item.amount <= maxAmount
    && typeof item.shared === 'boolean';
}

export function summarizeExpenses(items: Expense[], members: readonly string[]) {
  const totals = new Map<string, { total: number; shared: number; balance: number; formerMember: boolean }>();
  for (const item of items) {
    const entry = totals.get(item.currency) ?? { total: 0, shared: 0, balance: 0, formerMember: false };
    entry.total += item.amount;
    if (item.shared) {
      entry.shared += item.amount;
      if (item.paidBy === members[0]) entry.balance += item.amount;
      else if (item.paidBy === members[1]) entry.balance -= item.amount;
      else entry.formerMember = true;
    }
    totals.set(item.currency, entry);
  }
  return [...totals].map(([currency, entry]) => {
    const amount = Math.floor(Math.abs(entry.balance) / 2);
    return {
      currency, ...entry, amount,
      from: members[entry.balance > 0 ? 1 : 0],
      to: members[entry.balance > 0 ? 0 : 1],
    };
  });
}
