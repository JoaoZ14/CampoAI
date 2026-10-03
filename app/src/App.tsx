import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Clock3, Home, MapPinned, Menu, Plus, RefreshCw, UserRound, X } from 'lucide-react';
import aggiLockup from './assets/brand/aggi-lockup.png';
import aggiMark from './assets/brand/aggi-mark.png';
import aggiWord from './assets/brand/aggi-wordmark.png';
import { api, authClient, createWriteRequest, errorMessage, externalUrl, jsonBody, rural, type ActivityChange, type ActivityPage, type DashboardFilter, type Farm, type Task } from './api';
import { useFarmData } from './useFarmData';
import Dashboard from './Dashboard';
import RecordHistory from './RecordHistory';
const Signup = lazy(() => import('./Signup'));
const FarmRecords = lazy(() => import('./FarmRecords'));
const AgroWorkspace = lazy(() => import('./AgroWorkspace'));

type View = 'today' | 'agenda' | 'farm' | 'activity';
const nav = [
  { id: 'today' as const, label: 'Início', icon: Home },
  { id: 'activity' as const, label: 'Registros', icon: ClipboardList },
  { id: 'agenda' as const, label: 'Agenda', icon: CalendarDays },
  { id: 'farm' as const, label: 'Fazenda', icon: MapPinned },
];
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const dateTime = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const displayError = errorMessage;

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty"><div className="empty-icon"><ClipboardList size={19} strokeWidth={1.8} /></div><strong>{title}</strong><p>{children}</p></div>;
}

