import { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { applyPwaUpdate, isPwaUpdateRequired, usePwa } from '../services/pwa';

// Mounted once outside routes and header menus. There is no dismiss action.
export function PwaUpdatePrompt() {
  const pwa = usePwa();
  const ref = useRef<HTMLDialogElement>(null);
  const required = isPwaUpdateRequired(pwa);
  useEffect(() => {
    if (!required) return;
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, [required]);
  if (!required) return null;
  return <dialog className="pwa-update" ref={ref} aria-labelledby="pwa-update-title" aria-describedby="pwa-update-description" onCancel={event => event.preventDefault()}>
    <div className="pwa-update-content">
      <span className="pwa-update-icon"><RefreshCw size={28} aria-hidden="true"/></span>
      <h2 id="pwa-update-title">새 버전이 준비됐어요</h2>
      <p id="pwa-update-description">계속 사용하려면 최신 버전으로 업데이트해 주세요.<br/>저장한 여행은 그대로 유지돼요.</p>
      {pwa.updateError && <p className="error" role="alert">{pwa.updateError}</p>}
      <button type="button" className="primary" disabled={pwa.updating} onClick={applyPwaUpdate}>
        <RefreshCw size={17} aria-hidden="true"/>{pwa.updating ? '업데이트 중…' : pwa.updateError ? '업데이트 다시 시도' : '업데이트하기'}
      </button>
      <span className="pwa-update-status" role="status">{pwa.updating ? '잠시 후 새 버전이 열려요.' : ''}</span>
    </div>
  </dialog>;
}
