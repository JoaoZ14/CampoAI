import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, MessageCircle, RefreshCw } from 'lucide-react';
import type { Farm } from './api';

export default function FirstRequest({ farm, whatsappUrl, online, busy, onRefresh, onTasks }: {
  farm: Farm; whatsappUrl?: string; online: boolean; busy: boolean; onRefresh: () => void; onTasks: () => void;
}) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');
  const [draft, setDraft] = useState('');
  let link: string | undefined;
  try { if (draft && whatsappUrl) { const url = new URL(whatsappUrl); url.searchParams.set('text', draft); link = url.href; } } catch { /* Show the draft when the contact link is unavailable. */ }
  function prepare(event: FormEvent) {
    event.preventDefault();
    setDraft(`Agende a tarefa “${title.trim()}” na propriedade “${farm.name}” para amanhã às ${time}, no horário da propriedade. Sem lembrete no WhatsApp.`);
  }
  return <section className="first-request" aria-labelledby="first-request-title">
    <div className="first-request-heading"><span className="destination-icon"><MessageCircle size={24}/></span><div><span className="dash-eyebrow">WHATSAPP → APP</span><h2 id="first-request-title">Faça um pedido. Veja ele aqui.</h2><p>A Lida salva o que você pede; o AGGI mostra o que ficou registrado.</p></div></div>
    <ol className="first-request-steps"><li><b>1</b><span>Envie um pedido<br/><small>Conte à Lida o que precisa.</small></span></li><li><b>2</b><span>Confira a confirmação<br/><small>Veja a propriedade, o dia e o horário.</small></span></li><li><b>3</b><span>Abra o app<br/><small>Encontre em Últimos registros e Minhas tarefas.</small></span></li></ol>
    <details><summary>Começar com uma tarefa minha</summary><p>Escolha algo que você realmente precisa fazer amanhã. Preparar a mensagem não salva nem envia a tarefa.</p><form className="first-request-form" onSubmit={prepare}><label>O que você precisa fazer?<input required maxLength={160} value={title} onChange={event => { setTitle(event.target.value); setDraft(''); }} placeholder="Ex.: Conferir a água dos animais"/></label><label>Horário de amanhã<input required type="time" value={time} onChange={event => { setTime(event.target.value); setDraft(''); }}/></label><button className="button secondary" disabled={busy || !online || !title.trim()}>Preparar meu pedido</button></form>{draft && <div className="first-request-draft"><p>{draft}</p>{link ? <a className="button primary" href={link} target="_blank" rel="noreferrer">Abrir pedido no WhatsApp <ArrowUpRight size={17}/></a> : <p>Copie o pedido acima e envie à Lida no WhatsApp vinculado à sua conta.</p>}<small>Revise e envie no WhatsApp. Esta tarefa ficará sem aviso automático; você pode pedir o lembrete à Lida depois.</small></div>}</details>
    <div className="first-request-footer"><button className="dash-link" disabled={busy || !online} onClick={onRefresh}><RefreshCw size={16}/> Já enviei, atualizar resumo</button><button className="dash-link" disabled={busy} onClick={onTasks}><Check size={16}/> Ver minhas tarefas</button></div>
  </section>;
}
