import { useState, type FormEvent } from 'react';
import { Gift, Pencil, Plus, Trash2 } from 'lucide-react';
import type { SouvenirItem } from '../types';
import { uid } from '../data';
import { isSouvenirItem, souvenirLimit } from '../services/souvenirs';
import { Modal } from './Modal';

export function Souvenirs({items,busy,onAdd,onEdit,onDelete,onCheck}:{items:SouvenirItem[];busy:boolean;onAdd:()=>void;onEdit:(id:string)=>void;onDelete:(id:string)=>void;onCheck:(item:SouvenirItem,checked:boolean)=>void}) {
  const purchased=items.filter(item=>item.purchased).length;
  return <section className="souvenirs" aria-label="기념품 리스트">
    <div className="reservations-heading"><h2>기념품 리스트</h2><button className="primary" disabled={busy||items.length>=souvenirLimit} onClick={onAdd}><Plus size={17}/>기념품 추가</button></div>
    <div className="packing-progress"><span role="status">{items.length}개 중 {purchased}개 구매 완료</span><progress aria-label="기념품 구매 진행률" max={items.length||1} value={purchased}/></div>
    <p className="muted">한 사람이 체크하면 함께 구매 완료로 표시돼요. 가계부에는 자동으로 추가되지 않아요.</p>
    {items.length>=souvenirLimit&&<p className="muted">기념품은 여행당 {souvenirLimit}개까지 등록할 수 있어요.</p>}
    {items.length?<ul className="souvenir-items">{items.map(item=><li key={item.id} className={item.purchased?'purchased':''}>
      <div className="souvenir-entry"><label><input type="checkbox" checked={item.purchased} disabled={busy} aria-label={`${item.name} 구매 완료`} onChange={event=>onCheck(item,event.target.checked)}/><strong>{item.name}</strong></label><span className="badge">{item.quantity}개</span></div>
      <p className="muted">{item.recipient?`받을 사람 · ${item.recipient}`:'받을 사람 미정'} · {item.purchased?'구매 완료':'구매 전'}</p>
      {item.memo&&<p className="souvenir-memo">{item.memo}</p>}
      <div className="expense-actions"><button className="text-button" disabled={busy} aria-label={`${item.name} 수정`} onClick={()=>onEdit(item.id)}><Pencil size={14}/>수정</button><button className="text-button danger" disabled={busy} aria-label={`${item.name} 삭제`} onClick={()=>{if(confirm(`‘${item.name}’ 기념품을 삭제할까요?`))onDelete(item.id);}}><Trash2 size={14}/>삭제</button></div>
    </li>)}</ul>:<div className="empty"><Gift size={32}/><h3>챙겨주고 싶은 마음을 적어보세요</h3><p>기념품과 받을 사람을 함께 기록할 수 있어요.</p></div>}
  </section>;
}
export function SouvenirForm({item,busy,status,onClose,onSave}:{item?:SouvenirItem;busy:boolean;status?:string;onClose:()=>void;onSave:(item:SouvenirItem)=>void}) {
  const [name,setName]=useState(item?.name??''),[recipient,setRecipient]=useState(item?.recipient??'');
  const [quantity,setQuantity]=useState(String(item?.quantity??1)),[memo,setMemo]=useState(item?.memo??''),[error,setError]=useState('');
  function save(event:FormEvent) {
    event.preventDefault();if(busy)return;
    const value={id:item?.id??uid(),name:name.trim(),recipient:recipient.trim(),quantity:/^\d+$/.test(quantity)?Number(quantity):NaN,memo:memo.trim(),purchased:item?.purchased??false};
    if(!isSouvenirItem(value))return setError('기념품 이름과 수량(1~999개)을 확인해 주세요.');
    onSave(value);
  }
  return <Modal title={item?'기념품 수정':'기념품 추가'} busy={busy} status={status} onClose={onClose}><form className="form" onSubmit={save} onChange={()=>setError('')}>
    <label>기념품 이름<input autoFocus required maxLength={150} value={name} onChange={event=>setName(event.target.value)} placeholder="예: 말차 과자"/></label>
    <div className="form-row"><label>받을 사람 <small>선택</small><input maxLength={100} value={recipient} onChange={event=>setRecipient(event.target.value)} placeholder="예: 부모님, 친구"/></label><label>수량<input required type="number" inputMode="numeric" min={1} max={999} step={1} value={quantity} onChange={event=>setQuantity(event.target.value)}/></label></div>
    <label>메모 <small>선택</small><textarea maxLength={1000} rows={3} value={memo} onChange={event=>setMemo(event.target.value)} placeholder="구매할 곳, 맛이나 색상 등을 적어주세요"/></label>
    {error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>저장</button>
  </form></Modal>;
}
