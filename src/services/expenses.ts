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
  const totals = new Map<string, { total: number; shared: number; paid: Map<string, number>; formerMember: boolean }>();
  for (const item of items) {
    const entry = totals.get(item.currency) ?? { total: 0, shared: 0, paid: new Map(members.map(id => [id, 0])), formerMember: false };
    entry.total += item.amount;
    if (item.shared) {
      entry.shared += item.amount;
      if (entry.paid.has(item.paidBy)) entry.paid.set(item.paidBy, entry.paid.get(item.paidBy)! + item.amount);
      else entry.formerMember = true;
    }
    totals.set(item.currency, entry);
  }
  return [...totals].map(([currency, entry]) => {
    const transfers: { from: string; to: string; amount: number }[] = [];
    if (members.length && !entry.formerMember) {
      const base = Math.floor(entry.shared / members.length);
      const remainder = entry.shared % members.length;
      // The highest payers bear indivisible units; preserve the previous two-person rounding.
      const ranked = [...members].sort((a, b) => entry.paid.get(b)! - entry.paid.get(a)!);
      const extra = new Set(ranked.slice(0, remainder));
      const balances = members.map(id => ({ id, balance: entry.paid.get(id)! - base - (extra.has(id) ? 1 : 0) }));
      const debtors = balances.filter(item => item.balance < 0);
      const creditors = balances.filter(item => item.balance > 0);
      let index = 0;
      for (const debtor of debtors) while (debtor.balance < 0 && index < creditors.length) {
        const creditor = creditors[index];
        const amount = Math.min(-debtor.balance, creditor.balance);
        transfers.push({ from: debtor.id, to: creditor.id, amount });
        debtor.balance += amount; creditor.balance -= amount;
        if (creditor.balance === 0) index++;
      }
    }
    return { currency, total: entry.total, shared: entry.shared, formerMember: entry.formerMember,
      transfers, amount: transfers[0]?.amount ?? 0, from: transfers[0]?.from, to: transfers[0]?.to };
  });
}
