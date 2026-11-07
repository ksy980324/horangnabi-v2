import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowDown, ArrowUp, Plus, MapPin, CalendarDays, Pencil, Trash2, Compass, Download, Upload, Maximize2, GripVertical } from 'lucide-react';
import type { Database, Expense, PackingItem, Reservation, Stop, Trip, SavedPlace } from './types';
import { datesBetween, moveStop, reorderStop, parseDatabase, sampleDatabase, STORAGE_KEY, uid } from './data';
import { TravelMap } from './components/TravelMap';
import { Modal } from './components/Modal';
import { useScheduleScroll } from './hooks/useScheduleScroll';
import { useStopDrag } from './hooks/useStopDrag';
import { tripCenter } from './services/tripLocation';
import { SiteHeader, type HeaderAction } from './components/SiteHeader';
import { SavedPlaces } from './components/SavedPlaces';
import { scheduleSavedPlace } from './services/savedPlaces';
import { PackingList } from './components/PackingList';
import { packingCompletedCount, savePackingItem, removePackingItem, SHARED_PACKING_PARTICIPANTS } from './services/packing';
import type { SharedData } from './components/SharedWorkspace';
import { firebaseConfig, firebaseConfigProvided } from './services/firebaseConfig';
import { SharedTripConflict } from './services/sharedRevision';
import { googleMapsDirections } from './services/googleMapsLink';
import { StopPhoto } from './components/StopPhoto';
import { TripCard } from './components/TripCard';
import { removeReservation, saveReservation } from './services/reservations';

import { expenseLimit } from './services/expenses';
import { useOfflineMenu } from './hooks/useOfflineMenu';

type PlannerEditor = { kind: 'trip' | 'stop' | 'saved' | 'reservation' | 'expense'; id?: string };
type PlannerEntry = { scope: string; tripId?: string; editor?: PlannerEditor & { key: string } };

