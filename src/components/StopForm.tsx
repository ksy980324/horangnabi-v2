import { useState, type FormEvent } from 'react';
import { categories, type Place, type Stop, type SavedPlace } from '../types';
import { uid } from '../data';
import { hasCoordinates, type GeoPoint } from '../services/geo';
import { PlacePicker } from './PlacePicker';
import { Modal } from './Modal';
type Props = { date: string; dates: string[]; region: string; searchCenter?: GeoPoint; onClose: () => void; busy?: boolean; status?: string } & (
  { mode?: 'schedule'; stop?: Stop; onSave: (stop: Stop) => void } |
  { mode: 'saved'; savedPlace?: SavedPlace; onSave: (place: SavedPlace) => void }
);
export function StopForm(props: Props) {
  const { date, dates, region, searchCenter, onClose } = props;
  const savedMode = props.mode === 'saved';
  const stop = props.mode === 'saved' ? props.savedPlace : props.stop;
  const [place, setPlace] = useState<Place>(stop ?? { name: '', address: '' });
  const [resolving, setResolving] = useState(false);
  const [time, setTime] = useState(props.mode === 'saved' ? '' : props.stop?.time ?? '');
  const [category, setCategory] = useState<Stop['category']>(stop?.category ?? '관광');
  const [memo, setMemo] = useState(stop?.memo ?? '');
  const [day, setDay] = useState(props.mode === 'saved' ? date : props.stop?.date ?? date);
  function save(event: FormEvent) {
    event.preventDefault();
    if (resolving || props.busy) return;
    const next = { name: place.name.trim(), address: place.address, lat: place.lat, lng: place.lng, mapUrl: place.mapUrl, photoUrl: place.photoUrl, id: stop?.id ?? uid(), category, memo };
    if (props.mode === 'saved') props.onSave(next);
    else props.onSave({ ...next, date: day, time, flightReservationId: props.stop?.flightReservationId, stayReservation: props.stop?.stayReservation });
  }
  return <Modal title={savedMode ? (stop ? '후보 장소 수정' : '후보 장소 추가') : (stop ? '일정 수정' : '새 일정 추가')} onClose={onClose} busy={props.busy} status={props.status}>
    <fieldset className="stop-editor editor-fields" disabled={props.busy}>
      <PlacePicker value={place} onChange={setPlace} region={region} searchCenter={searchCenter} onResolving={setResolving}/>
      <form className="form" onSubmit={save}>
        <label>장소 이름<input required value={place.name} maxLength={150} pattern=".*\S.*" onChange={e => { setPlace({ ...place, name: e.target.value }); }}/></label>
        <label>주소<input value={place.address} maxLength={500} onChange={e => setPlace({ ...place, address: e.target.value })}/></label>
        <div className="coordinate-info">{hasCoordinates(place) ? '지도 핀이 연결됐어요.' : '위치 없이도 저장할 수 있어요.'}</div>
        {!savedMode && <div className="form-row"><label>날짜<select value={day} onChange={e => setDay(e.target.value)}>{dates.map((d, i) => <option key={d} value={d}>{i + 1}일차 · {d.slice(5)}</option>)}</select></label><label>시간 (선택)<input type="time" value={time} onChange={e => setTime(e.target.value)}/></label></div>}
        <div className="form-row"><label>카테고리<select value={category} onChange={e => setCategory(e.target.value as Stop['category'])}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>{!savedMode && <button type="button" className="secondary align-end" onClick={() => setTime('')}>시간 미정으로</button>}</div>
        <label>메모<textarea rows={3} maxLength={3000} value={memo} onChange={e => setMemo(e.target.value)} placeholder="함께 기억하고 싶은 것들을 적어 보세요."/></label>
        <button className="primary" type="submit" disabled={props.busy || resolving}>{resolving ? '지도 위치 확인 중' : stop ? '변경 저장' : savedMode ? '보관함에 저장' : '일정에 추가'}</button>
      </form>
    </fieldset>
  </Modal>;
}
