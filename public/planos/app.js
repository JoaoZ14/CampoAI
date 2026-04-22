function byId(id) {
  return document.getElementById(id);
}

/** @type {Array<Record<string, unknown>> | null} */
let cachedCatalogPlans = null;

/** @type {'personal'|'company'} */
let activeSegmentTab = 'personal';

/** Fallback se /api/plans falhar (só personal). */
const PLAN_CONTENT = {
  basic: {
    name: 'Básico',
    monthly: 29,
    benefits: [
      '30 análises/mês',
      'Acesso a notícias do agro',
      'Ideal para começar',
    ],
    summary: 'Plano simples para iniciar com segurança.',
  },
  pro: {
    name: 'PRO',
    monthly: 59,
    badge: 'Mais escolhido',
    benefits: [
      '100 análises/mês',
      'Recomendações mais completas',
      'Personalização por tipo de produção',
      'Histórico de análises',
      'Ideal para produtores ativos',
    ],
    summary: 'Melhor custo-benefício para quem usa no dia a dia.',
  },
  premium: {
    name: 'Premium',
    monthly: 119,
    benefits: [
      'Uso intensivo (com política justa)',
      'Prioridade nas respostas',
      'Análises avançadas',
      'Suporte prioritário',
      'Ideal para uso profissional',
    ],
    summary: 'Para operação profissional e ritmo mais intenso.',
  },
};

function buildStaticFallbackPlans() {
  return ['basic', 'pro', 'premium'].map((code) => {
    const p = PLAN_CONTENT[code];
    return {
      code,
      customerSegment: 'personal',
      name: p.name,
      priceBrl: p.monthly,
      summary: p.summary,
      bullets: p.benefits,
      highlight: code === 'pro',
    };
  });
}

function plansForRender() {
  return cachedCatalogPlans?.length ? cachedCatalogPlans : buildStaticFallbackPlans();
}

function planSegmentFromRow(p) {
  return p.customerSegment === 'company' ? 'company' : 'personal';
}

function filteredPlansForTab() {
  return plansForRender().filter((p) => planSegmentFromRow(p) === activeSegmentTab);
}

function syncSegmentTabs() {
  const personal = byId('tab-personal');
  const company = byId('tab-company');
  if (!personal || !company) return;
  const isPersonal = activeSegmentTab === 'personal';
  personal.classList.toggle('is-active', isPersonal);
  company.classList.toggle('is-active', !isPersonal);
  personal.setAttribute('aria-selected', isPersonal ? 'true' : 'false');
  company.setAttribute('aria-selected', !isPersonal ? 'true' : 'false');
}

function setSegmentTab(segment) {
  const next = segment === 'company' ? 'company' : 'personal';
  if (activeSegmentTab === next) return;
  activeSegmentTab = next;
  const curSeg = byId('customerType')?.value;
  if (curSeg && curSeg !== activeSegmentTab) {
    applySelectedPlan('', '');
  }
  syncSegmentTabs();
  renderPlans();
}

function getText(fd, key) {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
}

function showFeedback(msg, isError = false) {
  const el = byId('feedback');
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('error');
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle('error', Boolean(isError));
}

