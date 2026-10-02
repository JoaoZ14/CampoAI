import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  getSupabase,
  initSupabase,
} from './auth.js';

const PAGE_SIZE = 50;
const MSG_PAGE_SIZE = 40;

const ROUTES = [
  { hash: '', path: 'dashboard', label: 'Painel', title: 'Painel', subtitle: 'Visão geral do produto' },
  { hash: 'users', path: 'users', label: 'Usuários', title: 'Usuários', subtitle: 'Cadastros, trials e assinantes' },
  { hash: 'revenue', path: 'revenue', label: 'Receita', title: 'Receita', subtitle: 'Checkouts, assinaturas Asaas e trials' },
  { hash: 'orgs', path: 'orgs', label: 'Organizações', title: 'Organizações', subtitle: 'Planos equipe e assentos' },
  { hash: 'messages', path: 'messages', label: 'Conversas', title: 'Conversas IA', subtitle: 'Histórico de mensagens no WhatsApp' },
  { hash: 'plans', path: 'plans', label: 'Planos', title: 'Catálogo de planos', subtitle: 'Preços e benefícios exibidos em /planos' },
  { hash: 'news', path: 'news', label: 'Notícias', title: 'Notícias', subtitle: 'Feed da landing (GNews)' },
  { hash: 'settings', path: 'settings', label: 'Configurações', title: 'Configurações', subtitle: 'URLs, trial e integrações' },
];

const NAV_GROUPS = [
  { label: 'Visão geral', paths: ['dashboard'] },
  { label: 'Clientes', paths: ['users', 'revenue', 'orgs'] },
  { label: 'Operação', paths: ['messages'] },
  { label: 'Produto', paths: ['plans', 'news'] },
  { label: 'Sistema', paths: ['settings'] },
];

const INTEGRATION_LABELS = {
  gemini: 'Google Gemini (IA)',
  twilio: 'Twilio (WhatsApp/SMS)',
  resend: 'Resend (e-mail)',
  asaas: 'Asaas (pagamentos)',
  gnews: 'GNews (notícias)',
  supabase: 'Supabase (banco)',
};

let adminEmail = '';
let freeUsageLimit = 10;
/** @type {any[]} */
let organizationsCache = [];

const state = {
  users: { offset: 0, total: 0, q: '', status: '' },
  messages: { offset: 0, total: 0, phone: '' },
  revenue: { offset: 0, total: 0, tab: 'checkouts', trialStatus: 'trial_active' },
  plans: { selectedIndex: 0 },
  orgs: { q: '' },
};

/** @type {{ version: string, notes: string[], plans: any[], updated_at: string | null }} */
let plansCatalog = { version: '', notes: [], plans: [], updated_at: null };
let plansDirty = false;
let mainScrollY = 0;

