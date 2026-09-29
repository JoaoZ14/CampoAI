import { loadRural } from './rural.js';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  getSession,
  initCustomerSupabase,
  signOutCustomer,
} from '../shared/supabaseAuth.js';

function byId(id) {
  return document.getElementById(id);
}

function onlyDigits(s) {
  return String(s ?? '').replaceAll(/\D/g, '');
}

function formatPhoneDisplay(raw) {
  let d = onlyDigits(raw);
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatCpfDisplay(raw) {
  const d = onlyDigits(raw).slice(0, 11);
  if (!d) return '';
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function showFeedback(msg = '', isError = false) {
  const el = byId('feedback');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('is-error');
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle('is-error', isError);
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

function billingLabel(kind) {
  if (kind === 'team') return 'Empresa / equipe';
  if (kind === 'personal') return 'Pessoal (CPF)';
  return 'Trial grátis';
}

function usageText(out) {
  const u = out.usage || {};
  if (!u.isPaid) {
    const used = Number(u.usageCount) || 0;
    const reason = u.trialExpiryReason;
    if (reason === 'usage') return `${used} análises — limite do teste atingido`;
    if (reason === 'time') return 'Período de teste encerrado';
    return `${used} análises no teste grátis`;
  }
  if (u.monthlyAnalysisCap != null && u.monthlyAnalysisCap >= 1) {
    return `${u.monthlyAnalysisUsed} de ${u.monthlyAnalysisCap} análises neste mês`;
  }
  return 'Análises ilimitadas (uso justo)';
}

function renderPlan(out) {
  const dl = byId('plan-dl');
  if (!dl) return;
  const p = out.profile || {};
  const plan = out.plan;
  const rows = [
    ['Situação', p.isPaid ? 'Assinante' : 'Teste grátis'],
    ['Plano', plan?.name || (p.isPaid ? p.subscriptionPlanCode || '—' : 'Trial')],
    ['Titularidade', billingLabel(p.billingKind)],
    ['Uso', usageText(out)],
  ];
  if (!p.isPaid && p.trialEndsAt) {
    rows.push(['Trial até', fmtDate(p.trialEndsAt)]);
  }
  if (p.isPaid) {
    rows.push(['Status Asaas', p.asaasSubscriptionStatus || '—']);
  }
  dl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

function renderProfile(out, accountEmail) {
  const p = out.profile || {};
  byId('portal-email').textContent = accountEmail || p.email || '';
  byId('profile-name').value = p.name || '';
  byId('profile-phone').value = formatPhoneDisplay(p.phone) || p.phone || '';
  byId('profile-email').value = p.email || accountEmail || '';
  byId('profile-cpf').value = formatCpfDisplay(p.cpf || '');
}

function renderSeats(out) {
  const can = Boolean(out.organization?.id && out.profile?.billingKind === 'team');
  byId('seats-card').hidden = !can;
  if (!can) return;
  const list = byId('seat-list');
  list.innerHTML = '';
  for (const seat of out.organization?.seats || []) {
    if (!seat.active) continue;
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = seat.phone;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-secondary';
    btn.textContent = 'Remover';
    btn.addEventListener('click', async () => {
      try {
        await apiDelete('/api/customer/seats', { phone: seat.phone });
        await loadDashboard();
        showFeedback(`Número ${seat.phone} removido.`);
      } catch (e) {
        showFeedback(e.message || String(e), true);
      }
    });
    li.append(span, btn);
    list.appendChild(li);
  }
}

async function loadDashboard() {
  const out = await apiGet('/api/customer/me');
  if (!out.linked) {
    byId('dashboard-card').hidden = true;
    byId('link-card').hidden = false;
    return;
  }
  byId('link-card').hidden = true;
  byId('dashboard-card').hidden = false;
  renderPlan(out);
  renderProfile(out, out.email);
  renderSeats(out);
  void loadRural();
}

const linkState = { verificationToken: '' };

byId('link-phone')?.addEventListener('input', () => {
  byId('link-phone').value = formatPhoneDisplay(byId('link-phone').value);
});

byId('link-send-otp')?.addEventListener('click', async () => {
  const phone = onlyDigits(byId('link-phone')?.value);
  if (phone.length < 10) {
    showFeedback('Informe um WhatsApp válido.', true);
    return;
  }
  try {
    const out = await apiPost('/api/signup/otp/send', { phone });
    linkState.verificationToken = '';
    byId('link-otp-wrap').hidden = false;
    byId('link-confirm').hidden = false;
    showFeedback(`Código enviado para ${formatPhoneDisplay(out.phone || phone)}.`);
  } catch (e) {
    showFeedback(e.message || String(e), true);
  }
});

byId('link-form')?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const phone = onlyDigits(byId('link-phone')?.value);
  const code = onlyDigits(byId('link-otp')?.value);
  try {
    if (!linkState.verificationToken) {
      if (code.length !== 6) throw new Error('Digite o código de 6 dígitos.');
      const verified = await apiPost('/api/signup/otp/verify', { phone, code });
      linkState.verificationToken = verified.verificationToken;
    }
    await apiPost('/api/customer/link-phone', {
      phone,
      verificationToken: linkState.verificationToken,
    });
    showFeedback('WhatsApp vinculado.');
    await loadDashboard();
  } catch (e) {
    showFeedback(e.message || String(e), true);
  }
});

byId('profile-cpf')?.addEventListener('input', () => {
  byId('profile-cpf').value = formatCpfDisplay(byId('profile-cpf').value);
});

byId('profile-form')?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await apiPatch('/api/customer/profile', {
      name: byId('profile-name').value.trim(),
      cpf: onlyDigits(byId('profile-cpf').value),
    });
    showFeedback('Dados salvos.');
    await loadDashboard();
  } catch (e) {
    showFeedback(e.message || String(e), true);
  }
});

byId('seat-form')?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await apiPost('/api/customer/seats', { phone: byId('seat-phone').value.trim() });
    byId('seat-phone').value = '';
    await loadDashboard();
    showFeedback('Número adicionado.');
  } catch (e) {
    showFeedback(e.message || String(e), true);
  }
});

byId('logout-btn')?.addEventListener('click', async () => {
  await signOutCustomer();
  window.location.replace('/entrar?next=/area-do-cliente');
});

initCustomerSupabase()
  .then(async () => {
    const session = await getSession();
    if (!session) {
      window.location.replace('/entrar?next=/area-do-cliente');
      return;
    }
    await loadDashboard();
  })
  .catch((e) => {
    showFeedback(e.message || String(e), true);
  });
