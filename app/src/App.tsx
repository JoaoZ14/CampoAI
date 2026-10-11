import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronRight, ClipboardList, Clock3, Home, MapPinned, Menu, Plus, RefreshCw, UserRound, X } from 'lucide-react';
import aggiLockup from './assets/brand/aggi-lockup.png';
import aggiMark from './assets/brand/aggi-mark.png';
import aggiWord from './assets/brand/aggi-wordmark.png';
import { api, authClient, createWriteRequest, errorMessage, externalUrl, jsonBody, rural, type ActivityChange, type DashboardFilter, type Farm, type Task } from './api';
import { useFarmData } from './useFarmData';
import Dashboard from './Dashboard';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import RecordPage from './RecordPage';
import NavigationGuard from './NavigationGuard';
import { farmPath, parseRoute, queryRange, rangeSearch, recordPath, sections } from './routes';
import PasswordField from './PasswordField';
import AppHelp from './AppHelp';
import RecordsHub from './RecordsHub';
import { farmInstant } from './farmTime';
const Signup = lazy(() => import('./Signup'));
const FarmRecords = lazy(() => import('./FarmRecords'));
const AgroWorkspace = lazy(() => import('./AgroWorkspace'));

type View = 'today' | 'agenda' | 'farm' | 'activity';
const nav = [
  { id: 'today' as const, label: 'Início', icon: Home },
  { id: 'activity' as const, label: 'Registros', icon: ClipboardList },
  { id: 'agenda' as const, label: 'Tarefas', icon: CalendarDays },
  { id: 'farm' as const, label: 'Propriedade', icon: MapPinned },
];
const displayError = errorMessage;

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty"><div className="empty-icon"><ClipboardList size={19} strokeWidth={1.8} /></div><strong>{title}</strong><p>{children}</p></div>;
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
      <PasswordField label="Senha" value={password} onChange={setPassword}/>
      {error && <p className="notice error" role="alert">{error}</p>}
      <button className="button primary login-submit" disabled={busy}>{busy ? 'Entrando…' : <>Entrar <ArrowRight size={18}/></>}</button>
      <p className="login-help">Ainda não tem conta? <button type="button" disabled={busy} onClick={onSignup}>Cadastre-se</button><br/>Precisa recuperar o acesso? <a href={externalUrl('/entrar')}>Acesse a página de login</a></p>
    </form></dialog>}
  </main>;
}

