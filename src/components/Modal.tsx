import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Modal({ title, onClose, children, busy, status }: { title: string; onClose: () => void; children: ReactNode; busy?: boolean; status?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} onClick={e => { if (!busy && e.target === e.currentTarget) onClose(); }}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="닫기" disabled={busy} onClick={onClose}><X size={22}/></button></div>{(busy || status) && <p className="modal-status" role="status">{busy ? '공유 여행을 저장하고 있어요.' : status}</p>}{children}</dialog>;
}
