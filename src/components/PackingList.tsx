import { useState, type FormEvent } from 'react';
import { Check, Luggage, Pencil, Plus, Trash2, X } from 'lucide-react';
import { uid } from '../data';
import type { PackingItem } from '../types';

type Props = { items: PackingItem[]; onSave: (item: PackingItem) => Promise<boolean>; onDelete: (id: string) => void };
export function PackingList({ items, onSave, onDelete }: Props) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [error, setError] = useState('');
  const completed = items.filter(item => item.completed).length;
  async function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError('준비물 이름을 입력해 주세요.');
    if (await onSave({ id: uid(), name: name.trim(), completed: false })) {
      setName(current => current === name ? '' : current);
      setError('');
    }
  }
  async function rename(event: FormEvent, item: PackingItem) {
    event.preventDefault();
    if (!draft.trim()) return setError('준비물 이름을 입력해 주세요.');
    if (item.name !== originalName) return setError('다른 기기에서 이름을 변경했어요. 편집을 다시 열어 주세요.');
    if (await onSave({ ...item, name: draft.trim() })) {
      setEditingId(undefined);
      setError('');
    }
  }
  return <section className="packing-list" aria-label="여행 준비물">
    <div className="packing-heading"><div><h2>여행 준비물</h2><p>하나씩 챙기고, 가볍게 떠나요.</p></div><Luggage size={30} aria-hidden="true"/></div>
    <div className="packing-progress"><span role="status">{items.length ? `${items.length}개 중 ${completed}개 준비 완료` : '아직 등록한 준비물이 없어요.'}</span><progress aria-label="준비물 완료 진행률" max={items.length || 1} value={completed}/></div>
    <form className="packing-add" onSubmit={add}><label htmlFor="packing-name">준비물 추가</label><div><input id="packing-name" value={name} onChange={event => setName(event.target.value)} maxLength={150} placeholder="예: 여권, 충전기, 상비약" autoComplete="off"/><button className="primary" disabled={!name.trim()}><Plus size={17}/>추가</button></div></form>
    {error && <p className="error" role="alert">{error}</p>}
    {items.length ? <ul className="packing-items">{items.map(item => <li key={item.id} className={item.completed ? 'completed' : ''}>
      {editingId === item.id ? <form className="packing-edit" onSubmit={event => rename(event, item)}><input aria-label={`${item.name} 이름 수정`} autoFocus value={draft} onChange={event => setDraft(event.target.value)} maxLength={150}/><button className="icon-button" aria-label="준비물 수정 저장" disabled={!draft.trim()}><Check size={19}/></button><button type="button" className="icon-button" aria-label="준비물 수정 취소" onClick={() => { setEditingId(undefined); setError(''); }}><X size={19}/></button></form> : <>
        <label className="packing-check"><input type="checkbox" checked={item.completed} onChange={event => onSave({ ...item, completed: event.target.checked })}/><span>{item.name}</span></label>
        <div className="packing-actions"><button className="icon-button" aria-label={`${item.name} 수정`} onClick={() => { setEditingId(item.id); setDraft(item.name); setOriginalName(item.name); setError(''); }}><Pencil size={16}/></button><button className="icon-button danger" aria-label={`${item.name} 삭제`} onClick={() => { if (confirm(`‘${item.name}’ 준비물을 삭제할까요?`)) onDelete(item.id); }}><Trash2 size={16}/></button></div>
      </>}
    </li>)}</ul> : <div className="empty"><Luggage size={32}/><h3>꼭 챙길 것부터 적어보세요</h3><p>여행별로 따로 저장돼요.</p></div>}
  </section>;
}