export default function App() {
  const location = useLocation(), navigate = useNavigate();
  const route = parseRoute(location.pathname);
  const authFlow = route.signup ? 'signup' : 'login';
  const setAuthFlow = (flow: 'login' | 'signup') => navigate(flow === 'signup' ? '/cadastro' : '/');
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [linked, setLinked] = useState(true);
  const [farms, setFarms] = useState<Farm[]>([]);

  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceReload, setWorkspaceReload] = useState(0);
  const [workspaceUser, setWorkspaceUser] = useState('');
  const [whatsappUrl, setWhatsappUrl] = useState<string>();
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [modulesEnabled, setModulesEnabled] = useState(false);
  const farmId = session && workspaceUser === session.user.id && farms.some(item => item.id === route.farmId) ? route.farmId! : '';
  const view: View = ['propriedade', 'producao', 'vendas', 'agenda-da-propriedade'].includes(route.section || '') ? 'farm' : route.section === 'tarefas' ? 'agenda' : ['registros', 'gastos', 'trabalhos'].includes(route.section || '') ? 'activity' : 'today';
  const farmTab = route.section === 'producao' ? 'history' : route.section === 'vendas' ? 'finance' : route.section === 'agenda-da-propriedade' ? 'agenda' : 'units';
  const farmSection = farmTab;
  const productionRange = queryRange(new URLSearchParams(location.search));
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>({ period: 'month' });
  const { summary, tasks, weather, dashboard, dashboardLoading, loading, errors: sectionErrors, refresh, appendTasks } = useFarmData(session && workspaceUser === session.user.id ? farmId : '', dashboardFilter);
  const [moreTasks, setMoreTasks] = useState(false);
  const [busy, updateBusy] = useState(false), [dirty, updateDirty] = useState(false);
  const busyRef = useRef(false), dirtyRef = useRef(false);
  const setBusy = useCallback((value: boolean) => { busyRef.current = value; updateBusy(value); }, []);
  const setDirty = useCallback((value: boolean) => { dirtyRef.current = value; updateDirty(value); }, []);
  const shouldBlock = useCallback(() => busyRef.current || dirtyRef.current, []);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const taskForm = route.section === 'tarefas' && Boolean(route.creating);
  const setTaskForm = (value: boolean) => navigate(farmPath(farmId, value ? 'tarefas/nova' : 'tarefas'));
  const [farmForm, setFarmForm] = useState(false);
  const [recordReload, setRecordReload] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const recordCategory = route.section === 'gastos' ? 'expenses' : route.section === 'trabalhos' ? 'operations' : 'home';
  const go = (section = '', search = '') => navigate(farmPath(farmId, section) + search);
  const setFarmSection = useCallback((tab: 'units' | 'history' | 'finance' | 'agenda') => {
    const section = { units: 'propriedade', history: 'producao', finance: 'vendas', agenda: 'agenda-da-propriedade' }[tab];
    navigate(farmPath(farmId, section) + location.search);
  }, [farmId, navigate, location.search]);
  const pending = useRef(false);
  const write = useRef(createWriteRequest());
  const currentFarm = useRef(farmId);
  currentFarm.current = farmId;
  const farm = farms.find(item => item.id === farmId);
  const sortedTasks = [...tasks].sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const overdueTasks = tasks.filter(task => Date.parse(task.due_at) < Date.now());
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); setMenuOpen(false); setFarmForm(false); setNotice(''); setError(''); setDirty(false); }, [location.pathname, setDirty]);
  useEffect(() => {
    if (!route.recordId) document.title = ({ '': 'Início', registros: 'Meus registros', gastos: route.creating ? 'Adicionar gasto' : 'Meus gastos', tarefas: route.creating ? 'Nova tarefa' : 'Minhas tarefas', trabalhos: 'Trabalhos do campo', propriedade: 'Minha propriedade', producao: 'Minha produção', vendas: 'Vendas e recebimentos', 'agenda-da-propriedade': 'Tarefas da propriedade' } as Record<string, string>)[route.section || ''] + ' · AGGI';
    const frame = requestAnimationFrame(() => { const heading = document.querySelector<HTMLElement>('#conteudo h1'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); } });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, workspaceLoading]);

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
    setFarms([]); setLinked(true); setWorkspaceError(''); setWorkspaceLoading(true);
    setWhatsappUrl(undefined); setRemindersEnabled(false); setModulesEnabled(false);
    setFarmForm(false); setNotice(''); setError('');
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

    })().catch(cause => { if (active) setWorkspaceError(displayError(cause)); })
      .finally(() => { if (active) { setWorkspaceUser(session.user.id); setWorkspaceLoading(false); } });
    return () => { active = false; controller.abort(); };
  }, [session?.user.id, workspaceReload]);

  useEffect(() => {
    if (!route.root || workspaceLoading || !session || workspaceUser !== session.user.id || !farms.length) return;
    const saved = localStorage.getItem(`ag-app-farm:${session.user.id}`);
    navigate(farmPath(farms.find(item => item.id === saved)?.id || farms[0].id), { replace: true });
  }, [route.root, workspaceLoading, workspaceUser, session?.user.id, farms, navigate]);
  useEffect(() => {
    if (farmId && session) localStorage.setItem(`ag-app-farm:${session.user.id}`, farmId);
    setFarmForm(false); setNotice(''); setError('');
  }, [farmId]);
  useEffect(() => { setMoreTasks(tasks.length >= 50 && tasks.length % 50 === 0); }, [tasks]);

  async function mutate(action: () => Promise<unknown>, success: string, destination?: string) {
    if (pending.current || busy || !online) return;
    pending.current = true;
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(success); setDirty(false); if (destination) { setBusy(false); go(destination); } await refresh(); setRecordReload(value => value + 1); }
    catch (cause) { setError(displayError(cause)); }
    finally { pending.current = false; setBusy(false); }
  }

  async function signOut() {
    if (pending.current || busy) return;
    pending.current = true; setBusy(true);
    try {
      const { error: cause } = await (await authClient()).auth.signOut();
      if (cause) throw cause;
      setDirty(false); setBusy(false); navigate('/', { replace: true });
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
      setFarms(previous => [...previous, created]); setFarmForm(false); setDirty(false); setBusy(false); navigate(farmPath(created.id)); setNotice(`Propriedade ${created.name} cadastrada. Agora você pode pedir à Lida sua primeira tarefa.`);
    } catch (cause) { setError(displayError(cause)); }
    finally { pending.current = false; setBusy(false); }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    let dueAt: string;
    try { dueAt = farmInstant(String(values.get('due_at')), farm?.timezone || 'America/Sao_Paulo'); }
    catch { setError('Informe uma data e hora válidas no horário da propriedade.'); return; }
    await mutate(() => write.current(rural(farmId, '/farm_tasks'), { method: 'POST', body: jsonBody({ title: String(values.get('title')).trim(), due_at: dueAt, priority: String(values.get('priority')), remind: values.get('remind') === 'on' }) }), `Tarefa salva em ${farm?.name}. ${values.get('remind') === 'on' ? 'Lembrete no WhatsApp ativado.' : 'Sem lembrete no WhatsApp.'}`, 'tarefas');
  }

  function openRecord(change: ActivityChange) {
    if (!change.entity_id || busy || !online) return;
    const path = recordPath(farmId, change.entity, change.entity_id);
    if (path) navigate(path, { state: { returnTo: location.pathname + location.search } });
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
  if (authFlow === 'signup') return <Signup session={session} onBack={() => setAuthFlow('login')} onDone={() => { setWorkspaceReload(value => value + 1); navigate('/', { replace: true }); }} />;
  if (!session) return <><Login onSuccess={setSession} onSignup={() => setAuthFlow('signup')} />{error && <p className="boot-error" role="alert">{error}</p>}</>;

  return <div className="app-shell">
    <NavigationGuard busy={busy} dirty={dirty} shouldBlock={shouldBlock}/>
    <a className="skip" href="#conteudo" onClick={event => { event.preventDefault(); const main = document.getElementById('conteudo'); if (main) { main.tabIndex = -1; main.focus(); main.scrollIntoView(); } }}>Ir para o conteúdo</a>
    <aside className="sidebar" aria-label="Navegação principal">
      <div className="brand"><img className="brand-mark" src={aggiMark} alt="" /><div><img className="brand-word" src={aggiWord} alt="AGGI" /><span>Controle da fazenda</span></div></div>
      <div className="side-label">ESPAÇO DE TRABALHO</div>
      <nav className="side-nav">{nav.map(item => <Link key={item.id} to={farmId ? farmPath(farmId, sections[item.id]) : '/'} aria-disabled={!farmId || busy} className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined}><item.icon size={19} strokeWidth={1.9}/>{item.label}</Link>)}</nav>
      <div className="side-bottom">{whatsappUrl && <a className="side-lida" href={whatsappUrl} target="_blank" rel="noreferrer"><div className="lida-avatar">L</div><div><strong>Fale com a Lida</strong><span>Assistente no WhatsApp</span></div><ArrowUpRight size={17}/></a>}<a href={externalUrl('/area-do-cliente')}><UserRound size={18}/> Minha conta</a><button disabled={busy} onClick={() => void signOut()}>Sair</button></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="topbar-brand"><img className="brand-mark" src={aggiMark} alt="" /><img className="brand-word" src={aggiWord} alt="AGGI" /></div><label className="farm-select"><MapPinned size={17}/><span>Propriedade</span><select aria-label="Propriedade" value={farmId} onChange={event => navigate(farmPath(event.target.value, route.section || '') + (route.entity || route.creating ? '' : location.search))} disabled={!farms.length || busy}>{farms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown className="farm-chevron" size={16}/></label><button className="refresh icon-button" onClick={() => void refresh()} disabled={!farmId || loading || busy || !online} aria-label="Atualizar dados"><RefreshCw size={18}/></button><button className="account-button icon-button" onClick={() => setMenuOpen(value => !value)} aria-label="Abrir menu" aria-expanded={menuOpen}>{menuOpen ? <X size={19}/> : <Menu size={19}/>}</button></header>
      {menuOpen && <div className="account-menu"><a href={externalUrl('/area-do-cliente')}>Minha conta <ChevronRight size={16}/></a>{whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer">Falar com a Lida <ArrowUpRight size={16}/></a>}<button disabled={busy} onClick={() => void signOut()}>Sair da conta</button></div>}
      {!online && <div className="network-banner" role="status">Sem conexão. Os dados não podem ser atualizados ou alterados agora.</div>}
      {!workspaceLoading && !workspaceError && linked && <AppHelp whatsappUrl={whatsappUrl}/>}
      <main id="conteudo" className="content">
        {workspaceLoading || workspaceUser !== session.user.id ? <section className="workspace-state" role="status"><RefreshCw size={24}/><h1>Preparando sua fazenda</h1><p>Buscando suas propriedades e registros.</p></section> : workspaceError ? <section className="workspace-state"><h1>Não conseguimos abrir sua fazenda</h1><p role="alert">{workspaceError}</p><button className="button primary" disabled={!online} onClick={() => setWorkspaceReload(value => value + 1)}>Tentar novamente</button></section> : !linked ? <div className="onboarding"><h1>Vamos concluir seu cadastro</h1><p>Confirme seu WhatsApp aqui no app para conectar sua conta à Lida e liberar o controle da fazenda.</p><button className="button primary" onClick={() => setAuthFlow('signup')}>Continuar cadastro</button></div> : <>
          {view !== 'today' && Object.keys(sectionErrors).filter(key => key !== 'dashboard').length > 0 && <div className="notice error" role="alert"><div><strong>Alguns dados não puderam ser atualizados.</strong><p>{Object.keys(sectionErrors).filter(key => key !== 'dashboard').map(key => ({ summary: 'Fazenda', activity: 'Atividade', tasks: 'Agenda', weather: 'Clima', dashboard: 'Resumo' }[key])).join(', ')}. Os dados já carregados podem estar desatualizados.</p></div><button className="text-button" disabled={loading || !online || busy} onClick={() => void refresh()}>Tentar novamente</button></div>}
          {error && <div className="notice error" role="alert">{error} <button onClick={() => setError('')} aria-label="Fechar aviso">×</button></div>}
          {notice && <div className="notice success" role="status">{notice} <button onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></div>}
          {route.invalid ? <section className="workspace-state"><h1>Página não encontrada</h1><p>Confira o endereço ou volte ao início.</p><Link className="button primary" to={farms[0] ? farmPath(farms[0].id) : '/'}>Ir para o início</Link></section> : route.farmId && !farmId ? <section className="workspace-state"><h1>Propriedade não disponível</h1><p>Este endereço não pertence às propriedades disponíveis na sua conta.</p><Link className="button primary" to={farms[0] ? farmPath(farms[0].id) : '/'}>Ver minhas propriedades</Link></section> : !farms.length ? <section className="onboarding"><h1>Comece pela sua propriedade</h1><p>Cadastre uma fazenda aqui ou conte à Lida pelo WhatsApp. Os registros aparecerão neste espaço.</p><button className="button primary" onClick={() => setFarmForm(true)}>Cadastrar propriedade</button>{farmForm && <form className="stack-form" onSubmit={createFarm}><label>Nome<input name="name" required maxLength={120} /></label><label>Cidade<input name="city" maxLength={120} /></label><label>UF<input name="state" maxLength={2} /></label><button className="button primary" disabled={busy || !online}>{busy ? 'Salvando…' : 'Salvar propriedade'}</button></form>}</section> : route.entity && route.recordId && farm ? <RecordPage key={`${farmId}:${route.entity}:${route.recordId}`} farm={farm} entity={route.entity} id={route.recordId} editing={Boolean(route.editing)} online={online} reminders={remindersEnabled} onBusy={setBusy} onDirty={setDirty} onSaved={async () => { await refresh(); setRecordReload(value => value + 1); }}/> : <>
            {view === 'today' && farm && <Dashboard key={farmId} farm={farm} data={dashboard} filter={dashboardFilter} onPeriod={setDashboardFilter} weather={weather} loading={dashboardLoading} error={sectionErrors.dashboard} online={online} busy={busy} whatsappUrl={whatsappUrl} onRefresh={() => void refresh()} onRecord={change => void openRecord(change)} onRecords={() => go('registros')} onExpenses={() => go('gastos', rangeSearch(dashboard ? { from: dashboard.period.from, to: dashboard.period.to_exclusive } : undefined))} onAgenda={() => go('tarefas')} onFarm={() => go('propriedade')} onProduction={period => go('producao', rangeSearch({ from: period.from, to: period.to_exclusive }))} />}
            {view === 'agenda' && <><div className="page-heading"><div><h1>{taskForm ? 'Nova tarefa' : 'Minhas tarefas'}</h1><p>Tudo o que precisa fazer nesta propriedade. Salvar uma tarefa não ativa um lembrete automaticamente.</p></div><button className="button primary" disabled={busy || !online} onClick={() => setTaskForm(!taskForm)}>{taskForm ? <><X size={18}/> Fechar</> : <><Plus size={18}/> Nova tarefa</>}</button></div>
              {taskForm && <form className="panel stack-form task-form" onSubmit={createTask} onChange={() => setDirty(true)}><label>O que precisa ser feito<input name="title" required maxLength={160} placeholder="Ex.: Conferir bomba de irrigação" /></label><div className="form-grid"><label>Data e hora na propriedade<input name="due_at" type="datetime-local" required /></label><label>Prioridade<select name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="high">Alta</option><option value="low">Baixa</option></select></label></div><label className="checkbox"><input name="remind" type="checkbox" disabled={!remindersEnabled} /> Lida me lembra pelo WhatsApp</label><p className="form-note">{remindersEnabled ? 'Marque a opção para ativar o aviso no WhatsApp. Sem marcar, a tarefa fica salva apenas na agenda.' : 'Os lembretes por WhatsApp estão indisponíveis. A tarefa continua salva na agenda.'}</p><button className="button primary" disabled={busy || !online}>{busy ? 'Salvando…' : 'Salvar tarefa'}</button></form>}
              {!taskForm && <><div className="agenda-summary"><div><CalendarDays size={20}/><span><strong>{tasks.length}{moreTasks ? '+' : ''}</strong> pendentes</span></div><div><Clock3 size={20}/><span><strong>{overdueTasks.length}</strong> atrasadas</span></div></div>
              <section className="panel"><div className="section-heading"><h2>Tarefas pendentes</h2><span>Por data</span></div>{loading ? <p className="loading" role="status">Carregando agenda…</p> : sectionErrors.tasks ? <p className="muted">Não foi possível atualizar a agenda.</p> : tasks.length ? <ul className="agenda-list">{sortedTasks.map(task => <li key={task.id}><div className="task-date-tile"><strong>{new Date(task.due_at).toLocaleDateString('pt-BR', { timeZone: farm?.timezone || 'America/Sao_Paulo', day: '2-digit' })}</strong><span>{new Date(task.due_at).toLocaleDateString('pt-BR', { timeZone: farm?.timezone || 'America/Sao_Paulo', month: 'short' }).replace('.', '')}</span></div><div className="agenda-task-copy"><span className={Date.parse(task.due_at) < Date.now() ? 'due overdue' : 'due'}>{new Date(task.due_at).toLocaleString('pt-BR', { timeZone: farm?.timezone || 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}{Date.parse(task.due_at) < Date.now() ? ' · atrasada' : ''}</span><strong>{task.title}</strong><small className={task.remind ? 'task-reminder enabled' : 'task-reminder'}>{task.remind ? 'Lembrete no WhatsApp ativado' : 'Sem lembrete no WhatsApp'}</small><button className="text-button" disabled={busy || !online} onClick={() => { void openRecord({ entity: 'farm_tasks', entity_id: task.id, type: 'updated', label: 'Tarefa', title: task.title }); }}>Ver detalhes</button></div><button className="complete-button" disabled={busy || !online} onClick={() => void mutate(() => write.current(rural(farmId, `/farm_tasks/${task.id}`), { method: 'PATCH', body: jsonBody({ status: 'completed' }) }), 'Tarefa concluída.')} aria-label={`Concluir ${task.title}`}><Check size={18}/><span>Concluir</span></button></li>)}</ul> : <Empty title="Nenhuma tarefa pendente">Crie uma tarefa aqui ou peça à Lida pelo WhatsApp.</Empty>}{moreTasks && <button className="load-more" disabled={busy || loading || !online} onClick={() => void loadMoreTasks()}>Carregar mais tarefas <ArrowRight size={17}/></button>}</section></>}
            </>}
            {view === 'farm' && <><div className="page-heading"><div><h1>{modulesEnabled ? ({ history: "Minha produção", units: "Meus animais e áreas", finance: "Minhas vendas e recebimentos", agenda: "Tarefas da propriedade" })[farmSection] : "Minha propriedade"}</h1><p>{modulesEnabled ? farmSection === "history" ? "Produção e trabalho realizado, separados por atividade e período." : farmSection === "units" ? "Animais, lotes, áreas e as informações de cada um." : "Informações da atividade selecionada abaixo." : "Talhões e safras desta propriedade."}</p></div><button className="button secondary" disabled={busy || !online} onClick={() => setFarmForm(value => !value)}><Plus size={17}/> Nova propriedade</button></div>
              <section className="farm-hero"><div><span>PROPRIEDADE SELECIONADA</span><h2>{farm?.name}</h2><p>{farm?.city ? `${farm.city}${farm.state ? ` / ${farm.state}` : ''}` : 'Localização ainda não informada'}</p></div>{(!modulesEnabled || Boolean(farm?.total_area_ha || summary?.fields.length)) && <div className="farm-hero-facts"><div><strong>{farm?.total_area_ha ? `${farm.total_area_ha} ha` : '—'}</strong><span>Área cadastrada</span></div>{(!modulesEnabled || Boolean(summary?.fields.length)) && <div><strong>{summary?.fields.length ?? '—'}</strong><span>Talhões recentes</span></div>}</div>}</section>
              {farmForm && <form className="panel stack-form" onSubmit={createFarm}><h2>Cadastrar propriedade</h2><label>Nome<input name="name" required maxLength={120} /></label><div className="form-grid"><label>Cidade<input name="city" maxLength={120} /></label><label>UF<input name="state" maxLength={2} /></label></div><button className="button primary" disabled={busy || !online}>{busy ? 'Salvando…' : 'Salvar propriedade'}</button></form>}
              {(!modulesEnabled || Boolean(summary?.fields.length || summary?.seasons.length)) && <div className="farm-layout"><section className="panel"><div className="section-heading"><h2>Talhões</h2><span>{summary?.fields.length || 0} recentes</span></div>{loading ? <p className="loading" role="status">Carregando talhões…</p> : sectionErrors.summary ? <p className="muted">Não foi possível atualizar os talhões.</p> : summary?.fields.length ? <ul className="simple-list">{summary.fields.map(field => <li key={field.id}><strong>{field.name}</strong><span>{field.area_ha ? `${field.area_ha} ha` : 'Área não informada'}</span></li>)}</ul> : <Empty title="Ainda sem talhões">Diga à Lida o nome e a área de cada talhão para organizar os registros.</Empty>}</section>
                <section className="panel"><div className="section-heading"><h2>Safras</h2></div>{loading ? <p className="loading" role="status">Carregando safras…</p> : sectionErrors.summary ? <p className="muted">Não foi possível atualizar as safras.</p> : summary?.seasons.length ? <ul className="simple-list">{summary.seasons.map(season => <li key={season.id}><strong>{season.name}</strong><span>{season.status === 'active' ? 'Ativa' : season.status === 'planned' ? 'Planejada' : 'Concluída'}</span></li>)}</ul> : <Empty title="Nenhuma safra cadastrada">A Lida pode registrar sua safra quando você informar o nome e o período.</Empty>}</section></div>}
              {modulesEnabled && <Suspense fallback={<p className="loading" role="status">Abrindo atividades…</p>}><AgroWorkspace key={farmId} farmId={farmId} initialTab={farmTab} controlledTab={farmTab} onTabChange={setFarmSection} initialPeriod={farmTab === 'history' ? productionRange ? 'range' : 'month' : '90'} initialRange={productionRange || undefined} timezone={farm?.timezone || "America/Sao_Paulo"} online={online} reminders={remindersEnabled} onBusy={setBusy} onSaved={() => refresh()} /></Suspense>}
              <p className="property-records-note">Para conferir gastos e trabalhos do campo, abra <button type="button" className="text-button" disabled={busy} onClick={() => go('registros')}>Meus registros</button>.</p>
            </>}
            {view === 'activity' && <>
              {recordCategory === 'home' && farm ? <RecordsHub farm={farm} data={dashboard} modules={modulesEnabled} busy={busy} onExpenses={() => go('gastos', rangeSearch(dashboard ? { from: dashboard.period.from, to: dashboard.period.to_exclusive } : undefined))} onOperations={() => go('trabalhos')} onTasks={() => go('tarefas')} onAnimals={() => go('propriedade')} onProduction={() => go('producao', rangeSearch(dashboard ? { from: dashboard.period.from, to: dashboard.period.to_exclusive } : undefined))}/> : <><button className="text-button records-back" disabled={busy} onClick={() => go(route.creating ? route.section : 'registros', route.creating ? location.search : '')}>← {route.creating ? recordCategory === 'expenses' ? 'Meus gastos' : 'Trabalhos do campo' : 'Meus registros'}</button><div className="page-heading"><div><span className="dash-eyebrow">{farm?.name}</span><h1>{route.creating ? recordCategory === 'expenses' ? 'Adicionar gasto' : 'Registrar atividade' : recordCategory === 'expenses' ? 'Meus gastos' : 'Trabalhos do campo'}</h1><p>{route.creating ? 'Preencha os dados e confira antes de salvar.' : recordCategory === 'expenses' ? 'Acompanhe o que você gastou nesta propriedade.' : 'Confira o que está salvo, abra os detalhes e corrija quando precisar.'}</p></div></div><Suspense fallback={<p className="loading" role="status">Abrindo registros…</p>}><FarmRecords key={farmId + recordCategory + Boolean(route.creating)} refreshKey={recordReload} farmId={farmId} summary={summary} online={online} formPage={Boolean(route.creating)} onDirty={setDirty} initialForm={route.creating ? recordCategory === 'expenses' ? 'expense' : 'operation' : null} initialKind={recordCategory === 'expenses' ? 'expenses' : 'operations'} initialRange={queryRange(new URLSearchParams(location.search))} onRecord={change => void openRecord(change)} onSaved={() => refresh()} onBusy={setBusy}/></Suspense></>}

            </>}

            {loading && view !== 'today' && <p className="loading" role="status">Atualizando registros…</p>}
          </>}
        </>}
      </main>
      <nav className="bottom-nav" aria-label="Navegação principal">{nav.map(item => <Link key={item.id} className={view === item.id ? 'active' : ''} to={farmId ? farmPath(farmId, sections[item.id]) : '/'} aria-disabled={!farmId || busy} aria-current={view === item.id ? 'page' : undefined}><item.icon size={21} strokeWidth={view === item.id ? 2.3 : 1.8}/><span>{item.label}</span></Link>)}</nav>
    </div>
  </div>;
}
