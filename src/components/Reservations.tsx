import { useState, type FormEvent } from 'react';
import { BedDouble, ExternalLink, Pencil, Plane, Plus, Ticket, Trash2 } from 'lucide-react';
import { uid } from '../data';
import { isReservation, isReservationUrl, reservationLimits } from '../services/reservations';
import type { Reservation } from '../types';
import { Modal } from './Modal';

function displayDateTime(value: string) {
  return value.replace('T', ' ').replaceAll('-', '.');
}

export function Reservations({ items, onAdd, onEdit, onDelete }: {
  items: Reservation[]; onAdd: () => void; onEdit: (id: string) => void; onDelete: (id: string) => void;
}) {
  return <section className="reservations" aria-label="예약 정보">
    <div className="reservations-heading"><h2>예약 정보</h2><button className="primary" onClick={onAdd}><Plus size={17}/>예약 추가</button></div>
    {items.length ? <ul className="reservation-list">{items.map(item => <li className="reservation-card" key={item.id}>
      <div className="reservation-card-title">
        <span className="reservation-kind">{item.kind === 'flight' ? <><Plane size={15}/>항공편</> : <><BedDouble size={15}/>숙소</>}</span>
        <h3>{item.name}</h3>
      </div>
      <dl className="reservation-details">
        {item.kind === 'flight' && item.departure && <div><dt>출발</dt><dd>{displayDateTime(item.departure)}</dd></div>}
        {item.kind === 'stay' && <>
          {item.checkIn && <div><dt>체크인</dt><dd>{displayDateTime(item.checkIn)}</dd></div>}
          {item.checkOut && <div><dt>체크아웃</dt><dd>{displayDateTime(item.checkOut)}</dd></div>}
          {item.address && <div><dt>주소</dt><dd>{item.address}</dd></div>}
        </>}
        {item.reference && <div><dt>예약번호</dt><dd>{item.reference}</dd></div>}
      </dl>
      <div className="reservation-actions">
        {isReservationUrl(item.url) && <a className="secondary reservation-link" href={item.url} target="_blank" rel="noopener noreferrer">예약 확인<ExternalLink size={14} aria-hidden="true"/></a>}
        <button className="text-button" onClick={() => onEdit(item.id)}><Pencil size={14}/>수정</button>
        <button className="text-button danger" onClick={() => { if (confirm(`‘${item.name}’ 예약 정보를 삭제할까요?`)) onDelete(item.id); }}><Trash2 size={14}/>삭제</button>
      </div>
    </li>)}</ul> : <div className="empty"><Ticket size={30} aria-hidden="true"/><h3>아직 저장한 예약이 없어요</h3><p>항공편이나 숙소 정보를 추가해 보세요.</p></div>}
  </section>;
}

export function ReservationForm({ item, onClose, onSave, busy, status }: {
  item?: Reservation; onClose: () => void; onSave: (value: Reservation) => void; busy?: boolean; status?: string;
}) {
  const [kind, setKind] = useState<Reservation['kind']>(item?.kind ?? 'flight');
  const [name, setName] = useState(item?.name ?? '');
  const [reference, setReference] = useState(item?.reference ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const [departure, setDeparture] = useState(item?.kind === 'flight' ? item.departure ?? '' : '');
  const [checkIn, setCheckIn] = useState(item?.kind === 'stay' ? item.checkIn ?? '' : '');
  const [checkOut, setCheckOut] = useState(item?.kind === 'stay' ? item.checkOut ?? '' : '');
  const [address, setAddress] = useState(item?.kind === 'stay' ? item.address ?? '' : '');
  const [error, setError] = useState('');

  function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const details = { id: item?.id ?? uid(), name: name.trim(), reference: reference.trim() || undefined, url: url.trim() || undefined };
    if (details.url && !isReservationUrl(details.url)) return setError('https://로 시작하는 예약 확인 링크를 입력해 주세요.');
    if (kind === 'stay' && checkIn && checkOut && checkOut < checkIn) return setError('체크아웃은 체크인보다 빠를 수 없어요.');
    const reservation: Reservation = kind === 'flight' ? { ...details, kind, departure: departure || undefined }
      : { ...details, kind, checkIn: checkIn || undefined, checkOut: checkOut || undefined, address: address.trim() || undefined };
    if (!isReservation(reservation)) return setError('예약 이름과 날짜·시간을 확인해 주세요.');
    onSave(reservation);
  }

  return <Modal title={item ? '예약 수정' : '예약 추가'} onClose={onClose} busy={busy} status={status}>
    <form className="form" onSubmit={save} onChange={() => setError('')}>
      <label>예약 종류<select value={kind} onChange={event => setKind(event.target.value === 'stay' ? 'stay' : 'flight')}><option value="flight">항공편</option><option value="stay">숙소</option></select></label>
      <label>{kind === 'flight' ? '항공편명' : '숙소 이름'}<input required value={name} maxLength={reservationLimits.name} onChange={event => setName(event.target.value)} placeholder={kind === 'flight' ? '예: RS745' : '예: 카스이테이'}/></label>
      {kind === 'flight' ? <label>출발 날짜와 시간 (선택)<input type="datetime-local" value={departure} onChange={event => setDeparture(event.target.value)}/></label> : <>
        <label>체크인 날짜와 시간 (선택)<input type="datetime-local" value={checkIn} onChange={event => setCheckIn(event.target.value)}/></label>
        <label>체크아웃 날짜와 시간 (선택)<input type="datetime-local" min={checkIn || undefined} value={checkOut} onChange={event => setCheckOut(event.target.value)}/></label>
        <label>숙소 주소 (선택)<input value={address} maxLength={reservationLimits.address} onChange={event => setAddress(event.target.value)}/></label>
      </>}
      <p className="muted">예약 안내에 적힌 현지 날짜와 시간을 입력하세요.</p>
      <label>예약번호 (선택)<input value={reference} maxLength={reservationLimits.reference} onChange={event => setReference(event.target.value)}/></label>
      <label>예약 확인 링크 (선택)<input type="url" value={url} maxLength={reservationLimits.url} onChange={event => setUrl(event.target.value)} placeholder="https://…"/></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={busy}>예약 저장</button>
    </form>
  </Modal>;
}
