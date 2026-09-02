import { initSupabase, getSupabase, safeAdminNext } from './auth.js';

const $ = (id) => document.getElementById(id);

function showLoginGateMsg(text) {
  const g = $('login-gate-msg');
  if (!g) return;
  g.textContent = text;
  g.hidden = !text;
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

async function boot() {
  const params = new URLSearchParams(location.search);
  const next = safeAdminNext(params.get('next'));

  try {
    await initSupabase();
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      location.replace(next);
      return;
    }

    $('form-login')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      showLoginGateMsg('');
      const btn = /** @type {HTMLButtonElement | null} */ (ev.target?.querySelector('button[type="submit"]'));
      const fd = new FormData(/** @type {HTMLFormElement} */ (ev.target));
      const email = String(fd.get('email'));
      const password = String(fd.get('password'));
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Entrando…';
      }
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          showLoginGateMsg(error.message);
          return;
        }
        location.replace(next);
      } catch (e) {
        showLoginGateMsg(e?.message || 'Falha ao entrar. Tente de novo.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Entrar';
        }
      }
    });
  } catch (e) {
    showLoginGateMsg(e?.message || String(e));
    toast('Login indisponível. Verifique a configuração do servidor.', true);
  }
}

boot();
