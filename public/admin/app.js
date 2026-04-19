import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const PAGE_SIZE = 50;
const MSG_PAGE_SIZE = 40;

let supabase = null;
let userOffset = 0;
let userTotal = 0;
let msgOffset = 0;
let msgTotal = 0;
/** @type {any[]} */
let organizationsCache = [];

const el = (id) => document.getElementById(id);

/**
 * Sempre mesma origem do navegador (onde o HTML do /admin foi aberto).
 * Não usar PUBLIC_APP_URL aqui: isso quebrava o painel (só /config em localhost).
 */
function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return new URL(p, window.location.origin).href;
}

function showBanner(text, ok = false) {
  const b = el('banner');
  b.textContent = text;
  b.hidden = false;
  b.classList.toggle('ok', ok);
  if (!ok) b.classList.remove('ok');
}

function hideBanner() {
  el('banner').hidden = true;
}

function clearLoginGateMsg() {
  const g = el('login-gate-msg');
  if (g) {
    g.hidden = true;
    g.textContent = '';
  }
}

function showLoginGateMsg(text) {
  const g = el('login-gate-msg');
  if (!g) return;
  g.textContent = text;
  g.hidden = false;
}

/** E-mail no payload do JWT (só para mensagem; não valida assinatura). */
function emailFromJwt(accessToken) {
  try {
    const part = accessToken.split('.')[1];
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.email === 'string' ? json.email : '';
  } catch {
    return '';
  }
}

function authHeader() {
  return supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  });
}

const fetchNoStore = (url, opts = {}) =>
  fetch(url, { cache: 'no-store', ...opts });

/** @param {Response} res @param {object} json */
function createHttpError(res, json) {
  const e = new Error(json?.error || res.statusText || 'Erro na API');
  /** @type {any} */ (e).status = res.status;
  return e;
}

/**
 * @param {string} path
 * @param {{ accessToken?: string }} [opts] — use logo após login; evita corrida com getSession().
 */
