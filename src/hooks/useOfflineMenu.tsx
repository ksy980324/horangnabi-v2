import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { offlinePageUrl, readOfflineTrip, saveOfflineTrip } from '../services/offlineTrip';
import type { Trip } from '../types';

export function useOfflineMenu(trip?: Trip, owner?: string) {
  const [saved, setSaved] = useState(readOfflineTrip);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  const current = saved?.tripId === trip?.id && saved?.owner === owner;
  useEffect(() => {
    const refresh = () => setSaved(readOfflineTrip());
    window.addEventListener('pageshow', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      request.current?.abort();
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  async function save() {
    if (!trip || busy) return;
    if (saved && !current && !confirm(`‘${saved.name}’의 오프라인 사본을 이 여행으로 바꿀까요?`)) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setMessage('');
    try {
      await saveOfflineTrip(trip, owner, controller.signal);
      setSaved(readOfflineTrip());
      setMessage('이 기기에 저장했어요. 일정이 바뀌면 다시 저장해 주세요.');
    } catch {
      setMessage('오프라인 사본을 저장하지 못했어요. HTTPS 연결과 브라우저 저장 권한을 확인해 주세요.');
    } finally { request.current = null; setBusy(false); }
  }

  if (!trip && !saved) return null;
  return <div className="offline-menu">
    {trip && <button type="button" disabled={busy} onClick={() => void save()}><Download size={15} aria-hidden="true"/>{busy ? '저장 중' : current ? '오프라인 사본 갱신' : '오프라인용으로 저장'}</button>}
    {saved && <a href={offlinePageUrl().href}>저장한 일정 보기</a>}
    <p role="status">{message}</p>
  </div>;
}
