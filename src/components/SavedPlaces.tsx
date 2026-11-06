import { useState } from 'react';
import { Bookmark, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import type { SavedPlace } from '../types';
import { isGoogleMapsLink } from '../services/googleMapsLink';

type Props = {
  places: SavedPlace[]; dates: string[]; selected?: string;
  onSelect: (id: string) => void; onAdd: () => void; onEdit: (place: SavedPlace) => void;
  onDelete: (id: string) => void; onMove: (id: string, date: string) => void;
};
function SavedPlaceCard({ place, number, dates, selected, onSelect, onEdit, onDelete, onMove }: Omit<Props, 'places' | 'onAdd'> & { place: SavedPlace; number: number }) {
  const [date, setDate] = useState(dates[0]);
  const targetDate = dates.includes(date) ? date : dates[0];
  return <article id={`stop-${place.id}`} className={`stop-card ${selected === place.id ? 'selected' : ''}`}>
    <span className="stop-number">{number}</span><div className="stop-content saved-place-content">
      <button className="stop-select" aria-expanded={selected === place.id} onClick={() => onSelect(place.id)}>
        <div className="stop-meta"><span>{place.category}</span><span>날짜 미정</span></div>
        <h3>{place.name}</h3><p><MapPin size={12}/>{place.address || '아직 위치를 정하지 않았어요'}</p>
      </button>
      {selected === place.id && <div className="stop-detail">
        {place.memo && <p className="memo">{place.memo}</p>}
        {isGoogleMapsLink(place.mapUrl) && <a className="text-button" href={place.mapUrl} target="_blank" rel="noopener noreferrer">Google 지도에서 열기</a>}
        {place.lat !== undefined && <small className="muted">{place.lat.toFixed(5)}, {place.lng!.toFixed(5)}</small>}
        <div className="stop-actions"><button className="text-button" onClick={() => onEdit(place)}><Pencil size={14}/>수정</button><button className="text-button danger" onClick={() => { if (confirm(`‘${place.name}’ 장소를 보관함에서 삭제할까요?`)) onDelete(place.id); }}><Trash2 size={14}/>삭제</button></div>
        <div className="saved-place-move"><label>일정으로 옮길 날짜<select aria-label={`${place.name} 이동 날짜`} value={targetDate} onChange={event => setDate(event.target.value)}>{dates.map((date, index) => <option key={date} value={date}>{index + 1}일차 · {date.slice(5)}</option>)}</select></label><button className="secondary" disabled={!targetDate} onClick={() => onMove(place.id, targetDate)}>일정으로 이동</button></div>
        <p className="city-hint">선택한 날짜의 마지막 일정에 시간 미정으로 추가하고 보관함에서 옮겨요.</p>
      </div>}
    </div>
  </article>;
}
export function SavedPlaces(props: Props) {
  return <section className="schedule saved-places" aria-label="장소 보관함">
    <div className="day-heading"><div><h2>가보고 싶은 곳</h2><p className="city-hint">날짜는 나중에 정해도 괜찮아요.</p></div><span className="badge">{props.places.length}개의 후보</span></div>
    {props.places.length ? <div className="stop-list">{props.places.map((place, index) => <SavedPlaceCard key={place.id} {...props} place={place} number={index + 1}/>)}</div> : <div className="empty"><Bookmark size={32}/><h3>마음에 드는 장소를 모아두세요</h3><p>검색하거나 지도에서 골라 후보로 저장할 수 있어요.</p></div>}
    <button className="add-stop" onClick={props.onAdd}><Plus size={18}/>후보 장소 추가</button>
  </section>;
}
