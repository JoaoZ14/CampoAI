import {
  apiGet,
  initCustomerSupabase,
  safeNextPath,
  signInWithGoogle,
  signInWithPassword,
} from '../shared/supabaseAuth.js';

function byId(id) {
  return document.getElementById(id);
}

function showFeedback(msg, isError = false) {
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

function nextTarget() {
  const params = new URLSearchParams(window.location.search);
  return safeNextPath(params.get('next'), '/area-do-cliente');
}

async function goAfterLogin() {
  window.location.replace(nextTarget());
}

async function init() {
  const client = await initCustomerSupabase();
  const { data } = await client.auth.getSession();
  if (data.session) {
    try {
      await apiGet('/api/customer/me');
      await goAfterLogin();
      return;
    } catch {
      await goAfterLogin();
      return;
    }
  }

  byId('google-btn')?.addEventListener('click', async () => {
    showFeedback('');
    try {
      const redirect = `${window.location.origin}/entrar?next=${encodeURIComponent(nextTarget())}`;
      await signInWithGoogle(redirect);
    } catch (e) {
      showFeedback(e.message || String(e), true);
    }
  });

  byId('login-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    showFeedback('');
    const email = byId('email')?.value.trim();
    const password = byId('password')?.value;
    const btn = ev.submitter || byId('login-form')?.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      await signInWithPassword(email, password);
      await goAfterLogin();
    } catch (e) {
      showFeedback(e.message || 'Não foi possível entrar. Confira e-mail e senha.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

init().catch((e) => {
  showFeedback(e.message || String(e), true);
});