async function apiGet(path, opts = {}) {
  const headers =
    opts.accessToken != null && opts.accessToken !== ''
      ? { Authorization: `Bearer ${opts.accessToken}` }
      : await authHeader();
  const res = await fetchNoStore(apiUrl(path), { headers: { ...headers } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw createHttpError(res, json);
  }
  return json;
}

async function apiPost(path, body, opts = {}) {
  const base =
    opts.accessToken != null && opts.accessToken !== ''
      ? { Authorization: `Bearer ${opts.accessToken}` }
      : await authHeader();
  const res = await fetchNoStore(apiUrl(path), {
    method: 'POST',
    headers: { ...base, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw createHttpError(res, json);
  }
  return json;
}

async function apiPatch(path, body, opts = {}) {
  const base =
    opts.accessToken != null && opts.accessToken !== ''
      ? { Authorization: `Bearer ${opts.accessToken}` }
      : await authHeader();
  const res = await fetchNoStore(apiUrl(path), {
    method: 'PATCH',
    headers: { ...base, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw createHttpError(res, json);
  }
  return json;
}

async function apiPut(path, body, opts = {}) {
  const base =
    opts.accessToken != null && opts.accessToken !== ''
      ? { Authorization: `Bearer ${opts.accessToken}` }
      : await authHeader();
  const res = await fetchNoStore(apiUrl(path), {
    method: 'PUT',
    headers: { ...base, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw createHttpError(res, json);
  }
  return json;
}

async function apiDeleteJson(path, body, opts = {}) {
  const base =
    opts.accessToken != null && opts.accessToken !== ''
      ? { Authorization: `Bearer ${opts.accessToken}` }
      : await authHeader();
  const res = await fetchNoStore(apiUrl(path), {
    method: 'DELETE',
    headers: { ...base, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw createHttpError(res, json);
  }
  return json;
}

async function apiPlansPublic() {
  const res = await fetchNoStore(apiUrl('/api/plans'));
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error || res.statusText || 'Erro ao carregar planos';
    throw new Error(msg);
  }
  return json;
}

/**
 * @param {{ accessToken?: string }} [authOpts]
 */
async function loadPlanCatalogEditor(authOpts = {}) {
  const ta = el('plan-catalog-editor');
  if (!ta) return;
  try {
    const row = await apiGet('/admin/api/plan-catalog', authOpts);
    ta.value = JSON.stringify(
      {
        version: row.version,
        plans: row.plans,
        notes: Array.isArray(row.notes) ? row.notes : [],
      },
      null,
      2
    );
    ta.removeAttribute('placeholder');
  } catch (e) {
    ta.value = '';
    ta.setAttribute('placeholder', e.message || String(e));
  }
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function billingKindLabel(kind) {
  if (kind === 'personal') return 'Pessoal';
  if (kind === 'team') return 'Equipe';
  return 'Grátis';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderWarnings(warnings) {
  const sec = el('sec-warnings');
  const ul = el('warnings-list');
  if (!warnings?.length) {
    sec.hidden = true;
    ul.innerHTML = '';
    return;
  }
  sec.hidden = false;
  ul.innerHTML = warnings
    .map((w) => `<li>${escapeHtml(w.message || w.code || '')}</li>`)
    .join('');
}

/**
 * @param {any} overview
 * @param {any} analytics
 */
function renderStats(overview, analytics) {
  const grid = el('stats-grid');
  const items = [
    ['Usuários totais', overview.totalUsers],
    ['Pagos', overview.paidUsers],
    ['Gratuitos', overview.freeUsers],
    ['Novos (7 dias)', overview.newLast7Days],
    ['Bloqueados (cota)', overview.blockedFreeTier],
    ['Limite gratuito (IA)', String(overview.freeUsageLimit)],
    ['Soma uso (IA)', overview.totalUsageSum],
  ];
  if (analytics?.messagesTotal != null) {
    items.push(['Mensagens salvas (total)', analytics.messagesTotal]);
  }
  if (analytics?.messagesLast7Days != null) {
    items.push(['Mensagens (7 dias)', analytics.messagesLast7Days]);
  }
  if (analytics?.messagesLast30Days != null) {
    items.push(['Mensagens (30 dias)', analytics.messagesLast30Days]);
  }
  if (analytics?.organizationsCount != null) {
    items.push(['Organizações', analytics.organizationsCount]);
  }
  if (analytics?.activeSeatsCount != null) {
    items.push(['Assentos equipe ativos', analytics.activeSeatsCount]);
  }
  if (analytics?.avgUsagePaid != null) {
    items.push(['Média uso IA (pagos)', String(analytics.avgUsagePaid)]);
  }
  if (analytics?.avgUsageFree != null) {
    items.push(['Média uso IA (grátis)', String(analytics.avgUsageFree)]);
  }

  grid.innerHTML = items
    .map(
      ([label, value]) =>
        `<div class="stat"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`
    )
    .join('');
}

function renderIntegrations(integ) {
  const box = el('integrations');
  const rows = [
    ['Gemini', integ.gemini],
    ['Twilio WhatsApp', integ.twilio],
    ['Supabase', integ.supabase],
  ];
  box.innerHTML = rows
    .map(
      ([name, on]) =>
        `<span class="badge ${on ? 'on' : 'off'}">${name}: ${on ? 'ok' : 'faltando'}</span>`
    )
    .join('');
}

function renderBillingBreakdown(analytics) {
  const box = el('billing-breakdown');
  if (!analytics?.usersByBilling) {
    box.textContent = '—';
    return;
  }
  const u = analytics.usersByBilling;
  box.innerHTML = `<ul style="margin:0;padding-left:1.1rem">
    <li>Grátis: <strong>${u.free}</strong></li>
    <li>Pessoal: <strong>${u.personal}</strong></li>
    <li>Equipe: <strong>${u.team}</strong></li>
  </ul>`;
}

function renderSignupsChart(series) {
  const box = el('signups-chart');
  if (!series?.length) {
    box.textContent = 'Sem dados.';
    return;
  }
  const max = Math.max(1, ...series.map((s) => s.count));
  box.innerHTML = series
    .map((s) => {
      const pct = Math.round((s.count / max) * 100);
      return `<div class="bar-row">
        <span class="bar-label">${escapeHtml(s.date.slice(5))}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <span class="bar-val">${s.count}</span>
      </div>`;
    })
    .join('');
}

function renderTopUsers(rows) {
  const tbody = el('top-users-body');
  if (!rows?.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted small">Sem dados.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (u, i) =>
        `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(u.phone)}</td>
        <td>${u.usageCount}</td>
        <td>${escapeHtml(billingKindLabel(u.billingKind))}</td>
      </tr>`
    )
    .join('');
}

function renderPlanRef(data) {
  const box = el('plan-ref');
  const plans = data.plans || [];
  if (!plans.length) {
    box.textContent = '—';
    return;
  }
  const src =
    data.catalogSource === 'database'
      ? '<p class="muted small" style="margin:0 0 0.5rem">Fonte: tabela <code>plan_catalog</code> no Supabase.</p>'
      : '<p class="muted small" style="margin:0 0 0.5rem">Fonte: fallback (padrão do código — confira se a migração <code>migration_003_plan_catalog.sql</code> foi aplicada).</p>';
  const notes =
    Array.isArray(data.notes) && data.notes.length
      ? `<ul style="margin:0.5rem 0 0 1rem;font-size:0.88rem">${data.notes
          .map((n) => `<li>${escapeHtml(n)}</li>`)
          .join('')}</ul>`
      : '';
  box.innerHTML =
    src +
    plans
      .map(
        (p) =>
          `<p style="margin:0.35rem 0"><strong>${escapeHtml(p.name)}</strong> — R$ ${Number(
            p.priceBrl
          ).toFixed(0)}/${escapeHtml(p.period)}${
            p.seats ? ` · até ${p.seats} números` : ''
          }. ${escapeHtml(p.summary)}</p>`
      )
      .join('') +
    notes;
}

function renderOrgs() {
  const box = el('orgs-list');
  if (!organizationsCache.length) {
    box.innerHTML = '<p class="muted small">Nenhuma organização ainda.</p>';
    return;
  }
  box.innerHTML = organizationsCache
    .map((org) => {
      const activeList = (org.seats || []).filter((s) => s.active);
      const seatsHtml = activeList.length
        ? `<ul style="margin:0 0 0.5rem 1rem;padding:0">${activeList
            .map(
              (s) =>
                `<li style="margin:0.25rem 0" class="flex-gap">${escapeHtml(s.phone)} <button type="button" class="btn secondary sm" data-org-remove="${escapeHtml(org.id)}" data-phone="${escapeHtml(s.phone)}">Remover</button></li>`
            )
            .join('')}</ul>`
        : '<p class="muted small" style="margin:0 0 0.5rem">Nenhum número ativo.</p>';
      return `<div class="org-card" data-org-id="${escapeHtml(org.id)}">
        <h3>${escapeHtml(org.name || 'Sem nome')} <span class="muted small">· ${org.activeSeats ?? 0}/${
        org.maxSeats
      } ativos</span></h3>
        ${seatsHtml}
        <div class="flex-gap">
          <input type="text" class="org-phone-input" placeholder="+5511999999999" aria-label="WhatsApp" style="flex:1;min-width:160px;max-width:260px" />
          <button type="button" class="btn sm" data-org-add="${escapeHtml(org.id)}">Adicionar número</button>
        </div>
      </div>`;
    })
    .join('');
}

async function reloadOrgs() {
  try {
    const data = await apiGet('/admin/api/organizations');
    organizationsCache = data.organizations || [];
    renderOrgs();
  } catch (e) {
    organizationsCache = [];
    renderOrgs();
    throw e;
  }
}

function renderUsers(payload) {
  userTotal = payload.total ?? 0;
  const tbody = el('users-body');
  tbody.innerHTML = (payload.users || [])
    .map(
      (u) =>
        `<tr>
          <td>${escapeHtml(u.phone)}</td>
          <td>${u.usageCount}</td>
          <td>${u.isPaid ? 'Sim' : 'Não'}</td>
          <td>${escapeHtml(billingKindLabel(u.billingKind))}</td>
          <td>${fmtDate(u.createdAt)}</td>
          <td>
            ${
              u.billingKind === 'team'
                ? '<span class="muted small">Equipe</span>'
                : `<button type="button" class="btn secondary sm" data-user-paid="${escapeHtml(u.id)}" data-paid-next="true">Pago (pessoal)</button>
            <button type="button" class="btn secondary sm" data-user-paid="${escapeHtml(u.id)}" data-paid-next="false">Grátis</button>`
            }
          </td>
        </tr>`
    )
    .join('');

  const from = userOffset + 1;
  const to = Math.min(userOffset + PAGE_SIZE, userTotal);
  el('page-label').textContent =
    userTotal === 0 ? 'Nenhum registro' : `${from}–${to} de ${userTotal}`;

  el('btn-prev').disabled = userOffset <= 0;
  el('btn-next').disabled = userOffset + PAGE_SIZE >= userTotal;
}

function renderMessages(payload) {
  msgTotal = payload.total ?? 0;
  const tbody = el('messages-body');
  tbody.innerHTML = (payload.messages || [])
    .map(
      (m) =>
        `<tr>
          <td>${fmtDate(m.createdAt)}</td>
          <td>${escapeHtml(m.phone)}</td>
          <td>${escapeHtml(m.role)}</td>
          <td class="msg-cell">${escapeHtml(m.content)}${m.contentTruncated ? '…' : ''}</td>
        </tr>`
    )
    .join('');

  const from = msgOffset + 1;
  const to = Math.min(msgOffset + MSG_PAGE_SIZE, msgTotal);
  el('msg-page-label').textContent =
    msgTotal === 0 ? 'Nenhuma mensagem' : `${from}–${to} de ${msgTotal}`;

  el('btn-msg-prev').disabled = msgOffset <= 0;
  el('btn-msg-next').disabled = msgOffset + MSG_PAGE_SIZE >= msgTotal;
}

async function loadChatMessages(accessToken) {
  const data = await apiGet(
    `/admin/api/chat-messages?limit=${MSG_PAGE_SIZE}&offset=${msgOffset}`,
    accessToken ? { accessToken } : {}
  );
  renderMessages(data);
}

/**
 * @param {string} [accessToken] — token recém emitido no login (evita Bearer vazio na 1ª chamada).
 */
async function loadDashboard(accessToken) {
  hideBanner();
  const authOpts = accessToken ? { accessToken } : {};

  let dash = null;
  try {
    dash = await apiGet('/admin/api/dashboard', authOpts);
  } catch (e) {
    const status = /** @type {any} */ (e).status;
    if (status === 403) {
      const em = accessToken ? emailFromJwt(accessToken) : '';
      const hint = em
        ? `O servidor recusou o acesso para o e-mail ${em}.`
        : 'O servidor recusou o acesso ao painel.';
      const full = `${hint} Inclua exatamente esse e-mail (minúsculas) em ADMIN_EMAILS no .env, salve e reinicie a API.`;
      showBanner(full);
      showLoginGateMsg(full);
      await supabase.auth.signOut();
      showLogin();
      return;
    }
    if (status === 401) {
      showBanner('Sessão expirada ou inválida. Entre de novo.');
      await supabase.auth.signOut();
      showLogin();
      return;
    }
    showBanner(`Dashboard: ${e.message || String(e)}`);
    return;
  }

  renderWarnings(dash.warnings || []);

  if (dash.overview) {
    renderStats(dash.overview, dash.analytics);
    renderIntegrations(dash.overview.integrations || {});
  }

  if (dash.analytics) {
    renderBillingBreakdown(dash.analytics);
    renderSignupsChart(dash.analytics.signupsLast14Days);
    renderTopUsers(dash.analytics.topUsersByUsage);
  } else {
    renderBillingBreakdown(null);
    el('signups-chart').textContent = '—';
    renderTopUsers([]);
  }

  organizationsCache = dash.organizations || [];
  renderOrgs();

  try {
    const plans = await apiPlansPublic();
    renderPlanRef(plans);
  } catch (e) {
    el('plan-ref').textContent = e.message || String(e);
  }

  await loadPlanCatalogEditor(authOpts);

  try {
    const users = await apiGet(
      `/admin/api/users?limit=${PAGE_SIZE}&offset=${userOffset}`,
      authOpts
    );
    renderUsers(users);
  } catch (e) {
    el('users-body').innerHTML = `<tr><td colspan="6" class="muted small">${escapeHtml(
      e.message || String(e)
    )}</td></tr>`;
  }

  try {
    await loadChatMessages(accessToken);
  } catch (e) {
    el('messages-body').innerHTML = `<tr><td colspan="4" class="muted small">${escapeHtml(
      e.message || String(e)
    )}</td></tr>`;
  }
}

function showLogin() {
  el('view-login').hidden = false;
  el('view-dash').hidden = true;
}

function showDash() {
  el('view-login').hidden = true;
  el('view-dash').hidden = false;
}

async function init() {
  hideBanner();

  const cfgRes = await fetchNoStore(apiUrl('/admin/api/config'));
  const cfg = await cfgRes.json();
  if (!cfg.ok) {
    showBanner(cfg.error || 'Config indisponível.');
    return;
  }

  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'TOKEN_REFRESHED') return;

    /**
     * INITIAL_SESSION com session=null costuma disparar antes do storage terminar
     * e chama showLogin(), apagando a tela logo após um login bem-sucedido.
     * Só tratamos INITIAL_SESSION quando há sessão; o boot real faz getSession() abaixo.
     */
    if (event === 'INITIAL_SESSION') {
      if (session?.access_token) {
        showDash();
        userOffset = 0;
        msgOffset = 0;
        await loadDashboard(session.access_token);
      }
      return;
    }

    if (event === 'SIGNED_IN' && session?.access_token) {
      hideBanner();
      clearLoginGateMsg();
      showDash();
      userOffset = 0;
      msgOffset = 0;
      await loadDashboard(session.access_token);
    }

    if (event === 'SIGNED_OUT') {
      clearLoginGateMsg();
      showLogin();
    }
  });

  el('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    hideBanner();
    clearLoginGateMsg();
    const fd = new FormData(ev.target);
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showBanner(error.message);
      return;
    }
    let session = data?.session;
    if (!session?.access_token) {
      const { data: again } = await supabase.auth.getSession();
      session = again.session;
    }
    if (!session?.access_token) {
      showBanner('Login retornou 200, mas a sessão não apareceu. Atualize a página (F5) ou limpe o cache do site.');
      return;
    }
    hideBanner();
    clearLoginGateMsg();
    showDash();
    userOffset = 0;
    msgOffset = 0;
    await loadDashboard(session.access_token);
  });

  el('btn-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
    hideBanner();
  });

  el('btn-refresh').addEventListener('click', async () => {
    hideBanner();
    try {
      await loadDashboard();
      showBanner('Dados atualizados.', true);
    } catch (e) {
      showBanner(e.message || String(e));
    }
  });

  el('btn-prev').addEventListener('click', async () => {
    userOffset = Math.max(0, userOffset - PAGE_SIZE);
    try {
      const users = await apiGet(`/admin/api/users?limit=${PAGE_SIZE}&offset=${userOffset}`);
      renderUsers(users);
    } catch (e) {
      showBanner(e.message || String(e));
    }
  });

  el('btn-next').addEventListener('click', async () => {
    if (userOffset + PAGE_SIZE >= userTotal) return;
    userOffset += PAGE_SIZE;
    try {
      const users = await apiGet(`/admin/api/users?limit=${PAGE_SIZE}&offset=${userOffset}`);
      renderUsers(users);
    } catch (e) {
      showBanner(e.message || String(e));
    }
  });

  el('btn-msg-prev').addEventListener('click', async () => {
    msgOffset = Math.max(0, msgOffset - MSG_PAGE_SIZE);
    try {
      await loadChatMessages();
    } catch (e) {
      showBanner(e.message || String(e));
    }
  });

  el('btn-msg-next').addEventListener('click', async () => {
    if (msgOffset + MSG_PAGE_SIZE >= msgTotal) return;
    msgOffset += MSG_PAGE_SIZE;
    try {
      await loadChatMessages();
    } catch (e) {
      showBanner(e.message || String(e));
    }
  });

  el('form-org').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    hideBanner();
    try {
      const fd = new FormData(ev.target);
      const name = String(fd.get('orgName') || '').trim();
      const maxSeats = Number(fd.get('maxSeats'));
      await apiPost('/admin/api/organizations', { name: name || undefined, maxSeats });
      ev.target.reset();
      const ms = ev.target.querySelector('[name="maxSeats"]');
      if (ms) ms.value = '3';
      showBanner('Organização criada.', true);
      await reloadOrgs();
      const dash = await apiGet('/admin/api/dashboard');
      if (dash.overview) renderStats(dash.overview, dash.analytics);
    } catch (e) {
      showBanner(e.message || String(e));
    }
  });

  el('orgs-list').addEventListener('click', async (ev) => {
    const addBtn = ev.target.closest('[data-org-add]');
    const remBtn = ev.target.closest('[data-org-remove]');
    if (addBtn) {
      hideBanner();
      const orgId = addBtn.getAttribute('data-org-add');
      const card = addBtn.closest('.org-card');
      const input = card?.querySelector('.org-phone-input');
      const phone = String(input?.value || '').trim();
      if (!phone) {
        showBanner('Informe o telefone com DDI (ex.: +5511999999999).');
        return;
      }
      try {
        await apiPost(`/admin/api/organizations/${orgId}/seats`, { phone });
        if (input) input.value = '';
        showBanner('Número adicionado.', true);
        await reloadOrgs();
        const users = await apiGet(`/admin/api/users?limit=${PAGE_SIZE}&offset=${userOffset}`);
        renderUsers(users);
        const dash = await apiGet('/admin/api/dashboard');
        if (dash.overview) renderStats(dash.overview, dash.analytics);
      } catch (e) {
        showBanner(e.message || String(e));
      }
      return;
    }
    if (remBtn) {
      hideBanner();
      const orgId = remBtn.getAttribute('data-org-remove');
      const phone = remBtn.getAttribute('data-phone');
      try {
        await apiDeleteJson(`/admin/api/organizations/${orgId}/seats`, { phone });
        showBanner('Assento removido.', true);
        await reloadOrgs();
        const users = await apiGet(`/admin/api/users?limit=${PAGE_SIZE}&offset=${userOffset}`);
        renderUsers(users);
        const dash = await apiGet('/admin/api/dashboard');
        if (dash.overview) renderStats(dash.overview, dash.analytics);
      } catch (e) {
        showBanner(e.message || String(e));
      }
    }
  });

  el('users-body').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-user-paid]');
    if (!btn) return;
    hideBanner();
    const userId = btn.getAttribute('data-user-paid');
    const nextPaid = btn.getAttribute('data-paid-next') === 'true';
    try {
      await apiPatch(`/admin/api/users/${userId}`, { isPaid: nextPaid });
      showBanner(nextPaid ? 'Marcado como pago (pessoal).' : 'Usuário grátis.', true);
      const users = await apiGet(`/admin/api/users?limit=${PAGE_SIZE}&offset=${userOffset}`);
      renderUsers(users);
      const dash = await apiGet('/admin/api/dashboard');
      if (dash.overview) renderStats(dash.overview, dash.analytics);
      renderBillingBreakdown(dash.analytics);
    } catch (e) {
      showBanner(e.message || String(e));
    }
  });

  const btnPlanSave = el('btn-plan-catalog-save');
  if (btnPlanSave) {
    btnPlanSave.addEventListener('click', async () => {
      hideBanner();
      const ta = el('plan-catalog-editor');
      if (!ta) return;
      let body;
      try {
        body = JSON.parse(ta.value || '{}');
      } catch {
        showBanner('JSON inválido no editor de planos.');
        return;
      }
      try {
        const out = await apiPut('/admin/api/plan-catalog', {
          version: body.version,
          plans: body.plans,
          notes: body.notes,
        });
        if (out.catalog) renderPlanRef(out.catalog);
        showBanner('Catálogo salvo no banco.', true);
        await loadPlanCatalogEditor();
      } catch (e) {
        showBanner(e.message || String(e));
      }
    });
  }

  const btnPlanReload = el('btn-plan-catalog-reload');
  if (btnPlanReload) {
    btnPlanReload.addEventListener('click', async () => {
      hideBanner();
      try {
        await loadPlanCatalogEditor();
        const plans = await apiPlansPublic();
        renderPlanRef(plans);
        showBanner('Catálogo recarregado.', true);
      } catch (e) {
        showBanner(e.message || String(e));
      }
    });
  }

  const {
    data: { session: bootSession },
  } = await supabase.auth.getSession();
  if (bootSession?.access_token) {
    showDash();
    userOffset = 0;
    msgOffset = 0;
    await loadDashboard(bootSession.access_token);
  } else {
    showLogin();
  }
}

init().catch((err) => {
  console.error('[admin]', err);
  const b = document.getElementById('banner');
  if (b) {
    b.textContent = `Erro ao iniciar o painel: ${err?.message || String(err)}`;
    b.hidden = false;
    b.classList.remove('ok');
  }
});
