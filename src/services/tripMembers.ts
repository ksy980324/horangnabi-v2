export const MAX_TRIP_MEMBERS = 20;
export type TripAccess = { ownerId: string; memberIds: string[]; memberNames: Record<string, string>; inviteToken: string };
export type JoinRequest = { userId: string; displayName: string; status: 'pending' | 'approved' | 'rejected'; inviteToken?: string };

export function memberName(name: string | null | undefined, fallback = '동행인') {
  return name?.trim().slice(0, 60) || fallback;
}

export function parseTripAccess(value: unknown): TripAccess {
  if (!value || typeof value !== 'object') throw new Error('여행 참여자 정보를 확인해 주세요.');
  const access = value as TripAccess;
  if (typeof access.ownerId !== 'string' || !Array.isArray(access.memberIds) || !access.memberIds.length
    || access.memberIds.length > MAX_TRIP_MEMBERS || new Set(access.memberIds).size !== access.memberIds.length
    || access.memberIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 128)
    || !access.memberIds.includes(access.ownerId) || !access.memberNames || typeof access.memberNames !== 'object'
    || Array.isArray(access.memberNames) || Object.keys(access.memberNames).length !== access.memberIds.length
    || access.memberIds.some(id => !Object.hasOwn(access.memberNames, id) || typeof access.memberNames[id] !== 'string' || !access.memberNames[id].trim() || access.memberNames[id].length > 60)
    || typeof access.inviteToken !== 'string' || (access.inviteToken !== '' && !/^[a-f0-9]{64}$/.test(access.inviteToken))) throw new Error('여행 참여자 정보를 확인해 주세요.');
  return { ownerId: access.ownerId, memberIds: access.memberIds, memberNames: access.memberNames, inviteToken: access.inviteToken };
}

export function initialTripAccess(userId: string, name?: string | null): TripAccess {
  return parseTripAccess({ ownerId: userId, memberIds: [userId], memberNames: { [userId]: memberName(name, '여행장') }, inviteToken: '' });
}

export function approveMember(access: TripAccess, actorId: string, request: JoinRequest): TripAccess {
  if (access.ownerId !== actorId || request.status !== 'pending' || access.memberIds.includes(request.userId)
    || access.memberIds.length >= MAX_TRIP_MEMBERS) throw new Error('참여 요청과 여행장 권한을 확인해 주세요.');
  return parseTripAccess({ ...access, memberIds: [...access.memberIds, request.userId], memberNames: { ...access.memberNames, [request.userId]: memberName(request.displayName) } });
}

export function removeMember(access: TripAccess, actorId: string, targetId: string): TripAccess {
  if (targetId === access.ownerId || !access.memberIds.includes(targetId) || (actorId !== access.ownerId && actorId !== targetId)) throw new Error('여행장은 나갈 수 없으며 다른 참여자는 여행장만 제외할 수 있어요.');
  const names = { ...access.memberNames }; delete names[targetId];
  return parseTripAccess({ ...access, memberIds: access.memberIds.filter(id => id !== targetId), memberNames: names });
}

export const inviteTokenFromHash = (hash: string) => /^#invite=([a-f0-9]{64})$/.exec(hash)?.[1];

export function inviteUrl(token: string, currentUrl: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('초대 링크를 확인해 주세요.');
  const url = new URL(currentUrl); url.search = ''; url.hash = `invite=${token}`;
  return url.href;
}