function RecordDetails({ record, timezone }: { record: Record<string, unknown>; timezone: string }) {
  const labels: Record<string, string> = { name: 'Nome', title: 'Título', description: 'Descrição', amount: 'Valor', expense_date: 'Data da despesa', operation_date: 'Data da atividade', operation_type: 'Atividade', due_at: 'Prazo', area_ha: 'Área em hectares', total_area_ha: 'Área total em hectares', city: 'Cidade', state: 'UF', category: 'Categoria', status: 'Situação', quantity: 'Quantidade', unit: 'Unidade', crop: 'Cultura', start_date: 'Início', end_date: 'Fim', notes: 'Observações' };
  Object.assign(labels, { identifier: 'Identificação', unit_type: 'Tipo de ficha', species: 'Espécie', owner_name: 'Proprietário do animal', location: 'Local inicial', current_count: 'Saldo do grupo', event_type: 'Tipo de registro', event_date: 'Data do registro', duration_minutes: 'Duração em minutos', time_seconds: 'Tempo medido em segundos', penalty_seconds: 'Penalidade em segundos', operator: 'Responsável', period: 'Período', destination: 'Novo local', customer: 'Cliente', sale_date: 'Data da venda', due_date: 'Vencimento', payment_date: 'Data do recebimento', method: 'Forma de pagamento' });
  const translations: Record<string, string> = { pending: 'Pendente', completed: 'Concluída', cancelled: 'Cancelada', planned: 'Planejada', active: 'Ativa', inactive: 'Inativa', voided: 'Anulado', open: 'Aberta', resolved: 'Resolvida', monitoring: 'Em acompanhamento', combustivel: 'Combustível', mao_de_obra: 'Mão de obra', animal: 'Animal individual', herd: 'Lote / rebanho', flock: 'Lote de aves', pond: 'Viveiro / tanque', hive: 'Colmeia', apiary: 'Apiário', crop_area: 'Canteiro / área', orchard: 'Pomar', forestry_block: 'Área florestal', facility: 'Unidade de trabalho', equine: 'Equino', bovine: 'Bovino', poultry: 'Ave', pig: 'Suíno', sheep: 'Ovino', goat: 'Caprino', fish: 'Peixe', training: 'Treino', competition: 'Passada em prova', care: 'Cuidado realizado', reproduction: 'Evento reprodutivo', inspection: 'Inspeção', movement: 'Mudança de local', milk: 'Produção de leite', production: 'Produção de ovos', weighing: 'Pesagem', feeding: 'Consumo de alimento', harvest: 'Colheita', planting: 'Plantio', stock_entry: 'Entrada no grupo', stock_exit: 'Saída do grupo', mortality: 'Baixas no grupo', morning: 'Manhã', afternoon: 'Tarde', evening: 'Noite', day: 'Total do dia', pix: 'Pix', cash: 'Dinheiro', transfer: 'Transferência', card: 'Cartão', other: 'Outro' };
  return <dl className="record-details">{Object.entries(record).filter(([key, value]) => labels[key] && value != null && typeof value !== 'object').map(([key, value]) => {
    const text = key === 'amount' ? money(Number(value)) : key === 'due_at' ? new Date(String(value)).toLocaleString('pt-BR', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' }) : /_date$/.test(key) ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : translations[String(value)] || String(value).replaceAll('_', ' ');
    return <div key={key}><dt>{labels[key]}</dt><dd>{text}</dd></div>;
  })}</dl>;
}

function Login({ onSuccess, onSignup }: { onSuccess: (session: Session) => void; onSignup: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const loginTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const modal = dialog.current;
    modal?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { modal?.close(); document.body.style.overflow = previousOverflow; loginTrigger.current?.focus(); };
  }, [open]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const auth = await authClient();
      const { data, error: loginError } = await auth.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError) throw loginError;
      if (data.session) onSuccess(data.session);
    } catch (cause) { setError(displayError(cause)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <main className="login-shell">
    <div className="login-intro"><div className="login-intro-shade" /><div className="login-brand"><img className="brand-mark" src={aggiMark} alt="" /><img className="brand-word brand-word-light" src={aggiWord} alt="AGGI" /></div><div className="login-intro-copy"><span className="login-eyebrow">Sua fazenda, sempre por perto</span><h1>O campo segue.<br/><em>Você acompanha.</em></h1><p>O que a Lida fez, o que vem pela frente e tudo da sua fazenda no seu bolso.</p><button ref={loginTrigger} className="login-open" onClick={() => setOpen(true)}>Entrar na minha conta <ArrowRight size={19}/></button><button className="login-register" onClick={onSignup}>Ainda não tem conta? Cadastre-se <ArrowUpRight size={15}/></button></div><div className="login-intro-bottom"><span>Seu trabalho em boas mãos.</span><span>AGGI · Lida</span></div></div>
    {open && <dialog ref={dialog} className="login-dialog" aria-labelledby="login-title" onCancel={event => { event.preventDefault(); if (!pending.current) setOpen(false); }} onClick={event => { if (event.target === event.currentTarget && !pending.current) setOpen(false); }}><form className="login-form" onSubmit={submit}><div className="sheet-handle" aria-hidden="true" /><button className="login-close" type="button" aria-label="Fechar login" onClick={() => setOpen(false)} disabled={busy}><X size={20}/></button><div className="login-form-heading"><img className="login-mobile-brand" src={aggiLockup} alt="AGGI" /><h2 id="login-title">Bem-vindo de volta</h2><p>Entre para acompanhar sua fazenda.</p></div>
      <label>E-mail<input type="email" required autoFocus autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Senha<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <button className="button primary login-submit" disabled={busy}>{busy ? 'Entrando…' : <>Entrar <ArrowRight size={18}/></>}</button>
      <p className="login-help">Ainda não tem conta? <button type="button" disabled={busy} onClick={onSignup}>Cadastre-se</button><br/>Precisa recuperar o acesso? <a href={externalUrl('/entrar')}>Acesse a página de login</a></p>
    </form></dialog>}
  </main>;
}

export default function App() {
  const [authFlow, setAuthFlow] = useState<'login' | 'signup'>('login');
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [linked, setLinked] = useState(true);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmId, setFarmId] = useState('');
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceReload, setWorkspaceReload] = useState(0);
  const [workspaceUser, setWorkspaceUser] = useState('');
  const [whatsappUrl, setWhatsappUrl] = useState<string>();
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [modulesEnabled, setModulesEnabled] = useState(false);
  const [view, setView] = useState<View>('today');
  const [farmTab, setFarmTab] = useState<'units' | 'history'>('units');
  const [productionRange, setProductionRange] = useState<{ from: string; to: string } | null>(null);
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>({ period: 'month' });
  const { summary, activity, tasks, weather, dashboard, dashboardLoading, loading, errors: sectionErrors, refresh, appendActivity, appendTasks } = useFarmData(session && workspaceUser === session.user.id ? farmId : '', dashboardFilter);
  const activities = activity.items;
  const moreActivity = activity.has_more;
  const [moreTasks, setMoreTasks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [taskForm, setTaskForm] = useState(false);
  const [farmForm, setFarmForm] = useState(false);
  const [recordIntent, setRecordIntent] = useState<'operation' | 'expense' | null>(null);
  const [editing, setEditing] = useState<ActivityChange | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [recordDetails, setRecordDetails] = useState<Record<string, unknown>>({});
  const [recordHistory, setRecordHistory] = useState<ActivityPage | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<'all' | 'lida' | 'app'>('all');
  const pending = useRef(false);
  const write = useRef(createWriteRequest());
  const currentFarm = useRef(farmId);
  const editPanel = useRef<HTMLElement>(null);
  currentFarm.current = farmId;
  const farm = farms.find(item => item.id === farmId);
  const lidaActivities = activities.filter(item => item.source === 'lida');
  const visibleActivities = activities.filter(item => activityFilter === 'all' || item.source === activityFilter);
  const sortedTasks = [...tasks].sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const overdueTasks = tasks.filter(task => Date.parse(task.due_at) < Date.now());
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [view]);
  useEffect(() => {
    if (!editing) return;
    editPanel.current?.focus({ preventScroll: true });
    editPanel.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, [editing]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    authClient().then(async auth => {
      const { data } = await auth.auth.getSession();
      if (!active) return;
      if (active) { setSession(data.session); setInitializing(false); }
      const { data: listener } = auth.auth.onAuthStateChange((_event, next) => { if (active) setSession(next); });
      unsubscribe = () => listener.subscription.unsubscribe();
    }).catch(cause => { if (active) { setError(displayError(cause)); setInitializing(false); } });
    const updateNetwork = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateNetwork); window.addEventListener('offline', updateNetwork);
    return () => { active = false; unsubscribe?.(); window.removeEventListener('online', updateNetwork); window.removeEventListener('offline', updateNetwork); };
  }, []);

  useEffect(() => {
    setFarms([]); setFarmId(''); setLinked(true); setWorkspaceError(''); setWorkspaceLoading(true);
    setWhatsappUrl(undefined); setRemindersEnabled(false); setModulesEnabled(false);
    setEditing(null); setTaskForm(false); setFarmForm(false); setNotice(''); setError('');
    if (!session) return;
    let active = true;
    const controller = new AbortController();
    (async () => {
      const me = await api<{ linked: boolean; whatsappUrl: string | null; capabilities: { reminders: boolean; modules?: boolean } }>('/api/customer/workspace', { signal: controller.signal });
      if (!active) return;
      setLinked(me.linked);
      setWhatsappUrl(me.whatsappUrl || undefined); setRemindersEnabled(me.capabilities.reminders); setModulesEnabled(Boolean(me.capabilities.modules));
      if (!me.linked) return;
      const found = await api<Farm[]>('/api/rural/farms', { signal: controller.signal });
      if (!active) return;
      setFarms(found);
      const saved = localStorage.getItem(`ag-app-farm:${session.user.id}`);
      setFarmId(found.find(f => f.id === saved)?.id || found[0]?.id || '');
    })().catch(cause => { if (active) setWorkspaceError(displayError(cause)); })
      .finally(() => { if (active) { setWorkspaceUser(session.user.id); setWorkspaceLoading(false); } });
    return () => { active = false; controller.abort(); };
  }, [session?.user.id, workspaceReload]);

  useEffect(() => {
    if (farmId && session) localStorage.setItem(`ag-app-farm:${session.user.id}`, farmId);
    setEditing(null); setTaskForm(false); setFarmForm(false); setRecordIntent(null); setNotice(''); setError('');
  }, [farmId]);
  useEffect(() => { setMoreTasks(tasks.length >= 50 && tasks.length % 50 === 0); }, [tasks]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    if (pending.current || busy || !online) return;
    pending.current = true;
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(success); setEditing(null); setTaskForm(false); await refresh(); }
    catch (cause) { setError(displayError(cause)); }
    finally { pending.current = false; setBusy(false); }
  }

  async function signOut() {
    if (pending.current || busy) return;
    pending.current = true; setBusy(true);
    try {
      const { error: cause } = await (await authClient()).auth.signOut();
      if (cause) throw cause;
    } catch (cause) { setError(displayError(cause)); }
    finally { pending.current = false; setBusy(false); }
  }

  async function createFarm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !online) return;
    pending.current = true;
    const values = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const city = String(values.get('city')).trim();
      const state = String(values.get('state')).trim().toUpperCase();
      const created = await write.current<Farm>('/api/rural/farms', { method: 'POST', body: jsonBody({ name: String(values.get('name')).trim(), ...(city ? { city } : {}), ...(state ? { state } : {}) }) });
      setFarms(previous => [...previous, created]); setFarmId(created.id); setFarmForm(false); setNotice('Propriedade cadastrada.');
    } catch (cause) { setError(displayError(cause)); }
    finally { pending.current = false; setBusy(false); }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const when = new Date(String(values.get('due_at')));
    if (Number.isNaN(when.getTime())) { setError('Informe uma data e hora válidas.'); return; }
    await mutate(() => write.current(rural(farmId, '/farm_tasks'), { method: 'POST', body: jsonBody({ title: String(values.get('title')).trim(), due_at: when.toISOString(), priority: String(values.get('priority')), remind: values.get('remind') === 'on' }) }), 'Tarefa criada na agenda.');
  }

  async function openRecord(change: ActivityChange) {
    if (!change.entity_id || pending.current || !online) return;
    pending.current = true;
    setBusy(true); setError('');
    try {
      const record = await api<Record<string, unknown>>(rural(farmId, `/${change.entity}/${change.entity_id}`));
      setRecordDetails(record);
      const field = change.entity === 'farm_tasks' ? 'title' : change.entity === 'farm_operations' || change.entity === 'farm_expenses' ? 'description' : change.entity === 'fields' ? 'area_ha' : '';
      setRecordHistory(null); setHistoryError('');
      setEditing(change); setEditLabel(field);
      setEditValue(field ? String(record[field] ?? '') : '');
      try { setRecordHistory(await api<ActivityPage>(rural(farmId, '/' + change.entity + '/' + change.entity_id + '/history'))); }
      catch { setHistoryError('Não foi possível consultar as alterações agora. Feche e abra o registro para tentar novamente.'); }
    } catch (cause) { setError(displayError(cause)); }
    finally { pending.current = false; setBusy(false); }
  }

  async function loadRecordHistory() {
    if (!editing?.entity_id || !recordHistory || pending.current || !online) return;
    pending.current = true; setBusy(true); setHistoryError('');
    try {
      const page = await api<ActivityPage>(rural(farmId, '/' + editing.entity + '/' + editing.entity_id + '/history?offset=' + recordHistory.items.length));
      setRecordHistory({ items: [...recordHistory.items, ...page.items], has_more: page.has_more });
    } catch { setHistoryError('Não foi possível carregar mais alterações.'); }
    finally { pending.current = false; setBusy(false); }
  }

  async function saveRecord(event: FormEvent) {
    event.preventDefault();
    if (!editing?.entity_id || !editLabel) return;
    const value = editLabel === 'area_ha' ? Number(editValue) : editValue.trim();
    await mutate(() => write.current(rural(farmId, `/${editing.entity}/${editing.entity_id}`), { method: 'PATCH', body: jsonBody({ [editLabel]: value }) }), 'Registro corrigido. A Lida usará o dado atualizado nas próximas consultas.');
  }

  async function loadMoreActivity() {
    if (pending.current || !online || loading) return;
    pending.current = true;
    const selected = farmId;
    setBusy(true); setError('');
    try { const page = await api<ActivityPage>(rural(selected, `/activity?offset=${activities.length}`)); if (currentFarm.current === selected) appendActivity(page); }
    catch (cause) { setError(displayError(cause)); }
    finally { pending.current = false; setBusy(false); }
  }

  async function loadMoreTasks() {
    if (pending.current || !online || loading) return;
    pending.current = true;
    const selected = farmId;
    setBusy(true); setError('');
    try { const page = await api<Task[]>(rural(selected, `/farm_tasks?status=pending&offset=${tasks.length}`)); if (currentFarm.current === selected) { appendTasks(page); setMoreTasks(page.length === 50); } }
    catch (cause) { setError(displayError(cause)); }
    finally { pending.current = false; setBusy(false); }
  }

  if (initializing) return <div className="boot">Preparando o AGGI…</div>;
  if (authFlow === 'signup') return <Signup session={session} onBack={() => setAuthFlow('login')} onDone={() => window.location.reload()} />;
  if (!session) return <><Login onSuccess={setSession} onSignup={() => setAuthFlow('signup')} />{error && <p className="boot-error" role="alert">{error}</p>}</>;

  return <div className="app-shell">
    <a className="skip" href="#conteudo">Ir para o conteúdo</a>
    <aside className="sidebar" aria-label="Navegação principal">
      <div className="brand"><img className="brand-mark" src={aggiMark} alt="" /><div><img className="brand-word" src={aggiWord} alt="AGGI" /><span>Controle da fazenda</span></div></div>
      <div className="side-label">ESPAÇO DE TRABALHO</div>
      <nav className="side-nav">{nav.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} disabled={busy} aria-current={view === item.id ? 'page' : undefined} onClick={() => { setView(item.id); setFarmTab('units'); setEditing(null); setRecordIntent(null); }}><item.icon size={19} strokeWidth={1.9}/>{item.label}</button>)}</nav>
      <div className="side-bottom">{whatsappUrl && <a className="side-lida" href={whatsappUrl} target="_blank" rel="noreferrer"><div className="lida-avatar">L</div><div><strong>Fale com a Lida</strong><span>Assistente no WhatsApp</span></div><ArrowUpRight size={17}/></a>}<a href={externalUrl('/area-do-cliente')}><UserRound size={18}/> Minha conta</a><button disabled={busy} onClick={() => void signOut()}>Sair</button></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="topbar-brand"><img className="brand-mark" src={aggiMark} alt="" /><img className="brand-word" src={aggiWord} alt="AGGI" /></div><label className="farm-select"><MapPinned size={17}/><span>Propriedade</span><select aria-label="Propriedade" value={farmId} onChange={event => { setFarmId(event.target.value); setEditing(null); }} disabled={!farms.length || busy}>{farms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown className="farm-chevron" size={16}/></label><button className="refresh icon-button" onClick={() => void refresh()} disabled={!farmId || loading || busy || !online} aria-label="Atualizar dados"><RefreshCw size={18}/></button><button className="account-button icon-button" onClick={() => setMenuOpen(value => !value)} aria-label="Abrir menu" aria-expanded={menuOpen}>{menuOpen ? <X size={19}/> : <Menu size={19}/>}</button></header>
      {menuOpen && <div className="account-menu"><a href={externalUrl('/area-do-cliente')}>Minha conta <ChevronRight size={16}/></a>{whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer">Falar com a Lida <ArrowUpRight size={16}/></a>}<button disabled={busy} onClick={() => void signOut()}>Sair da conta</button></div>}
      {!online && <div className="network-banner" role="status">Sem conexão. Os dados não podem ser atualizados ou alterados agora.</div>}
      <main id="conteudo" className="content">
        {workspaceLoading || workspaceUser !== session.user.id ? <section className="workspace-state" role="status"><RefreshCw size={24}/><h1>Preparando sua fazenda</h1><p>Buscando suas propriedades e registros.</p></section> : workspaceError ? <section className="workspace-state"><h1>Não conseguimos abrir sua fazenda</h1><p role="alert">{workspaceError}</p><button className="button primary" disabled={!online} onClick={() => setWorkspaceReload(value => value + 1)}>Tentar novamente</button></section> : !linked ? <div className="onboarding"><h1>Vamos concluir seu cadastro</h1><p>Confirme seu WhatsApp aqui no app para conectar sua conta à Lida e liberar o controle da fazenda.</p><button className="button primary" onClick={() => setAuthFlow('signup')}>Continuar cadastro</button></div> : <>
          {view !== 'today' && Object.keys(sectionErrors).filter(key => key !== 'dashboard').length > 0 && <div className="notice error" role="alert"><div><strong>Alguns dados não puderam ser atualizados.</strong><p>{Object.keys(sectionErrors).filter(key => key !== 'dashboard').map(key => ({ summary: 'Fazenda', activity: 'Atividade', tasks: 'Agenda', weather: 'Clima', dashboard: 'Resumo' }[key])).join(', ')}. Os dados já carregados podem estar desatualizados.</p></div><button className="text-button" disabled={loading || !online || busy} onClick={() => void refresh()}>Tentar novamente</button></div>}
          {error && <div className="notice error" role="alert">{error} <button onClick={() => setError('')} aria-label="Fechar aviso">×</button></div>}
          {notice && <div className="notice success" role="status">{notice} <button onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></div>}
          {!farms.length ? <section className="onboarding"><h1>Comece pela sua propriedade</h1><p>Cadastre uma fazenda aqui ou conte à Lida pelo WhatsApp. Os registros aparecerão neste espaço.</p><button className="button primary" onClick={() => setFarmForm(true)}>Cadastrar propriedade</button>{farmForm && <form className="stack-form" onSubmit={createFarm}><label>Nome<input name="name" required maxLength={120} /></label><label>Cidade<input name="city" maxLength={120} /></label><label>UF<input name="state" maxLength={2} /></label><button className="button primary" disabled={busy || !online}>{busy ? 'Salvando…' : 'Salvar propriedade'}</button></form>}</section> : <>
            {view === 'today' && farm && <Dashboard key={farmId} farm={farm} data={dashboard} filter={dashboardFilter} onPeriod={setDashboardFilter} weather={weather} loading={dashboardLoading} error={sectionErrors.dashboard} online={online} busy={busy} whatsappUrl={whatsappUrl} onRefresh={() => void refresh()} onRecord={change => { setEditing(null); setView('activity'); void openRecord(change); }} onRecords={() => { setEditing(null); setActivityFilter('all'); setView('activity'); }} onAgenda={() => setView('agenda')} onFarm={() => { setRecordIntent(null); setFarmTab('units'); setView('farm'); }} onProduction={period => { setRecordIntent(null); setProductionRange({ from: period.from, to: period.to_exclusive }); setFarmTab('history'); setView('farm'); }} />}
            {view === 'agenda' && <><div className="page-heading"><div><h1>Agenda</h1><p>Suas tarefas e os lembretes combinados com a Lida.</p></div><button className="button primary" disabled={busy || !online} onClick={() => setTaskForm(value => !value)}>{taskForm ? <><X size={18}/> Fechar</> : <><Plus size={18}/> Nova tarefa</>}</button></div>
              {taskForm && <form className="panel stack-form task-form" onSubmit={createTask}><h2>Nova tarefa</h2><label>O que precisa ser feito<input name="title" required maxLength={160} placeholder="Ex.: Conferir bomba de irrigação" /></label><div className="form-grid"><label>Data e hora<input name="due_at" type="datetime-local" required /></label><label>Prioridade<select name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="high">Alta</option><option value="low">Baixa</option></select></label></div><label className="checkbox"><input name="remind" type="checkbox" disabled={!remindersEnabled} /> Lida me lembra pelo WhatsApp</label><p className="form-note">{remindersEnabled ? 'Você receberá o lembrete no WhatsApp vinculado à sua conta.' : 'Os lembretes por WhatsApp estão indisponíveis. A tarefa continua salva na agenda.'}</p><button className="button primary" disabled={busy || !online}>{busy ? 'Salvando…' : 'Salvar tarefa'}</button></form>}
              <div className="agenda-summary"><div><CalendarDays size={20}/><span><strong>{tasks.length}{moreTasks ? '+' : ''}</strong> pendentes</span></div><div><Clock3 size={20}/><span><strong>{overdueTasks.length}</strong> atrasadas</span></div></div>
              <section className="panel"><div className="section-heading"><h2>Tarefas pendentes</h2><span>Por data</span></div>{loading ? <p className="loading" role="status">Carregando agenda…</p> : sectionErrors.tasks ? <p className="muted">Não foi possível atualizar a agenda.</p> : tasks.length ? <ul className="agenda-list">{sortedTasks.map(task => <li key={task.id}><div className="task-date-tile"><strong>{new Date(task.due_at).toLocaleDateString('pt-BR', { day: '2-digit' })}</strong><span>{new Date(task.due_at).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span></div><div className="agenda-task-copy"><span className={Date.parse(task.due_at) < Date.now() ? 'due overdue' : 'due'}>{dateTime(task.due_at)}{Date.parse(task.due_at) < Date.now() ? ' · atrasada' : ''}</span><strong>{task.title}</strong>{task.remind && <small>Lembrete solicitado à Lida</small>}</div><button className="complete-button" disabled={busy || !online} onClick={() => void mutate(() => write.current(rural(farmId, `/farm_tasks/${task.id}`), { method: 'PATCH', body: jsonBody({ status: 'completed' }) }), 'Tarefa concluída.')} aria-label={`Concluir ${task.title}`}><Check size={18}/></button></li>)}</ul> : <Empty title="Nenhuma tarefa pendente">Crie uma tarefa aqui ou peça à Lida pelo WhatsApp.</Empty>}{moreTasks && <button className="load-more" disabled={busy || loading || !online} onClick={() => void loadMoreTasks()}>Carregar mais tarefas <ArrowRight size={17}/></button>}</section>
            </>}
            {view === 'farm' && <><div className="page-heading"><div><h1>{modulesEnabled ? "Sua operação" : "Sua fazenda"}</h1><p>{modulesEnabled ? "Atividades, animais, produção e compromissos em um só lugar." : "Talhões, safras e registros em um só lugar."}</p></div><button className="button secondary" disabled={busy || !online} onClick={() => setFarmForm(value => !value)}><Plus size={17}/> Nova propriedade</button></div>
              <section className="farm-hero"><div><span>PROPRIEDADE SELECIONADA</span><h2>{farm?.name}</h2><p>{farm?.city ? `${farm.city}${farm.state ? ` / ${farm.state}` : ''}` : 'Localização ainda não informada'}</p></div>{(!modulesEnabled || Boolean(farm?.total_area_ha || summary?.fields.length)) && <div className="farm-hero-facts"><div><strong>{farm?.total_area_ha ? `${farm.total_area_ha} ha` : '—'}</strong><span>Área cadastrada</span></div>{(!modulesEnabled || Boolean(summary?.fields.length)) && <div><strong>{summary?.fields.length ?? '—'}</strong><span>Talhões recentes</span></div>}</div>}</section>
              {farmForm && <form className="panel stack-form" onSubmit={createFarm}><h2>Cadastrar propriedade</h2><label>Nome<input name="name" required maxLength={120} /></label><div className="form-grid"><label>Cidade<input name="city" maxLength={120} /></label><label>UF<input name="state" maxLength={2} /></label></div><button className="button primary" disabled={busy || !online}>{busy ? 'Salvando…' : 'Salvar propriedade'}</button></form>}
              {(!modulesEnabled || Boolean(summary?.fields.length || summary?.seasons.length)) && <div className="farm-layout"><section className="panel"><div className="section-heading"><h2>Talhões</h2><span>{summary?.fields.length || 0} recentes</span></div>{loading ? <p className="loading" role="status">Carregando talhões…</p> : sectionErrors.summary ? <p className="muted">Não foi possível atualizar os talhões.</p> : summary?.fields.length ? <ul className="simple-list">{summary.fields.map(field => <li key={field.id}><strong>{field.name}</strong><span>{field.area_ha ? `${field.area_ha} ha` : 'Área não informada'}</span></li>)}</ul> : <Empty title="Ainda sem talhões">Diga à Lida o nome e a área de cada talhão para organizar os registros.</Empty>}</section>
                <section className="panel"><div className="section-heading"><h2>Safras</h2></div>{loading ? <p className="loading" role="status">Carregando safras…</p> : sectionErrors.summary ? <p className="muted">Não foi possível atualizar as safras.</p> : summary?.seasons.length ? <ul className="simple-list">{summary.seasons.map(season => <li key={season.id}><strong>{season.name}</strong><span>{season.status === 'active' ? 'Ativa' : season.status === 'planned' ? 'Planejada' : 'Concluída'}</span></li>)}</ul> : <Empty title="Nenhuma safra cadastrada">A Lida pode registrar sua safra quando você informar o nome e o período.</Empty>}</section></div>}
              {modulesEnabled && <Suspense fallback={<p className="loading" role="status">Abrindo atividades…</p>}><AgroWorkspace key={farmId} farmId={farmId} initialTab={farmTab} initialPeriod={farmTab === 'history' ? productionRange ? 'range' : 'month' : '90'} initialRange={productionRange || undefined} timezone={farm?.timezone || "America/Sao_Paulo"} online={online} reminders={remindersEnabled} onBusy={setBusy} onSaved={() => refresh()} /></Suspense>}
              {modulesEnabled ? <details className="legacy-records" open={Boolean(recordIntent)}><summary>Registros gerais e despesas anteriores</summary><Suspense fallback={<p className="loading" role="status">Abrindo registros…</p>}><FarmRecords key={farmId} farmId={farmId} summary={summary} online={online} initialForm={recordIntent} onSaved={() => refresh()} onBusy={setBusy} /></Suspense></details> : <Suspense fallback={<p className="loading" role="status">Abrindo registros…</p>}><FarmRecords key={farmId} farmId={farmId} summary={summary} online={online} initialForm={recordIntent} onSaved={() => refresh()} onBusy={setBusy} /></Suspense>}
            </>}
            {view === 'activity' && <><div className="page-heading"><div><h1>O que a Lida fez</h1><p>Confira cada registro feito nesta propriedade. Consultas sem alteração não aparecem.</p></div></div><div className="activity-summary"><div className="lida-avatar large">L</div><div><strong>Trabalho da Lida</strong><span>{lidaActivities.length} registro{lidaActivities.length === 1 ? '' : 's'} recente{lidaActivities.length === 1 ? '' : 's'} nesta propriedade</span></div><CheckCircle2 size={21}/></div><div className="filter-tabs" role="group" aria-label="Filtrar atividade"><button aria-pressed={activityFilter === 'all'} className={activityFilter === 'all' ? 'selected' : ''} onClick={() => setActivityFilter('all')}>Tudo</button><button aria-pressed={activityFilter === 'lida'} className={activityFilter === 'lida' ? 'selected' : ''} onClick={() => setActivityFilter('lida')}>Feito pela Lida</button><button aria-pressed={activityFilter === 'app'} className={activityFilter === 'app' ? 'selected' : ''} onClick={() => setActivityFilter('app')}>Feito no app</button></div><section className="panel history-panel"><div className="section-heading"><h2>Histórico de registros</h2><span>Mais recentes primeiro</span></div>{loading ? <p className="loading" role="status">Carregando histórico…</p> : sectionErrors.activity ? <p className="muted">Não foi possível atualizar o histórico.</p> : visibleActivities.length ? <ul className="history-list">{visibleActivities.map(item => <li key={item.id}><span className={item.source === 'lida' ? 'history-avatar lida' : 'history-avatar'}>{item.source === 'lida' ? 'L' : <UserRound size={18}/>}</span><div className="history-body"><div className="history-meta"><span>{item.source === 'lida' ? 'Lida no WhatsApp' : 'Feito no app'}</span><time dateTime={item.created_at}>{dateTime(item.created_at)}</time></div>{item.changes.length ? item.changes.map((change, index) => <div className="history-change" key={`${item.id}-${index}`}><div><strong>{change.title}</strong><small>{change.label} {change.type === 'created' ? 'criado' : 'atualizado'}</small></div>{change.entity_id && <button className="record-button" disabled={busy || !online} onClick={() => void openRecord(change)}>Abrir registro <ChevronRight size={16}/></button>}</div>) : <span>Registro atualizado</span>}</div></li>)}</ul> : <Empty title={activityFilter === 'all' ? 'Ainda não há registros' : 'Nenhum resultado nos registros carregados'}>{activityFilter === 'all' ? 'Peça à Lida para registrar uma tarefa ou atividade. As ações confirmadas aparecerão aqui.' : 'Mude o filtro ou carregue mais registros para continuar a busca.'}</Empty>}{moreActivity && <button className="load-more" disabled={busy || loading || !online} onClick={() => void loadMoreActivity()}>Carregar mais registros <ArrowRight size={17}/></button>}</section>
              {editing && <section ref={editPanel} tabIndex={-1} className="panel edit-panel" aria-label="Registro selecionado"><div className="section-heading"><h2>{editing.label}: {editing.title}</h2><button className="text-button" disabled={busy} onClick={() => setEditing(null)}>Fechar</button></div><RecordDetails record={recordDetails} timezone={farm?.timezone || 'America/Sao_Paulo'} /><RecordHistory data={recordHistory} error={historyError} timezone={farm?.timezone || 'America/Sao_Paulo'} disabled={busy || !online} onMore={() => void loadRecordHistory()}/>{editLabel ? <form className="stack-form" onSubmit={saveRecord}><label>{editLabel === 'title' ? 'Título' : editLabel === 'area_ha' ? 'Área em hectares' : 'Descrição'}<input required type={editLabel === 'area_ha' ? 'number' : 'text'} min={editLabel === 'area_ha' ? '0.0001' : undefined} step={editLabel === 'area_ha' ? 'any' : undefined} value={editValue} onChange={event => setEditValue(event.target.value)} /></label><button className="button primary" disabled={busy || !online}>Salvar correção</button></form> : <p className="muted">Você pode consultar os dados acima. Para corrigir este tipo de registro, peça o ajuste à Lida pelo WhatsApp.</p>}</section>}
            </>}
            {loading && view !== 'today' && <p className="loading" role="status">Atualizando registros…</p>}
          </>}
        </>}
      </main>
      <nav className="bottom-nav" aria-label="Navegação principal">{nav.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} disabled={busy} onClick={() => { setView(item.id); setFarmTab('units'); setEditing(null); setRecordIntent(null); setMenuOpen(false); }} aria-current={view === item.id ? 'page' : undefined}><item.icon size={21} strokeWidth={view === item.id ? 2.3 : 1.8}/><span>{item.label}</span></button>)}</nav>
    </div>
  </div>;
}
