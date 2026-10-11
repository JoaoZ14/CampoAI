import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export default function RecordDialog({ title, farm, busy, correcting, subtitle, focusFirstField = false, onClose, children }: {
  title: string; farm: string; busy: boolean; correcting: boolean; subtitle?: string; focusFirstField?: boolean; onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const modal = dialog.current;
    const overflow = document.body.style.overflow;
    modal?.showModal();
    if (focusFirstField) modal?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    return () => {
      modal?.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected && !trigger.matches(':disabled')) trigger.focus({ preventScroll: true });
      else {
        const heading = document.querySelector<HTMLElement>('#conteudo h1');
        heading?.setAttribute('tabindex', '-1');
        heading?.focus();
      }
    };
  }, []);
  return <dialog ref={dialog} className="record-dialog" aria-labelledby="record-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]')).filter(element => element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className="record-dialog-header"><div><p>{farm}</p><h2 id="record-dialog-title">{title}</h2><span>{subtitle || (correcting ? 'Corrigir este registro' : 'Detalhes do registro')}</span></div><button type="button" className="icon-button" aria-label="Fechar detalhes" disabled={busy} onClick={onClose}><X size={22}/></button></header>
    {children}
  </dialog>;
}