function th(label) {
  return `<th scope="col">${esc(label)}</th>`;
}

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function toast(msg, isError = false) {
  const root = $('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast${isError ? ' error' : ''}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function getHashParts() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart || 'dashboard';
  return { path, params: new URLSearchParams(queryPart || '') };
}

function routeByPath(path) {
  if (path === 'billing') return ROUTES.find((r) => r.path === 'revenue');
  return ROUTES.find((r) => r.path === path || (path === '' && r.path === 'dashboard')) || ROUTES[0];
}

function getRoute() {
  const { path } = getHashParts();
  return routeByPath(path);
}

function syncStateFromHash() {
  const { path, params } = getHashParts();

  if (path === 'billing') {
    location.replace('#/revenue?tab=checkouts');
    return true;
  }

  if (path === 'users') {
    const status = params.get('status') || '';
    if (status !== state.users.status) state.users.offset = 0;
    state.users.status = status;
  }

  if (path === 'revenue') {
    const tab = params.get('tab') || 'checkouts';
    const trialStatus = params.get('status');
    if (tab !== state.revenue.tab) state.revenue.offset = 0;
    state.revenue.tab = tab;
    if (tab === 'trials') {
      const nextTrial = trialStatus === 'trial_expired' ? 'trial_expired' : 'trial_active';
      if (nextTrial !== state.revenue.trialStatus) state.revenue.offset = 0;
      state.revenue.trialStatus = nextTrial;
    }
  }

  return false;
}

function updateHash(path, params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const qs = q.toString();
  const hashPath = path === 'dashboard' ? '' : path;
  location.hash = qs ? `#/${hashPath}?${qs}` : hashPath ? `#/${hashPath}` : '#/';
}

function confirmAction(title, message, { danger = false } = {}) {
  return new Promise((resolve) => {
    openModal(
      title,
      `<p class="confirm-msg">${esc(message)}</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="confirm-cancel">Cancelar</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">Confirmar</button>
      </div>`
    );
    const onClose = (result) => {
      closeModal();
      resolve(result);
    };
    $('confirm-cancel')?.addEventListener('click', () => onClose(false), { once: true });
    $('confirm-ok')?.addEventListener('click', () => onClose(true), { once: true });
  });
}

function openDrawer(title, html) {
  const d = /** @type {HTMLDialogElement} */ ($('drawer'));
  $('drawer-title').textContent = title;
  $('drawer-body').innerHTML = html;
  d.showModal();
}

function closeDrawer() {
  /** @type {HTMLDialogElement} */ ($('drawer'))?.close();
}

function openModal(title, html) {
  const m = /** @type {HTMLDialogElement} */ ($('modal'));
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = html;
  m.showModal();
}

function closeModal() {
  /** @type {HTMLDialogElement} */ ($('modal'))?.close();
}

function closeSidebar() {
  $('sidebar')?.classList.remove('is-open');
  const backdrop = $('sidebar-backdrop');
  if (backdrop) {
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
  }
  $('btn-menu')?.setAttribute('aria-expanded', 'false');
}

function openSidebar() {
  $('sidebar')?.classList.add('is-open');
  const backdrop = $('sidebar-backdrop');
  if (backdrop) {
    backdrop.hidden = false;
    backdrop.setAttribute('aria-hidden', 'false');
  }
  const menuBtn = $('btn-menu');
  menuBtn?.setAttribute('aria-expanded', 'true');
  const firstLink = $('side-nav')?.querySelector('a');
  if (firstLink) firstLink.focus();
}

function trialLabel(user) {
  if (user.isPaid) return { text: 'Assinante', cls: 'badge-ok' };
  const usage = user.usageCount ?? 0;
  const expiredByUsage = usage >= freeUsageLimit;
  const expiredByTime = user.trialEndsAt && Date.now() > new Date(user.trialEndsAt).getTime();
  if (expiredByUsage || expiredByTime) return { text: 'Trial expirado', cls: 'badge-danger' };
  if (!user.signupCompletedAt) return { text: 'Sem cadastro', cls: 'badge-warn' };
  let days = '';
  if (user.trialEndsAt) {
    const d = Math.ceil((new Date(user.trialEndsAt).getTime() - Date.now()) / 86400000);
    days = d > 0 ? ` · ${d}d` : '';
  }
  return { text: `Trial · ${usage}/${freeUsageLimit}${days}`, cls: 'badge-muted' };
}

function integrationBadges(integrations, humanLabels = true) {
  return Object.entries(integrations || {})
    .map(([k, on]) => {
      const label = humanLabels ? INTEGRATION_LABELS[k] || k : k;
      return `<span class="integration-badge ${on ? 'on' : 'off'}">${esc(label)} ${on ? 'OK' : 'off'}</span>`;
    })
    .join('');
}

function kpiCard(value, label, href, ariaLabel) {
  return `<a href="${href}" class="kpi kpi-link" aria-label="${esc(ariaLabel || `Ver ${label}`)}">
    <div class="kpi-value">${value}</div>
    <div class="kpi-label">${esc(label)}</div>
  </a>`;
}

function renderSideNav(activePath) {
  const nav = $('side-nav');
  if (!nav) return;
  const routeMap = Object.fromEntries(ROUTES.map((r) => [r.path, r]));
  nav.innerHTML = NAV_GROUPS.map((group) => {
    const links = group.paths
      .map((p) => {
        const r = routeMap[p];
        if (!r) return '';
        const href = r.hash ? `#/${r.hash}` : '#/';
        return `<a href="${href}" class="${activePath === r.path ? 'is-active' : ''}" data-path="${r.path}">${esc(r.label)}</a>`;
      })
      .join('');
    return `<div class="nav-group"><span class="nav-group-label">${esc(group.label)}</span>${links}</div>`;
  }).join('');
}

function setPageMeta(route) {
  $('page-title').textContent = route.title;
  const sub = $('page-subtitle');
  if (sub) sub.textContent = route.subtitle || '';
  document.title = `${route.title} — AGGI Admin`;
  renderSideNav(route.path);
}

function renderSegmentNav(tabs, activeId, basePath) {
  return `<nav class="segment-nav" aria-label="Filtrar por tipo">${tabs
    .map(
      (t) =>
        `<a href="#/${basePath}?tab=${t.id}${t.status ? `&status=${t.status}` : ''}" class="tab-btn${activeId === t.id ? ' is-active' : ''}">${esc(t.label)}</a>`
    )
    .join('')}</nav>`;
}

async function loadDashboard() {
  const data = await apiGet('/admin/api/dashboard');
  const o = data.overview || {};
  const a = data.analytics || {};
  freeUsageLimit = o.freeUsageLimit ?? 10;

  let warnings = '';
  if (data.warnings?.length) {
    warnings = `<section class="card warn-card"><h3>Avisos</h3><ul class="warn-list">${data.warnings
      .map((w) => `<li>${esc(w.message || w.code)}</li>`)
      .join('')}</ul></section>`;
  }

  const integrations = o.integrations || {};
  const offCount = Object.values(integrations).filter((v) => !v).length;
  const intSummary =
    offCount === 0
      ? '<span class="badge badge-ok">Todas as integrações OK</span>'
      : `<span class="badge badge-warn">${offCount} integração(ões) com problema</span>`;

  const signups = a.signupsLast14Days || [];
  const maxSignup = Math.max(1, ...signups.map((s) => s.count));
  const chartSummary = signups.map((s) => `${s.date}: ${s.count}`).join(', ');

  return `${warnings}
    <div class="kpi-grid kpi-grid-primary">
      ${kpiCard(o.trialsActive ?? 0, 'Trials ativos', '#/revenue?tab=trials&status=trial_active', 'Ver trials ativos')}
      ${kpiCard(o.trialsExpired ?? 0, 'Trials expirados', '#/revenue?tab=trials&status=trial_expired', 'Ver trials expirados')}
      ${kpiCard(o.activeSubscriptions ?? 0, 'Asaas ativas', '#/revenue?tab=asaas', 'Ver assinaturas Asaas ativas')}
      ${kpiCard(a.messagesLast7Days ?? '—', 'Msgs 7d', '#/messages', 'Ver conversas dos últimos 7 dias')}
    </div>
    <details class="card kpi-more">
      <summary>Mais métricas</summary>
      <div class="kpi-grid kpi-grid-secondary">
        ${kpiCard(o.totalUsers ?? 0, 'Usuários', '#/users', 'Ver todos os usuários')}
        ${kpiCard(o.paidUsers ?? 0, 'Pagos', '#/users?status=paid', 'Ver usuários pagos')}
        ${kpiCard(o.signupsCompleted7d ?? 0, 'Cadastros recentes', '#/users', 'Ver lista de usuários (sem filtro de data)')}
        ${kpiCard(o.blockedFreeTier ?? 0, 'Bloqueados (cota)', '#/users?status=blocked', 'Ver usuários bloqueados por cota')}
      </div>
    </details>
    <div class="card integration-summary">
      <p>${intSummary} <a href="#/settings" class="link-btn">Ver integrações em Configurações</a></p>
    </div>
    <div class="card">
      <h3>Cadastros (14 dias)</h3>
      <div class="chart-bars" role="img" aria-label="Cadastros nos últimos 14 dias: ${esc(chartSummary)}">${signups
        .map((s) => {
          const h = Math.round((s.count / maxSignup) * 100);
          return `<div class="chart-bar" style="height:${Math.max(4, h)}%" title="${s.date}: ${s.count}"><span>${s.date.slice(5)}</span><span class="sr-only">${s.count}</span></div>`;
        })
        .join('')}</div>
    </div>
    <div class="card">
      <h3>Top uso IA</h3>
      <div class="table-wrap"><table><thead><tr>${th('Telefone')}${th('Uso')}${th('Tipo')}</tr></thead>
      <tbody>${(a.topUsersByUsage || [])
        .slice(0, 10)
        .map(
          (u) =>
            `<tr><td><button type="button" class="link-btn" data-user-phone="${esc(u.phone)}">${esc(u.phone)}</button></td><td>${u.usageCount}</td><td>${esc(u.billingKind)}</td></tr>`
        )
        .join('')}</tbody></table></div>
    </div>`;
}

async function loadUsersView() {
  const { offset, q, status } = state.users;
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  const data = await apiGet(`/admin/api/users?${params}`);
  state.users.total = data.total ?? 0;

  const rows = (data.users || [])
    .map((u) => {
      const t = trialLabel(u);
      return `<tr>
        <td><button type="button" class="link-btn" data-user-id="${esc(u.id)}">${esc(u.phone)}</button></td>
        <td>${esc(u.name || '—')}</td>
        <td>${esc(u.email || '—')}</td>
        <td><span class="badge ${t.cls}">${esc(t.text)}</span></td>
        <td>${u.isPaid ? '<span class="badge badge-ok">Pago</span>' : '<span class="badge badge-muted">Grátis</span>'}</td>
        <td>${esc(u.signupSource || '—')}</td>
        <td>${fmtDate(u.signupCompletedAt || u.createdAt)}</td>
      </tr>`;
    })
    .join('');

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(state.users.total / PAGE_SIZE));

  return `<div class="toolbar">
      <input type="search" id="users-q" aria-label="Buscar usuários" placeholder="Buscar telefone, nome ou e-mail" value="${esc(q)}" />
      <select id="users-status" aria-label="Filtrar por status">
        <option value="">Todos</option>
        <option value="trial_active" ${status === 'trial_active' ? 'selected' : ''}>Trial ativo</option>
        <option value="trial_expired" ${status === 'trial_expired' ? 'selected' : ''}>Trial expirado</option>
        <option value="paid" ${status === 'paid' ? 'selected' : ''}>Pagos</option>
        <option value="blocked" ${status === 'blocked' ? 'selected' : ''}>Bloqueados (cota)</option>
        <option value="no_signup" ${status === 'no_signup' ? 'selected' : ''}>Sem cadastro</option>
      </select>
      <button type="button" class="btn btn-secondary sm" id="users-search">Buscar</button>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr>${th('Telefone')}${th('Nome')}${th('E-mail')}${th('Trial')}${th('Plano')}${th('Origem')}${th('Cadastro')}</tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="empty-state">Nenhum usuário</td></tr>'}</tbody>
    </table></div>
    <div class="pager">
      <button type="button" class="btn btn-secondary sm" id="users-prev" ${offset <= 0 ? 'disabled' : ''}>Anterior</button>
      <span>Página ${page} de ${pages} (${state.users.total} total)</span>
      <button type="button" class="btn btn-secondary sm" id="users-next" ${offset + PAGE_SIZE >= state.users.total ? 'disabled' : ''}>Próxima</button>
    </div></div>`;
}

