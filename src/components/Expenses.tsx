import { ExpenseWonTotal } from './ExpenseWonTotal';
import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { uid } from '../data';
import { amountInput, currencies, currencyName, expenseLimit, formatAmount, isExpense, parseAmount, summarizeExpenses } from '../services/expenses';
import type { Expense } from '../types';
import { Modal } from './Modal';

type Members = { userId: string; memberIds: readonly string[]; memberNames?: Record<string, string> };
const memberLabel = (id: string, members: Members) =>
  id === members.userId ? '나' : members.memberNames?.[id] || (members.memberIds.includes(id) ? '동행인' : '이전 참여자 · ' + id.slice(-6));

export function Expenses({ items, members, busy, onAdd, onEdit, onDelete }: {
  items: Expense[]; members: Members; busy: boolean; onAdd: () => void; onEdit: (id: string) => void; onDelete: (id: string) => void;
}) {
  const summaries = summarizeExpenses(items, members.memberIds);
  return <section className="expenses" aria-label="공동 가계부">
    <div className="reservations-heading"><h2>공동 가계부</h2><button className="primary" disabled={busy || items.length >= expenseLimit} onClick={onAdd}><Plus size={17}/>지출 추가</button></div>
    {items.length > 0 && <ExpenseWonTotal items={items}/>}
    {items.length >= expenseLimit && <p className="muted">여행당 지출을 {expenseLimit}개까지 기록할 수 있어요.</p>}
    {summaries.length > 0 && <ul className="expense-totals" aria-label="통화별 정산">
      {summaries.map(summary => <li key={summary.currency}>
        <small>{currencyName(summary.currency)} · 전체 지출</small><strong>{formatAmount(summary.total, summary.currency)}</strong>
        <p>공동 지출 {formatAmount(summary.shared, summary.currency)}</p>
        <div className="expense-settlement">{summary.formerMember ? <p>이전 참여자의 공동 지출이 있어 정산을 표시할 수 없어요.</p> : summary.transfers.length ? summary.transfers.map((transfer, index) => <p key={index}>{memberLabel(transfer.from, members)} → {memberLabel(transfer.to, members)} {formatAmount(transfer.amount, summary.currency)}</p>) : <p>{summary.shared ? '보낼 금액이 없어요.' : '공동 지출이 없어요.'}</p>}</div>
      </li>)}
    </ul>}
    {items.length ? <ul className="expense-list">{[...items].reverse().sort((a, b) => b.date.localeCompare(a.date)).map(item =>
      <li key={item.id}><div className="expense-entry"><div><strong>{item.name}</strong>
        <p>{item.date.replaceAll('-', '.')} · {item.recordOnly ? '단순 기록용 · 정산 제외' : `${memberLabel(item.paidBy, members)} 결제 · ${item.shared ? '공동' : '개인'}`}</p></div>
        <strong>{formatAmount(item.amount, item.currency)}</strong></div>
        <div className="expense-actions">
          <button className="text-button" disabled={busy} onClick={() => onEdit(item.id)} aria-label={`${item.name} 수정`}><Pencil size={14}/>수정</button>
          <button className="text-button danger" disabled={busy} onClick={() => { if (confirm(`‘${item.name}’ 지출을 삭제할까요?`)) onDelete(item.id); }} aria-label={`${item.name} 삭제`}><Trash2 size={14}/>삭제</button>
        </div>
      </li>)}</ul> : <div className="empty"><Wallet size={30} aria-hidden="true"/><h3>아직 지출이 없어요</h3><p>공동 지출은 균등 정산하고, 개인 지출과 단순 기록용은 정산에서 제외해요.</p></div>}
  </section>;
}

export function ExpenseForm({ item, members, defaultCurrency, onClose, onSave, busy, status }: {
  item?: Expense; members: Members; defaultCurrency: string; onClose: () => void; onSave: (item: Expense) => void; busy: boolean; status?: string;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [date, setDate] = useState(item?.date ?? new Date().toLocaleDateString('sv-SE'));
  const [currency, setCurrency] = useState(item?.currency ?? defaultCurrency);
  const [amount, setAmount] = useState(item ? amountInput(item.amount, item.currency) : '');
  const [paidBy, setPaidBy] = useState(item?.paidBy ?? members.userId);
  const [kind, setKind] = useState(item?.recordOnly ? 'record' : item?.shared === false ? 'personal' : 'shared');
  const [error, setError] = useState('');
  function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const value = { id: item?.id ?? uid(), name: name.trim(), date, currency, amount: parseAmount(amount, currency), paidBy, shared: kind === 'shared', ...(kind === 'record' ? {recordOnly: true} : {}) };
    if (!isExpense(value)) return setError('이름과 날짜, 통화에 맞는 0보다 큰 금액을 확인해 주세요.');
    onSave(value);
  }
  return <Modal title={item ? '지출 수정' : '지출 추가'} onClose={onClose} busy={busy} status={status}>
    <form className="form" onSubmit={save} onChange={() => setError('')}>
      <label>지출 이름<input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="예: 저녁 식사"/></label>
      <label>{kind === 'record' ? '기록 날짜' : '결제 날짜'}<input type="date" required value={date} onChange={event => setDate(event.target.value)}/></label>
      <div className="form-row">
        <label>금액<input required inputMode="decimal" maxLength={18} value={amount} onChange={event => setAmount(event.target.value)} placeholder="예: 4500"/></label>
        <label>통화<select value={currency} onChange={event => setCurrency(event.target.value)}>
          {currencies.map(code => <option value={code} key={code}>{code} · {currencyName(code)}</option>)}
        </select></label>
      </div>
      <label>지출 구분<select value={kind} onChange={event => setKind(event.target.value)}>
        <option value="shared">공동 지출 · 현재 참여자 균등 정산</option><option value="personal">개인 지출 · 정산 제외</option><option value="record">단순 기록용 · 정산 제외</option>
      </select></label>
      {kind !== 'record' && <label>결제한 사람<select value={paidBy} onChange={event => setPaidBy(event.target.value)}>
        {members.memberIds.map(id => <option value={id} key={id}>{memberLabel(id, members)}</option>)}
        {item && !members.memberIds.includes(item.paidBy) && <option value={item.paidBy}>이전 참여자</option>}
      </select></label>}
      <p className="muted">단순 기록용은 결제자 선택 없이 총지출에만 포함하고 정산에서 제외해요. 모든 지출 기록은 참여자 모두에게 보여요. 공동 지출은 현재 참여자 기준으로 균등 정산하며, 참여자가 바뀌면 과거 지출의 정산도 다시 계산돼요.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>저장</button>
    </form>
  </Modal>;
}
