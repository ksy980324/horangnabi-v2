import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Globe2, MapPin, Search } from 'lucide-react';
import { countries, popularCountryCodes, filterCities, citySearchQuery, parseDestination } from '../services/destinations';
import { searchPlaces, type SearchResult } from '../services/search';
import type { TripDestination } from '../types';
import { hasCoordinates } from '../services/geo';
import { matchingCity } from '../services/tripLocation';

export function DestinationPicker({ value, destination, onChange, onResolving }: { value: string; destination?: TripDestination; onChange: (value: string, destination?: TripDestination) => void; onResolving: (busy: boolean) => void }) {
  const [initial] = useState(() => parseDestination(value));
  const [countryCode, setCountryCode] = useState(initial.countryCode), [cityName, setCityName] = useState(initial.cityName);
  const [manual, setManual] = useState(initial.manual), [editing, setEditing] = useState(!initial.cityName);
  const [query, setQuery] = useState(''), [limit, setLimit] = useState(12);
  const [remote, setRemote] = useState<SearchResult[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [custom, setCustom] = useState(false), [customCity, setCustomCity] = useState('');
  const requestVersion = useRef(0);
  useEffect(() => () => { requestVersion.current++; }, []);
  const country = countries.find(country => country.code === countryCode);
  const matches = useMemo(() => filterCities(countryCode, query), [countryCode, query]);
  function resetSearch() { requestVersion.current++; setRemote([]); setMessage(''); setLimit(12); setBusy(false); onResolving(false); }
  async function choose(name: string, result?: SearchResult) {
    if (!country || !name.trim()) return;
    resetSearch();
    const version = requestVersion.current;
    const region = `${country.name} · ${name.trim()}`;
    const next: TripDestination = { countryCode, cityName: name.trim() };
    setCityName(name.trim()); setEditing(false); setCustom(false); setMessage('');
    if (result && hasCoordinates(result)) {
      onChange(region, { ...next, lat: result.lat, lng: result.lng });
      return;
    }
    onChange(region, next);
    setBusy(true); onResolving(true); setMessage('도시의 지도 위치를 확인하고 있어요…');
    try {
      const results = await searchPlaces(citySearchQuery(countryCode, name.trim()), { countryCode, cityOnly: true });
      if (version !== requestVersion.current) return;
      const found = matchingCity(countryCode, name.trim(), results);
      if (found && hasCoordinates(found)) {
        onChange(region, { ...next, lat: found.lat, lng: found.lng });
        setMessage('');
      } else setMessage('도시 위치를 확정하지 못했어요. 도시 변경에서 검색 결과의 주소를 확인해 선택해 주세요. 위치 없이 여행을 저장해도 괜찮아요.');
    } catch (error) {
      if (version === requestVersion.current) setMessage(`${(error as Error).message} 위치 없이 저장하거나 아래 버튼으로 다시 확인할 수 있어요.`);
    } finally {
      if (version === requestVersion.current) { setBusy(false); onResolving(false); }
    }
  }
  async function search() {
    if (!country || query.trim().length < 2) return;
    const version = ++requestVersion.current;
    setBusy(true); setMessage(''); setRemote([]);
    try {
      const results = await searchPlaces(citySearchQuery(countryCode, query.trim()), { countryCode, cityOnly: true });
      if (requestVersion.current !== version) return;
      setRemote(results);
      setMessage(results.length ? `${results.length}개의 도시·지역을 찾았어요. 행정구역을 확인하고 선택하세요.` : '도시를 찾지 못했어요. 영문·현지어로 검색하거나 도시 이름을 직접 입력해 주세요.');
    } catch (error) { if (requestVersion.current === version) setMessage((error as Error).message); }
    finally { if (requestVersion.current === version) setBusy(false); }
  }
  return <fieldset className="destination-picker"><legend><Globe2 size={15}/>여행지</legend>
    <div className="destination-mode"><span>{manual ? '여러 국가·목록에 없는 여행지' : '국가를 고르고 도시를 선택하세요'}</span><button type="button" className="text-button" onClick={() => { resetSearch(); setManual(!manual); if (!manual) onChange(value); if (manual) { setCountryCode(''); setCityName(''); setEditing(true); onChange(''); } }}> {manual ? '목록에서 선택' : '여행지 직접 입력'}</button></div>
    {manual ? <label>국가 · 도시<input required maxLength={100} value={value} onChange={e => onChange(e.target.value)} placeholder="예: 일본 · 요나고 / 프랑스·이탈리아 여행" pattern=".*\S.*"/></label> : <>
      <label>국가·지역<select required value={countryCode} aria-label="국가·지역 선택" onChange={e => { resetSearch(); setCountryCode(e.target.value); setCityName(''); setQuery(''); setCustom(false); setCustomCity(''); setEditing(true); onChange(''); }}><option value="">국가·지역을 선택하세요</option><optgroup label="자주 찾는 국가·지역">{popularCountryCodes.map(code => countries.find(country => country.code === code)!).map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</optgroup><optgroup label="그 외 국가·지역">{countries.filter(country => !popularCountryCodes.includes(country.code)).map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</optgroup></select></label>
      {cityName && <div className="destination-selected"><MapPin size={17}/><span><strong>{country?.name} · {cityName}</strong><small>선택한 여행지</small></span><button type="button" className="text-button" onClick={() => { setEditing(!editing); setQuery(''); resetSearch(); }}>{editing ? '선택 목록 닫기' : '도시 변경'}</button></div>}
      {!manual && cityName && <div className="city-hint" role="status">{destination && hasCoordinates(destination) ? '도시 위치가 연결됐어요. 빈 일정의 지도와 장소 검색이 이 도시에서 시작해요.' : message || '도시 위치가 아직 없어요. 위치 없이도 저장할 수 있어요.'}{!busy && !hasCoordinates(destination ?? {}) && <button type="button" className="text-button" onClick={() => void choose(cityName)}>도시 위치 다시 확인</button>}</div>}
      {country && editing && <div className="city-picker">
        <label>도시·지역 찾기<input aria-label="도시·지역 찾기" value={query} maxLength={100} onChange={e => { resetSearch(); setQuery(e.target.value); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!busy) void search(); } }} placeholder="한글·영문·현지어 검색 (예: 요나고, Yonago)"/></label>
        <div className="city-list-heading"><strong>{query ? `목록 검색 결과 ${matches.length}개` : '자주 찾는 도시부터 소도시까지'}</strong><span>목록 검색은 인터넷 없이 가능해요</span></div>
        <ul className="city-grid">{matches.slice(0, limit).map(city => <li key={city.englishName}><button type="button" className={cityName === city.name ? 'chosen' : ''} aria-pressed={cityName === city.name} onClick={() => choose(city.name)}><span><strong>{city.name}</strong><small>{city.englishName}</small></span>{cityName === city.name ? <Check size={14}/> : <MapPin size={13}/>}</button></li>)}</ul>
        {!matches.length && <p className="city-hint">기본 목록에 없어요. 아래에서 {country.name} 안의 다른 도시·소도시를 검색할 수 있어요.</p>}
        {matches.length > limit && <button type="button" className="city-more" onClick={() => setLimit(count => count + 24)}>도시 더 보기 ({matches.length - limit}개)</button>}
        <button type="button" className="secondary city-online" disabled={busy || query.trim().length < 2} onClick={() => void search()}><Search size={15}/>{busy ? '도시 검색 중…' : `${country.name}의 다른 도시 검색`}</button>
        <p className="city-hint">추가 검색은 버튼을 누를 때만 실행해요. 한국어로 안 나오면 영문·현지어 이름으로 찾아보세요.</p>
        {message && <p role="status" className="city-hint">{message}</p>}
        {remote.length > 0 && <ul className="city-remote-results">{remote.map(result => <li key={result.resultId}><button type="button" onClick={() => void choose(filterCities(countryCode, result.name).find(city => [city.name, city.englishName, ...city.aliases].includes(result.name))?.name ?? result.name, result)}><MapPin size={15}/><span><strong>{result.name}</strong>{result.originalName && <small>{result.originalName}</small>}<small>{result.address}</small></span></button></li>)}</ul>}
        <button type="button" className="text-button" onClick={() => { setCustom(!custom); setCustomCity(query); }}>목록에 없는 도시 직접 입력</button>
        {custom && <div className="custom-city"><label>도시 이름 직접 입력<input aria-label="도시 이름 직접 입력" value={customCity} onChange={e => setCustomCity(e.target.value)} maxLength={70} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); choose(customCity); } }}/></label><button type="button" className="secondary" disabled={!customCity.trim()} onClick={() => choose(customCity)}>이 도시 선택</button></div>}
      </div>}
    </>}
  </fieldset>;
}