async function loadCheckoutsTab() {
  const { offset } = state.revenue;
  const data = await apiGet(`/admin/api/subscription-requests?limit=${PAGE_SIZE}&offset=${offset}`);
  state.revenue.total = data.total ?? 0;
  const rows = (data.requests || [])
    .map(
      (r) => `<tr>
        <td>${fmtDate(r.createdAt)}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.email || '—')}</td>
        <td>${esc(r.phone)}</td>
        <td>${esc(r.planCode)}</td>
        <td>${esc(r.customerType)}</td>
        <td><span class="badge badge-muted">${esc(r.status)}</span></td>
        <td>${r.userId ? `<button type="button" class="link-btn" data-user-id="${esc(r.userId)}">Ver usuário</button>` : '—'}</td>
      </tr>`
    )
    .join('');
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(state.revenue.total / PAGE_SIZE));
  return `<p class="muted small">Solicitações de checkout em <code>/planos</code> — ainda não são assinaturas ativas no Asaas.</p>
    <div class="table-wrap"><table>
      <thead><tr>${th('Data')}${th('Nome')}${th('E-mail')}${th('Telefone')}${th('Plano')}${th('Tipo')}${th('Status')}${th('Usuário')}</tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="empty-state">Nenhuma solicitação</td></tr>'}</tbody>
    </table></div>
    <div class="pager">
      <button type="button" class="btn btn-secondary sm" id="revenue-prev" ${offset <= 0 ? 'disabled' : ''}>Anterior</button>
      <span>Página ${page} de ${pages}</span>
      <button type="button" class="btn btn-secondary sm" id="revenue-next" ${offset + PAGE_SIZE >= state.revenue.total ? 'disabled' : ''}>Próxima</button>
    </div>`;
}

async function loadAsaasTab() {
  const { offset } = state.revenue;
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), status: 'asaas_active' });
  const data = await apiGet(`/admin/api/users?${params}`);
  state.revenue.total = data.total ?? 0;
  const rows = (data.users || [])
    .map(
      (u) => `<tr>
        <td><button type="button" class="link-btn" data-user-id="${esc(u.id)}">${esc(u.phone)}</button></td>
        <td>${esc(u.name || '—')}</td>
        <td>${esc(u.email || '—')}</td>
        <td><span class="badge badge-ok">${esc(u.asaasSubscriptionStatus || 'ACTIVE')}</span></td>
        <td>${esc(u.subscriptionPlanCode || '—')}</td>
        <td>${fmtDate(u.signupCompletedAt)}</td>
      </tr>`
    )
    .join('');
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(state.revenue.total / PAGE_SIZE));
  return `<p class="muted small">Assinantes com status Asaas ativo (fonte de verdade para cobrança recorrente).</p>
    <div class="table-wrap"><table>
      <thead><tr>${th('Telefone')}${th('Nome')}${th('E-mail')}${th('Status Asaas')}${th('Plano')}${th('Cadastro')}</tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty-state">Nenhuma assinatura Asaas ativa</td></tr>'}</tbody>
    </table></div>
    <div class="pager">
      <button type="button" class="btn btn-secondary sm" id="revenue-prev" ${offset <= 0 ? 'disabled' : ''}>Anterior</button>
      <span>Página ${page} de ${pages}</span>
      <button type="button" class="btn btn-secondary sm" id="revenue-next" ${offset + PAGE_SIZE >= state.revenue.total ? 'disabled' : ''}>Próxima</button>
    </div>`;
}

async function loadTrialsTab() {
  const { offset, trialStatus } = state.revenue;
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), status: trialStatus });
  const data = await apiGet(`/admin/api/users?${params}`);
  state.revenue.total = data.total ?? 0;
  const rows = (data.users || [])
    .map((u) => {
      const t = trialLabel(u);
      return `<tr>
        <td><button type="button" class="link-btn" data-user-id="${esc(u.id)}">${esc(u.phone)}</button></td>
        <td>${esc(u.name || '—')}</td>
        <td><span class="badge ${t.cls}">${esc(t.text)}</span></td>
        <td>${u.usageCount ?? 0} / ${freeUsageLimit}</td>
        <td>${fmtDate(u.trialEndsAt)}</td>
        <td>${fmtDate(u.signupCompletedAt)}</td>
      </tr>`;
    })
    .join('');
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(state.revenue.total / PAGE_SIZE));
  const trialFilter = `<div class="toolbar toolbar-inline">
    <label class="inline-label">Mostrar
      <select id="trial-status-filter" aria-label="Filtrar trials">
        <option value="trial_active" ${trialStatus === 'trial_active' ? 'selected' : ''}>Trials ativos</option>
        <option value="trial_expired" ${trialStatus === 'trial_expired' ? 'selected' : ''}>Trials expirados</option>
      </select>
    </label>
  </div>`;
  return `${trialFilter}
    <p class="muted small">Usuários em período de teste — acompanhe conversão para plano pago.</p>
    <div class="table-wrap"><table>
      <thead><tr>${th('Telefone')}${th('Nome')}${th('Status')}${th('Uso IA')}${th('Trial até')}${th('Cadastro')}</tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty-state">Nenhum trial neste filtro</td></tr>'}</tbody>
    </table></div>
    <div class="pager">
      <button type="button" class="btn btn-secondary sm" id="revenue-prev" ${offset <= 0 ? 'disabled' : ''}>Anterior</button>
      <span>Página ${page} de ${pages}</span>
      <button type="button" class="btn btn-secondary sm" id="revenue-next" ${offset + PAGE_SIZE >= state.revenue.total ? 'disabled' : ''}>Próxima</button>
    </div>`;
}

