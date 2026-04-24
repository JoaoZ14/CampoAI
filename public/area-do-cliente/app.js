const tokenKey = 'ag_customer_token';

function byId(id) {
  return document.getElementById(id);
}

function setFeedback(msg = '', isError = false) {
  const el = byId('feedback');
  el.textContent = msg;
  el.style.color = isError ? '#b42318' : '#027a48';
}

async function api(path, opts = {}) {
  const token = localStorage.getItem(tokenKey) || '';
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...opts, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || json.message || `Erro ${res.status}`);
  return json;
}

function renderSeats(org) {
  const list = byId('seat-list');
  list.innerHTML = '';
  for (const seat of org?.seats || []) {
    if (!seat.active) continue;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Remover';
    btn.addEventListener('click', async () => {
      try {
        await api('/api/customer/seats', {
          method: 'DELETE',
          body: JSON.stringify({ phone: seat.phone }),
        });
        await loadDashboard();
        setFeedback(`Numero ${seat.phone} removido.`);
      } catch (e) {
        setFeedback(e.message || String(e), true);
      }
    });
    li.textContent = `${seat.phone} `;
    li.appendChild(btn);
    list.appendChild(li);
  }
}

async function loadDashboard() {
  const out = await api('/api/customer/me');
  byId('login-card').hidden = true;
  byId('dashboard-card').hidden = false;
  byId('summary').textContent = JSON.stringify(
    {
      perfil: out.profile,
      plano: out.plan,
      uso: out.usage,
      organizacao: out.organization
        ? {
            id: out.organization.id,
            nome: out.organization.name,
            maxSeats: out.organization.maxSeats,
            totalAtivos: (out.organization.seats || []).filter((s) => s.active).length,
          }
        : null,
    },
    null,
    2
  );

  const canManageSeats = Boolean(out.organization?.id && out.profile?.billingKind === 'team');
  byId('seats-card').hidden = !canManageSeats;
  if (canManageSeats) renderSeats(out.organization);
}

byId('login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    const out = await api('/api/customer/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: byId('email').value.trim(),
        password: byId('password').value,
      }),
    });
    localStorage.setItem(tokenKey, out.token);
    await loadDashboard();
    setFeedback('Login realizado com sucesso.');
  } catch (e) {
    setFeedback(e.message || String(e), true);
  }
});

byId('logout-btn').addEventListener('click', () => {
  localStorage.removeItem(tokenKey);
  byId('dashboard-card').hidden = true;
  byId('seats-card').hidden = true;
  byId('login-card').hidden = false;
  setFeedback('Sessao encerrada.');
});

byId('seat-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    const phone = byId('seat-phone').value.trim();
    await api('/api/customer/seats', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
    byId('seat-phone').value = '';
    await loadDashboard();
    setFeedback('Numero adicionado.');
  } catch (e) {
    setFeedback(e.message || String(e), true);
  }
});

if (localStorage.getItem(tokenKey)) {
  loadDashboard().catch(() => {
    localStorage.removeItem(tokenKey);
    setFeedback('Sessao expirada. Faça login novamente.', true);
  });
}
