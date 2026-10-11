import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import RecordDialog from './RecordDialog';

export default function NavigationGuard({ busy, dirty, shouldBlock }: { busy: boolean; dirty: boolean; shouldBlock: () => boolean }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => shouldBlock() && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => { if (blocker.state === 'blocked' && !busy && !dirty) blocker.reset(); }, [blocker, busy, dirty]);
  useEffect(() => {
    if (!busy && !dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [busy, dirty]);
  if (blocker.state !== 'blocked') return null;
  return <RecordDialog title={busy ? 'Aguarde o envio' : 'Sair sem salvar?'} farm="" busy={false} correcting={false} subtitle={busy ? 'Estamos aguardando a confirmação do seu registro.' : 'Os dados que você preencheu ainda não foram salvos.'} onClose={() => blocker.reset()}><div className="record-dialog-actions"><button type="button" className="button primary" onClick={() => blocker.reset()}>{busy ? 'Continuar aqui' : 'Continuar preenchendo'}</button>{!busy && <button type="button" className="button secondary" onClick={() => blocker.proceed()}>Sair sem salvar</button>}</div></RecordDialog>;
}