async function loadRevenueView() {
  const tab = state.revenue.tab;
  const tabs = renderSegmentNav(
    [
      { id: 'checkouts', label: 'Checkouts' },
      { id: 'asaas', label: 'Assinaturas Asaas' },
      { id: 'trials', label: 'Trials', status: state.revenue.trialStatus },
    ],
    tab,
    'revenue'
  );
  let content = '';
  if (tab === 'asaas') content = await loadAsaasTab();
  else if (tab === 'trials') content = await loadTrialsTab();
  else content = await loadCheckoutsTab();
  return `${tabs}<div class="card">${content}</div>`;
}

async function showUserDrawer(userId) {
  const data = await apiGet(`/admin/api/users/${userId}`);
  let ruralHtml = '';
  try {
    const rural = await apiGet(`/admin/api/users/${userId}/rural`);
    ruralHtml = `<h3>Operação rural</h3><p>${Number(rural.farm_count)} propriedades · ${rural.farms.reduce((n,f)=>n+Number(f.field_count),0)} talhões</p><ul>${rural.actions.map(a=>`<li>${esc(a.tool_name)} · ${esc(a.status)} · ${fmtDate(a.created_at)}</li>`).join('')||'<li>Nenhuma ação registrada.</li>'}</ul><h4>Lembretes</h4><ul>${rural.jobs.map(j=>`<li>${esc(j.status)} · ${fmtDate(j.run_at)}${j.last_error?' · '+esc(j.last_error):''}</li>`).join('')||'<li>Nenhum lembrete.</li>'}</ul>`;
  } catch (e) { if(e.status!==404) ruralHtml='<p>Dados operacionais indisponíveis.</p>'; }
  const u = data.user;
  const t = trialLabel(u);
  const msgs = (data.recentMessages || [])
    .map((m) => `<li><strong>${esc(m.role)}</strong> ${fmtDate(m.createdAt)}: ${esc(m.content)}</li>`)
    .join('');

  const orgLink = data.organization
    ? `<p><strong>Organização:</strong> <a href="#/orgs" class="link-btn">${esc(data.organization.name || data.organization.id)}</a></p>`
    : '';

  openDrawer(
    u.name || u.phone,
    `<dl class="detail-grid">
      <dt>Telefone</dt><dd>${esc(u.phone)}</dd>
      <dt>E-mail</dt><dd>${esc(u.email || '—')}</dd>
      <dt>Status</dt><dd><span class="badge ${t.cls}">${esc(t.text)}</span></dd>
      <dt>Uso IA</dt><dd>${u.usageCount ?? 0} / ${freeUsageLimit}</dd>
      <dt>Cadastro</dt><dd>${fmtDate(u.signupCompletedAt)}</dd>
      <dt>Trial até</dt><dd>${fmtDate(u.trialEndsAt)}</dd>
      <dt>Asaas</dt><dd>${esc(u.asaasSubscriptionStatus || '—')} ${u.subscriptionPlanCode ? `(${esc(u.subscriptionPlanCode)})` : ''}</dd>
      <dt>Boas-vindas WA</dt><dd>${fmtDate(u.welcomeSentAt)}</dd>
    </dl>
    ${orgLink}
    ${ruralHtml}
    <h3>Últimas mensagens</h3><ul>${msgs || '<li>Nenhuma</li>'}</ul>
    <div class="drawer-actions">
      <button type="button" class="btn btn-secondary sm" data-action="extend-7" data-uid="${esc(u.id)}">+7 dias trial</button>
      <button type="button" class="btn btn-secondary sm" data-action="extend-14" data-uid="${esc(u.id)}">+14 dias trial</button>
      <button type="button" class="btn btn-secondary sm" data-action="reset-usage" data-uid="${esc(u.id)}">Resetar uso</button>
      ${u.isPaid
        ? `<button type="button" class="btn btn-danger sm" data-action="set-free" data-uid="${esc(u.id)}">Marcar grátis</button>`
        : `<button type="button" class="btn btn-primary sm" data-action="set-paid" data-uid="${esc(u.id)}">Marcar pago</button>`}
      <button type="button" class="btn btn-secondary sm" data-action="view-msgs" data-phone="${esc(u.phone)}">Ver conversas</button>
    </div>`
  );
}

async function loadOrgsView() {
  const data = await apiGet('/admin/api/organizations');
  organizationsCache = data.organizations || [];

  if (data.degraded) {
    toast('Lista de organizações em modo degradado — dados podem estar incompletos.', true);
  }

  const q = state.orgs.q.trim().toLowerCase();
  const filtered = organizationsCache.filter((org) => {
    if (!q) return true;
    const name = String(org.name || '').toLowerCase();
    const id = String(org.id || '').toLowerCase();
    return name.includes(q) || id.includes(q);
  });

  const rows = filtered
    .map(
      (org) => `<tr>
        <td><button type="button" class="link-btn" data-org-open="${esc(org.id)}">${esc(org.name || 'Sem nome')}</button></td>
        <td>${org.activeSeats}/${org.maxSeats}</td>
        <td>${org.isActive ? '<span class="badge badge-ok">Ativa</span>' : '<span class="badge badge-muted">Inativa</span>'}</td>
        <td class="muted small">${esc(org.id)}</td>
      </tr>`
    )
    .join('');

  return `<div class="card">
    <h3>Nova organização</h3>
    <form id="form-new-org" class="toolbar">
      <input name="name" placeholder="Nome (opcional)" aria-label="Nome da organização" />
      <input name="maxSeats" type="number" min="1" max="100" value="3" required aria-label="Máximo de assentos" />
      <button type="submit" class="btn btn-primary sm">Criar</button>
    </form>
  </div>
  <div class="toolbar">
    <input type="search" id="orgs-q" aria-label="Buscar organizações" placeholder="Buscar por nome ou ID" value="${esc(state.orgs.q)}" />
  </div>
  <div class="card">
    <div class="table-wrap"><table>
      <thead><tr>${th('Nome')}${th('Assentos')}${th('Status')}${th('ID')}</tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="empty-state">Nenhuma organização</td></tr>'}</tbody>
    </table></div>
    <p class="muted small" style="margin-top:0.75rem">Clique no nome para editar assentos e configurações.</p>
  </div>`;
}

