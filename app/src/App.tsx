import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Clock3, CloudSun, Home, MapPinned, Menu, MessageCircle, Plus, RefreshCw, UserRound, X } from 'lucide-react';
import { api, authClient, externalUrl, jsonBody, rural, type Activity, type ActivityChange, type ActivityPage, type Farm, type Summary, type Task, type Weather } from './api';
import Signup from './Signup';
import FarmRecords from './FarmRecords';

type View = 'today' | 'agenda' | 'farm' | 'activity';
const nav = [
  { id: 'today' as const, label: 'Início', icon: Home },
  { id: 'activity' as const, label: 'Atividade', icon: ClipboardList },
  { id: 'agenda' as const, label: 'Agenda', icon: CalendarDays },
  { id: 'farm' as const, label: 'Fazenda', icon: MapPinned },
];
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const dateTime = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const displayError = (error: unknown) => error instanceof Error ? error.message : 'Algo deu errado. Tente novamente.';

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty"><div className="empty-icon"><ClipboardList size={19} strokeWidth={1.8} /></div><strong>{title}</strong><p>{children}</p></div>;
}

function Login({ onSuccess, onSignup }: { onSuccess: (session: Session) => void; onSignup: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) setOpen(false); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', closeOnEscape); };
  }, [open, busy]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const auth = await authClient();
      const { data, error: loginError } = await auth.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError) throw loginError;
      if (data.session) onSuccess(data.session);
    } catch (cause) { setError(displayError(cause)); }
    finally { setBusy(false); }
  }
  return <main className="login-shell">
    <div className="login-intro"><div className="login-intro-shade" /><div className="login-brand"><div className="brand-mark">AG</div><span>AG Assist</span></div><div className="login-intro-copy"><span className="login-eyebrow">Sua fazenda, sempre por perto</span><h1>O campo segue.<br/><em>Você acompanha.</em></h1><p>O que a Lida fez, o que vem pela frente e tudo da sua fazenda no seu bolso.</p><button className="login-open" onClick={() => setOpen(true)}>Entrar na minha conta <ArrowRight size={19}/></button><button className="login-register" onClick={onSignup}>Ainda não tem conta? Cadastre-se <ArrowUpRight size={15}/></button></div><div className="login-intro-bottom"><span>Seu trabalho em boas mãos.</span><span>AG Assist · Lida</span></div></div>
    {open && <div className="login-overlay" onClick={() => !busy && setOpen(false)}><form className="login-form" role="dialog" aria-modal="true" aria-labelledby="login-title" onClick={event => event.stopPropagation()} onSubmit={submit}><div className="sheet-handle" aria-hidden="true" /><button className="login-close" type="button" aria-label="Fechar login" onClick={() => setOpen(false)} disabled={busy}><X size={20}/></button><div className="login-form-heading"><span className="login-mobile-brand">AG Assist</span><h2 id="login-title">Bem-vindo de volta</h2><p>Entre para acompanhar sua fazenda.</p></div>
      <label>E-mail<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Senha<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <button className="button primary login-submit" disabled={busy}>{busy ? 'Entrando…' : <>Entrar <ArrowRight size={18}/></>}</button>
      <p className="login-help">Ainda não tem conta? <button type="button" onClick={onSignup}>Cadastre-se</button><br/>Precisa recuperar o acesso? <a href={externalUrl('/entrar')}>Acesse a página de login</a></p>
    </form></div>}
  </main>;
}

