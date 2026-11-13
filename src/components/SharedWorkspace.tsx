import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { createSharedSnapshotReader, type SharedSnapshot } from '../services/sharedSnapshot';
import { auth, googleSignIn, sharedReferences } from '../services/firebase';
import { packingMembers } from '../services/packing';
import { clearSharedOfflineTrip } from '../services/offlineTrip';
import { SiteHeader, type HeaderAction } from './SiteHeader';
import type { Database } from '../types';

export type SharedData = { userId: string; memberIds: string[]; db: Database; revisions: Map<string, number> };

export default function SharedWorkspace({ onBack, children }: { onBack: () => void; children: (data: SharedData, actions: HeaderAction[]) => ReactNode }) {
  const [user, setUser] = useState<User | null>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [workspace, setWorkspace] = useState<SharedData>();
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, next => {
      if (next) clearSharedOfflineTrip(next.uid);
      setWorkspace(undefined); setMessage(''); setUser(next);
    });
  }, []);
  useEffect(() => {
    if (!user) return;
    const refs = sharedReferences();
    const readTrips = createSharedSnapshotReader();
    const pendingChanges = new Set<string>();
    let disposed = false;
    let stopMembers: (() => void) | undefined;
    let stopTrips: (() => void) | undefined;
    let memberIds: string[] | undefined;
    let trips: SharedSnapshot | undefined;
    const publish = () => {
      // Both server responses must be ready; never reveal a cached/unauthorized workspace.
      if (disposed || !memberIds || !trips) return;
      const ready = { userId: user.uid, memberIds, ...trips };
      setWorkspace(current => current?.db === ready.db && current.memberIds.length === ready.memberIds.length
        && current.memberIds.every((id, index) => id === ready.memberIds[index]) ? current : ready);
      setMessage('');
    };
    const fail = (message: string) => {
      if (disposed) return;
      disposed = true;
      stopMembers?.(); stopTrips?.();
      setWorkspace(undefined);
      setMessage(message);
    };
    // Start both independent subscriptions together, instead of waiting one network round trip.
    stopMembers = onSnapshot(refs.members, { includeMetadataChanges: true }, snapshot => {
      if (disposed || snapshot.metadata.fromCache) return;
      memberIds = packingMembers(snapshot.data()?.uids);
      if (!memberIds.includes(user.uid)) {
        fail('아직 공유 공간에 등록되지 않은 계정이거나 접근 규칙이 적용되지 않았어요.');
        return;
      }
      publish();
    }, error => {
      fail(error.code === 'permission-denied' ? '아직 공유 공간에 등록되지 않은 계정이거나 접근 규칙이 적용되지 않았어요.' : '공유 공간 연결을 확인해 주세요.');
    });
    stopTrips = onSnapshot(refs.trips, { includeMetadataChanges: true }, result => {
      if (disposed) return;
      // Cached/offline changes may be followed by a server event containing only metadata.
      for (const change of result.docChanges()) pendingChanges.add(change.doc.id);
      if (result.metadata.fromCache) return;
      try {
        trips = readTrips(result.docs, [...pendingChanges]);
        pendingChanges.clear();
        publish();
      } catch { fail('공유 여행 데이터를 읽지 못했어요.'); }
    }, error => {
      fail(error.code === 'permission-denied' ? '공유 여행에 접근할 권한이 없어요.' : '공유 여행을 불러오지 못했어요.');
    });
    return () => { disposed = true; stopMembers?.(); stopTrips?.(); };
  }, [user, attempt]);

  async function changeSession() {
    if (!auth) return;
    setBusy(true);
    setMessage('');
    try {
      if (user) { await signOut(auth); clearSharedOfflineTrip(); }
      else await googleSignIn();
    } catch (error) {
      const code = error instanceof Error && 'code' in error && typeof error.code === 'string' && /^auth\/[a-z0-9-]+$/.test(error.code) ? error.code : '';
      const hints: Record<string, string> = {
        'auth/unauthorized-domain': `현재 접속 도메인(${window.location.hostname})이 Firebase에 승인되어 있는지 확인해 주세요. 로컬에서는 localhost 주소로 열어 주세요.`,
        'auth/popup-blocked': '브라우저가 로그인 팝업을 차단했어요. 주소창에서 이 사이트의 팝업을 허용해 주세요.',
        'auth/popup-closed-by-user': '로그인 창이 완료 전에 닫혔어요. 팝업에서 계정 선택을 끝까지 진행해 주세요.',
        'auth/operation-not-allowed': 'Firebase Authentication의 로그인 제공업체에서 Google이 사용 설정되어 있는지 확인해 주세요.',
        'auth/network-request-failed': 'Google 로그인 서버에 연결하지 못했어요. 네트워크 연결을 확인해 주세요.',
        'auth/invalid-api-key': 'Firebase 웹 앱의 API 키 설정을 확인해 주세요.',
        'auth/app-not-authorized': 'Firebase 웹 앱의 API 키 제한과 현재 접속 도메인을 확인해 주세요.',
      };
      const fallback = user ? '로그아웃하지 못했어요.' : 'Google 로그인을 완료하지 못했어요.';
      setMessage(`${hints[code] ?? fallback}${code ? ` (${code})` : ''}`);
    } finally { setBusy(false); }
  }

  const actions: HeaderAction[] = [{ label: '이 기기의 여행', onClick: onBack }];
  if (user) actions.push({ label: '로그아웃', onClick: () => void changeSession(), disabled: busy });

  if (workspace && workspace.userId === user?.uid) return children(workspace, actions);
  return <>
    <SiteHeader actions={actions}/>
    <main className="shared-panel">
      <h1>공유 여행</h1>
      <p role="status">{message || (user === undefined ? '로그인 상태를 확인하고 있어요.' : user ? '공유 여행을 불러오고 있어요.' : 'Google 계정으로 로그인해 공유 여행을 열어보세요.')}</p>
      {user === null && <button className="primary" disabled={busy} onClick={() => void changeSession()}>{busy ? '로그인 중' : 'Google로 로그인'}</button>}
      {user && <><p>{user.email}</p><p>Firebase 사용자 UID <code>{user.uid}</code></p><button className="secondary" onClick={() => { setMessage(''); setAttempt(value => value + 1); }}>접근 다시 확인</button></>}
    </main>
  </>;
}
