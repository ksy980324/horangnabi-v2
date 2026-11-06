import { useEffect, useRef } from 'react';
import { Heart, Menu } from 'lucide-react';
import { ButterflyMark } from './BrandIcons';

export type HeaderAction = { label: string; onClick: () => void; disabled?: boolean };

export function SiteHeader({ onHome, actions = [] }: { onHome?: () => void; actions?: HeaderAction[] }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const toggle = useRef<HTMLElement>(null);
  const brand = <><ButterflyMark/><span>호랑나비</span></>;

  function close(focusToggle = false) {
    if (!menu.current?.open) return;
    menu.current.open = false;
    if (focusToggle) toggle.current?.focus();
  }

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  return <header className="site-header">
    <div className="header-inner">
      {onHome ? <button className="brand" onClick={onHome}>{brand}</button> : <div className="brand header-brand-label">{brand}</div>}
      {actions.length ? <details className="header-menu" ref={menu} onBlur={event => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close();
      }} onKeyDown={event => {
        if (event.key === 'Escape' && menu.current?.open) { event.preventDefault(); close(true); }
      }}>
        <summary className="header-menu-toggle" aria-label="호랑나비 메뉴" ref={toggle}><Menu size={22} aria-hidden="true"/></summary>
        <div className="header-menu-panel">
          {actions.map(action => <button type="button" key={action.label} disabled={action.disabled} onClick={() => { close(true); action.onClick(); }}>{action.label}</button>)}
        </div>
      </details> : <span className="header-note"><Heart size={14}/>우리 둘만의 여행 기록</span>}
    </div>
  </header>;
}
