import { getPlanIconSvg } from './planIcons.js';

function byId(id) {
  return document.getElementById(id);
}

/** @type {Array<Record<string, unknown>> | null} */
let cachedCatalogPlans = null;

/** @type {'personal'|'company'} */
let activeSegmentTab = 'personal';

/** Evita cliques repetidos (planos, OTP, finalizar). */
let flowInteractionLock = false;

/** Fallback se /api/plans falhar (alinhado à oferta atual: PF dois níveis + PJ). */
const PLAN_CONTENT = {
  lite: {
    name: 'Essencial',
    monthly: 29,
    benefits: [
      'Até 35 análises com IA por mês (renova no mês civil, horário de Brasília)',
      'Um número de WhatsApp',
      'Conteúdo técnico em linguagem clara; calc ajuda integrada',
    ],
    summary: 'Entrada com custo menor: teto mensal claro antes de ir para o Starter ilimitado.',
  },
  basic: {
    name: 'Starter',
    monthly: 49,
    benefits: [
      'Um número com análises ilimitadas (política de uso justo)',
      'Respostas técnicas em linguagem clara; calc ajuda integrada',
      'Memória da conversa conforme o servidor',
    ],
    summary: 'Ponto de entrada: custo fixo mensal e um WhatsApp para validar o produto no seu ritmo.',
  },
  premium: {
    name: 'Team',
    monthly: 119,
    benefits: [
      'Até 3 números na mesma assinatura',
      'Um titular; você distribui o acesso à equipe ou família',
      'Mesmo padrão de resposta para todos os números',
    ],
    summary: 'Quando mais de uma pessoa precisa do assistente no mesmo contrato.',
  },
};

const COMPANY_FALLBACK_PLAN = {
  code: 'premium',
  customerSegment: 'company',
  name: 'Business',
  priceBrl: 199,
  summary:
    'Assinatura em CNPJ: até 5 números, cadastro e faturamento empresariais, NF quando aplicável.',
  bullets: [
    'Até 5 números vinculados ao contrato empresarial',
    'Cadastro e cobrança alinhados ao CNPJ',
    'Mesmo nível de serviço para a equipe',
  ],
  highlight: true,
};

