import {
  apiPost,
  displayNameFromUser,
  getSession,
  initCustomerSupabase,
  signInWithGoogle,
  signUpWithPassword,
} from '../shared/supabaseAuth.js';

const RESEND_COOLDOWN_SEC = 45;

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

function formatOtpDisplay(raw) {
  return onlyDigits(raw).slice(0, 6);
}

function getText(fd, key) {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
}

function signupSourceFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('origin')?.trim() || 'landing';
}

function defaultWhatsappOpenUrl() {
  return 'https://wa.me/';
}

function clearFieldErrors() {
  document.querySelectorAll('.field-error').forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });
  document.querySelectorAll('[aria-invalid]').forEach((el) => {
    el.removeAttribute('aria-invalid');
  });
}

function setFieldError(fieldId, message) {
  const input = byId(fieldId);
  const errorEl = byId(`${fieldId}-error`);
  if (fieldId === 'otpCode') {
    const otpErr = byId('otp-error');
    if (otpErr) {
      otpErr.hidden = false;
      otpErr.textContent = message;
    }
  }
  if (!input || !errorEl) {
    if (input) input.focus();
    return;
  }
  input.setAttribute('aria-invalid', 'true');
  errorEl.hidden = false;
  errorEl.textContent = message;
  input.focus();
}

function showFeedback(msg, isError = false) {
  const el = byId('feedback');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('is-error');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle('is-error', isError);
  el.setAttribute('role', isError ? 'alert' : 'status');
  el.setAttribute('aria-live', isError ? 'assertive' : 'polite');
}

function updateStepper(step) {
  document.querySelectorAll('[data-step-indicator]').forEach((el) => {
    const n = Number(el.dataset.stepIndicator);
    el.classList.toggle('is-active', n === step);
    el.classList.toggle('is-done', n < step);
  });
}

function focusStep(step) {
  const panel = document.querySelector(`[data-step="${step}"]`);
  if (!panel) return;
  const target =
    panel.querySelector('input:not([type="checkbox"]):not([readonly])') ||
    panel.querySelector('button') ||
    panel.querySelector('h2');
  target?.focus();
}

function setStep(step) {
  document.querySelectorAll('[data-step]').forEach((el) => {
    el.hidden = Number(el.dataset.step) !== step;
  });
  updateStepper(step);
  focusStep(step);
}

/** @type {{ verificationToken: string }} */
const state = { verificationToken: '' };

let lock = false;
let resendTimerId = null;

function setLock(v) {
  lock = v;
  byId('send-otp')?.toggleAttribute('disabled', v);
  byId('verify-otp')?.toggleAttribute('disabled', v);
  byId('signup-email-btn')?.toggleAttribute('disabled', v);
  byId('google-btn')?.toggleAttribute('disabled', v);
  byId('resend-otp')?.toggleAttribute('disabled', v || byId('resend-otp')?.hasAttribute('data-cooldown'));
}

function setButtonLoading(btn, loading, labelLoading) {
  if (!btn) return;
  if (loading) {
    if (!btn.dataset.defaultLabel) btn.dataset.defaultLabel = btn.textContent.trim();
    btn.classList.add('is-loading');
    btn.textContent = labelLoading;
    btn.disabled = true;
  } else {
    btn.classList.remove('is-loading');
    btn.textContent = btn.dataset.defaultLabel || btn.textContent;
    btn.disabled = false;
  }
}

function startResendCooldown(seconds = RESEND_COOLDOWN_SEC) {
  const btn = byId('resend-otp');
  const timerEl = byId('resend-timer');
  if (!btn || !timerEl) return;

  if (resendTimerId) clearInterval(resendTimerId);

  let remaining = seconds;
  btn.disabled = true;
  btn.setAttribute('data-cooldown', '');
  timerEl.hidden = false;
  timerEl.textContent = `(aguarde ${remaining}s)`;

  resendTimerId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(resendTimerId);
      resendTimerId = null;
      btn.disabled = false;
      btn.removeAttribute('data-cooldown');
      timerEl.hidden = true;
      timerEl.textContent = '';
      return;
    }
    timerEl.textContent = `(aguarde ${remaining}s)`;
  }, 1000);
}

