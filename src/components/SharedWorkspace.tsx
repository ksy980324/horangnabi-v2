import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { createSharedSnapshotReader } from '../services/sharedSnapshot';
import { auth, googleSignIn, sharedReferences, migrateLegacyTrips, profileReference, saveNickname, syncOwnNickname } from '../services/firebase';
import { parseUserProfile, type UserProfile } from '../services/userProfile';
import { NicknameForm } from './NicknameForm';
import { Modal } from './Modal';
import { InviteJoin } from './TripSharing';
import { inviteTokenFromHash, type TripAccess } from '../services/tripMembers';
import { clearSharedOfflineTrip } from '../services/offlineTrip';
import { SiteHeader, type HeaderAction } from './SiteHeader';
import type { Database } from '../types';

export type SharedData = { userId: string; nickname: string; access: Map<string, TripAccess>; db: Database; revisions: Map<string, number> };

export default function SharedWorkspace({ onBack, children }: { onBack?: () => void; children: (data: SharedData, actions: HeaderAction[]) => ReactNode }) {
  const [user, setUser] = useState<User | null>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [workspace, setWorkspace] = useState<Omit<SharedData, 'nickname'>>();
  const [profile, setProfile] = useState<UserProfile | null>();
  const [profileError, setProfileError] = useState('');
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [setupPending, setSetupPending] = useState(false);
  const [nameSyncError, setNameSyncError] = useState('');
  const [token, setToken] = useState(() => inviteTokenFromHash(location.hash));
  const [migrationMessage, setMigrationMessage] = useState('');
  useEffect(() => { const changed = () => setToken(inviteTokenFromHash(location.hash)); window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  const closeInvite = () => { history.replaceState(history.state, '', location.pathname + location.search); setToken(undefined); };
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, next => {
      if (next) clearSharedOfflineTrip(next.uid);
      setWorkspace(undefined); setProfile(undefined); setProfileError(''); setProfileEditing(false); setSetupPending(false); setNameSyncError(''); setMessage(''); setUser(next);
    });
  }, []);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(profileReference(user.uid), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) return;
      try { setProfile(snapshot.exists() ? parseUserProfile(snapshot.data()) : null); setProfileError(''); }
      catch { setProfile(null); setProfileError('저장된 닉네임을 확인하지 못했어요. 다시 설정해 주세요.'); }
    }, () => { setProfile(undefined); setProfileError('닉네임 정보를 불러오지 못했어요. 새 보안 규칙과 연결을 확인하고 접근 다시 확인을 눌러 주세요.'); });
  }, [user, attempt]);
  useEffect(() => {
    if (!user) return;
    const refs = sharedReferences(user.uid);
    const readTrips = createSharedSnapshotReader(user.uid);
    const pendingChanges = new Set<string>();
    let disposed = false;
    const stopTrips = onSnapshot(refs.visibleTrips, { includeMetadataChanges: true }, result => {
      if (disposed) return;
      for (const change of result.docChanges()) pendingChanges.add(change.doc.id);
      if (result.metadata.fromCache) return;
      try {
        const trips = readTrips(result.docs, [...pendingChanges]);
        pendingChanges.clear();
        setWorkspace(current => current?.db === trips.db && current.access === trips.access ? current : { userId: user.uid, ...trips });
        setMessage('');
      } catch { setWorkspace(undefined); setMessage('공유 여행 데이터를 읽지 못했어요.'); }
    }, error => {
      if (disposed) return;
      setWorkspace(undefined);
      setMessage(error.code === 'permission-denied' ? '여행별 공유 보안 규칙을 적용한 뒤 접근 다시 확인을 눌러 주세요.' : '공유 여행을 불러오지 못했어요.');
    });
    return () => { disposed = true; stopTrips(); };
  }, [user, attempt]);
  const profileReady = !!profile;
  useEffect(() => {
    if (!user || !profileReady) return;
    let disposed = false;
    setMigrationMessage('기존 공유 여행을 확인하고 있어요.');
    void migrateLegacyTrips(user.uid).then(() => { if (!disposed) setMigrationMessage(''); }).catch(() => {
      if (!disposed) setMigrationMessage('기존 여행을 전환하지 못했어요. 데이터는 원본에 남아 있어요. 보안 규칙과 연결을 확인한 뒤 다시 로그인해 주세요.');
    });
    return () => { disposed = true; };
  }, [user, profileReady, attempt]);
  const pendingNameTrips = profile && workspace ? [...workspace.access].filter(([, access]) => access.memberNames[user!.uid] !== profile.nickname).map(([id]) => id).sort().join('|') : '';
  useEffect(() => {
    if (!user || !profile || profileSaving || !pendingNameTrips) { if (!pendingNameTrips) setNameSyncError(''); return; }
    let active = true;
    void syncOwnNickname(user.uid, profile.nickname).then(() => { if (active) setNameSyncError(''); }).catch(() => { if (active) setNameSyncError('일부 여행의 닉네임을 갱신하지 못했어요. 메뉴의 닉네임 변경에서 다시 저장해 주세요.'); });
    return () => { active = false; };
  }, [user, profile?.nickname, pendingNameTrips, profileSaving]);
  useEffect(() => {
    const restore = () => setProfileEditing(!!user && history.state?.horangnabiNickname === user.uid);
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [user]);
  function openProfileEditor() {
    if (!user) return;
    history.pushState({ ...history.state, horangnabiNickname: user.uid }, '');
    setProfileEditing(true);
  }
  function closeProfileEditor() {
    if (user && history.state?.horangnabiNickname === user.uid) history.back();
    else setProfileEditing(false);
  }

  async function changeNickname(nickname: string) {
    if (!user || profileSaving) return;
    if (!profile) setSetupPending(true);
    setProfileSaving(true);
    try { await saveNickname(user.uid, nickname); setSetupPending(false); if (profileEditing) closeProfileEditor(); setNameSyncError(''); }
    catch (error) {
      if (error instanceof Error && error.message.startsWith('닉네임은 저장')) throw error;
      throw new Error('닉네임을 저장하지 못했어요. 새 보안 규칙과 연결을 확인하고 다시 시도해 주세요.');
    } finally { setProfileSaving(false); }
  }

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

  const actions: HeaderAction[] = [];
  const legacyRecovery = onBack && <aside className="legacy-recovery"><button className="text-button" type="button" onClick={onBack}>이전 기기 여행 복구</button><small>과거 이 기기에만 저장한 여행을 열어요.</small></aside>;
  if (user && profile && workspace && !setupPending) actions.push({ label: `닉네임 변경 · ${profile.nickname}`, onClick: openProfileEditor, disabled: busy || profileSaving });
  if (user) actions.push({ label: '로그아웃', onClick: () => void changeSession(), disabled: busy || profileSaving });

  if (user && (profile === null || setupPending)) return <><SiteHeader actions={actions}/><main><NicknameForm required busy={profileSaving} initial={profile?.nickname} message={profileError} onSave={changeNickname} onCancel={() => {}}/></main>{legacyRecovery}</>;
  if (workspace && workspace.userId === user?.uid && profile) return <>{(migrationMessage || nameSyncError) && <p role="status" className="migration-notice">{nameSyncError || migrationMessage}</p>}{children({ ...workspace, nickname: profile.nickname }, actions)}{legacyRecovery}{profileEditing && <Modal title="닉네임 변경" busy={profileSaving} onClose={closeProfileEditor}><NicknameForm required={false} busy={profileSaving} initial={profile.nickname} onSave={changeNickname} onCancel={closeProfileEditor}/></Modal>}{token && <InviteJoin token={token} userId={user.uid} access={workspace.access} onClose={closeInvite}/>}</>;
  return <>
    <SiteHeader actions={actions}/>
    <main className="shared-panel">
      <h1>내 여행</h1>
      <p role="status">{profileError || message || (user === undefined ? '로그인 상태를 확인하고 있어요.' : user ? profile === undefined ? '닉네임 정보를 확인하고 있어요.' : '공유 여행을 불러오고 있어요.' : 'Google 계정으로 로그인해 공유 여행을 열어보세요.')}</p>
      {user === null && <button className="primary" disabled={busy} onClick={() => void changeSession()}>{busy ? '로그인 중' : 'Google로 로그인'}</button>}
      {user && <><p>{user.email}</p><p>Firebase 사용자 UID <code>{user.uid}</code></p><button className="secondary" onClick={() => { setMessage(''); setAttempt(value => value + 1); }}>접근 다시 확인</button></>}
    </main>
    {legacyRecovery}
  </>;
}