async function showOrgDrawer(orgId) {
  const org = organizationsCache.find((o) => o.id === orgId);
  if (!org) return;

  const seats = (org.seats || [])
    .map(
      (s) =>
        `<li><span>${esc(s.phone)} ${s.active ? '' : '(inativo)'}</span>
        ${s.active ? `<button type="button" class="link-btn" data-remove-seat data-org="${esc(org.id)}" data-phone="${esc(s.phone)}">Remover</button>` : ''}</li>`
    )
    .join('');

  openDrawer(
    org.name || 'Organização',
    `<p class="muted small">ID: ${esc(org.id)}</p>
    <form class="org-edit-form" id="drawer-org-edit" data-org-id="${esc(org.id)}">
      <label>Nome <input name="name" value="${esc(org.name || '')}" /></label>
      <label>Máx. assentos <input name="maxSeats" type="number" min="1" max="100" value="${org.maxSeats}" /></label>
      <label class="plan-checkbox-label"><input type="checkbox" name="isActive" ${org.isActive ? 'checked' : ''} /> Organização ativa</label>
      <button type="submit" class="btn btn-primary sm">Salvar alterações</button>
    </form>
    <h3>Assentos (${org.activeSeats}/${org.maxSeats})</h3>
    <ul class="seat-list">${seats || '<li>Nenhum assento</li>'}</ul>
    <form class="seat-add-form" id="drawer-seat-add" data-org-id="${esc(org.id)}">
      <label>Adicionar telefone <input name="phone" placeholder="(00) 00000-0000" required /></label>
      <button type="submit" class="btn btn-secondary sm">Adicionar assento</button>
    </form>`
  );

  $('drawer-org-edit')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = /** @type {HTMLFormElement} */ (ev.target);
    const fd = new FormData(f);
    await apiPatch(`/admin/api/organizations/${orgId}`, {
      name: fd.get('name'),
      maxSeats: Number(fd.get('maxSeats')),
      isActive: fd.get('isActive') === 'on',
    });
    toast('Organização atualizada');
    closeDrawer();
    navigate();
  });

  $('drawer-seat-add')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const phone = new FormData(/** @type {HTMLFormElement} */ (ev.target)).get('phone');
    await apiPost(`/admin/api/organizations/${orgId}/seats`, { phone });
    toast('Assento adicionado');
    closeDrawer();
    navigate();
  });
}

async function loadMessagesView() {
  const { offset, phone } = state.messages;
  const params = new URLSearchParams({ limit: String(MSG_PAGE_SIZE), offset: String(offset) });
  if (phone) params.set('phone', phone);
  const data = await apiGet(`/admin/api/chat-messages?${params}`);
  state.messages.total = data.total ?? 0;
  const rows = (data.messages || [])
    .map(
      (m) => `<tr>
        <td>${fmtDate(m.createdAt)}</td>
        <td><button type="button" class="link-btn" data-filter-phone="${esc(m.phone)}">${esc(m.phone)}</button></td>
        <td>${esc(m.role)}</td>
        <td class="msg-preview"><button type="button" class="link-btn" data-msg-content="${esc(m.content)}">${esc(m.content)}</button></td>
      </tr>`
    )
    .join('');
  const page = Math.floor(offset / MSG_PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(state.messages.total / MSG_PAGE_SIZE));
  return `<div class="toolbar">
      <input type="search" id="msg-phone" aria-label="Filtrar conversas por telefone" placeholder="Filtrar por telefone" value="${esc(phone)}" />
      <button type="button" class="btn btn-secondary sm" id="msg-filter">Filtrar</button>
      <button type="button" class="btn btn-secondary sm" id="msg-clear">Limpar</button>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr>${th('Data')}${th('Telefone')}${th('Papel')}${th('Conteúdo')}</tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="empty-state">Nenhuma mensagem</td></tr>'}</tbody>
    </table></div>
    <div class="pager">
      <button type="button" class="btn btn-secondary sm" id="msg-prev" ${offset <= 0 ? 'disabled' : ''}>Anterior</button>
      <span>Página ${page} de ${pages}</span>
      <button type="button" class="btn btn-secondary sm" id="msg-next" ${offset + MSG_PAGE_SIZE >= state.messages.total ? 'disabled' : ''}>Próxima</button>
    </div></div>`;
}

async function loadPlansView() {
  const row = await apiGet('/admin/api/plan-catalog');
  plansCatalog = {
    version: row.version || '',
    notes: row.notes || [],
    plans: row.plans || [],
    updated_at: row.updated_at || null,
  };
  if (state.plans.selectedIndex >= plansCatalog.plans.length) {
    state.plans.selectedIndex = 0;
  }

  const listHtml = plansCatalog.plans
    .map((p, i) => {
      const active = i === state.plans.selectedIndex ? ' is-active' : '';
      const hl = p.highlight ? '<span class="badge badge-warn plan-list-badge">Destaque</span>' : '';
      return `<button type="button" class="plan-list-item${active}" data-plan-index="${i}">
        <span class="plan-list-item-main">
          <strong>${esc(p.name)}</strong>
          <span class="muted small">${esc(p.code)} · R$ ${p.priceBrl ?? 0}/${esc(p.period || 'mês')}</span>
        </span>
        ${hl}
      </button>`;
    })
    .join('');

  const selected = plansCatalog.plans[state.plans.selectedIndex] || plansCatalog.plans[0];

  return `<div class="plans-admin">
    <header class="plans-admin-head card">
      <div>
        <p class="muted small" style="margin:0">Versão <strong>${esc(plansCatalog.version)}</strong>${plansCatalog.updated_at ? ` · Atualizado ${fmtDate(plansCatalog.updated_at)}` : ''}</p>
        <p class="muted small" style="margin:0.35rem 0 0">Edite um plano e veja o preview como na vitrine <code>/planos</code>.</p>
      </div>
      <div class="plans-admin-head-actions">
        <span id="plans-dirty-badge" class="badge badge-warn" hidden>Alterações não salvas</span>
        <a href="/planos" target="_blank" rel="noopener" class="btn btn-secondary sm">Abrir vitrine</a>
        <button type="button" class="btn btn-primary sm" id="btn-save-plans">Salvar alterações</button>
      </div>
    </header>
    <div class="plans-admin-layout">
      <nav class="plans-admin-list card" aria-label="Planos do catálogo">${listHtml || '<p class="empty-state">Nenhum plano</p>'}</nav>
      <div class="plans-admin-main">
        <div class="card plan-editor-card" id="plan-editor">${renderPlanEditor(selected, state.plans.selectedIndex)}</div>
        <div class="card plans-preview-card">
          <div class="plans-preview-head">
            <h3>Preview</h3>
            <span class="muted small">Como o cliente vê em /planos</span>
          </div>
          <div id="plan-live-preview" class="plans-preview-stage">${renderPlanPreviewCard(selected)}</div>
        </div>
        <div class="card">
          <h3>Notas do catálogo</h3>
          <p class="muted small">Textos internos ou observações (não aparecem na vitrine).</p>
          <textarea id="plan-notes" class="plan-notes-input" rows="3">${esc((plansCatalog.notes || []).join('\n'))}</textarea>
        </div>
        <details class="json-fallback card">
          <summary>Editar JSON (avançado)</summary>
          <textarea id="plan-json-fallback" rows="12">${esc(JSON.stringify({ version: plansCatalog.version, plans: plansCatalog.plans, notes: plansCatalog.notes }, null, 2))}</textarea>
          <button type="button" class="btn btn-secondary sm" id="btn-save-json" style="margin-top:0.75rem">Salvar via JSON</button>
        </details>
      </div>
    </div>
  </div>`;
}