function wireMasks() {
  const phone = byId('phone');
  const otp = byId('otpCode');
  phone?.addEventListener('input', () => {
    phone.value = formatPhoneDisplay(phone.value);
  });
  otp?.addEventListener('input', () => {
    otp.value = formatOtpDisplay(otp.value);
  });
}

function readStep2Fields() {
  const form = byId('signup-form');
  const fd = new FormData(form);
  return {
    name: getText(fd, 'name').trim(),
    phone: onlyDigits(getText(fd, 'phone')),
    email: getText(fd, 'email').trim(),
  };
}

function validateStep2() {
  clearFieldErrors();
  showFeedback('');
  const { name, phone } = readStep2Fields();
  const terms = byId('accept-terms');

  let valid = true;
  if (name.length < 3) {
    setFieldError('name', 'Informe como quer ser chamado (mínimo 3 caracteres).');
    valid = false;
  }
  if (phone.length < 10) {
    setFieldError('phone', 'Informe um WhatsApp válido com DDD.');
    valid = false;
  }
  if (!terms?.checked) {
    const termsError = byId('terms-error');
    if (termsError) {
      termsError.hidden = false;
      termsError.textContent = 'Aceite os Termos e a Política de privacidade para continuar.';
    }
    terms?.focus();
    valid = false;
  }
  return valid;
}

function updatePhoneRecap() {
  const recap = byId('phone-recap-value');
  const { phone } = readStep2Fields();
  if (recap) recap.textContent = formatPhoneDisplay(phone) || '—';
}

function showSuccess(whatsappOpenUrl) {
  byId('signup-form')?.setAttribute('hidden', '');
  document.querySelector('.signup-stepper')?.setAttribute('hidden', '');
  const panel = byId('success-panel');
  if (panel) {
    panel.hidden = false;
    panel.focus();
  }
  const wa = byId('open-whatsapp');
  if (wa) wa.href = whatsappOpenUrl || defaultWhatsappOpenUrl();
}

function applySessionToForm(session) {
  const user = session?.user;
  const email = user?.email || '';
  const emailEl = byId('email');
  if (emailEl && email) emailEl.value = email;
  const nameEl = byId('name');
  if (nameEl && !nameEl.value) {
    const guessed = displayNameFromUser(user);
    if (guessed) nameEl.value = guessed;
  }
  const recap = byId('session-email');
  if (recap && email) {
    recap.hidden = false;
    recap.textContent = `Conta web: ${email}`;
  }
}

async function completeSignup() {
  const { name, phone, email } = readStep2Fields();
  const btn = byId('verify-otp');
  setButtonLoading(btn, true, 'Concluindo cadastro…');
  setLock(true);
  try {
    const out = await apiPost('/api/signup/complete', {
      name,
      phone,
      email: email || undefined,
      verificationToken: state.verificationToken,
      signupSource: signupSourceFromQuery(),
    });
    showFeedback('');
    if (out.linkedExisting) {
      window.location.replace('/area-do-cliente');
      return;
    }
    showSuccess(out.whatsappOpenUrl);
  } catch (e) {
    showFeedback(e.message || String(e), true);
  } finally {
    setButtonLoading(btn, false);
    setLock(false);
  }
}

async function afterAuthSession(session) {
  applySessionToForm(session);
  try {
    const me = await fetch('/api/customer/me', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).then((r) => r.json());
    if (me.linked) {
      window.location.replace('/area-do-cliente');
      return;
    }
  } catch {
    /* segue o cadastro */
  }
  setStep(2);
}

byId('send-otp')?.addEventListener('click', async () => {
  if (lock) return;
  if (!validateStep2()) return;

  const { phone } = readStep2Fields();
  const btn = byId('send-otp');
  setButtonLoading(btn, true, 'Enviando SMS…');
  setLock(true);
  try {
    const out = await apiPost('/api/signup/otp/send', { phone });
    showFeedback(`Código enviado por SMS para ${formatPhoneDisplay(out.phone || phone)}.`);
    updatePhoneRecap();
    byId('otpCode').value = '';
    setStep(3);
    startResendCooldown();
  } catch (e) {
    showFeedback(e.message || String(e), true);
    const match = String(e.message).match(/Aguarde (\d+)s/);
    if (match) startResendCooldown(Number(match[1]));
  } finally {
    setButtonLoading(btn, false);
    setLock(false);
  }
});