export default function App() {
  const [authFlow, setAuthFlow] = useState<'login' | 'signup'>('login');
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [linked, setLinked] = useState(true);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmId, setFarmId] = useState('');
  const [view, setView] = useState<View>('today');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [moreActivity, setMoreActivity] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [moreTasks, setMoreTasks] = useState(false);
  const [loading, setLoading] = useState(false);
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<'all' | 'lida' | 'app'>('all');
  const farm = farms.find(item => item.id === farmId);
  const lidaActivities = activities.filter(item => item.source === 'lida');
  const visibleActivities = activities.filter(item => activityFilter === 'all' || item.source === activityFilter);
  const sortedTasks = [...tasks].sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const overdueTasks = tasks.filter(task => Date.parse(task.due_at) < Date.now());

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    authClient().then(async auth => {
      const { data } = await auth.auth.getSession();
      if (active) { setSession(data.session); setInitializing(false); }
      const { data: listener } = auth.auth.onAuthStateChange((_event, next) => { if (active) setSession(next); });
      unsubscribe = () => listener.subscription.unsubscribe();
    }).catch(cause => { if (active) { setError(displayError(cause)); setInitializing(false); } });
    const updateNetwork = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateNetwork); window.addEventListener('offline', updateNetwork);
    return () => { active = false; unsubscribe?.(); window.removeEventListener('online', updateNetwork); window.removeEventListener('offline', updateNetwork); };
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    (async () => {
      const me = await api<{ linked: boolean }>('/api/customer/me');
      if (!active) return;
      setLinked(me.linked);
      if (!me.linked) return;
      const found = await api<Farm[]>('/api/rural/farms');
      if (!active) return;
      setFarms(found);
      const saved = localStorage.getItem('ag-app-farm');
      setFarmId(found.find(f => f.id === saved)?.id || found[0]?.id || '');
    })().catch(cause => { if (active) setError(displayError(cause)); });
    return () => { active = false; };
  }, [session]);

  async function refresh(selected = farmId) {
    if (!selected) return;
    setLoading(true); setError('');
    try {
      const [nextSummary, activityPage, pendingTasks, nextWeather] = await Promise.all([
        api<Summary>(rural(selected, '/summary')),
        api<ActivityPage>(rural(selected, '/activity')),
        api<Task[]>(rural(selected, '/farm_tasks?status=pending')),
        api<Weather>(rural(selected, '/weather')).catch(() => null),
      ]);
      setSummary(nextSummary); setActivities(activityPage.items); setMoreActivity(activityPage.has_more);
      setTasks(pendingTasks); setMoreTasks(pendingTasks.length === 50); setWeather(nextWeather);
    } catch (cause) { setError(displayError(cause)); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (farmId) { localStorage.setItem('ag-app-farm', farmId); void refresh(farmId); } }, [farmId]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(success); setEditing(null); setTaskForm(false); await refresh(); }
    catch (cause) { setError(displayError(cause)); }
    finally { setBusy(false); }
  }

  async function createFarm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const city = String(values.get('city')).trim();
      const state = String(values.get('state')).trim().toUpperCase();
      const created = await api<Farm>('/api/rural/farms', { method: 'POST', body: jsonBody({ name: String(values.get('name')).trim(), ...(city ? { city } : {}), ...(state ? { state } : {}) }) });
      setFarms(previous => [...previous, created]); setFarmId(created.id); setFarmForm(false); setNotice('Propriedade cadastrada.');
    } catch (cause) { setError(displayError(cause)); }
    finally { setBusy(false); }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const when = new Date(String(values.get('due_at')));
    if (Number.isNaN(when.getTime())) { setError('Informe uma data e hora válidas.'); return; }
    await mutate(() => api(rural(farmId, '/farm_tasks'), { method: 'POST', body: jsonBody({ title: String(values.get('title')).trim(), due_at: when.toISOString(), priority: String(values.get('priority')), remind: values.get('remind') === 'on' }) }), 'Tarefa criada na agenda.');
  }

  async function openRecord(change: ActivityChange) {
    if (!change.entity_id) return;
    setBusy(true); setError('');
    try {
      const record = await api<Record<string, unknown>>(rural(farmId, `/${change.entity}/${change.entity_id}`));
      const field = change.entity === 'farm_tasks' ? 'title' : change.entity === 'farm_operations' || change.entity === 'farm_expenses' ? 'description' : change.entity === 'fields' ? 'area_ha' : '';
      setEditing(change); setEditLabel(field);
      setEditValue(field ? String(record[field] ?? '') : '');
    } catch (cause) { setError(displayError(cause)); }
    finally { setBusy(false); }
  }

  async function saveRecord(event: FormEvent) {
    event.preventDefault();
    if (!editing?.entity_id || !editLabel) return;
    const value = editLabel === 'area_ha' ? Number(editValue) : editValue.trim();
    await mutate(() => api(rural(farmId, `/${editing.entity}/${editing.entity_id}`), { method: 'PATCH', body: jsonBody({ [editLabel]: value }) }), 'Registro corrigido. A Lida usará o dado atualizado nas próximas consultas.');
  }

  async function loadMoreActivity() {
    setBusy(true); setError('');
    try { const page = await api<ActivityPage>(rural(farmId, `/activity?offset=${activities.length}`)); setActivities(previous => [...previous, ...page.items]); setMoreActivity(page.has_more); }
    catch (cause) { setError(displayError(cause)); }
    finally { setBusy(false); }
  }

  async function loadMoreTasks() {
    setBusy(true); setError('');
    try { const page = await api<Task[]>(rural(farmId, `/farm_tasks?status=pending&offset=${tasks.length}`)); setTasks(previous => [...previous, ...page]); setMoreTasks(page.length === 50); }
    catch (cause) { setError(displayError(cause)); }
    finally { setBusy(false); }
  }

  if (initializing) return <div className="boot">Preparando o AG Assist…</div>;
  if (authFlow === 'signup') return <Signup session={session} onBack={() => setAuthFlow('login')} onDone={() => window.location.reload()} />;
  if (!session) return <><Login onSuccess={setSession} onSignup={() => setAuthFlow('signup')} />{error && <p className="boot-error" role="alert">{error}</p>}</>;

  return <div className="app-shell">
    <a className="skip" href="#conteudo">Ir para o conteúdo</a>
    <aside className="sidebar" aria-label="Navegação principal">
      <div className="brand"><div className="brand-mark">AG</div><div><strong>AG Assist</strong><span>Controle da fazenda</span></div></div>
      <div className="side-label">ESPAÇO DE TRABALHO</div>
      <nav className="side-nav">{nav.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => { setView(item.id); setEditing(null); setRecordIntent(null); }}><item.icon size={19} strokeWidth={1.9}/>{item.label}</button>)}</nav>
      <div className="side-bottom"><a className="side-lida" href="https://wa.me/5524988685043" target="_blank" rel="noreferrer"><div className="lida-avatar">L</div><div><strong>Fale com a Lida</strong><span>Assistente no WhatsApp</span></div><ArrowUpRight size={17}/></a><a href={externalUrl('/area-do-cliente')}><UserRound size={18}/> Minha conta</a><button onClick={async () => { await (await authClient()).auth.signOut(); }}>Sair</button></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="topbar-brand"><div className="brand-mark">AG</div><strong>AG Assist</strong></div><label className="farm-select"><MapPinned size={17}/><span>Propriedade</span><select aria-label="Propriedade" value={farmId} onChange={event => setFarmId(event.target.value)} disabled={!farms.length}>{farms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown className="farm-chevron" size={16}/></label><button className="refresh icon-button" onClick={() => void refresh()} disabled={!farmId || loading} aria-label="Atualizar dados"><RefreshCw size={18}/></button><button className="account-button icon-button" onClick={() => setMenuOpen(value => !value)} aria-label="Abrir menu" aria-expanded={menuOpen}>{menuOpen ? <X size={19}/> : <Menu size={19}/>}</button></header>
      {menuOpen && <div className="account-menu"><a href={externalUrl('/area-do-cliente')}>Minha conta <ChevronRight size={16}/></a><a href="https://wa.me/5524988685043" target="_blank" rel="noreferrer">Falar com a Lida <ArrowUpRight size={16}/></a><button onClick={async () => { await (await authClient()).auth.signOut(); }}>Sair da conta</button></div>}
      {!online && <div className="network-banner" role="status">Sem conexão. Os dados não podem ser atualizados ou alterados agora.</div>}
      <main id="conteudo" className="content">
        {!linked ? <div className="onboarding"><h1>Vamos concluir seu cadastro</h1><p>Confirme seu WhatsApp aqui no app para conectar sua conta à Lida e liberar o controle da fazenda.</p><button className="button primary" onClick={() => setAuthFlow('signup')}>Continuar cadastro</button></div> : <>
          {error && <div className="notice error" role="alert">{error} <button onClick={() => setError('')} aria-label="Fechar aviso">×</button></div>}
          {notice && <div className="notice success" role="status">{notice} <button onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></div>}
          {!farms.length ? <section className="onboarding"><h1>Comece pela sua propriedade</h1><p>Cadastre uma fazenda aqui ou conte à Lida pelo WhatsApp. Os registros aparecerão neste espaço.</p><button className="button primary" onClick={() => setFarmForm(true)}>Cadastrar propriedade</button>{farmForm && <form className="stack-form" onSubmit={createFarm}><label>Nome<input name="name" required maxLength={120} /></label><label>Cidade<input name="city" maxLength={120} /></label><label>UF<input name="state" maxLength={2} /></label><button className="button primary" disabled={busy}>Salvar propriedade</button></form>}</section> : <>
            {view === 'today' && <>
              <div className="page-heading home-heading"><div><span className="date-label">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span><h1>Sua fazenda, em dia.</h1><p>Acompanhe o que aconteceu e o que vem pela frente.</p></div></div>
              <section className="home-overview"><div><span className="overview-label">VISÃO DE HOJE</span><h2>{overdueTasks.length ? `${overdueTasks.length} tarefa${overdueTasks.length === 1 ? '' : 's'} precisa${overdueTasks.length === 1 ? '' : 'm'} de atenção` : tasks.length ? `${tasks.length} tarefa${tasks.length === 1 ? '' : 's'} no radar` : 'Tudo em ordem por aqui'}</h2><p>{lidaActivities.length ? `A Lida fez ${lidaActivities.length} registro${lidaActivities.length === 1 ? '' : 's'} recente${lidaActivities.length === 1 ? '' : 's'} nesta propriedade.` : 'Quando a Lida registrar algo, você verá o resultado aqui.'}</p></div><a className="overview-cta" href="https://wa.me/5524988685043" target="_blank" rel="noreferrer"><MessageCircle size={20}/> Falar com a Lida <ArrowUpRight size={17}/></a></section>
              <div className="quick-register" aria-label="Registro rápido"><span>Registrar no app</span><button onClick={() => { setRecordIntent('operation'); setView('farm'); }}><Plus size={17}/> Atividade</button><button onClick={() => { setRecordIntent('expense'); setView('farm'); }} disabled={!summary?.expenses}><Plus size={17}/> Despesa</button></div>
              <div className="today-layout"><section className="panel activity-panel"><div className="section-heading"><div><span className="section-overline">ACOMPANHAMENTO</span><h2>O que a Lida fez</h2></div><button className="text-button" onClick={() => setView('activity')}>Ver tudo <ArrowRight size={16}/></button></div>{lidaActivities.length ? <ul className="activity-list">{lidaActivities.slice(0, 4).map(item => <li key={item.id}><span className="activity-icon"><Check size={17}/></span><div><strong>{item.changes.map(c => c.title).join(', ') || 'Registro atualizado'}</strong><small>{item.changes.map(c => c.label).join(', ')} · {dateTime(item.created_at)}</small></div><ChevronRight size={17} className="row-chevron"/></li>)}</ul> : <Empty title="A Lida ainda não registrou nada">Peça pelo WhatsApp para ela anotar uma atividade, tarefa ou despesa.</Empty>}</section>
                <section className="panel agenda-panel"><div className="section-heading"><div><span className="section-overline">PRÓXIMOS PASSOS</span><h2>Agenda</h2></div><button className="text-button" onClick={() => setView('agenda')}>Ver tudo <ArrowRight size={16}/></button></div>{tasks.length ? <ul className="task-list">{sortedTasks.slice(0, 4).map(task => <li key={task.id}><div className="task-date-tile"><strong>{new Date(task.due_at).toLocaleDateString('pt-BR', { day: '2-digit' })}</strong><span>{new Date(task.due_at).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span></div><div className="task-main"><strong>{task.title}</strong><span>{dateTime(task.due_at)}{Date.parse(task.due_at) < Date.now() ? ' · atrasada' : ''}</span></div><button className="complete-button" aria-label={`Concluir ${task.title}`} title="Concluir tarefa" disabled={busy || !online} onClick={() => void mutate(() => api(rural(farmId, `/farm_tasks/${task.id}`), { method: 'PATCH', body: jsonBody({ status: 'completed' }) }), 'Tarefa concluída.')}><Check size={18}/></button></li>)}</ul> : <Empty title="Nenhuma tarefa pendente">Peça à Lida para criar uma tarefa ou adicione uma pela agenda.</Empty>}</section></div>
              {summary?.alerts?.length ? <section className="alerts"><h2>Avisos da propriedade</h2>{summary.alerts.map(alert => <p key={alert.id}><strong>{alert.title}</strong> — {alert.message}</p>)}</section> : null}
              <div className="home-bottom">{weather && <section className="weather-line" aria-label="Clima da propriedade"><span className="weather-icon"><CloudSun size={22}/></span><div><strong>{weather.current.temperature_2m != null ? `${Math.round(weather.current.temperature_2m)}${weather.current_units?.temperature_2m || '°C'}` : 'Clima'}</strong><span>{weather.daily?.precipitation_probability_max?.[0] != null ? `${weather.daily.precipitation_probability_max[0]}% de chance de chuva hoje` : 'Previsão da propriedade'}</span><small>{weather.source} · atualizado {dateTime(weather.retrieved_at)}</small></div></section>}
                <button className="farm-glance" onClick={() => setView('farm')}><span className="farm-glance-icon"><MapPinned size={21}/></span><span><strong>Visão da fazenda</strong><small>{summary?.fields.length ?? '—'} talhões · {summary?.expenses ? `${money(summary.expenses.amount)} em custos` : 'Custos não habilitados'}</small></span><ChevronRight size={18}/></button></div>
            </>}
            {view === 'agenda' && <><div className="page-heading"><div><h1>Agenda</h1><p>Suas tarefas e os lembretes combinados com a Lida.</p></div><button className="button primary" onClick={() => setTaskForm(value => !value)}>{taskForm ? <><X size={18}/> Fechar</> : <><Plus size={18}/> Nova tarefa</>}</button></div>
              {taskForm && <form className="panel stack-form task-form" onSubmit={createTask}><h2>Nova tarefa</h2><label>O que precisa ser feito<input name="title" required maxLength={160} placeholder="Ex.: Conferir bomba de irrigação" /></label><div className="form-grid"><label>Data e hora<input name="due_at" type="datetime-local" required /></label><label>Prioridade<select name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="high">Alta</option><option value="low">Baixa</option></select></label></div><label className="checkbox"><input name="remind" type="checkbox" /> Lida me lembra pelo WhatsApp</label><p className="form-note">O lembrete depende do WhatsApp vinculado e do serviço de envio estar habilitado.</p><button className="button primary" disabled={busy || !online}>Salvar tarefa</button></form>}
              <div className="agenda-summary"><div><CalendarDays size={20}/><span><strong>{tasks.length}{moreTasks ? '+' : ''}</strong> pendentes</span></div><div><Clock3 size={20}/><span><strong>{overdueTasks.length}</strong> atrasadas</span></div></div>
              <section className="panel"><div className="section-heading"><h2>Tarefas pendentes</h2><span>Por data</span></div>{tasks.length ? <ul className="agenda-list">{sortedTasks.map(task => <li key={task.id}><div className="task-date-tile"><strong>{new Date(task.due_at).toLocaleDateString('pt-BR', { day: '2-digit' })}</strong><span>{new Date(task.due_at).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span></div><div className="agenda-task-copy"><span className={Date.parse(task.due_at) < Date.now() ? 'due overdue' : 'due'}>{dateTime(task.due_at)}{Date.parse(task.due_at) < Date.now() ? ' · atrasada' : ''}</span><strong>{task.title}</strong>{task.remind && <small>Lembrete solicitado à Lida</small>}</div><button className="complete-button" disabled={busy || !online} onClick={() => void mutate(() => api(rural(farmId, `/farm_tasks/${task.id}`), { method: 'PATCH', body: jsonBody({ status: 'completed' }) }), 'Tarefa concluída.')} aria-label={`Concluir ${task.title}`}><Check size={18}/></button></li>)}</ul> : <Empty title="Nenhuma tarefa pendente">Crie uma tarefa aqui ou peça à Lida pelo WhatsApp.</Empty>}{moreTasks && <button className="load-more" disabled={busy} onClick={() => void loadMoreTasks()}>Carregar mais tarefas <ArrowRight size={17}/></button>}</section>
            </>}
            {view === 'farm' && <><div className="page-heading"><div><h1>Sua fazenda</h1><p>Talhões, safras e registros em um só lugar.</p></div><button className="button secondary" onClick={() => setFarmForm(value => !value)}><Plus size={17}/> Nova propriedade</button></div>
              <section className="farm-hero"><div><span>PROPRIEDADE SELECIONADA</span><h2>{farm?.name}</h2><p>{farm?.city ? `${farm.city}${farm.state ? ` / ${farm.state}` : ''}` : 'Localização ainda não informada'}</p></div><div className="farm-hero-facts"><div><strong>{farm?.total_area_ha ? `${farm.total_area_ha} ha` : '—'}</strong><span>Área cadastrada</span></div><div><strong>{summary?.fields.length ?? '—'}</strong><span>Talhões recentes</span></div></div></section>
              {farmForm && <form className="panel stack-form" onSubmit={createFarm}><h2>Cadastrar propriedade</h2><label>Nome<input name="name" required maxLength={120} /></label><div className="form-grid"><label>Cidade<input name="city" maxLength={120} /></label><label>UF<input name="state" maxLength={2} /></label></div><button className="button primary" disabled={busy}>Salvar propriedade</button></form>}
              <div className="farm-layout"><section className="panel"><div className="section-heading"><h2>Talhões</h2><span>{summary?.fields.length || 0} recentes</span></div>{summary?.fields.length ? <ul className="simple-list">{summary.fields.map(field => <li key={field.id}><strong>{field.name}</strong><span>{field.area_ha ? `${field.area_ha} ha` : 'Área não informada'}</span></li>)}</ul> : <Empty title="Ainda sem talhões">Diga à Lida o nome e a área de cada talhão para organizar os registros.</Empty>}</section>
                <section className="panel"><div className="section-heading"><h2>Safras</h2></div>{summary?.seasons.length ? <ul className="simple-list">{summary.seasons.map(season => <li key={season.id}><strong>{season.name}</strong><span>{season.status === 'active' ? 'Ativa' : season.status === 'planned' ? 'Planejada' : 'Concluída'}</span></li>)}</ul> : <Empty title="Nenhuma safra cadastrada">A Lida pode registrar sua safra quando você informar o nome e o período.</Empty>}</section></div>
              <FarmRecords key={farmId} farmId={farmId} summary={summary} online={online} initialForm={recordIntent} onSaved={() => refresh()} />
            </>}
            {view === 'activity' && <><div className="page-heading"><div><h1>O que a Lida fez</h1><p>Confira cada registro feito nesta propriedade. Consultas sem alteração não aparecem.</p></div></div><div className="activity-summary"><div className="lida-avatar large">L</div><div><strong>Trabalho da Lida</strong><span>{lidaActivities.length} registro{lidaActivities.length === 1 ? '' : 's'} recente{lidaActivities.length === 1 ? '' : 's'} nesta propriedade</span></div><CheckCircle2 size={21}/></div><div className="filter-tabs" role="group" aria-label="Filtrar atividade"><button className={activityFilter === 'all' ? 'selected' : ''} onClick={() => setActivityFilter('all')}>Tudo</button><button className={activityFilter === 'lida' ? 'selected' : ''} onClick={() => setActivityFilter('lida')}>Feito pela Lida</button><button className={activityFilter === 'app' ? 'selected' : ''} onClick={() => setActivityFilter('app')}>Feito no app</button></div><section className="panel history-panel"><div className="section-heading"><h2>Histórico de registros</h2><span>Mais recentes primeiro</span></div>{visibleActivities.length ? <ul className="history-list">{visibleActivities.map(item => <li key={item.id}><span className={item.source === 'lida' ? 'history-avatar lida' : 'history-avatar'}>{item.source === 'lida' ? 'L' : <UserRound size={18}/>}</span><div className="history-body"><div className="history-meta"><span>{item.source === 'lida' ? 'Lida no WhatsApp' : 'Feito no app'}</span><time dateTime={item.created_at}>{dateTime(item.created_at)}</time></div>{item.changes.length ? item.changes.map((change, index) => <div className="history-change" key={`${item.id}-${index}`}><div><strong>{change.title}</strong><small>{change.label} {change.type === 'created' ? 'criado' : 'atualizado'}</small></div>{change.entity_id && <button className="record-button" disabled={busy} onClick={() => void openRecord(change)}>Ver registro <ChevronRight size={16}/></button>}</div>) : <span>Registro atualizado</span>}</div></li>)}</ul> : <Empty title={activityFilter === 'all' ? 'Ainda não há registros' : 'Nada por aqui ainda'}>{activityFilter === 'all' ? 'Peça à Lida para registrar uma tarefa ou atividade. As ações confirmadas aparecerão aqui.' : 'Mude o filtro para ver os outros registros desta propriedade.'}</Empty>}{moreActivity && <button className="load-more" disabled={busy} onClick={() => void loadMoreActivity()}>Carregar mais registros <ArrowRight size={17}/></button>}</section>
              {editing && <section className="panel edit-panel" aria-label="Registro selecionado"><div className="section-heading"><h2>{editing.label}: {editing.title}</h2><button className="text-button" onClick={() => setEditing(null)}>Fechar</button></div>{editLabel ? <form className="stack-form" onSubmit={saveRecord}><label>{editLabel === 'title' ? 'Título' : editLabel === 'area_ha' ? 'Área em hectares' : 'Descrição'}<input required type={editLabel === 'area_ha' ? 'number' : 'text'} min={editLabel === 'area_ha' ? '0.0001' : undefined} step={editLabel === 'area_ha' ? 'any' : undefined} value={editValue} onChange={event => setEditValue(event.target.value)} /></label><button className="button primary" disabled={busy || !online}>Salvar correção</button></form> : <p className="muted">Este tipo de registro pode ser consultado, mas ainda não tem correção rápida no app. Peça o ajuste à Lida.</p>}</section>}
            </>}
            {loading && <p className="loading" role="status">Atualizando registros…</p>}
          </>}
        </>}
      </main>
      <nav className="bottom-nav" aria-label="Navegação principal">{nav.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => { setView(item.id); setEditing(null); setRecordIntent(null); setMenuOpen(false); }} aria-current={view === item.id ? 'page' : undefined}><item.icon size={21} strokeWidth={view === item.id ? 2.3 : 1.8}/><span>{item.label}</span></button>)}</nav>
    </div>
  </div>;
}