const firebaseConfigured = Boolean(firebaseConfig);
const SharedWorkspace = lazy(() => import('./components/SharedWorkspace'));
const TripForm = lazy(() => import('./components/TripForm').then(module => ({ default: module.TripForm })));
const StopForm = lazy(() => import('./components/StopForm').then(module => ({ default: module.StopForm })));
const Reservations = lazy(() => import('./components/Reservations').then(module => ({ default: module.Reservations })));
const ReservationForm = lazy(() => import('./components/Reservations').then(module => ({ default: module.ReservationForm })));
const Expenses = lazy(() => import('./components/Expenses').then(module => ({ default: module.Expenses })));
const ExpenseForm = lazy(() => import('./components/Expenses').then(module => ({ default: module.ExpenseForm })));
const formatDate = (date: string) => new Date(date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
function load(): { db: Database; error: string } {
  try { const raw = localStorage.getItem(STORAGE_KEY); return { db: raw ? parseDatabase(JSON.parse(raw)) : sampleDatabase(), error: '' }; }
  catch { return { db: { version: 1, trips: [] }, error: '저장 데이터를 읽지 못했습니다. 원본 보호를 위해 자동 저장을 멈췄어요. 백업을 복원하거나 아래 버튼으로 다시 시작해 주세요.' }; }
}
export default function App() {
  const [sharedOpen, setSharedOpen] = useState(firebaseConfigured);
  const openLocal = () => setSharedOpen(false);
  if (sharedOpen) return <Suspense fallback={<><SiteHeader actions={[{ label: '이 기기의 여행', onClick: openLocal }]}/><main className="shared-panel"><p role="status">공유 여행 화면을 열고 있어요.</p></main></>}><SharedWorkspace onBack={openLocal}>{(shared, actions) => <Planner key={shared.userId} shared={shared} headerActions={actions}/>}</SharedWorkspace></Suspense>;
  return <Planner headerActions={firebaseConfigured ? [{ label: '공유 여행', onClick: () => setSharedOpen(true) }] : undefined}/>;
}

function Planner({ shared, headerActions }: { shared?: SharedData; headerActions?: HeaderAction[] }) {
  const [initial] = useState(() => shared ? { db: shared.db, error: '' } : load());
  const [localDb, setDb] = useState(initial.db), [storageError, setStorageError] = useState(initial.error), [blocked, setBlocked] = useState(!!initial.error);
  const db = shared?.db ?? localDb;
  const pending = useRef(false);
  const editorRevision = useRef<number | undefined>(undefined);
  const editorTrip = useRef<Trip | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [tripId, setTripId] = useState<string>(), [day, setDay] = useState(''), [selected, setSelected] = useState<string>(), [fit, setFit] = useState(0);
  const [tripEditor, setTripEditor] = useState<Trip | 'new'>(), [stopEditor, setStopEditor] = useState<Stop | 'new'>(), [notice, setNotice] = useState('');
  const [view, setView] = useState<'schedule' | 'saved' | 'reservations' | 'expenses'>('schedule');
  const [packingOpen, setPackingOpen] = useState(false);
  const [savedEditor, setSavedEditor] = useState<SavedPlace | 'new'>();
  const [reservationEditor, setReservationEditor] = useState<Reservation | 'new'>();
  const [expenseEditor, setExpenseEditor] = useState<Expense | 'new'>();
  const [historyScope] = useState(uid);
  const fileRef = useRef<HTMLInputElement>(null);
  const trip = db.trips.find(t => t.id === tripId) ?? (shared && (stopEditor || savedEditor || reservationEditor || expenseEditor) ? editorTrip.current : undefined);
  const offlineMenu = useOfflineMenu(trip, shared?.userId);
  const dates = useMemo(() => trip ? datesBetween(trip.start, trip.end) : [], [trip]);
  const activeDay = dates.includes(day) ? day : dates[0];
  const stops = useMemo(() => trip?.stops.filter(s => s.date === activeDay) ?? [], [trip, activeDay]);
  const savedPlaces = useMemo(() => trip?.savedPlaces ?? [], [trip]);
  const reservations = trip?.reservations ?? [];
  const expenses = trip?.expenses ?? [];
  const packingItems = trip?.packingItems ?? [];
  const completedPacking = packingItems.filter(item => shared ? packingCompletedCount(item, shared.memberIds) === SHARED_PACKING_PARTICIPANTS : item.completed).length;
  const visiblePlaces = view === 'saved' ? savedPlaces : stops;
  const points = useMemo(() => visiblePlaces.map((s, i) => ({ ...s, number: i + 1 })), [visiblePlaces]);
  const searchCenter = useMemo(() => {
    return tripCenter(trip, visiblePlaces);
  }, [visiblePlaces, trip]);
  const mapSectionRef = useRef<HTMLElement>(null);
  const stopDrag = useStopDrag(stops, mapSectionRef, saving || packingOpen || view !== 'schedule', (id, target) => {
    if (!trip) return;
    const next = reorderStop(trip, activeDay, id, target);
    if (next !== trip) void updateTrip(next);
  });
  const { activeId, focusStop, clearFocus } = useScheduleScroll(`${tripId}:${activeDay}:${view}`, visiblePlaces, mapSectionRef, !!tripEditor || !!stopDrag.preview || !!stopEditor || !!savedEditor || !!reservationEditor || !!expenseEditor || packingOpen || view === 'reservations' || view === 'expenses');
  const focusedStop = activeId ?? selected;
  useEffect(() => {
    if (shared || blocked) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(localDb)); setStorageError(''); }
    catch { setStorageError('기기에 저장하지 못했습니다. 저장 공간과 브라우저 설정을 확인하고 JSON 백업을 내려받아 주세요.'); }
  }, [localDb, blocked, shared]);
  function beginEdit(base?: Trip) {
    setNotice('');
    editorTrip.current = base;
    editorRevision.current = base ? shared?.revisions.get(base.id) : undefined;
  }
  function applyEntry(entry: PlannerEntry) {
    const target = db.trips.find(item => item.id === entry.tripId);
    if (entry.tripId !== tripId) {
      setTripId(entry.tripId);
      setView('schedule'); setPackingOpen(false); setDay(target?.start ?? ''); setSelected(undefined);
      if (entry.tripId) window.scrollTo({ top: 0, behavior: 'instant' });
    }
    setTripEditor(undefined); setStopEditor(undefined); setSavedEditor(undefined); setReservationEditor(undefined); setExpenseEditor(undefined);
    const editor = entry.editor;
    if (!editor) return;
    const base = editor.kind === 'trip' ? db.trips.find(item => item.id === editor.id) : target;
    beginEdit(base);
    if (editor.kind === 'trip') setTripEditor(editor.id ? base : 'new');
    if (editor.kind === 'stop' && base) setStopEditor(editor.id ? base.stops.find(item => item.id === editor.id) : 'new');
    if (editor.kind === 'saved' && base) setSavedEditor(editor.id ? base.savedPlaces?.find(item => item.id === editor.id) : 'new');
    if (editor.kind === 'expense' && base && shared) setExpenseEditor(editor.id ? base.expenses?.find(item => item.id === editor.id) : 'new');
    if (editor.kind === 'reservation' && base) setReservationEditor(editor.id ? base.reservations?.find(item => item.id === editor.id) : 'new');
  }
  const restoreEntry = useEffectEvent((event: PopStateEvent) => {
    const entry = event.state?.horangnabi as PlannerEntry | undefined;
    applyEntry(entry?.scope === historyScope ? entry : { scope: historyScope });
  });
  useEffect(() => {
    const handlePop = (event: PopStateEvent) => restoreEntry(event);
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);
  function pushEntry(nextTripId?: string, editor?: PlannerEditor) {
    const entry = { scope: historyScope, tripId: nextTripId, editor: editor && { ...editor, key: uid() } };
    window.history.pushState({ horangnabi: entry }, '');
    applyEntry(entry);
  }
  function returnToTrips() {
    const entry = window.history.state?.horangnabi as PlannerEntry | undefined;
    if (entry?.scope === historyScope && entry.tripId) window.history.back();
  }
  function closeEditor() {
    const entry = window.history.state?.horangnabi as PlannerEntry | undefined;
    if (entry?.scope === historyScope && entry.editor) window.history.back();
  }
  function afterEditorSave(done: () => void) {
    const key = (window.history.state?.horangnabi as PlannerEntry | undefined)?.editor?.key;
    return () => {
      const entry = window.history.state?.horangnabi as PlannerEntry | undefined;
      if (key && entry?.scope === historyScope && entry.editor?.key === key) done();
    };
  }
  function finishTripEdit(next: Trip) {
    const entry = window.history.state?.horangnabi as PlannerEntry | undefined;
    if (entry?.scope !== historyScope || entry.editor?.kind !== 'trip') return;
    if (tripId === next.id) { closeEditor(); return; }
    const destination = { scope: historyScope, tripId: next.id };
    window.history.replaceState({ horangnabi: destination }, '');
    applyEntry(destination);
    setDay(next.start);
  }
  async function saveShared(action: () => Promise<void>) {
    if (pending.current) return false;
    pending.current = true;
    setSaving(true);
    try { await action(); setNotice(''); return true; }
    catch (error) {
      setNotice(error instanceof SharedTripConflict ? '다른 기기에서 이 여행을 변경했어요. 입력한 내용을 확인한 뒤 편집창을 다시 열어 최신 일정에 적용해 주세요.' : '공유 공간에 저장하지 못했어요. 연결과 접근 권한을 확인한 뒤 다시 시도해 주세요.');
      return false;
    } finally { pending.current = false; setSaving(false); }
  }
  async function updateTrip(next: Trip, done?: () => void, expected = shared?.revisions.get(next.id), create = false) {
    if (shared) {
      const saved = await saveShared(async () => {
        if (!create && expected === undefined) throw new SharedTripConflict();
        const { writeSharedTrip } = await import('./services/firebase');
        return writeSharedTrip(shared.userId, next.id, create ? undefined : expected, next);
      });
      if (!saved) return false;
    } else {
      setDb(old => ({ ...old, trips: create ? [...old.trips, next] : old.trips.map(t => t.id === next.id ? next : t) }));
    }
    done?.();
    return true;
  }
  function removeTrip(id: string) {
    if (shared) {
      const expected = shared.revisions.get(id);
      if (expected !== undefined) void saveShared(async () => {
        const { writeSharedTrip } = await import('./services/firebase');
        await writeSharedTrip(shared.userId, id, expected);
      });
      return;
    }
    setDb(old => ({ ...old, trips: old.trips.filter(t => t.id !== id) }));
  }
  function checkPackingItem(trip: Trip, item: PackingItem, checked: boolean) {
    if (shared) {
      void saveShared(async () => {
        const { checkSharedPackingItem } = await import('./services/firebase');
        await checkSharedPackingItem(shared.userId, trip.id, item.id, checked);
      });
    } else {
      void updateTrip(savePackingItem(trip, { ...item, completed: checked }));
    }
  }
  function selectStop(id: string, scroll = false) {
    setSelected(id); focusStop(id);
    if (scroll) requestAnimationFrame(() => document.getElementById(`stop-${id}`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }));
  }
  function exportBackup() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `horangnabi-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('5MB 이하의 백업 파일을 선택해 주세요.');
      const next = parseDatabase(JSON.parse(await file.text()));
      if (shared) {
        if (!next.trips.length || !window.confirm(`${next.trips.length}개의 여행을 공유 공간에 복사할까요? 기존 여행은 그대로 남아요.`)) return;
        if (await saveShared(async () => {
          const { importSharedTrips } = await import('./services/firebase');
          await importSharedTrips(shared.userId, next.trips);
        })) setNotice('백업의 여행을 공유 공간에 복사했어요.');
        return;
      }
      if (!window.confirm(`${next.trips.length}개의 여행으로 현재 데이터를 교체할까요? 먼저 현재 데이터를 백업해 두세요.`)) return;
      setDb(next); setBlocked(false); returnToTrips(); setNotice('백업을 복원했어요.');
    } catch (e) { setNotice(e instanceof Error ? e.message : '백업을 복원하지 못했어요.'); }
  }
  function renderTripCard(trip: Trip, featured = false) {
    return <TripCard key={trip.id} trip={trip} featured={featured} onOpen={() => pushEntry(trip.id)}
      onEdit={() => pushEntry(tripId, { kind: 'trip', id: trip.id })}
      onDelete={() => { if (confirm(`‘${trip.name}’ 여행과 모든 일정을 삭제할까요?`)) removeTrip(trip.id); }}/>;
  }
  const today = new Date().toLocaleDateString('sv-SE');
  const upcoming = db.trips.filter(t => t.end >= today).sort((a, b) => a.start.localeCompare(b.start));
  const past = db.trips.filter(t => t.end < today).sort((a, b) => b.start.localeCompare(a.start));
  return <><SiteHeader onHome={returnToTrips} actions={headerActions} menuContent={offlineMenu}/><main>{saving && <p role="status" className="alert">공유 여행을 저장하고 있어요.</p>}{!shared && firebaseConfigProvided && !firebaseConfigured && <p role="alert" className="alert">공유 여행의 Firebase 설정을 확인해 주세요.</p>}{storageError && <div role="alert" className="alert">{storageError}{blocked && <button onClick={() => { if (confirm('읽지 못한 기존 저장 데이터를 현재 화면의 데이터로 교체할까요?')) setBlocked(false); }}>현재 데이터로 저장 재개</button>}</div>}{notice && <div role="status" className="alert">{notice}<button onClick={() => setNotice('')}>닫기</button></div>}{!trip ? <><section className="trip-section home-upcoming">
  <div className="section-heading home-section-heading">
    <h1>다가오는 여행 <span>{upcoming.length}</span></h1>
    <button className="primary" onClick={() => pushEntry(tripId, { kind: 'trip' })}><Plus size={17}/>새 여행 만들기</button>
  </div>
  {upcoming.length ? <>
    {renderTripCard(upcoming[0], true)}
    {upcoming.length > 1 && <div className="trip-grid home-more-trips">{upcoming.slice(1).map(item => renderTripCard(item))}</div>}
  </> : <div className="home-empty"><Compass size={24} aria-hidden="true"/><p>예정된 여행이 없어요.</p></div>}
</section>{past.length > 0 && <section className="trip-section"><div className="section-heading"><h2>지난 여행 <span>{past.length}</span></h2></div><div className="trip-grid">{past.map(item => renderTripCard(item))}</div></section>}</> : <><button className="back-button" onClick={returnToTrips}><ArrowLeft size={16}/>나의 여행</button><section className="trip-banner"><div><div className="eyebrow"><MapPin size={14}/>{trip.region}</div><h1>{trip.name}</h1><p><CalendarDays size={16}/>{trip.start.replaceAll('-', '.')} — {trip.end.replaceAll('-', '.')}<span className="badge">{dates.length}일</span></p></div><button className="secondary" onClick={() => pushEntry(tripId, { kind: 'trip', id: trip.id })}><Pencil size={15}/>여행 수정</button></section><nav className="trip-view-tabs" aria-label="여행 보기"><button aria-pressed={!packingOpen && view === 'schedule'} onClick={() => { setPackingOpen(false); setView('schedule'); setSelected(undefined); clearFocus(); }}>여행 일정</button><button aria-pressed={!packingOpen && view === 'reservations'} onClick={() => { setPackingOpen(false); setView('reservations'); setSelected(undefined); clearFocus(); }}>예약 <span>{reservations.length}</span></button><button aria-pressed={!packingOpen && view === 'saved'} onClick={() => { setPackingOpen(false); setView('saved'); setSelected(undefined); clearFocus(); }}>장소 보관함 <span>{savedPlaces.length}</span></button>{shared && <button aria-pressed={!packingOpen && view === 'expenses'} onClick={() => { setPackingOpen(false); setView('expenses'); setSelected(undefined); clearFocus(); }}>가계부 <span>{expenses.length}</span></button>}<button aria-pressed={packingOpen} onClick={() => { setPackingOpen(true); setSelected(undefined); clearFocus(); }}>준비물 <span>{completedPacking}/{packingItems.length}</span></button></nav>{packingOpen && <PackingList key={trip.id} items={packingItems} shared={shared} busy={saving} onCheck={(item, checked) => checkPackingItem(trip, item, checked)} onSave={item => updateTrip(savePackingItem(trip, item))} onDelete={id => updateTrip(removePackingItem(trip, id))}/>}{!packingOpen && view === 'reservations' && <Suspense fallback={<p role="status" className="muted">예약 정보를 준비하고 있어요.</p>}><Reservations items={reservations} stops={trip.stops} onOpenStop={stop => { setView('schedule'); setDay(stop.date); selectStop(stop.id, true); }} onAdd={() => pushEntry(tripId, { kind: 'reservation' })} onEdit={id => pushEntry(tripId, { kind: 'reservation', id })} onDelete={id => void updateTrip(removeReservation(trip, id))}/></Suspense>}{shared && !packingOpen && view === 'expenses' && <Suspense fallback={<p role="status" className="muted">가계부를 열고 있어요.</p>}><Expenses items={expenses} members={shared} busy={saving} onAdd={() => pushEntry(tripId, { kind: 'expense' })} onEdit={id => pushEntry(tripId, { kind: 'expense', id })} onDelete={id => void updateTrip({ ...trip, expenses: expenses.filter(item => item.id !== id) })}/></Suspense>}<div className="planner" hidden={packingOpen || view === 'reservations' || view === 'expenses'}><section className="map-section" ref={mapSectionRef}><div className="map-title">{view === 'saved' && <span><span className="live-dot"/>모아둔 후보 장소</span>}<button className="text-button" onClick={() => { setSelected(undefined); clearFocus(); setFit(v => v + 1); }}><Maximize2 size={15}/>전체 장소 보기</button></div><TravelMap points={points} connectPoints={view === 'schedule'} selected={focusedStop} onSelect={id => selectStop(id, true)} initialCenter={searchCenter} fitKey={`${trip.id}-${activeDay}-${view}-${fit}`}/><div className="map-bottom"><MapPin size={14}/>{points.filter(p => p.lat !== undefined).length}개의 장소{view === 'saved' && <span>후보 번호 · 방문 순서 미정</span>}</div></section>{view === 'saved' ? <SavedPlaces places={savedPlaces} dates={dates} selected={focusedStop} onSelect={id => selectStop(id)} onAdd={() => pushEntry(tripId, { kind: 'saved' })} onEdit={place => pushEntry(tripId, { kind: 'saved', id: place.id })} onDelete={id => { updateTrip({ ...trip, savedPlaces: savedPlaces.filter(place => place.id !== id) }); setSelected(undefined); clearFocus(); }} onMove={(id, date) => { const next = scheduleSavedPlace(trip, id, date); if (next === trip) return; updateTrip(next, () => { setDay(date); setView('schedule'); setSelected(id); clearFocus(); setFit(value => value + 1); setNotice('선택한 날짜의 일정으로 옮겼어요.'); }); }}/> : <section className="schedule"><div className="date-tabs" role="tablist" aria-label="여행 날짜">{dates.map((d, i) => <button role="tab" aria-selected={activeDay === d} aria-current={d === today ? 'date' : undefined} key={d} className={activeDay === d ? 'active' : ''} onClick={() => { setDay(d); setSelected(undefined); }}><strong>{i + 1}일차</strong><small>{d.slice(5).replace('-', '.')}{d === today && <span className="today-tab-badge">오늘</span>}</small></button>)}</div><div className="day-heading"><div><div className="eyebrow">DAY {dates.indexOf(activeDay) + 1}</div><h2>{formatDate(activeDay)}</h2></div><span className="badge">{stops.length}개의 일정</span></div><div className="stop-list">{stops.map((s, i) => { const directions = googleMapsDirections(s); return <article id={`stop-${s.id}`} key={s.id} className={`stop-card ${focusedStop === s.id ? 'selected' : ''}`} data-dragging={stopDrag.preview?.source === i || undefined} data-drop={stopDrag.preview?.target === i && stopDrag.preview.source !== i ? (stopDrag.preview.source < i ? 'after' : 'before') : undefined}><div className="stop-order"><span className="stop-number">{i + 1}</span><span className="stop-time">{s.time || '시간 미정'}</span>{stops.length > 1 && <span className="stop-drag-handle" title="끌어서 일정 순서 변경" aria-hidden="true" {...stopDrag.handleProps(i)}><GripVertical size={17}/></span>}</div><div className="stop-content"><div className="stop-summary"><button className="stop-select" aria-expanded={selected === s.id} onClick={() => selectStop(s.id)}><div className="stop-label"><div className="stop-meta"><span className={`category category-${s.category === '맛집' ? 'food' : s.category === '카페' ? 'cafe' : 'place'}`}>{s.category}</span></div><h3>{s.name}</h3><p><MapPin size={12}/>{s.address || (s.lat === undefined ? '아직 위치를 정하지 않았어요' : '지도에서 선택한 위치')}</p></div></button><StopPhoto {...s}/></div>{selected === s.id && <div className="stop-detail"><div className="stop-location-review"><strong>저장된 장소 주소</strong><p>{s.address || '저장된 장소 주소가 없어요.'}</p><strong>저장된 Google 지도 주소</strong>{s.mapUrl ? <a href={s.mapUrl} target="_blank" rel="noopener noreferrer">{s.mapUrl}</a> : <p>저장된 Google 지도 링크가 없어요.</p>}</div>{directions && <p className="stop-directions"><a className="secondary" href={directions} target="_blank" rel="noopener noreferrer">현 위치에서 길찾기</a></p>}{s.memo && <p className="memo">{s.memo}</p>}<div className="stop-actions"><button className="text-button" onClick={() => pushEntry(tripId, { kind: 'stop', id: s.id })}><Pencil size={14}/>수정</button><button className="text-button danger" onClick={() => { if (confirm(`‘${s.name}’ 일정을 삭제할까요?`)) { updateTrip({ ...trip, stops: trip.stops.filter(x => x.id !== s.id) }); setSelected(undefined); } }}><Trash2 size={14}/>삭제</button></div></div>}<div className="reorder"><button className="icon-button" disabled={i === 0} aria-label={`${s.name} 위로 이동`} onClick={() => updateTrip(moveStop(trip, activeDay, s.id, -1))}><ArrowUp size={15}/></button><button className="icon-button" disabled={i === stops.length - 1} aria-label={`${s.name} 아래로 이동`} onClick={() => updateTrip(moveStop(trip, activeDay, s.id, 1))}><ArrowDown size={15}/></button></div></div></article>; })}{!stops.length && <div className="empty"><Compass size={32}/><h3>아직 비어 있는 하루</h3><p>가보고 싶은 첫 장소를 추가해 보세요.</p></div>}</div><button className="add-stop" onClick={() => pushEntry(tripId, { kind: 'stop' })}><Plus size={18}/>일정 추가하기</button></section>}</div></>}<footer><span>✦ 호랑나비 <small>함께 만드는 여행</small></span><div><button className="text-button" onClick={exportBackup}><Download size={14}/>JSON 백업</button><button className="text-button" onClick={() => fileRef.current?.click()}><Upload size={14}/>{shared ? '백업 가져오기' : '복원'}</button><input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={e => { void importBackup(e.target.files?.[0]); e.target.value = ''; }}/></div><small>{shared ? '공유 여행은 등록된 두 계정에 동기화됩니다' : '이 기기의 여행은 브라우저에 저장됩니다'}</small></footer></main><Suspense fallback={<Modal title="편집 화면을 열고 있어요" onClose={closeEditor}><p className="modal-status" role="status">잠시 기다려 주세요.</p></Modal>}>{expenseEditor && trip && shared && <ExpenseForm item={expenseEditor === 'new' ? undefined : expenseEditor} members={shared} defaultCurrency={trip.destination?.countryCode === 'JP' || trip.region.includes('일본') ? 'JPY' : 'KRW'} busy={saving} status={notice} onClose={closeEditor} onSave={item => {
  const exists = expenses.some(entry => entry.id === item.id);
  if (expenseEditor === 'new' && expenses.length >= expenseLimit) { setNotice('여행당 지출을 500개까지 기록할 수 있어요.'); return; }
  const next = exists ? expenses.map(entry => entry.id === item.id ? item : entry) : [...expenses, item];
  void updateTrip({ ...trip, expenses: next }, afterEditorSave(closeEditor), editorRevision.current);
}}/>}{reservationEditor && trip && <ReservationForm region={trip.region} searchCenter={searchCenter} startDate={trip.start} endDate={trip.end} item={reservationEditor === 'new' ? undefined : reservationEditor} busy={saving} status={shared ? notice : undefined} onClose={closeEditor} onSave={item => { void updateTrip(saveReservation(trip, item), afterEditorSave(closeEditor), editorRevision.current); }}/>} {tripEditor && <TripForm busy={saving} status={shared ? notice : undefined} trip={tripEditor === 'new' ? undefined : tripEditor} onClose={closeEditor} onSave={next => { updateTrip(next, afterEditorSave(() => finishTripEdit(next)), editorRevision.current, tripEditor === 'new'); }}/ >}{savedEditor && trip && <StopForm busy={saving} status={shared ? notice : undefined} mode="saved" savedPlace={savedEditor === 'new' ? undefined : savedEditor} region={trip.region} searchCenter={searchCenter} date={activeDay} dates={dates} onClose={closeEditor} onSave={place => { updateTrip({ ...trip, savedPlaces: savedPlaces.some(item => item.id === place.id) ? savedPlaces.map(item => item.id === place.id ? place : item) : [...savedPlaces, place] }, afterEditorSave(() => { setSelected(place.id); focusStop(place.id); closeEditor(); setFit(value => value + 1); }), editorRevision.current); }}/ >}{stopEditor && trip && <StopForm busy={saving} status={shared ? notice : undefined} region={trip.region} searchCenter={searchCenter} stop={stopEditor === 'new' ? undefined : stopEditor} date={activeDay} dates={dates} onClose={closeEditor} onSave={s => { updateTrip({ ...trip, stops: trip.stops.some(x => x.id === s.id) ? trip.stops.map(x => x.id === s.id ? s : x) : [...trip.stops, s] }, afterEditorSave(() => { setDay(s.date); setSelected(s.id); focusStop(s.id); closeEditor(); }), editorRevision.current); }}/>}</Suspense></>;
}
