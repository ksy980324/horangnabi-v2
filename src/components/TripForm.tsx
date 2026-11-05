import { useState, type FormEvent } from 'react';
import type { Trip, TripDestination } from '../types';
import { datesBetween, uid } from '../data';
import { Modal } from './Modal';
import { DestinationPicker } from './DestinationPicker';
export function TripForm({ trip, onSave, onClose }: { trip?: Trip; onSave: (trip: Trip) => void; onClose: () => void }) {
  const [name, setName] = useState(trip?.name ?? ''), [region, setRegion] = useState(trip?.region ?? '');
  const [today] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [start, setStart] = useState(trip?.start ?? today), [end, setEnd] = useState(trip?.end ?? today);
  const [destination, setDestination] = useState<TripDestination | undefined>(trip?.destination);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    if (resolving) return;
    if (!region.trim()) return setError('국가와 도시를 선택하거나 여행지를 직접 입력해 주세요.');
    if (!datesBetween(start, end).length) return setError('종료일은 시작일 이후여야 하며, 여행은 최대 366일입니다.');
    if (trip?.stops.some(s => s.date < start || s.date > end)) return setError('기존 일정이 있는 날짜를 여행 기간에서 제외할 수 없어요. 먼저 해당 일정을 수정해 주세요.');
    onSave({ ...trip, id: trip?.id ?? uid(), name: name.trim(), region: region.trim(), destination, start, end, stops: trip?.stops ?? [] });
  }
  return <Modal title={trip ? '여행 수정' : '새로운 여행'} onClose={onClose}><form onSubmit={submit} className="form"><p className="muted">함께 떠날 다음 여행을 기록해 보세요.</p><label>여행 이름<input autoFocus required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="우리 둘, 어디로 떠날까요?" pattern=".*\S.*"/></label><DestinationPicker value={region} destination={destination} onChange={(value, location) => { setRegion(value); setDestination(location); }} onResolving={setResolving}/><div className="form-row"><label>시작일<input required type="date" value={start} onChange={e => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }}/></label><label>종료일<input required type="date" min={start} value={end} onChange={e => setEnd(e.target.value)}/></label></div>{error && <p role="alert" className="error">{error}</p>}<button className="primary" type="submit" disabled={resolving}>{trip ? '변경 저장' : '여행 만들기'}</button></form></Modal>;
}
