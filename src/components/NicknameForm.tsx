import { useState, type FormEvent } from 'react';
import { UserRound } from 'lucide-react';
import { normalizeNickname, NICKNAME_MAX_LENGTH } from '../services/userProfile';
import { usePwaUpdateBlocker } from '../services/pwa';

export function NicknameForm({ initial = '', required, busy, message, onSave, onCancel }: {
  initial?: string; required: boolean; busy: boolean; message?: string; onSave: (nickname: string) => Promise<void>; onCancel: () => void;
}) {
  const [nickname, setNickname] = useState(initial);
  const [error, setError] = useState('');
  usePwaUpdateBlocker(busy || nickname !== initial);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    try { const normalized = normalizeNickname(nickname); setError(''); await onSave(normalized); }
    catch (error) { setError(error instanceof Error ? error.message : '닉네임을 저장하지 못했어요.'); }
  }
  return <section className="nickname-panel" aria-labelledby={required ? 'nickname-title' : undefined} aria-label={required ? undefined : '닉네임 변경'}>
    <span className="nickname-icon"><UserRound size={26} aria-hidden="true"/></span>
    {required && <h1 id="nickname-title">어떤 이름으로 함께할까요?</h1>}
    <p className="muted">호랑나비에서 사용할 닉네임을 정해 주세요.<br/>함께 여행하는 사람들에게 이 이름으로 보여요.</p>
    <form className="form" onSubmit={event => void submit(event)}>
      <label htmlFor="nickname">닉네임<input id="nickname" autoFocus required autoComplete="nickname" maxLength={NICKNAME_MAX_LENGTH} value={nickname} disabled={busy} onChange={event => { setNickname(event.target.value); setError(''); }} placeholder="예: 나비, 여행하는 호랑이"/></label>
      <small className="muted">1~20자 · 나중에 메뉴에서 바꿀 수 있어요.</small>
      {(error || message) && <p role="alert" className="error">{error || message}</p>}
      <button className="primary" disabled={busy}>{busy ? '닉네임 저장 중…' : required ? '이 이름으로 시작하기' : '변경 저장'}</button>
      {!required && <button type="button" className="secondary" disabled={busy} onClick={onCancel}>취소</button>}
    </form>
  </section>;
}
