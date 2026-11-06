import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BedDouble, ExternalLink, Pencil, Plane, Plus, Ticket, Trash2 } from 'lucide-react';
import { uid } from '../data';
import { isReservation, isReservationUrl, reservationLimits } from '../services/reservations';
import { flightDate, flightNumber, type FlightLookupErrorReason, type FlightSchedule } from '../services/flightLookup';
import { mapsLinkResolverUrl } from '../services/resolveGoogleMapsLink';
import type { FlightDirection, Reservation } from '../types';
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
        <span className="reservation-kind">{item.kind === 'flight' ? <><Plane size={15}/>{item.direction === 'outbound' ? '출국편' : item.direction === 'return' ? '복귀편' : '항공편'}</> : <><BedDouble size={15}/>숙소</>}</span>
        <h3>{item.name}</h3>
      </div>
      <dl className="reservation-details">
        {item.kind === 'flight' && <>
          {item.departure && <div><dt>출발 시간</dt><dd>{displayDateTime(item.departure)}</dd></div>}
          {item.departureAirport && <div><dt>출발 공항</dt><dd>{item.departureAirport}</dd></div>}
          {item.arrivalAirport && <div><dt>도착 공항</dt><dd>{item.arrivalAirport}</dd></div>}
          {item.arrival && <div><dt>도착 시간</dt><dd>{displayDateTime(item.arrival)}</dd></div>}
        </>}
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

