import { Users } from 'lucide-react';
import type { TripAccess } from '../services/tripMembers';

export function TripMembers({ access, userId, compact = false }: { access: TripAccess; userId: string; compact?: boolean }) {
  const names = access.memberIds.map(id => ({ id, name: access.memberNames[id], self: id === userId }));
  const visible = compact ? names.slice(0, 3) : names;
  const title = names.length === 1 ? '나만 보는 여행' : `${names.length}명이 함께하는 여행`;
  return <div className={`trip-members${compact ? ' compact' : ''}`} role="group" aria-label={`여행 참여자: ${names.map(member => member.name + (member.self ? ' (나)' : '')).join(', ')}`}>
    <span className="trip-members-title"><Users size={14} aria-hidden="true"/>{title}</span>
    <div className="trip-member-chips">{visible.map(member => <span className={`trip-member-chip${member.self ? ' self' : ''}`} key={member.id} title={member.name + (member.self ? ' (나)' : '')}>
      <span className="member-initial" aria-hidden="true">{Array.from(member.name)[0]}</span><span className="member-nickname">{member.name}{member.self && <small> (나)</small>}</span>
    </span>)}{compact && names.length > visible.length && <span className="trip-members-more">외 {names.length - visible.length}명</span>}</div>
  </div>;
}
