import type { Trip } from '../types';
import { Modal } from './Modal';
import { ACTIVITY_LIMIT, activityFields, activityLabel } from '../services/activityLog';

export function ActivityLog({trip,userId,onClose}:{trip:Trip;userId?:string;onClose:()=>void}) {
  const entries=trip.activityLog??[];
  return <Modal title="최근 변경 내역" onClose={onClose}>
    <div className="activity-log">
      <p className="muted">{trip.name}의 최근 {ACTIVITY_LIMIT}건을 보여줘요.</p>
      {entries.length?<ol>{entries.map(entry=><li key={entry.id}>
        <div className="activity-log-meta"><strong>{entry.actorName}{entry.actorId===userId?' · 나':''}</strong><time dateTime={new Date(entry.at).toISOString()}>{new Date(entry.at).toLocaleString('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></div>
        <ul>{entry.changes.map((change,index)=><li key={index}>
          <span className="badge">{activityLabel(change)}</span><p>{change.label}</p>
          {(change.date||activityFields(change))&&<small className="muted">{[change.date?.slice(5).replace('-','.'),activityFields(change)].filter(Boolean).join(' · ')}</small>}
        </li>)}</ul>
        {entry.more>0&&<small className="muted">그 외 {entry.more}개의 변경</small>}
      </li>)}</ol>:<p className="empty">아직 기록된 변경이 없어요. 이 기능 적용 후 저장한 변경부터 표시돼요.</p>}
      <small className="muted">일정·보관함·예약·준비물·가계부·여행 정보의 저장 내역이에요. 표시 시각은 변경한 기기의 시간을 기준으로 해요.</small>
    </div>
  </Modal>;
}