export function ReservationForm({ item, startDate, endDate, onClose, onSave, busy, status }: {
  item?: Reservation; startDate: string; endDate: string; onClose: () => void; onSave: (value: Reservation) => void; busy?: boolean; status?: string;
}) {
  const [kind, setKind] = useState<Reservation['kind']>(item?.kind ?? 'flight');
  const [name, setName] = useState(item?.name ?? '');
  const [reference, setReference] = useState(item?.reference ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const [direction, setDirection] = useState<FlightDirection>(item?.kind === 'flight' ? item.direction ?? 'outbound' : 'outbound');
  const [departure, setDeparture] = useState(item?.kind === 'flight' ? item.departure ?? '' : '');
  const [arrival, setArrival] = useState(item?.kind === 'flight' ? item.arrival ?? '' : '');
  const [departureAirport, setDepartureAirport] = useState(item?.kind === 'flight' ? item.departureAirport ?? '' : '');
  const [arrivalAirport, setArrivalAirport] = useState(item?.kind === 'flight' ? item.arrivalAirport ?? '' : '');
  const [lookupDate, setLookupDate] = useState(departure.slice(0, 10) || startDate);
  const [flights, setFlights] = useState<FlightSchedule[]>([]);
  const [lookupMessage, setLookupMessage] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const flightRequest = useRef<AbortController | undefined>(undefined);
  const [checkIn, setCheckIn] = useState(item?.kind === 'stay' ? item.checkIn ?? '' : '');
  const [checkOut, setCheckOut] = useState(item?.kind === 'stay' ? item.checkOut ?? '' : '');
  const [address, setAddress] = useState(item?.kind === 'stay' ? item.address ?? '' : '');
  const [error, setError] = useState('');
  useEffect(() => () => {
    const controller = flightRequest.current;
    flightRequest.current = undefined;
    controller?.abort();
  }, []);

  function applyFlight(flight: FlightSchedule) {
    setDeparture(flight.departure);
    setDepartureAirport(flight.departureAirport);
    setArrivalAirport(flight.arrivalAirport);
    setFlights([]);
    setLookupMessage('출발 시간과 공항을 채웠어요. 도착 시간은 예약 안내를 보고 입력해 주세요.');
  }

  async function findFlight() {
    if (flightRequest.current || !mapsLinkResolverUrl) return;
    const number = flightNumber(name);
    if (!number || !flightDate(lookupDate)) { setLookupMessage('항공편명과 출발 날짜를 확인해 주세요.'); return; }
    const controller = new AbortController();
    flightRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    setLookingUp(true);
    setFlights([]);
    setLookupMessage('인천공항의 예정 운항편을 조회하고 있어요.');
    try {
      const endpoint = new URL('/flight', mapsLinkResolverUrl);
      endpoint.search = new URLSearchParams({ number, date: lookupDate }).toString();
      const response = await fetch(endpoint, { signal: controller.signal });
      const result = await response.json() as { flights?: FlightSchedule[]; reason?: FlightLookupErrorReason; providerCode?: string; providerStatus?: number };
      if (flightRequest.current !== controller) return;
      if (!response.ok) {
        const messages: Record<FlightLookupErrorReason, string> = {
          authorization: '공공데이터포털에서 이 API의 활용 승인이 완료됐는지와 Worker에 등록한 인증키를 확인해 주세요.',
          quota: '인천공항 조회의 일일 한도에 도달했어요. 직접 입력할 수 있어요.',
          timeout: '인천공항에서 응답이 늦어요. 잠시 후 다시 시도하거나 직접 입력해 주세요.',
          network: '조회 서버가 공공데이터포털에 연결하지 못했어요. 직접 입력할 수 있어요.',
          upstream: '인천공항 조회 서비스에서 정상 응답을 받지 못했어요. 직접 입력할 수 있어요.',
        };
        const message = response.status === 503 ? '인천공항 조회 서비스가 아직 연결되지 않았어요.' : messages[result.reason ?? 'upstream'];
        const detail = result.providerCode ? ` (공공데이터 코드 ${result.providerCode})` : result.providerStatus ? ` (공공데이터 HTTP ${result.providerStatus})` : '';
        throw new Error(`${message}${detail}`);
      }
      if (!Array.isArray(result.flights)) throw new Error('항공편 조회 응답을 읽지 못했어요.');
      if (result.flights.length === 1) applyFlight(result.flights[0]);
      else if (result.flights.length) { setFlights(result.flights); setLookupMessage('해당하는 운항편을 선택하세요.'); }
      else setLookupMessage('이 날짜의 인천 출발편을 찾지 못했어요. 편명과 날짜를 확인하거나 직접 입력해 주세요.');
    } catch (failure) {
      if (flightRequest.current === controller) setLookupMessage(controller.signal.aborted ? '조회 시간이 초과됐어요. 다시 시도하거나 직접 입력해 주세요.' : failure instanceof TypeError ? '조회 서비스에 연결하지 못했어요. 직접 입력할 수도 있어요.' : (failure as Error).message);
    } finally {
      window.clearTimeout(timeout);
      if (flightRequest.current === controller) { flightRequest.current = undefined; setLookingUp(false); }
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (busy || lookingUp) return;
    const details = { id: item?.id ?? uid(), name: name.trim(), reference: reference.trim() || undefined, url: url.trim() || undefined };
    if (details.url && !isReservationUrl(details.url)) return setError('https://로 시작하는 예약 확인 링크를 입력해 주세요.');
    if (kind === 'stay' && checkIn && checkOut && checkOut < checkIn) return setError('체크아웃은 체크인보다 빠를 수 없어요.');
    const reservation: Reservation = kind === 'flight' ? { ...details, kind, direction, departure: departure || undefined, arrival: arrival || undefined, departureAirport: departureAirport.trim() || undefined, arrivalAirport: arrivalAirport.trim() || undefined }
      : { ...details, kind, checkIn: checkIn || undefined, checkOut: checkOut || undefined, address: address.trim() || undefined };
    if (!isReservation(reservation)) return setError('예약 이름과 날짜·시간을 확인해 주세요.');
    onSave(reservation);
  }

  const eventDate = (direction === 'outbound' ? arrival : departure).slice(0, 10);

  return <Modal title={item ? '예약 수정' : '예약 추가'} onClose={onClose} busy={busy} status={status}>
    <form className="form" onSubmit={save} onChange={() => setError('')}>
      <label>예약 종류<select disabled={lookingUp} value={kind} onChange={event => setKind(event.target.value === 'stay' ? 'stay' : 'flight')}><option value="flight">항공편</option><option value="stay">숙소</option></select></label>
      <label>{kind === 'flight' ? '항공편명' : '숙소 이름'}<input required disabled={lookingUp} value={name} maxLength={reservationLimits.name} onChange={event => { setName(event.target.value); setFlights([]); setLookupMessage(''); }} placeholder={kind === 'flight' ? '예: RS471' : '예: 카스이테이'}/></label>
      {kind === 'flight' ? <>
        <label>여행 방향<select disabled={lookingUp} value={direction} onChange={event => setDirection(event.target.value === 'return' ? 'return' : 'outbound')}><option value="outbound">출국편 · 여행지로 가는 편</option><option value="return">복귀편 · 여행지에서 떠나는 편</option></select></label>
        {mapsLinkResolverUrl && direction === 'outbound' && <div className="flight-lookup">
          <label>조회할 출발 날짜<input type="date" value={lookupDate} disabled={lookingUp} onChange={event => { setLookupDate(event.target.value); setFlights([]); setLookupMessage(''); }}/></label>
          <button type="button" className="secondary" disabled={lookingUp || busy} onClick={() => void findFlight()}>인천 출발편 조회</button>
          {lookupMessage && <p role="status">{lookupMessage}</p>}
          {flights.map(flight => <button type="button" className="text-button" key={`${flight.departure}:${flight.arrivalAirport}`} onClick={() => applyFlight(flight)}>{displayDateTime(flight.departure)} · {flight.arrivalAirport}</button>)}
        </div>}
        <label>출발 날짜와 시간 (선택)<input type="datetime-local" disabled={lookingUp} value={departure} onChange={event => setDeparture(event.target.value)}/></label>
        <label>출발 공항 (선택)<input disabled={lookingUp} value={departureAirport} maxLength={reservationLimits.airport} onChange={event => setDepartureAirport(event.target.value)}/></label>
        <label>도착 공항 (선택)<input disabled={lookingUp} value={arrivalAirport} maxLength={reservationLimits.airport} onChange={event => setArrivalAirport(event.target.value)}/></label>
        <label>도착 날짜와 시간 (선택)<input type="datetime-local" disabled={lookingUp} value={arrival} onChange={event => setArrival(event.target.value)}/></label>
        <p className="muted">{eventDate && (eventDate < startDate || eventDate > endDate) ? '여행 기간 밖의 날짜예요. 예약은 저장되고 공항 일정은 추가되지 않아요.' : direction === 'outbound' ? '도착 공항과 도착 시간을 입력하면 여행 일정에 자동으로 추가돼요.' : '출발 공항과 출발 시간을 입력하면 여행 일정에 자동으로 추가돼요.'}</p>
      </> : <>
        <label>체크인 날짜와 시간 (선택)<input type="datetime-local" value={checkIn} onChange={event => setCheckIn(event.target.value)}/></label>
        <label>체크아웃 날짜와 시간 (선택)<input type="datetime-local" min={checkIn || undefined} value={checkOut} onChange={event => setCheckOut(event.target.value)}/></label>
        <label>숙소 주소 (선택)<input value={address} maxLength={reservationLimits.address} onChange={event => setAddress(event.target.value)}/></label>
      </>}
      <p className="muted">예약 안내에 적힌 현지 날짜와 시간을 입력하세요.</p>
      <label>예약번호 (선택)<input value={reference} maxLength={reservationLimits.reference} onChange={event => setReference(event.target.value)}/></label>
      <label>예약 확인 링크 (선택)<input type="url" value={url} maxLength={reservationLimits.url} onChange={event => setUrl(event.target.value)} placeholder="https://…"/></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={busy || lookingUp}>예약 저장</button>
    </form>
  </Modal>;
}
