import { useEffect, useEffectEvent, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent } from 'react';
import { Search, MapPin, Check } from 'lucide-react';
import type { Place } from '../types';
import type { SearchResult } from '../services/search';
import { searchWithEnglishFallback } from '../services/searchWithEnglishFallback';
import { hasCoordinates, type GeoPoint, type MapView } from '../services/geo';
import { resolveSearchQuery } from '../services/searchQuery';
import { MAX_MAP_LINK_LENGTH, parseGoogleMapsShare } from '../services/googleMapsLink';
import { mapsLinkResolverUrl, resolveGoogleMapsLink } from '../services/resolveGoogleMapsLink';
import { TravelMap } from './TravelMap';

export function PlacePicker({ value: place, onChange: setPlace, region, searchCenter, onResolving }: {
  value: Place; onChange: (place: Place) => void; region: string; searchCenter?: GeoPoint; onResolving?: (value: boolean) => void;
}) {
  const [mapUrlError, setMapUrlError] = useState('');
  const [lookupUrl, setLookupUrl] = useState('');
  const [anchor] = useState(() => hasCoordinates(place) ? { lat: place.lat, lng: place.lng } : searchCenter);
  const [view, setView] = useState<MapView>();
  const [scope, setScope] = useState(anchor ? 'nearby' : 'global');
  const [query, setQuery] = useState(''), [results, setResults] = useState<SearchResult[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [searched, setSearched] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [sort, setSort] = useState('relevance');
  const points = useMemo(() => [{ ...place, id: 'picked', number: 1 }], [place]);
  const sortedResults = useMemo(() => sort === 'distance' ? [...results].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)) : results, [results, sort]);
  const searchQuery = useMemo(() => resolveSearchQuery(query), [query]);
  const searchRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { searchRequest.current?.abort(); searchRequest.current = null; }, []);
  function resetResults() {
    searchRequest.current?.abort();
    searchRequest.current = null;
    setBusy(false);
    setResults([]); setSearched(false); setSearchFailed(false); setMessage('');
  }
  async function search(e: Pick<FormEvent, 'preventDefault'>, requestedScope = scope) {
    e.preventDefault();
    if (parseGoogleMapsShare(query)) { updateMapLink(query); return; }
    if (busy) return;
    resetResults();
    const request = new AbortController();
    searchRequest.current = request;
    setBusy(true);
    try {
      const options = requestedScope === 'nearby' && anchor ? { center: anchor }
        : requestedScope === 'map' && view ? { center: view.center, bounds: view.bounds } : {};
      const data = await searchWithEnglishFallback(query, { ...options, signal: request.signal }, text => {
        if (searchRequest.current === request) setMessage(text);
      });
      if (searchRequest.current !== request) return;
      setResults(data.places); setSearched(true);
      const translated = data.translatedQuery ? `‘${data.translatedQuery}’로도 검색했어요. ` : '';
      setMessage(data.translationUnavailable ? '한국어 검색 결과가 없고 영어 번역을 사용할 수 없어요. 잠시 후 다시 검색하거나 Google 지도에서 찾아보세요.'
        : translated + (data.places.length ? `${data.places.length}개의 장소를 찾았어요. 주소와 지점을 확인하고 선택하세요.` : '이 조건에서 결과가 없어요. 다른 이름이나 상세 주소로 검색해 보세요.'));
    } catch (error) {
      if (searchRequest.current === request && !request.signal.aborted) { setSearchFailed(true); setMessage((error as Error).message); }
    } finally {
      if (searchRequest.current === request) { searchRequest.current = null; setBusy(false); }
    }
  }
  function pick(p: Place) {
    setLookupUrl('');
    setMapUrlError('');
    setPlace({ name: p.name, address: p.address, lat: p.lat, lng: p.lng });
    setMessage('위치를 선택했어요. 아래에서 장소 이름과 주소를 확인한 뒤 저장하세요.');
  }
  const pendingShare = useRef<Place | undefined>(undefined);
  const applyResolvedShare = useEffectEvent((url: string, share: NonNullable<ReturnType<typeof parseGoogleMapsShare>>) => {
    if (url !== place.mapUrl) return;
    const seed = pendingShare.current;
    const positionUnchanged = place.lat === seed?.lat && place.lng === seed?.lng;
    setPlace({
      ...place,
      name: place.name === seed?.name ? place.name || share.name : place.name,
      address: place.address === seed?.address ? share.address || place.address : place.address,
      ...(positionUnchanged && share.point ? share.point : {}),
    });
    setMessage(share.point ? '공유한 장소를 지도에 표시했어요.' : '장소 이름을 읽었어요. 위치 정보가 없는 링크는 지도에서 위치를 확인해 주세요.');
  });
  useEffect(() => {
    onResolving?.(!!lookupUrl);
    return () => onResolving?.(false);
  }, [lookupUrl, onResolving]);
  useEffect(() => {
    if (!lookupUrl) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    let active = true;
    void resolveGoogleMapsLink(lookupUrl, controller.signal).then(share => {
      if (!share) throw new Error('공유 링크 연결을 확인해 주세요.');
      if (active) applyResolvedShare(lookupUrl, share);
    }).catch(() => {
      if (active) setMapUrlError('공유 링크에서 위치를 읽지 못했어요. 다시 시도하거나 장소 이름으로 검색해 주세요.');
    }).finally(() => {
      if (active) setLookupUrl('');
      window.clearTimeout(timeout);
    });
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [lookupUrl]);
  function updateMapLink(value: string) {
    const share = parseGoogleMapsShare(value);
    if (!share) { setMapUrlError('Google 지도에서 복사한 공유 링크를 확인해 주세요.'); return; }
    resetResults();
    setQuery(share.url);
    setMapUrlError('');
    const next = { name: share.name, address: '', ...share.point, mapUrl: share.url };
    pendingShare.current = next;
    setPlace(next);
    setLookupUrl(mapsLinkResolverUrl && (!share.name || !share.point) ? share.url : '');
    if (!share.point && !mapsLinkResolverUrl) setMapUrlError('공유 링크 연결이 준비되지 않았어요. 장소 이름으로 검색하거나 지도에서 선택해 주세요.');
  }
  function pasteMapLink(event: ClipboardEvent<HTMLInputElement>) {
    const value = event.clipboardData.getData('text');
    if (!parseGoogleMapsShare(value)) return;
    event.preventDefault();
    updateMapLink(value);
  }
  function changeQuery(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    const input = event.nativeEvent as InputEvent;
    if (input.inputType === 'insertFromPaste' && parseGoogleMapsShare(value)) {
      updateMapLink(value);
      return;
    }
    setQuery(value);
    resetResults();
  }
  return <div className="place-picker">
      <form onSubmit={search} className="place-search">
        <div className="search-form"><input aria-label="장소 이름 또는 Google 지도 공유 링크" disabled={busy} value={query} onChange={changeQuery} placeholder="장소 이름 또는 Google 지도 공유 링크" autoComplete="off" onPaste={pasteMapLink} maxLength={MAX_MAP_LINK_LENGTH}/><button className="primary" disabled={busy || !!lookupUrl || query.trim().length < 2 || (scope === 'map' && !view && !parseGoogleMapsShare(query))}><Search size={18}/>{lookupUrl ? '확인 중' : busy ? '검색 중' : '검색'}</button></div>
      </form>
      <TravelMap points={points} selected="picked" initialCenter={anchor} onViewChange={setView} fitKey={`${place.lat},${place.lng}`} onPick={pick}/>
      {lookupUrl && <p className="hint" role="status">공유 링크에서 장소와 위치를 가져오고 있어요.</p>}
      {mapUrlError && <p className="hint error" role="alert">{mapUrlError}</p>}
      {(place.name || hasCoordinates(place)) && <div className="picked-place" role="status">
        <MapPin size={18} aria-hidden="true"/><div><strong>{place.name || '지도에서 선택한 위치'}</strong><p>{place.address || (hasCoordinates(place) ? '지도 핀이 연결됐어요.' : '아직 지도 위치가 확인되지 않았어요.')}</p></div>
        <button type="button" className="text-button" onClick={() => { setLookupUrl(''); setPlace({ name: '', address: '' }); setMapUrlError(''); }}>선택 해제</button>
      </div>}
      {searchQuery.airport && scope !== 'global' && <div className="search-alternatives"><p>여행지 밖의 공항은 전체 지역에서 찾아보세요.</p><button type="button" className="secondary" disabled={busy} onClick={e => { setScope('global'); void search(e, 'global'); }}>공항 이름으로 전체 지역 검색</button></div>}
      {searchQuery.alternatives.length > 0 && <div className="search-alternatives"><p>이타미와 간사이는 서로 다른 공항이에요. 원하는 공항을 선택한 뒤 검색하세요.</p>{searchQuery.alternatives.map(name => <button type="button" className="secondary" key={name} disabled={busy} onClick={() => { setQuery(name); resetResults(); }}>{name}</button>)}</div>}

      <p role="status" className="hint">{message}</p>
      {results.some(result => !result.nameLocalized) && <p className="hint">한국어 이름이 없는 일부 장소는 원문으로 표시됩니다.</p>}
      {results.length > 0 && <div className="result-toolbar"><strong>검색 결과 {results.length}개</strong><label>정렬<select aria-label="검색 결과 정렬" value={sort} onChange={e => setSort(e.target.value)}><option value="relevance">관련도순</option><option value="distance" disabled={!results.some(p => p.distanceKm !== undefined)}>가까운순</option></select></label></div>}
      {results.length > 0 && <ul className="search-results detailed-results" aria-label="장소 검색 결과">{sortedResults.map(p => {
        const chosen = place.lat === p.lat && place.lng === p.lng && place.name === p.name;
        return <li key={p.resultId}><button className={chosen ? 'chosen' : ''} aria-pressed={chosen} onClick={() => pick(p)}><MapPin size={18}/><span><strong>{p.name}</strong>{p.originalName && <small className="result-original-name">{p.originalName}</small>}<small className="result-primary-address">{p.address || '주소 정보가 없어 지도 위치를 확인해 주세요.'}</small>{p.originalAddress && <small className="result-original-address">{p.originalAddress}</small>}<span className="result-meta"><span>{p.typeLabel}</span>{p.distanceKm !== undefined && <span>기준점에서 직선 {p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)}m` : `${p.distanceKm.toFixed(1)}km`}</span>}</span></span>{chosen && <Check size={17}/>}</button></li>;
      })}</ul>}
      {(searched || searchFailed) && <div className="search-empty-actions">
        {searched && !results.length && scope !== 'global' && <button type="button" className="secondary" disabled={busy} onClick={event => { setScope('global'); void search(event, 'global'); }}>범위 제한 없이 다시 검색</button>}
        <a className="secondary" href={`https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: [query.trim(), scope !== 'global' ? region : ''].filter(Boolean).join(' ') })}`} target="_blank" rel="noopener noreferrer">Google 지도에서 검색</a>
      </div>}
      <div className="search-scope">
        <label><span>검색 범위</span><select aria-label="검색 범위" disabled={busy} value={scope} onChange={event => { setScope(event.target.value); resetResults(); }}>
          <option value="nearby" disabled={!anchor}>여행지 주변 우선</option>
          <option value="map" disabled={!view}>현재 지도 안</option>
          <option value="global">전체 지역</option>
        </select></label>
      </div>
      {place.mapUrl && <p className="hint">Google 지도 공유 링크가 연결됐어요.</p>}
    </div>;
}
