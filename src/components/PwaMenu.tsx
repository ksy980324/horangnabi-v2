import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download } from 'lucide-react';
import { promptInstall, usePwa } from '../services/pwa';
import { Modal } from './Modal';

export function PwaMenu({ closeMenu }: { closeMenu: () => void }) {
  const pwa = usePwa();
  const [helpOpen, setHelpOpen] = useState(false);
  const [message, setMessage] = useState('');
  const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  useEffect(() => {
    if (!helpOpen) return;
    const restore = () => setHelpOpen(!!history.state?.horangnabiInstall);
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [helpOpen]);
  function closeHelp() { if (history.state?.horangnabiInstall) history.back(); else setHelpOpen(false); }
  async function install() {
    closeMenu();
    if (pwa.canPrompt) {
      try { if (await promptInstall() !== 'unavailable') return; }
      catch { setMessage('설치 창을 열지 못했어요. 아래 방법으로 추가해 주세요.'); }
    }
    history.pushState({ ...history.state, horangnabiInstall: true }, ''); setHelpOpen(true);
  }
  if (!pwa.available) return null;
  return <>
    {!pwa.installed && <button type="button" onClick={() => void install()}><Download size={15} aria-hidden="true"/>홈 화면에 설치</button>}
    {helpOpen && createPortal(<Modal title="호랑나비를 홈 화면에" onClose={closeHelp}>
      <div className="pwa-help">
        <p>나비 아이콘을 누르면 호랑나비를 바로 열 수 있어요.</p>
        <ol>{isAppleMobile ? <>
          <li>이 주소를 <strong>Safari</strong>에서 열어 주세요.</li>
          <li><strong>공유</strong> 버튼을 누른 뒤 <strong>홈 화면에 추가</strong>를 선택하세요.</li>
          <li>표시되는 추가 버튼을 눌러 마무리하세요.</li>
        </> : <>
          <li>이 주소를 <strong>Chrome</strong>에서 열어 주세요.</li>
          <li>브라우저 메뉴에서 <strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 선택하세요.</li>
          <li>PC에서는 주소창의 설치 아이콘으로도 설치할 수 있어요.</li>
        </>}</ol>
        <p className="muted">카카오톡 같은 앱 안에서 열었다면 Safari나 Chrome으로 다시 열어 주세요. 설치한 화면에서는 Google 로그인이 다시 필요할 수 있어요.</p>
        <p className="muted">인터넷 없이 보려면 여행 메뉴에서 <strong>오프라인용으로 저장</strong>을 먼저 눌러 주세요. 지도·검색·공동 편집은 인터넷 연결이 필요해요.</p>
        {(message || pwa.error) && <p role="status">{message || pwa.error}</p>}
        <button type="button" className="primary" onClick={closeHelp}>알겠어요</button>
      </div>
    </Modal>, document.body)}
  </>;
}