function renderPlanEditor(plan, index) {
  if (!plan) return '<p class="empty-state">Selecione um plano</p>';
  const bullets = (plan.bullets || []).join('\n');
  return `<h3 class="plan-editor-title">Editar: ${esc(plan.name)}</h3>
    <form class="plan-editor-form" id="plan-editor-form" data-plan-index="${index}">
      <div class="plan-editor-grid">
        <label>Código <input data-field="code" value="${esc(plan.code)}" readonly class="readonly" title="Identificador técnico — não altere sem alinhar ao backend" /></label>
        <label>Nome exibido <input data-field="name" value="${esc(plan.name)}" required /></label>
        <label>Preço (R$) <input data-field="priceBrl" type="number" min="0" step="1" value="${plan.priceBrl ?? 0}" required /></label>
        <label>Período <input data-field="period" value="${esc(plan.period || 'mês')}" placeholder="mês" /></label>
        <label>Assentos (equipe) <input data-field="seats" type="number" min="0" value="${plan.seats ?? ''}" placeholder="vazio = individual" /></label>
        <label class="plan-checkbox-label"><input data-field="highlight" type="checkbox" ${plan.highlight ? 'checked' : ''} /> Destacar na vitrine</label>
      </div>
      <label>Resumo curto <textarea data-field="summary" rows="2">${esc(plan.summary || '')}</textarea></label>
      <label>Benefícios <span class="muted small">(um por linha)</span>
        <textarea data-field="bullets" rows="5">${esc(bullets)}</textarea>
      </label>
    </form>`;
}

function renderPlanPreviewCard(plan) {
  if (!plan) return '<p class="muted">Nenhum plano selecionado</p>';
  const featured = plan.highlight ? ' featured' : '';
  const bullets = (plan.bullets || [])
    .map(
      (b) =>
        `<li><span class="benefit-check" aria-hidden="true">✓</span><span>${esc(b)}</span></li>`
    )
    .join('');
  const seats =
    plan.seats != null && plan.seats !== ''
      ? `<p class="plan-audience">Até ${esc(plan.seats)} números no mesmo plano.</p>`
      : '<p class="plan-audience">Um número de WhatsApp.</p>';
  return `<article class="plan-card${featured}">
    <div class="plan-card-head">
      <div class="plan-icon-wrap" aria-hidden="true"><span class="plan-icon-letter">${esc((plan.name || 'P').charAt(0).toUpperCase())}</span></div>
      <div class="plan-card-head-meta">${plan.highlight ? '<span class="plan-badge">Destaque</span>' : ''}</div>
    </div>
    <h3 class="plan-title">${esc(plan.name)}</h3>
    ${seats}
    <div class="plan-price-row">
      <p class="price">R$&nbsp;${Number(plan.priceBrl) || 0}</p>
      <p class="period">/${esc(plan.period || 'mês')}</p>
    </div>
    <p class="summary">${esc(plan.summary || '')}</p>
    <ul class="benefits">${bullets || '<li class="muted">Adicione benefícios na lista</li>'}</ul>
    <button type="button" class="plan-cta" disabled>Assinar agora</button>
  </article>`;
}

