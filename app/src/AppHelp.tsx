import { useId, useState } from 'react';
import { ArrowUpRight, CircleHelp, MessageCircle, X } from 'lucide-react';

export default function AppHelp({ whatsappUrl }: { whatsappUrl?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return <section className="app-help" aria-label="Lida e ajuda">
    <div className="app-help-toolbar">
      {whatsappUrl && <a className="app-help-lida" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={20} aria-hidden="true"/><span>Falar com a Lida</span><ArrowUpRight size={17} aria-hidden="true"/></a>}
      <button type="button" className={open ? 'app-help-toggle active' : 'app-help-toggle'} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>{open ? <X size={19} aria-hidden="true"/> : <CircleHelp size={19} aria-hidden="true"/>}<span>Ajuda</span></button>
    </div>
    <div className="app-help-panel" id={panelId} hidden={!open}>
      <h2>Como usar o AGGI</h2>
      <ol>
        <li><span className="app-help-step" aria-hidden="true">1</span><div><strong>Peça à Lida no WhatsApp.</strong><p>Conte o que aconteceu ou o que precisa fazer. Pode mandar texto ou áudio.</p></div></li>
        <li><span className="app-help-step" aria-hidden="true">2</span><div><strong>Confira aqui no app.</strong><p>Início mostra o resumo. Registros reúne o que foi salvo. Tarefas mostra o que precisa fazer.</p></div></li>
        <li><span className="app-help-step" aria-hidden="true">3</span><div><strong>Corrija se precisar.</strong><p>Abra os detalhes e toque em “Corrigir este registro”. Confira a propriedade escolhida no alto da tela.</p></div></li>
      </ol>
    </div>
  </section>;
}