function buildStaticFallbackPlans() {
  const personal = ['lite', 'basic', 'premium'].map((code) => {
    const p = PLAN_CONTENT[code];
    return {
      code,
      customerSegment: 'personal',
      name: p.name,
      priceBrl: p.monthly,
      summary: p.summary,
      bullets: p.benefits,
      highlight: code === 'basic',
      seats: code === 'lite' ? 1 : code === 'premium' ? 3 : 1,
    };
  });
  return [...personal, COMPANY_FALLBACK_PLAN];
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

function onlyDigits(s) {
  return String(s ?? '').replaceAll(/\D/g, '');
}

/** Espaços colapsados e bordas limpas (nomes, endereço). */
function normalizeSpaces(s) {
  return String(s ?? '')
    .replaceAll(/\s+/g, ' ')
    .trim();
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

function formatCnpjDisplay(raw) {
  const d = onlyDigits(raw).slice(0, 14);
  if (!d) return '';
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatCepDisplay(raw) {
  const d = onlyDigits(raw).slice(0, 8);
  if (!d) return '';
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatCardNumberDisplay(raw) {
  const d = onlyDigits(raw).slice(0, 19);
  if (!d) return '';
  const parts = [];
  for (let i = 0; i < d.length; i += 4) parts.push(d.slice(i, i + 4));
  return parts.join(' ');
}

function formatOtpDisplay(raw) {
  return onlyDigits(raw).slice(0, 6);
}

function formatExpMonthDigits(raw) {
  return onlyDigits(raw).slice(0, 2);
}

function formatExpYearDigits(raw) {
  return onlyDigits(raw).slice(0, 4);
}

function formatCvvDigits(raw) {
  return onlyDigits(raw).slice(0, 4);
}

function clampMonthStr(raw) {
  const d = onlyDigits(raw).slice(0, 2);
  if (!d) return '';
  let m = Number.parseInt(d, 10);
  if (!Number.isFinite(m) || m < 1) m = 1;
  if (m > 12) m = 12;
  return String(m).padStart(2, '0');
}

function padExpMonthForSubmit(s) {
  const d = onlyDigits(s).slice(0, 2);
  if (!d) return '';
  return d.length === 1 ? `0${d}` : d;
}

function normalizeExpYearForSubmit(s) {
  const d = onlyDigits(s);
  if (d.length === 2) return `20${d}`;
  return d.slice(0, 4);
}

function wireInputMask(id, formatFn) {
  const el = byId(id);
  if (!el) return;
  el.addEventListener('input', () => {
    const next = formatFn(el.value);
    if (el.value !== next) el.value = next;
  });
}

function wireBlurNormalize(id, fn) {
  const el = byId(id);
  if (!el) return;
  el.addEventListener('blur', () => {
    el.value = fn(el.value);
  });
}

function wireSubscriptionFormatting() {
  wireInputMask('phone', formatPhoneDisplay);
  wireInputMask('otpCode', formatOtpDisplay);
  wireInputMask('cpfCnpj', formatCpfDisplay);
  wireInputMask('cnpj', formatCnpjDisplay);
  wireInputMask('ccNumber', formatCardNumberDisplay);
  wireInputMask('postalCode', formatCepDisplay);

  const ccMonth = byId('ccExpMonth');
  if (ccMonth) {
    ccMonth.addEventListener('input', () => {
      const next = formatExpMonthDigits(ccMonth.value);
      if (ccMonth.value !== next) ccMonth.value = next;
    });
    ccMonth.addEventListener('blur', () => {
      if (!onlyDigits(ccMonth.value)) return;
      ccMonth.value = clampMonthStr(ccMonth.value);
    });
  }

  const ccYear = byId('ccExpYear');
  if (ccYear) {
    ccYear.addEventListener('input', () => {
      const next = formatExpYearDigits(ccYear.value);
      if (ccYear.value !== next) ccYear.value = next;
    });
    ccYear.addEventListener('blur', () => {
      const d = onlyDigits(ccYear.value);
      if (d.length === 2) ccYear.value = `20${d}`;
    });
  }

  wireInputMask('ccCvv', formatCvvDigits);

  wireBlurNormalize('name', normalizeSpaces);
  wireBlurNormalize('companyName', normalizeSpaces);
  wireBlurNormalize('contactName', normalizeSpaces);
  wireBlurNormalize('ccHolder', normalizeSpaces);
  wireBlurNormalize('addressNumber', normalizeSpaces);
  wireBlurNormalize('addressComplement', normalizeSpaces);

  const emailEl = byId('email');
  if (emailEl) {
    emailEl.addEventListener('blur', () => {
      emailEl.value = emailEl.value.trim().toLowerCase();
    });
  }
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

/** Alinhado a `src/config/billing.js` (ANNUAL_DISCOUNT_FRACTION = 0,2). */
function formatPrice(monthly, annualMode) {
  if (!annualMode) return { price: monthly, period: 'mês' };
  const discounted = Math.round(monthly * (1 - 0.2) * 12);
  return { price: discounted, period: 'ano' };
}

function escHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Alinha bullets ao `seats` do plano (ex.: Business 5 vs catálogo JSON ainda com 3). */
function bulletsAlignedToSeats(bullets, seats) {
  const arr = Array.isArray(bullets) ? bullets : [];
  if (!Number.isFinite(seats) || seats < 1) return arr;
  return arr.map((b) =>
    String(b)
      .replace(/[Aa]té\s+\d+\s+números?\b/g, `Até ${seats} números`)
      .replace(/\b\d+\s+números\s+de\s+WhatsApp\b/gi, `${seats} números de WhatsApp`)
      .replace(/\b\d+\s+números\s+no\s+mesmo\s+plano\b/gi, `${seats} números no mesmo plano`)
  );
}

const PLAN_SUMMARY_EMPTY =
  'Escolha a aba Pessoal ou Empresa e toque em “Assinar agora” no card do plano desejado.';

function enterCheckout() {
  const merch = byId('plans-merchandise');
  const panel = byId('checkout-panel');
  const success = byId('subscription-success');
  if (!merch || !panel) return;
  if (success) success.hidden = true;
  merch.hidden = true;
  panel.hidden = false;
  document.body.classList.add('checkout-flow-active');
}

function exitCheckout() {
  const merch = byId('plans-merchandise');
  const panel = byId('checkout-panel');
  const success = byId('subscription-success');
  if (!merch || !panel) return;
  merch.hidden = false;
  panel.hidden = true;
  if (success) success.hidden = true;
  document.body.classList.remove('checkout-flow-active');
}

function setFlowInteractionLock(locked) {
  flowInteractionLock = locked;
  const form = byId('flow-form');
  if (form) {
    form.querySelectorAll('button').forEach((b) => {
      b.disabled = locked;
    });
  }
  const back = byId('back-to-plans');
  if (back) back.disabled = locked;
  syncPlanCtasLocked();
}

function syncPlanCtasLocked() {
  document.querySelectorAll('.plan-cta').forEach((b) => {
    b.disabled = flowInteractionLock;
  });
  const toggle = byId('billing-toggle-btn');
  if (toggle) toggle.disabled = flowInteractionLock;
  document.querySelectorAll('.segment-tab').forEach((t) => {
    t.disabled = flowInteractionLock;
  });
}

/**
 * @param {Record<string, unknown>} out resposta de /api/billing/checkout
 */
function showSubscriptionSuccess(out) {
  const checkout = byId('checkout-panel');
  const panel = byId('subscription-success');
  const detail = byId('success-plan-detail');
  if (checkout) checkout.hidden = true;
  if (panel) {
    panel.hidden = false;
    const name =
      String(out.planName != null ? out.planName : out.planCode != null ? out.planCode : '')
        .trim() || 'AG Assist';
    const status = String(out.status != null ? out.status : '').trim();
    const due = String(out.nextDueDate != null ? out.nextDueDate : '').trim();
    const cycle =
      String(out.billingCycle || '').toUpperCase() === 'YEARLY' ? 'Cobrança anual' : 'Cobrança mensal';
    if (detail) {
      detail.textContent = `Plano: ${name} — ${cycle}. Status ${status}. Próximo vencimento (referência): ${due}.`;
    }
    requestAnimationFrame(() =>
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  }
  document.body.classList.add('checkout-flow-active');
}

function dismissSubscriptionSuccess() {
  const panel = byId('subscription-success');
  if (panel) panel.hidden = true;
  showFeedback();
  const form = byId('flow-form');
  form?.reset();
  applySelectedPlan('', '');
  setStep(null);
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
  if (fromUserClick && flowInteractionLock) return;
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
    target.className = 'plan-grid';
    return;
  }

  target.className =
    'plan-grid' +
    (list.length === 1 ? ' plan-grid--one' : list.length === 2 ? ' plan-grid--two' : ' plan-grid--many');

  target.innerHTML = list
    .map((raw) => {
      const p = /** @type {Record<string, unknown>} */ (raw);
      const code = String(p.code ?? '');
      const segment = p.customerSegment === 'company' ? 'company' : 'personal';
      const name = escHtml(String(p.name ?? code));
      const priceBrl = Number(p.priceBrl);
      const pricing = formatPrice(Number.isFinite(priceBrl) ? priceBrl : 0, annualMode);
      const seatCap = Number(p.seats);
      const bullets = bulletsAlignedToSeats(Array.isArray(p.bullets) ? p.bullets : [], seatCap);
      const benefits = bullets
        .map(
          (b) =>
            `<li><span class="benefit-check" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>${escHtml(String(b))}</span></li>`
        )
        .join('');
      const featured = p.highlight ? ' featured' : '';
      const badge =
        p.highlight && segment === 'personal' && code === 'basic'
          ? '<span class="plan-badge">Mais escolhido</span>'
          : '';
      const audience =
        activeSegmentTab === 'company'
          ? 'Vários WhatsApp no mesmo contrato, com cobrança e cadastro no CNPJ.'
          : 'Titular em CPF: uso individual ou compartilhado com família no mesmo padrão.';
      const legal =
        segment === 'company'
          ? '<span class="plan-legal-pill">CNPJ</span>'
          : '<span class="plan-legal-pill">CPF</span>';
      const sum = escHtml(String(p.summary ?? ''));
      const iconHtml = getPlanIconSvg(code, segment);
      return `<article class="plan-card${featured}">
        <div class="plan-card-head">
          <div class="plan-icon-wrap">${iconHtml}</div>
          <div class="plan-card-head-meta">
            ${badge ? `<div class="plan-badges">${badge}</div>` : ''}
            ${legal}
          </div>
        </div>
        <h3 class="plan-title">${name}</h3>
        <p class="plan-audience">${audience}</p>
        <div class="plan-price-row">
          <p class="price">R$&nbsp;${pricing.price}</p>
          <p class="period">/${pricing.period}</p>
        </div>
        <p class="summary">${sum}</p>
        <ul class="benefits">${benefits}</ul>
        <button type="button" class="plan-cta" data-plan-code="${code}" data-customer-segment="${segment}">Assinar agora</button>
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
  syncPlanCtasLocked();
}

function setStep(step) {
  const n = step == null || step === '' ? NaN : Number(step);
  document.querySelectorAll('[data-step]').forEach((el) => {
    el.hidden = !Number.isFinite(n) || Number(el.dataset.step) !== n;
  });
  const toggleBtn = byId('billing-toggle-btn');
  if (toggleBtn) {
    const lockBilling = Number.isFinite(n) && n >= 3;
    toggleBtn.disabled = lockBilling || flowInteractionLock;
  }
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
  /** @type {{ verificationToken: string, billingCycle: 'MONTHLY'|'YEARLY' }} */
  const state = { verificationToken: '', billingCycle: 'MONTHLY' };

  wireSubscriptionFormatting();

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
    if (flowInteractionLock) return;
    state.verificationToken = '';
    state.billingCycle = 'MONTHLY';
    form.reset();
    applySelectedPlan('', '');
    setStep(null);
    showFeedback();
  });

  byId('success-done-btn')?.addEventListener('click', () => {
    state.verificationToken = '';
    state.billingCycle = 'MONTHLY';
    dismissSubscriptionSuccess();
    refreshCompanyFields();
  });

  byId('send-otp').addEventListener('click', async () => {
    if (flowInteractionLock) return;
    const fd = new FormData(form);
    setFlowInteractionLock(true);
    try {
      const annualMode = toggleBtn.getAttribute('aria-pressed') === 'true';
      state.billingCycle = annualMode ? 'YEARLY' : 'MONTHLY';
      const out = await apiPost('/api/billing/otp/send', {
        phone: onlyDigits(getText(fd, 'phone')),
        planCode: getText(fd, 'planCode'),
        customerType: getText(fd, 'customerType'),
        billingCycle: state.billingCycle,
      });
      showFeedback(`Código enviado para ${out.phone} por SMS.`);
      setStep(3);
    } catch (e) {
      showFeedback(e.message || String(e), true);
    } finally {
      setFlowInteractionLock(false);
    }
  });

  byId('verify-otp').addEventListener('click', async () => {
    if (flowInteractionLock) return;
    const fd = new FormData(form);
    setFlowInteractionLock(true);
    try {
      const out = await apiPost('/api/billing/otp/verify', {
        phone: onlyDigits(getText(fd, 'phone')),
        planCode: getText(fd, 'planCode'),
        customerType: getText(fd, 'customerType'),
        code: onlyDigits(getText(fd, 'otpCode')),
        billingCycle: state.billingCycle,
      });
      state.verificationToken = out.verificationToken;
      showFeedback('Telefone validado com sucesso. Agora finalize o pagamento.');
      refreshCompanyFields();
      setStep(4);
    } catch (e) {
      showFeedback(e.message || String(e), true);
    } finally {
      setFlowInteractionLock(false);
    }
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (flowInteractionLock) return;
    const fd = new FormData(form);
    const submitBtn = byId('submit-subscribe');
    const submitLabel = submitBtn?.textContent?.trim() || 'Finalizar assinatura';
    setFlowInteractionLock(true);
    if (submitBtn) {
      submitBtn.textContent = 'Processando…';
      submitBtn.disabled = true;
    }
    try {
      if (!state.verificationToken) {
        throw new Error('Valide o código SMS antes de pagar.');
      }

      await apiPost('/api/billing/requests', {
        customerType: getText(fd, 'customerType'),
        planCode: getText(fd, 'planCode'),
        name: normalizeSpaces(getText(fd, 'name')),
        phone: onlyDigits(getText(fd, 'phone')),
        password: getText(fd, 'password'),
        companyName: normalizeSpaces(getText(fd, 'companyName')),
        cnpj: onlyDigits(getText(fd, 'cnpj')),
        contactName: normalizeSpaces(getText(fd, 'contactName')),
        email: getText(fd, 'email').trim().toLowerCase(),
        notes: '',
      });

      const out = await apiPost('/api/billing/checkout', {
        verificationToken: state.verificationToken,
        planCode: getText(fd, 'planCode'),
        customerType: getText(fd, 'customerType'),
        billingCycle: state.billingCycle,
        phone: onlyDigits(getText(fd, 'phone')),
        name: normalizeSpaces(getText(fd, 'name')),
        email: getText(fd, 'email').trim().toLowerCase(),
        cpfCnpj: onlyDigits(getText(fd, 'cpfCnpj')),
        creditCard: {
          holderName: normalizeSpaces(getText(fd, 'ccHolder')),
          number: onlyDigits(getText(fd, 'ccNumber')),
          expiryMonth: clampMonthStr(padExpMonthForSubmit(getText(fd, 'ccExpMonth'))),
          expiryYear: normalizeExpYearForSubmit(getText(fd, 'ccExpYear')),
          ccv: onlyDigits(getText(fd, 'ccCvv')),
        },
        creditCardHolderInfo: {
          name: normalizeSpaces(getText(fd, 'name')),
          email: getText(fd, 'email').trim().toLowerCase(),
          cpfCnpj: onlyDigits(getText(fd, 'cpfCnpj')),
          postalCode: onlyDigits(getText(fd, 'postalCode')),
          addressNumber: normalizeSpaces(getText(fd, 'addressNumber')),
          addressComplement: normalizeSpaces(getText(fd, 'addressComplement')),
          mobilePhone: onlyDigits(getText(fd, 'phone')),
        },
      });

      state.verificationToken = '';
      state.billingCycle = 'MONTHLY';
      form.reset();
      showFeedback();
      showSubscriptionSuccess(out);
      refreshCompanyFields();
      setStep(null);
    } catch (e) {
      showFeedback(e.message || String(e), true);
    } finally {
      setFlowInteractionLock(false);
      if (submitBtn) {
        submitBtn.textContent = submitLabel;
        submitBtn.disabled = false;
      }
    }
  });

  syncPlanCtasLocked();
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
  if (prePhone) byId('phone').value = formatPhoneDisplay(prePhone);
}

await init();