function readPlanFromEditor() {
  const form = $('plan-editor-form');
  if (!form) return null;
  const idx = Number(form.getAttribute('data-plan-index'));
  const base = { ...(plansCatalog.plans[idx] || {}) };
  form.querySelectorAll('[data-field]').forEach((input) => {
    const field = input.getAttribute('data-field');
    if (field === 'bullets') {
      base.bullets = /** @type {HTMLTextAreaElement} */ (input).value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (field === 'highlight') {
      base.highlight = /** @type {HTMLInputElement} */ (input).checked;
    } else if (field === 'priceBrl' || field === 'seats') {
      const v = /** @type {HTMLInputElement} */ (input).value;
      base[field] = v === '' ? undefined : Number(v);
    } else if (field === 'code') {
      base.code = /** @type {HTMLInputElement} */ (input).value;
    } else {
      base[field] = /** @type {HTMLInputElement} */ (input).value;
    }
  });
  return { index: idx, plan: base };
}

function setPlansDirty(dirty) {
  plansDirty = dirty;
  const badge = $('plans-dirty-badge');
  if (badge) badge.hidden = !dirty;
}

function syncPlanPreview() {
  const read = readPlanFromEditor();
  if (!read) return;
  plansCatalog.plans[read.index] = read.plan;
  const preview = $('plan-live-preview');
  if (preview) preview.innerHTML = renderPlanPreviewCard(read.plan);
  setPlansDirty(true);
}

function collectPlansForSave() {
  const read = readPlanFromEditor();
  if (read) plansCatalog.plans[read.index] = read.plan;
  const notesRaw = /** @type {HTMLTextAreaElement} */ ($('plan-notes'))?.value || '';
  const notes = notesRaw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return { version: plansCatalog.version, plans: [...plansCatalog.plans], notes };
}

async function loadNewsView() {
  const data = await apiGet('/admin/api/news');
  const rows = (data.items || [])
    .map(
      (n) => `<tr>
        <td>${esc(n.title)}</td>
        <td>${esc(n.source)}</td>
        <td>${fmtDate(n.publishedAt)}</td>
        <td><a href="${esc(n.url)}" target="_blank" rel="noopener">Abrir</a></td>
      </tr>`
    )
    .join('');
  return `<div class="card">
    <p>Última sync: <strong>${fmtDate(data.fetchedAt)}</strong></p>
    <button type="button" class="btn btn-primary" id="btn-refresh-news">Atualizar agora (GNews)</button>
    <div class="table-wrap" style="margin-top:1rem"><table>
      <thead><tr>${th('Título')}${th('Fonte')}${th('Publicado')}${th('')}</tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="empty-state">Nenhuma notícia em cache</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

async function loadSettingsView() {
  const { settings } = await apiGet('/admin/api/settings');
  const intBadges = integrationBadges(settings.integrations, true);
  return `<div class="card"><h3>URLs de produção</h3>
    <dl class="detail-grid">
      <dt>URL pública do app</dt><dd>${esc(settings.publicAppUrl || '—')}</dd>
      <dt>URL de cadastro</dt><dd>${esc(settings.signupUrl || '—')}</dd>
      <dt>URL do paywall</dt><dd>${esc(settings.paywallUrl || '—')}</dd>
    </dl></div>
    <div class="card"><h3>Trial</h3>
    <dl class="detail-grid">
      <dt>Dias de trial</dt><dd>${settings.freeTrialDays}</dd>
      <dt>Limite de análises</dt><dd>${settings.freeUsageLimit}</dd>
      <dt>Cron expiração</dt><dd>${settings.trialExpiryCronEnabled ? 'Ativo' : 'Desligado'}</dd>
      <dt>E-mail boas-vindas</dt><dd>${settings.signupEmailEnabled ? 'Ativo' : 'Desligado'}</dd>
    </dl></div>
    <div class="card"><h3>Integrações</h3><div class="badges-row">${intBadges}</div>
    <p class="muted small" style="margin-top:0.75rem">Checklist: <code>docs/PRODUCTION_CHECKLIST.md</code></p></div>`;
}

async function renderRoute(route) {
  setPageMeta(route);
  const main = $('app-main');
  main.innerHTML = '<p class="muted">Carregando…</p>';
  try {
    let html = '';
    switch (route.path) {
      case 'dashboard':
        html = await loadDashboard();
        break;
      case 'users':
        html = await loadUsersView();
        break;
      case 'revenue':
        html = await loadRevenueView();
        break;
      case 'orgs':
        html = await loadOrgsView();
        break;
      case 'messages':
        html = await loadMessagesView();
        break;
      case 'plans':
        html = await loadPlansView();
        break;
      case 'news':
        html = await loadNewsView();
        break;
      case 'settings':
        html = await loadSettingsView();
        break;
      default:
        html = await loadDashboard();
    }
    main.innerHTML = html;
    bindViewEvents(route.path);
    main.focus();
  } catch (e) {
    main.innerHTML = `<div class="card"><p class="badge badge-danger">${esc(e.message)}</p></div>`;
    if (/** @type {any} */ (e).status === 403) {
      toast('Acesso negado — confira ADMIN_EMAILS no servidor.', true);
    }
  }
}

function navigate() {
  const main = $('app-main');
  if (main) mainScrollY = main.scrollTop;
  if (syncStateFromHash()) return;
  renderRoute(getRoute()).then(() => {
    requestAnimationFrame(() => {
      const m = $('app-main');
      if (m) m.scrollTop = mainScrollY;
    });
  });
}

async function refreshCurrent() {
  await renderRoute(getRoute());
  toast('Dados atualizados');
}

function bindViewEvents(path) {
  const main = $('app-main');
  if (!main) return;

  const onMainClick = async (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target);
    const userBtn = t.closest('[data-user-id]');
    if (userBtn) {
      ev.preventDefault();
      const id = userBtn.getAttribute('data-user-id');
      if (id) await showUserDrawer(id);
      return;
    }
    const orgBtn = t.closest('[data-org-open]');
    if (orgBtn) {
      ev.preventDefault();
      const id = orgBtn.getAttribute('data-org-open');
      if (id) await showOrgDrawer(id);
      return;
    }
    if (t.matches('[data-filter-phone]') || t.matches('[data-user-phone]')) {
      const raw = t.getAttribute('data-filter-phone') || t.getAttribute('data-user-phone') || '';
      state.messages.phone = raw.replace(/\D/g, '');
      state.messages.offset = 0;
      location.hash = '#/messages';
      return;
    }
    if (t.matches('[data-msg-content]')) {
      openModal('Mensagem completa', `<p style="white-space:pre-wrap">${esc(t.getAttribute('data-msg-content'))}</p>`);
      return;
    }
    if (t.matches('[data-remove-seat]')) {
      const orgId = t.getAttribute('data-org');
      const phone = t.getAttribute('data-phone');
      if (await confirmAction('Remover assento', `Remover o telefone ${phone} desta organização?`, { danger: true })) {
        await apiDelete(`/admin/api/organizations/${orgId}/seats`, { phone });
        toast('Assento removido');
        navigate();
      }
    }
  };

  main.replaceWith(main.cloneNode(true));
  const freshMain = $('app-main');
  freshMain?.addEventListener('click', onMainClick);

  if (path === 'users') {
    const runUsersSearch = () => {
      state.users.q = /** @type {HTMLInputElement} */ ($('users-q')).value.trim();
      state.users.status = /** @type {HTMLSelectElement} */ ($('users-status')).value;
      state.users.offset = 0;
      updateHash('users', { status: state.users.status || undefined });
    };
    $('users-search')?.addEventListener('click', runUsersSearch);
    $('users-q')?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') runUsersSearch();
    });
    $('users-prev')?.addEventListener('click', () => {
      state.users.offset = Math.max(0, state.users.offset - PAGE_SIZE);
      navigate();
    });
    $('users-next')?.addEventListener('click', () => {
      state.users.offset += PAGE_SIZE;
      navigate();
    });
  }

  if (path === 'revenue') {
    $('revenue-prev')?.addEventListener('click', () => {
      state.revenue.offset = Math.max(0, state.revenue.offset - PAGE_SIZE);
      navigate();
    });
    $('revenue-next')?.addEventListener('click', () => {
      state.revenue.offset += PAGE_SIZE;
      navigate();
    });
    $('trial-status-filter')?.addEventListener('change', () => {
      state.revenue.trialStatus = /** @type {HTMLSelectElement} */ ($('trial-status-filter')).value;
      state.revenue.offset = 0;
      updateHash('revenue', { tab: 'trials', status: state.revenue.trialStatus });
    });
  }

  if (path === 'messages') {
    const runMsgFilter = () => {
      state.messages.phone = /** @type {HTMLInputElement} */ ($('msg-phone')).value.replace(/\D/g, '');
      state.messages.offset = 0;
      navigate();
    };
    $('msg-filter')?.addEventListener('click', runMsgFilter);
    $('msg-phone')?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') runMsgFilter();
    });
    $('msg-clear')?.addEventListener('click', () => {
      state.messages.phone = '';
      state.messages.offset = 0;
      navigate();
    });
    $('msg-prev')?.addEventListener('click', () => {
      state.messages.offset = Math.max(0, state.messages.offset - MSG_PAGE_SIZE);
      navigate();
    });
    $('msg-next')?.addEventListener('click', () => {
      state.messages.offset += MSG_PAGE_SIZE;
      navigate();
    });
  }

  if (path === 'orgs') {
    $('form-new-org')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(/** @type {HTMLFormElement} */ (ev.target));
      await apiPost('/admin/api/organizations', {
        name: fd.get('name'),
        maxSeats: Number(fd.get('maxSeats')),
      });
      toast('Organização criada');
      navigate();
    });
    const runOrgsSearch = () => {
      state.orgs.q = /** @type {HTMLInputElement} */ ($('orgs-q')).value.trim();
      navigate();
    };
    $('orgs-q')?.addEventListener('input', runOrgsSearch);
    $('orgs-q')?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') runOrgsSearch();
    });
  }

  if (path === 'plans') {
    setPlansDirty(false);

    const onPlanEditorInput = () => syncPlanPreview();

    $('plan-editor-form')?.addEventListener('input', onPlanEditorInput);
    $('plan-editor-form')?.addEventListener('change', onPlanEditorInput);
    $('plan-notes')?.addEventListener('input', () => setPlansDirty(true));

    document.querySelectorAll('.plan-list-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const read = readPlanFromEditor();
        if (read) plansCatalog.plans[read.index] = read.plan;
        const newIndex = Number(btn.getAttribute('data-plan-index'));
        if (newIndex === state.plans.selectedIndex) return;
        if (
          plansDirty &&
          !(await confirmAction('Descartar alterações', 'Há alterações não salvas neste plano. Deseja continuar sem salvar?'))
        ) {
          return;
        }
        setPlansDirty(false);
        state.plans.selectedIndex = newIndex;
        navigate();
      });
    });

    $('btn-save-plans')?.addEventListener('click', async () => {
      const body = collectPlansForSave();
      await apiPut('/admin/api/plan-catalog', body);
      setPlansDirty(false);
      toast('Planos salvos');
      navigate();
    });
    $('btn-save-json')?.addEventListener('click', async () => {
      try {
        const body = JSON.parse(/** @type {HTMLTextAreaElement} */ ($('plan-json-fallback')).value);
        await apiPut('/admin/api/plan-catalog', body);
        setPlansDirty(false);
        toast('Planos salvos (JSON)');
        navigate();
      } catch {
        toast('JSON inválido', true);
      }
    });
  }

  if (path === 'news') {
    $('btn-refresh-news')?.addEventListener('click', async () => {
      const btn = $('btn-refresh-news');
      btn.disabled = true;
      try {
        await apiPost('/admin/api/news/refresh', {});
        toast('Notícias atualizadas');
        navigate();
      } catch (e) {
        toast(e.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  }
}

function redirectToLogin() {
  const next = encodeURIComponent(location.pathname + location.search + location.hash);
  location.replace(`/admin/login?next=${next}`);
}

async function boot() {
  try {
    await initSupabase();
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      redirectToLogin();
      return;
    }

    adminEmail = session.user?.email || '';
    const emailEl = $('admin-email');
    if (emailEl) {
      emailEl.textContent = adminEmail;
      emailEl.title = adminEmail;
    }

    supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) redirectToLogin();
    });

    navigate();
  } catch (e) {
    const main = $('app-main');
    if (main) {
      main.innerHTML = `<div class="card"><p class="badge badge-danger">${esc(e.message || String(e))}</p></div>`;
    }
  }
}

$('btn-logout')?.addEventListener('click', async () => {
  const supabase = getSupabase();
  await supabase.auth.signOut();
  location.replace('/admin/login');
});
$('btn-refresh')?.addEventListener('click', () => refreshCurrent());
$('drawer-close')?.addEventListener('click', closeDrawer);
$('modal-close')?.addEventListener('click', closeModal);

$('drawer-body')?.addEventListener('click', async (ev) => {
  const t = /** @type {HTMLElement} */ (ev.target);
  const action = t.getAttribute?.('data-action');
  const actionUid = t.getAttribute?.('data-uid');
  if (!action || !actionUid) return;
  try {
    if (action === 'extend-7' && (await confirmAction('Estender trial', 'Adicionar 7 dias ao trial deste usuário?'))) {
      await apiPatch(`/admin/api/users/${actionUid}`, { extendTrialDays: 7 });
      toast('Trial estendido');
      await showUserDrawer(actionUid);
    } else if (action === 'extend-14' && (await confirmAction('Estender trial', 'Adicionar 14 dias ao trial deste usuário?'))) {
      await apiPatch(`/admin/api/users/${actionUid}`, { extendTrialDays: 14 });
      toast('Trial estendido');
      await showUserDrawer(actionUid);
    } else if (action === 'reset-usage' && (await confirmAction('Resetar uso', 'Zerar o contador de análises IA deste usuário?', { danger: true }))) {
      await apiPatch(`/admin/api/users/${actionUid}`, { resetUsage: true });
      toast('Uso resetado');
      await showUserDrawer(actionUid);
    } else if (action === 'set-paid' && (await confirmAction('Marcar como pago', 'Marcar este usuário como assinante pago manualmente?', { danger: true }))) {
      await apiPatch(`/admin/api/users/${actionUid}`, { isPaid: true });
      toast('Marcado como pago');
      closeDrawer();
      navigate();
    } else if (action === 'set-free' && (await confirmAction('Marcar como grátis', 'Remover status de assinante pago deste usuário?', { danger: true }))) {
      await apiPatch(`/admin/api/users/${actionUid}`, { isPaid: false });
      toast('Marcado como grátis');
      closeDrawer();
      navigate();
    } else if (action === 'view-msgs') {
      const phone = t.getAttribute('data-phone') || '';
      closeDrawer();
      state.messages.phone = phone.replace(/\D/g, '');
      state.messages.offset = 0;
      location.hash = '#/messages';
    }
  } catch (e) {
    toast(e.message, true);
  }
});

$('btn-menu')?.addEventListener('click', () => {
  const sidebar = $('sidebar');
  if (sidebar?.classList.contains('is-open')) closeSidebar();
  else openSidebar();
});
$('btn-sidebar-toggle')?.addEventListener('click', closeSidebar);
$('sidebar-backdrop')?.addEventListener('click', closeSidebar);

$('sidebar')?.addEventListener('click', (ev) => {
  if (/** @type {HTMLElement} */ (ev.target).closest('.side-nav a')) closeSidebar();
});

document.addEventListener('click', async (ev) => {
  const a = /** @type {HTMLElement} */ (ev.target).closest('a[href^="#"]');
  if (!a || getRoute().path !== 'plans' || !plansDirty) return;
  const href = a.getAttribute('href');
  if (!href || href === location.hash) return;
  ev.preventDefault();
  if (
    await confirmAction(
      'Descartar alterações',
      'Há alterações não salvas nos planos. Deseja sair sem salvar?'
    )
  ) {
    setPlansDirty(false);
    location.hash = href.replace(/^#/, '');
  }
}, true);

function focusPageSearch() {
  const path = getRoute().path;
  if (path === 'users') $('users-q')?.focus();
  else if (path === 'messages') $('msg-phone')?.focus();
  else if (path === 'orgs') $('orgs-q')?.focus();
}

document.addEventListener('keydown', (ev) => {
  const tag = /** @type {HTMLElement} */ (ev.target).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.target?.isContentEditable) return;
  if (ev.key === 'r' && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
    ev.preventDefault();
    refreshCurrent();
  }
  if (ev.key === '/' && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
    ev.preventDefault();
    focusPageSearch();
  }
});

window.addEventListener('hashchange', () => navigate());

boot();