byId('verify-otp')?.addEventListener('click', async () => {
  if (lock) return;
  clearFieldErrors();
  showFeedback('');

  const { phone } = readStep2Fields();
  const code = onlyDigits(byId('otpCode')?.value);
  if (code.length !== 6) {
    setFieldError('otpCode', 'Digite o código de 6 dígitos enviado por SMS.');
    return;
  }

  const btn = byId('verify-otp');
  setButtonLoading(btn, true, 'Validando código…');
  setLock(true);
  try {
    const out = await apiPost('/api/signup/otp/verify', { phone, code });
    state.verificationToken = out.verificationToken;
    await completeSignup();
  } catch (e) {
    showFeedback(e.message || String(e), true);
    setButtonLoading(btn, false);
    setLock(false);
  }
});

byId('resend-otp')?.addEventListener('click', async () => {
  if (lock || byId('resend-otp')?.hasAttribute('data-cooldown')) return;
  const { phone } = readStep2Fields();
  if (phone.length < 10) {
    showFeedback('Volte e informe um WhatsApp válido.', true);
    return;
  }
  setLock(true);
  try {
    const out = await apiPost('/api/signup/otp/send', { phone });
    showFeedback(`Novo código enviado para ${formatPhoneDisplay(out.phone || phone)}.`);
    byId('otpCode').value = '';
    byId('otpCode')?.focus();
    startResendCooldown();
  } catch (e) {
    showFeedback(e.message || String(e), true);
    const match = String(e.message).match(/Aguarde (\d+)s/);
    if (match) startResendCooldown(Number(match[1]));
  } finally {
    setLock(false);
  }
});

byId('back-step-2')?.addEventListener('click', () => {
  state.verificationToken = '';
  setStep(2);
  showFeedback('');
  clearFieldErrors();
});

byId('edit-phone')?.addEventListener('click', () => {
  state.verificationToken = '';
  setStep(2);
  showFeedback('');
  clearFieldErrors();
  byId('phone')?.focus();
});

byId('google-btn')?.addEventListener('click', async () => {
  showFeedback('');
  try {
    await signInWithGoogle(`${window.location.origin}/cadastro`);
  } catch (e) {
    showFeedback(e.message || String(e), true);
  }
});

byId('signup-email-btn')?.addEventListener('click', async () => {
  if (lock) return;
  const email = byId('auth-email')?.value.trim();
  const password = byId('auth-password')?.value;
  if (!email || !email.includes('@')) {
    showFeedback('Informe um e-mail válido.', true);
    byId('auth-email')?.focus();
    return;
  }
  if (!password || password.length < 6) {
    showFeedback('A senha precisa ter no mínimo 6 caracteres.', true);
    byId('auth-password')?.focus();
    return;
  }
  const btn = byId('signup-email-btn');
  setButtonLoading(btn, true, 'Criando conta…');
  setLock(true);
  try {
    const data = await signUpWithPassword(email, password);
    if (data.session) {
      await afterAuthSession(data.session);
      return;
    }
    showFeedback(
      'Enviamos um e-mail de confirmação. Depois de confirmar, volte em Entrar para continuar o cadastro.'
    );
  } catch (e) {
    showFeedback(e.message || String(e), true);
  } finally {
    setButtonLoading(btn, false);
    setLock(false);
  }
});

byId('signup-form')?.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  const step2 = document.querySelector('[data-step="2"]');
  if (!step2 || step2.hidden) return;
  const tag = ev.target?.tagName?.toLowerCase();
  if (tag === 'textarea') return;
  ev.preventDefault();
  byId('send-otp')?.click();
});

wireMasks();

initCustomerSupabase()
  .then(async () => {
    const session = await getSession();
    if (session) {
      await afterAuthSession(session);
      return;
    }
    setStep(1);
  })
  .catch((e) => {
    showFeedback(e.message || String(e), true);
    setStep(1);
  });
