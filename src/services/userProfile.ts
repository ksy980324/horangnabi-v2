export const NICKNAME_MAX_LENGTH = 20;
export type UserProfile = { nickname: string };

export function normalizeNickname(value: string) {
  if (/[\u0000-\u001f\u007f]/u.test(value)) throw new Error('닉네임에는 줄바꿈이나 제어 문자를 넣을 수 없어요.');
  const nickname = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!nickname || nickname.length > NICKNAME_MAX_LENGTH) throw new Error('닉네임을 1~20자로 입력해 주세요.');
  return nickname;
}

export function parseUserProfile(value: unknown): UserProfile {
  if (!value || typeof value !== 'object' || !('nickname' in value) || typeof value.nickname !== 'string'
    || normalizeNickname(value.nickname) !== value.nickname) throw new Error('닉네임을 다시 설정해 주세요.');
  return { nickname: value.nickname };
}
