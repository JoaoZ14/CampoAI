import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const PAGE_SIZE = 50;

let supabase = null;
let userOffset = 0;
let userTotal = 0;

const el = (id) => document.getElementById(id);

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

function authHeader() {
  return supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  });
}

async function apiGet(path) {
  const headers = await authHeader();
  const res = await fetch(path, { headers: { ...headers } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error || res.statusText || 'Erro na API';
    throw new Error(msg);
  }
  return json;
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

function renderStats(data) {
  const grid = el('stats-grid');
  const items = [
    ['Usuários', data.totalUsers],
    ['Pagos', data.paidUsers],
    ['Gratuitos', data.freeUsers],
    ['Novos (7 dias)', data.newLast7Days],
    ['Bloqueados (cota)', data.blockedFreeTier],
    ['Limite gratuito', String(data.freeUsageLimit)],
    ['Soma uso (IA)', data.totalUsageSum],
  ];
  grid.innerHTML = items
    .map(
      ([label, value]) =>
        `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`
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
          <td>${fmtDate(u.createdAt)}</td>
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadDashboard() {
  const overview = await apiGet('/admin/api/overview');
  renderStats(overview);
  renderIntegrations(overview.integrations || {});

  const users = await apiGet(
    `/admin/api/users?limit=${PAGE_SIZE}&offset=${userOffset}`
  );
  renderUsers(users);
}

function showLogin() {
  el('view-login').hidden = false;
  el('view-dash').hidden = true;
  el('btn-logout').hidden = true;
}

function showDash() {
  el('view-login').hidden = true;
  el('view-dash').hidden = false;
  el('btn-logout').hidden = false;
}

async function init() {
  hideBanner();

  const cfgRes = await fetch('/admin/api/config');
  const cfg = await cfgRes.json();
  if (!cfg.ok) {
    showBanner(cfg.error || 'Config indisponível.');
    return;
  }

  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Só login e-mail/senha; evita redirects extras com hash na URL.
      detectSessionInUrl: false,
    },
  });

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'TOKEN_REFRESHED') return;

    if (event === 'INITIAL_SESSION') {
      if (session) {
        try {
          showDash();
          userOffset = 0;
          await loadDashboard();
        } catch (e) {
          showBanner(e.message || String(e));
          await supabase.auth.signOut();
          showLogin();
        }
      } else {
        showLogin();
      }
      return;
    }

    if (event === 'SIGNED_IN' && session) {
      try {
        hideBanner();
        showDash();
        userOffset = 0;
        await loadDashboard();
      } catch (e) {
        showBanner(e.message || String(e));
        await supabase.auth.signOut();
        showLogin();
      }
    }

    if (event === 'SIGNED_OUT') {
      showLogin();
    }
  });
}

el('form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  hideBanner();
  const fd = new FormData(ev.target);
  const email = String(fd.get('email') || '').trim();
  const password = String(fd.get('password') || '');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showBanner(error.message);
    return;
  }
});

el('btn-logout').addEventListener('click', async () => {
  await supabase.auth.signOut();
  hideBanner();
});

el('btn-prev').addEventListener('click', async () => {
  userOffset = Math.max(0, userOffset - PAGE_SIZE);
  try {
    const users = await apiGet(
      `/admin/api/users?limit=${PAGE_SIZE}&offset=${userOffset}`
    );
    renderUsers(users);
  } catch (e) {
    showBanner(e.message || String(e));
  }
});

el('btn-next').addEventListener('click', async () => {
  if (userOffset + PAGE_SIZE >= userTotal) return;
  userOffset += PAGE_SIZE;
  try {
    const users = await apiGet(
      `/admin/api/users?limit=${PAGE_SIZE}&offset=${userOffset}`
    );
    renderUsers(users);
  } catch (e) {
    showBanner(e.message || String(e));
  }
});

init();
