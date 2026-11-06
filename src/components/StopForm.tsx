import { useMemo, useState, type FormEvent } from 'react';
import { Search, MapPin, Check } from 'lucide-react';
import { categories, type Place, type Stop, type SavedPlace } from '../types';
import { uid } from '../data';
import { searchPlaces, type SearchResult } from '../services/search';
import { hasCoordinates, parseCoordinates, type GeoPoint, type MapView } from '../services/geo';
import { resolveSearchQuery } from '../services/searchQuery';
import { TravelMap } from './TravelMap';
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
  const [anchor] = useState(() => stop && hasCoordinates(stop) ? { lat: stop.lat, lng: stop.lng } : searchCenter);
  const [view, setView] = useState<MapView>();
  const [scope, setScope] = useState(anchor ? 'nearby' : 'global');
  const [radius, setRadius] = useState(50), [area, setArea] = useState('');
  const [query, setQuery] = useState(''), [results, setResults] = useState<SearchResult[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [searched, setSearched] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [addressResults, setAddressResults] = useState(false);
  const [coordinateText, setCoordinateText] = useState('');
  const [coordinateError, setCoordinateError] = useState('');
  const [sort, setSort] = useState('relevance');
  const [time, setTime] = useState(props.mode === 'saved' ? '' : props.stop?.time ?? ''), [category, setCategory] = useState<Stop['category']>(stop?.category ?? '관광'), [memo, setMemo] = useState(stop?.memo ?? ''), [day, setDay] = useState(props.mode === 'saved' ? date : props.stop?.date ?? date);
  const points = useMemo(() => [{ ...place, id: 'picked', number: 1 }], [place]);
  const sortedResults = useMemo(() => sort === 'distance' ? [...results].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)) : results, [results, sort]);
  const searchQuery = useMemo(() => resolveSearchQuery(query), [query]);
  function resetResults() { setResults([]); setSearched(false); setSearchFailed(false); setAddressResults(false); setMessage(''); }
  async function search(e: Pick<FormEvent, 'preventDefault'>, requestedScope = scope, addressOnly = false) {
    e.preventDefault(); setBusy(true); resetResults();
    try {
      const options = { area: addressOnly ? undefined : area, ...(requestedScope === 'nearby' && anchor ? { center: anchor, radiusKm: radius } : requestedScope === 'map' && view ? { center: view.center, bounds: view.bounds } : { center: anchor }) };
      const data = await searchPlaces(addressOnly ? area : query, options);
      setResults(data); setSearched(true); setAddressResults(addressOnly);
      setMessage(data.length ? (addressOnly ? '주소로 찾은 위치예요. 지도에서 건물이나 입구를 확인해 주세요.' : `${data.length}개의 장소를 찾았어요. 주소와 지점을 확인하고 선택하세요.`) : '이 조건에서 결과가 없어요. 다른 이름이나 상세 주소로 검색해 보세요.');
    } catch (error) { setSearchFailed(true); setMessage((error as Error).message); } finally { setBusy(false); }
  }
  function pick(p: Place) {
    setPlace({ name: p.name, address: p.address, lat: p.lat, lng: p.lng });
    setMessage('위치를 선택했어요. 아래에서 장소 이름과 주소를 확인한 뒤 저장하세요.');
  }
  function applyCoordinates(event: FormEvent) {
    event.preventDefault();
    const point = parseCoordinates(coordinateText);
    if (!point) { setCoordinateError('위도, 경도 순서로 입력해 주세요. 예: 35.4585, 133.3578'); return; }
    setCoordinateError('');
    pick({ name: place.name || query.trim().slice(0, 150), address: place.address, ...point });
  }
  function save(event: FormEvent) {
    event.preventDefault();
    const next = { name: place.name.trim(), address: place.address, lat: place.lat, lng: place.lng, id: stop?.id ?? uid(), category, memo };
    if (props.mode === 'saved') props.onSave(next);
    else props.onSave({ ...next, date: day, time });
  }
  return <Modal title={savedMode ? (stop ? '후보 장소 수정' : '후보 장소 추가') : (stop ? '일정 수정' : '새 일정 추가')} onClose={onClose} busy={props.busy} status={props.status}>
    <div className="stop-editor">
      <form onSubmit={search} className="place-search">
        <div className="search-form"><input aria-label="장소 검색" disabled={busy} value={query} onChange={e => { setQuery(e.target.value); resetResults(); }} placeholder="장소·지점명 (예: 오사카 공항)" maxLength={200}/><button className="primary" disabled={busy || query.trim().length < 2 || (scope === 'map' && !view)}><Search size={18}/>{busy ? '검색 중' : '검색'}</button></div>
        <div className="search-options">
          <p className="search-region"><MapPin size={13}/>{region}</p>
          <div className="form-row"><label>검색 범위<select aria-label="검색 범위" disabled={busy} value={scope} onChange={e => { setScope(e.target.value); resetResults(); }}><option value="nearby" disabled={!anchor}>여행 일정 주변</option><option value="map" disabled={!view}>현재 지도 안</option><option value="global">전체 지역</option></select></label>{scope === 'nearby' && <label>검색 반경<select aria-label="검색 반경" disabled={busy} value={radius} onChange={e => { setRadius(Number(e.target.value)); resetResults(); }}><option value={5}>5km 이내</option><option value={20}>20km 이내</option><option value={50}>50km 이내</option></select></label>}</div>
          <label>도시·상세 주소 추가 (선택)<input disabled={busy} value={area} onChange={e => { setArea(e.target.value); resetResults(); }} placeholder="예: Osaka Namba / 도로명·건물 번호" maxLength={150}/></label>
        </div>
      </form>
      {searchQuery.expanded && <p className="hint search-query-note">{searchQuery.label ? `${searchQuery.label} · ` : ''}{searchQuery.text} 이름으로 검색합니다.</p>}
      {searchQuery.airport && scope !== 'global' && <div className="search-alternatives"><p>다른 도시의 공항은 현재 검색 범위에서 제외될 수 있어요.</p><button type="button" className="secondary" disabled={busy} onClick={e => { setScope('global'); void search(e, 'global'); }}>공항 이름으로 전체 지역 검색</button></div>}
      {searchQuery.alternatives.length > 0 && <div className="search-alternatives"><p>이타미와 간사이는 서로 다른 공항이에요. 원하는 공항을 선택한 뒤 검색하세요.</p>{searchQuery.alternatives.map(name => <button type="button" className="secondary" key={name} disabled={busy} onClick={() => { setQuery(name); resetResults(); }}>{name}</button>)}</div>}
      <p className="hint">{scope === 'nearby' ? '여행지 또는 일정 위치를 기준으로 가까운 장소를 찾아요.' : scope === 'map' ? '지도를 이동·확대한 뒤 검색하면 보이는 범위에서 찾아요.' : '여행 도시나 상세 주소를 함께 입력하면 더 정확해요.'} 입력 중에는 검색하지 않습니다.</p>
      <TravelMap points={points} selected="picked" initialCenter={anchor} onViewChange={setView} fitKey={`${place.lat},${place.lng}`} onPick={pick}/>
      <p className="search-credit">장소 검색: Photon · © OpenStreetMap contributors</p>
      <p role="status" className="hint">{message}</p>
      {results.some(result => !result.nameLocalized) && <p className="hint">한국어 이름이 없는 일부 장소는 원문으로 표시됩니다.</p>}
      {searched && !results.length && scope !== 'global' && <button type="button" className="secondary search-widen" disabled={busy} onClick={e => { setScope('global'); void search(e, 'global', addressResults); }}>범위 제한 없이 다시 검색</button>}
      {searched && !addressResults && area.trim().length >= 2 && <button type="button" className="secondary search-widen" disabled={busy} onClick={e => void search(e, scope, true)}>장소 이름 빼고 주소로 검색</button>}
      {results.length > 0 && <div className="result-toolbar"><strong>검색 결과 {results.length}개</strong><label>정렬<select aria-label="검색 결과 정렬" value={sort} onChange={e => setSort(e.target.value)}><option value="relevance">관련도순</option><option value="distance" disabled={!results.some(p => p.distanceKm !== undefined)}>가까운순</option></select></label></div>}
      {results.length > 0 && <ul className="search-results detailed-results" aria-label="장소 검색 결과">{sortedResults.map(p => {
        const chosen = place.lat === p.lat && place.lng === p.lng && (addressResults || place.name === p.name);
        return <li key={p.resultId}><button className={chosen ? 'chosen' : ''} aria-pressed={chosen} onClick={() => pick(addressResults ? { ...p, name: query.trim().slice(0, 150), address: p.address || area.trim() } : p)}><MapPin size={18}/><span><strong>{p.name}</strong>{p.originalName && <small className="result-original-name">{p.originalName}</small>}<small className="result-primary-address">{p.address || '주소 정보가 없어 지도 위치를 확인해 주세요.'}</small>{p.originalAddress && <small className="result-original-address">{p.originalAddress}</small>}<span className="result-meta"><span>{p.typeLabel}</span>{p.distanceKm !== undefined && <span>기준점에서 직선 {p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)}m` : `${p.distanceKm.toFixed(1)}km`}</span>}</span></span>{chosen && <Check size={17}/>}</button></li>;
      })}</ul>}
      {(searched || searchFailed) && <div className="search-alternatives"><p>원하는 장소가 없나요? Google 지도에서 위치를 확인한 뒤 돌아와 지도를 누르거나 좌표를 입력하세요.</p><a className="text-button" href={`https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: [query.trim(), area.trim() || (scope !== 'global' ? region : '')].filter(Boolean).join(' ') })}`} target="_blank" rel="noopener noreferrer">Google 지도에서 검색</a></div>}
      <details className="search-alternatives"><summary>위도·경도로 위치 지정</summary><form className="form" onSubmit={applyCoordinates}><label>위도, 경도<input value={coordinateText} onChange={e => { setCoordinateText(e.target.value); setCoordinateError(''); }} placeholder="35.4585, 133.3578" maxLength={80}/></label>{coordinateError && <p className="error" role="alert">{coordinateError}</p>}<button className="secondary" disabled={!coordinateText.trim()}>지도에 표시</button></form></details>
      <form className="form" onSubmit={save}>
        <label>장소 이름<input required value={place.name} maxLength={150} pattern=".*\S.*" onChange={e => setPlace({ ...place, name: e.target.value })}/></label>
        <label>주소<input value={place.address} maxLength={500} onChange={e => setPlace({ ...place, address: e.target.value })}/></label>
        <div className="coordinate-info">{place.lat !== undefined ? <><span>위도 {place.lat.toFixed(6)} · 경도 {place.lng!.toFixed(6)}</span><button type="button" className="text-button" onClick={() => setPlace({ name: place.name, address: place.address })}>위치 제거</button></> : '위치 없이도 일정을 저장할 수 있어요.'}</div>
        {!savedMode && <div className="form-row"><label>날짜<select value={day} onChange={e => setDay(e.target.value)}>{dates.map((d, i) => <option key={d} value={d}>{i + 1}일차 · {d.slice(5)}</option>)}</select></label><label>시간 (선택)<input type="time" value={time} onChange={e => setTime(e.target.value)}/></label></div>}
        <div className="form-row"><label>카테고리<select value={category} onChange={e => setCategory(e.target.value as Stop['category'])}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>{!savedMode && <button type="button" className="secondary align-end" onClick={() => setTime('')}>시간 미정으로</button>}</div>
        <label>메모<textarea rows={3} maxLength={3000} value={memo} onChange={e => setMemo(e.target.value)} placeholder="함께 기억하고 싶은 것들을 적어 보세요."/></label>
        <button className="primary" type="submit" disabled={props.busy}>{stop ? '변경 저장' : savedMode ? '보관함에 저장' : '일정에 추가'}</button>
      </form>
    </div>
  </Modal>;
}
