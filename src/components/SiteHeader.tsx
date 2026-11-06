import { useEffect, useId, useRef, useState } from 'react';
import { Heart, Menu } from 'lucide-react';
import { ButterflyMark } from './BrandIcons';

export type HeaderAction = { label: string; onClick: () => void; disabled?: boolean };

export function SiteHeader({ onHome, actions = [] }: { onHome?: () => void; actions?: HeaderAction[] }) {
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const brand = <><ButterflyMark/><span>호랑나비</span></>;

  function close(focusToggle = false) {
    setOpen(false);
    if (focusToggle) toggle.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return <header className="site-header">
    <div className="header-inner">
      {onHome ? <button className="brand" onClick={onHome}>{brand}</button> : <div className="brand header-brand-label">{brand}</div>}
      {actions.length ? <div className="header-menu" ref={menu} onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); close(true); }
      }}>
        <button type="button" className="header-menu-toggle" aria-label="호랑나비 메뉴" aria-expanded={open} aria-controls={menuId} ref={toggle} onClick={() => setOpen(value => !value)}><Menu size={22} aria-hidden="true"/></button>
        <div className="header-menu-panel" id={menuId} hidden={!open}>
          {actions.map(action => <button type="button" key={action.label} disabled={action.disabled} onClick={() => { close(true); action.onClick(); }}>{action.label}</button>)}
        </div>
      </div> : <span className="header-note"><Heart size={14}/>우리 둘만의 여행 기록</span>}
    </div>
  </header>;
}