async function apiGet(path) {
  const res = await fetch(path, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Falha ao carregar dados.');
  return json;
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Não foi possível enviar.');
  return json;
}

function formatPrice(monthly, annualMode) {
  if (!annualMode) return { price: monthly, period: 'mês' };
  const discounted = Math.round(monthly * 0.8 * 12);
  return { price: discounted, period: 'ano' };
}

function escHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const PLAN_SUMMARY_EMPTY =
  'Escolha a aba Pessoal ou Empresa e toque em “Assinar agora” no card do plano desejado.';

function enterCheckout() {
  const merch = byId('plans-merchandise');
  const panel = byId('checkout-panel');
  if (!merch || !panel) return;
  merch.hidden = true;
  panel.hidden = false;
  document.body.classList.add('checkout-flow-active');
}

function exitCheckout() {
  const merch = byId('plans-merchandise');
  const panel = byId('checkout-panel');
  if (!merch || !panel) return;
  merch.hidden = false;
  panel.hidden = true;
  document.body.classList.remove('checkout-flow-active');
}

function highlightPlanCard(code, segment) {
  const target = byId('plan-grid');
  if (!target) return;
  target.querySelectorAll('.plan-card').forEach((card) => {
    card.classList.remove('is-selected');
  });
  if (!code || !segment) return;
  const btn = target.querySelector(
    `.plan-cta[data-plan-code="${code}"][data-customer-segment="${segment}"]`
  );
  const card = btn?.closest('.plan-card');
  if (card) card.classList.add('is-selected');
}

function planLabelFromCache(code, segment) {
  const list = plansForRender();
  const hit = list.find((p) => p.code === code && p.customerSegment === segment);
  if (hit?.name) return String(hit.name);
  return code;
}

/**
 * @param {string} code
 * @param {string} segment personal | company
 * @param {{ silent?: boolean; fromUserClick?: boolean }} [opts]
 */
function applySelectedPlan(code, segment, opts = {}) {
  const { silent = false, fromUserClick = false } = opts;
  const planInput = byId('planCode');
  const typeInput = byId('customerType');
  const summary = byId('plan-selected-summary');
  if (!planInput || !typeInput || !summary) return;

  if (!code || !segment) {
    planInput.value = '';
    typeInput.value = '';
    summary.textContent = PLAN_SUMMARY_EMPTY;
    highlightPlanCard('', '');
    refreshCompanyFields();
    exitCheckout();
    return;
  }

  if (fromUserClick && !silent) {
    showFeedback();
  }

  planInput.value = code;
  typeInput.value = segment;
  const label = planLabelFromCache(code, segment);
  const doc =
    segment === 'company'
      ? 'Contrato em nome de empresa (CNPJ)'
      : 'Pagamento e titularidade em CPF (produtor ou família)';
  summary.textContent = `Plano: ${label} — ${doc}`;
  highlightPlanCard(code, segment);
  refreshCompanyFields();

  if (fromUserClick && !silent) {
    enterCheckout();
    setStep(2);
    requestAnimationFrame(() => {
      byId('phone')?.focus();
      byId('checkout-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function renderPlans() {
  const target = byId('plan-grid');
  const annualMode = byId('billing-toggle-btn').getAttribute('aria-pressed') === 'true';
  const list = filteredPlansForTab();
  const prevCode = byId('planCode')?.value || '';
  const prevSeg = byId('customerType')?.value || '';

  if (!list.length) {
    target.innerHTML =
      '<p class="plan-grid-empty muted">Nenhum plano disponível nesta aba no momento.</p>';
    return;
  }

  target.innerHTML = list
    .map((raw) => {
      const p = /** @type {Record<string, unknown>} */ (raw);
      const code = String(p.code ?? '');
      const segment = p.customerSegment === 'company' ? 'company' : 'personal';
      const name = escHtml(String(p.name ?? code));
      const priceBrl = Number(p.priceBrl);
      const pricing = formatPrice(Number.isFinite(priceBrl) ? priceBrl : 0, annualMode);
      const bullets = Array.isArray(p.bullets) ? p.bullets : [];
      const benefits = bullets.map((b) => `<li>${escHtml(String(b))}</li>`).join('');
      const featured = p.highlight ? ' featured' : '';
      const badge =
        p.highlight && segment === 'personal' && code === 'pro'
          ? '<p class="plan-badge">Mais escolhido</p>'
          : '';
      const audience =
        activeSegmentTab === 'company'
          ? 'Contrato em CNPJ: nota fiscal e cadastro com dados da empresa.'
          : 'Titular em CPF: produtor, família ou time no mesmo padrão de uso.';
      const sum = escHtml(String(p.summary ?? ''));
      return `<article class="plan-card${featured}">
        ${badge}
        <p class="plan-audience">${audience}</p>
        <h3>${name}</h3>
        <p class="price">R$ ${pricing.price}</p>
        <p class="period">/ ${pricing.period}</p>
        <p class="summary">${sum}</p>
        <ul class="benefits">${benefits}</ul>
        <button class="plan-cta" type="button" data-plan-code="${code}" data-customer-segment="${segment}">Assinar agora</button>
      </article>`;
    })
    .join('');

  target.querySelectorAll('.plan-cta').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = String(btn.dataset.planCode || '');
      const segment = String(btn.dataset.customerSegment || 'personal');
      applySelectedPlan(code, segment, { fromUserClick: true });
    });
  });

  if (prevCode && prevSeg) {
    applySelectedPlan(prevCode, prevSeg, { silent: true });
  }
}

function setStep(step) {
  const n = step == null || step === '' ? NaN : Number(step);
  document.querySelectorAll('[data-step]').forEach((el) => {
    el.hidden = !Number.isFinite(n) || Number(el.dataset.step) !== n;
  });
}

function refreshCompanyFields() {
  const isCompany = byId('customerType').value === 'company';
  const companyBlocks = document.querySelectorAll('.company-only');
  companyBlocks.forEach((n) => {
    n.hidden = !isCompany;
    n.querySelectorAll('input').forEach((i) => {
      i.required = isCompany;
    });
  });
}

function bindFlow() {
  const form = byId('flow-form');
  const toggleBtn = byId('billing-toggle-btn');
  const state = { verificationToken: '' };

  byId('tab-personal')?.addEventListener('click', () => setSegmentTab('personal'));
  byId('tab-company')?.addEventListener('click', () => setSegmentTab('company'));
  syncSegmentTabs();

  toggleBtn.addEventListener('click', () => {
    const next = toggleBtn.getAttribute('aria-pressed') !== 'true';
    toggleBtn.setAttribute('aria-pressed', String(next));
    renderPlans();
  });

  refreshCompanyFields();

  byId('back-to-plans')?.addEventListener('click', () => {
    state.verificationToken = '';
    form.reset();
    applySelectedPlan('', '');
    setStep(null);
    showFeedback();
  });

  byId('send-otp').addEventListener('click', async () => {
    const fd = new FormData(form);
    try {
      const out = await apiPost('/api/billing/otp/send', {
        phone: getText(fd, 'phone'),
        planCode: getText(fd, 'planCode'),
        customerType: getText(fd, 'customerType'),
      });
      showFeedback(`Código enviado para ${out.phone}. Confira seu WhatsApp.`);
      setStep(3);
    } catch (e) {
      showFeedback(e.message || String(e), true);
    }
  });

  byId('verify-otp').addEventListener('click', async () => {
    const fd = new FormData(form);
    try {
      const out = await apiPost('/api/billing/otp/verify', {
        phone: getText(fd, 'phone'),
        planCode: getText(fd, 'planCode'),
        customerType: getText(fd, 'customerType'),
        code: getText(fd, 'otpCode'),
      });
      state.verificationToken = out.verificationToken;
      showFeedback('Telefone validado com sucesso. Agora finalize o pagamento.');
      refreshCompanyFields();
      setStep(4);
    } catch (e) {
      showFeedback(e.message || String(e), true);
    }
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    try {
      if (!state.verificationToken) {
        throw new Error('Valide o código do WhatsApp antes de pagar.');
      }

      await apiPost('/api/billing/requests', {
        customerType: getText(fd, 'customerType'),
        planCode: getText(fd, 'planCode'),
        name: getText(fd, 'name'),
        phone: getText(fd, 'phone'),
        password: getText(fd, 'password'),
        companyName: getText(fd, 'companyName'),
        cnpj: getText(fd, 'cnpj'),
        contactName: getText(fd, 'contactName'),
        email: getText(fd, 'email'),
        notes: '',
      });

      const out = await apiPost('/api/billing/checkout', {
        verificationToken: state.verificationToken,
        planCode: getText(fd, 'planCode'),
        customerType: getText(fd, 'customerType'),
        phone: getText(fd, 'phone'),
        name: getText(fd, 'name'),
        email: getText(fd, 'email'),
        cpfCnpj: getText(fd, 'cpfCnpj'),
        creditCard: {
          holderName: getText(fd, 'ccHolder'),
          number: getText(fd, 'ccNumber'),
          expiryMonth: getText(fd, 'ccExpMonth'),
          expiryYear: getText(fd, 'ccExpYear'),
          ccv: getText(fd, 'ccCvv'),
        },
        creditCardHolderInfo: {
          name: getText(fd, 'name'),
          email: getText(fd, 'email'),
          cpfCnpj: getText(fd, 'cpfCnpj'),
          postalCode: getText(fd, 'postalCode'),
          addressNumber: getText(fd, 'addressNumber'),
          addressComplement: getText(fd, 'addressComplement'),
          mobilePhone: getText(fd, 'phone'),
        },
      });

      showFeedback(
        `Assinatura criada com sucesso (status: ${out.status}). A confirmação foi enviada no seu WhatsApp.`
      );
      form.reset();
      state.verificationToken = '';
      applySelectedPlan('', '');
      refreshCompanyFields();
      setStep(null);
    } catch (e) {
      showFeedback(e.message || String(e), true);
    }
  });
}

async function init() {
  try {
    const payload = await apiGet('/api/plans');
    cachedCatalogPlans = Array.isArray(payload.plans) ? payload.plans : null;
    renderPlans();
  } catch (e) {
    showFeedback(`Não consegui carregar os planos: ${e.message || e}`, true);
    cachedCatalogPlans = null;
    renderPlans();
  }
  bindFlow();
  setStep(null);

  const qs = new URLSearchParams(globalThis.location.search);
  const prePhone = qs.get('phone');
  if (prePhone) byId('phone').value = prePhone;
}

await init();
