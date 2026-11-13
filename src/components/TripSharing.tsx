import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { Copy, Link, Users } from 'lucide-react';
import { Modal } from './Modal';
import { changeTripMember, joinRequestReference, loadTripInvite, rejectJoinRequest, requestTripJoin, rotateTripInvite, sharingReferences } from '../services/firebase';
import { inviteUrl, MAX_TRIP_MEMBERS, type JoinRequest, type TripAccess } from '../services/tripMembers';

export function TripSharing({ tripId, access, userId, onClose }: { tripId: string; access: TripAccess; userId: string; onClose: () => void }) {
  const owner = access.ownerId === userId;
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!owner) return;
    return onSnapshot(sharingReferences(userId, tripId).requests, snapshot => {
      setRequests(snapshot.docs.map(doc => doc.data() as JoinRequest).filter(request => request.status === 'pending'));
    }, () => setMessage('참여 요청을 불러오지 못했어요. 공유 보안 규칙과 연결을 확인해 주세요.'));
  }, [owner, userId, tripId]);
  async function action(task: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await task(); setMessage(success); }
    catch { setMessage('변경하지 못했어요. 현재 여행장 권한과 연결을 확인하고 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  const url = access.inviteToken ? inviteUrl(access.inviteToken, location.href) : '';
  return <Modal title="여행 공유" onClose={onClose} busy={busy} status={message}>
    <div className="sharing-panel">
      <p><Users size={17}/> 참여자 {access.memberIds.length}/{MAX_TRIP_MEMBERS}명</p>
      <ul className="sharing-members">{access.memberIds.map(id => <li key={id}><span>{access.memberNames[id]}{id === userId && ' (나)'}{id === access.ownerId && <small>여행장</small>}</span>
        {owner && id !== userId && <button className="text-button danger" disabled={busy} onClick={() => { if (confirm('이 참여자를 여행에서 제외할까요? 준비물과 정산 기준도 바뀝니다.')) void action(() => changeTripMember(userId, tripId, id), '참여자를 제외했어요.'); }}>제외</button>}</li>)}</ul>
      {owner ? <>
        <h3>초대 링크</h3><p className="muted">링크는 7일 동안 유효해요. 친구가 로그인해 참여를 요청하면 여기에서 승인해 주세요.</p>
        {url && <><label>현재 초대 링크<input readOnly value={url} onFocus={event => event.currentTarget.select()}/></label><button className="secondary" disabled={busy} onClick={() => void action(() => navigator.clipboard.writeText(url), '링크를 복사했어요. 친구에게 직접 전달해 주세요.')}><Copy size={15}/>링크 복사</button></>}
        <div className="sharing-actions"><button className="primary" disabled={busy} onClick={() => void action(() => rotateTripInvite(userId, tripId, true), '7일 동안 사용할 새 링크를 만들었어요. 이전 링크는 취소됐어요.')}><Link size={15}/>{url ? '새 링크 만들기' : '초대 링크 만들기'}</button>
          {url && <button className="secondary" disabled={busy} onClick={() => void action(() => rotateTripInvite(userId, tripId, false), '초대 링크를 취소했어요. 이미 들어온 요청은 승인·거절할 수 있어요.')}>링크 취소</button>}</div>
        <h3>참여 요청 {requests.length}개</h3>
        {requests.length ? <ul className="sharing-members">{requests.map(request => <li key={request.userId}><span>{request.displayName}<small>계정 {request.userId.slice(-6)}</small></span><div className="sharing-actions">
          <button className="secondary" disabled={busy || access.memberIds.length >= MAX_TRIP_MEMBERS} onClick={() => void action(() => changeTripMember(userId, tripId, request.userId, true), '참여 요청을 승인했어요.')}>승인</button>
          <button className="text-button danger" disabled={busy} onClick={() => void action(() => rejectJoinRequest(userId, tripId, request.userId), '참여 요청을 거절했어요.')}>거절</button></div></li>)}</ul> : <p className="muted">아직 기다리는 요청이 없어요.</p>}
      </> : <><p className="muted">여행장이 초대 링크와 참여 요청을 관리해요. 참여자는 일정과 예약을 함께 편집할 수 있어요.</p>
        <button className="secondary danger" disabled={busy} onClick={() => { if (confirm('이 여행에서 나갈까요? 다시 들어오려면 초대와 승인이 필요해요.')) void action(() => changeTripMember(userId, tripId, userId), '여행에서 나왔어요.'); }}>여행 나가기</button></>}
    </div>
  </Modal>;
}

export function InviteJoin({ token, userId, access, onClose }: { token: string; userId: string; access: Map<string, TripAccess>; onClose: () => void }) {
  const [invitation, setInvitation] = useState<{ tripId: string; tripName: string }>();
  const [request, setRequest] = useState<JoinRequest>();
  const [message, setMessage] = useState('초대 링크를 확인하고 있어요.');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setInvitation(undefined); setRequest(undefined);
    void loadTripInvite(userId, token).then(value => { if (active) { setInvitation(value); setMessage(''); } }).catch(() => { if (active) setMessage('초대 링크를 확인하지 못했어요. 만료·취소 여부와 연결을 확인하고 새로 열어 주세요.'); });
    return () => { active = false; };
  }, [token, userId]);
  useEffect(() => {
    if (!invitation) return;
    return onSnapshot(joinRequestReference(userId, invitation.tripId), snapshot => {
      setRequest(snapshot.exists() ? snapshot.data() as JoinRequest : undefined);
    }, () => setMessage('요청 상태를 확인하지 못했어요. 연결과 보안 규칙을 확인해 주세요.'));
  }, [invitation, userId]);
  const joined = invitation && access.has(invitation.tripId);
  const canRequest = !request || request.status === 'approved' || (request.status === 'rejected' && request.inviteToken !== token);
  async function join() {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await requestTripJoin(userId, token); }
    catch { setMessage('참여 요청을 보내지 못했어요. 링크 유효 기간과 연결을 확인해 주세요.'); }
    finally { setBusy(false); }
  }
  return <Modal title="여행 초대" onClose={onClose} busy={busy}>
    <div className="sharing-panel">
      {invitation && <h3>{invitation.tripName}</h3>}
      <p role="status">{message || (joined ? '참여 중인 여행이에요. 내 여행 목록에서 열 수 있어요.' : request?.status === 'pending' ? '여행장의 승인을 기다리고 있어요. 이 창을 닫아도 요청은 유지돼요.' : request?.status === 'approved' ? '이전에 승인된 요청이에요. 여행이 목록에 없으면 다시 참여를 요청할 수 있어요.' : request?.status === 'rejected' ? '참여 요청이 거절됐어요. 여행장에게 확인해 주세요.' : '참여를 요청하면 여행장에게 호랑나비 닉네임이 전달돼요. 승인 전에는 일정을 볼 수 없어요.')}</p>
      {invitation && !joined && canRequest && <button className="primary" disabled={busy} onClick={() => void join()}>{request ? '다시 참여 요청' : '참여 요청 보내기'}</button>}
      <button className="secondary" disabled={busy} onClick={onClose}>{joined ? '내 여행 목록으로' : '닫기'}</button>
    </div>
  </Modal>;
}
