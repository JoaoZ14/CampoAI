import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, LockKeyhole, MessageCircle, Sprout } from 'lucide-react';
import { api, authClient, externalUrl } from './api';

type Step = 'account' | 'details' | 'code' | 'email' | 'done';
const digits = (value: string) => value.replace(/\D/g, '');
const message = (error: unknown) => error instanceof Error ? error.message : 'Algo deu errado. Tente novamente.';

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(externalUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || 'Não foi possível continuar.');
  return result as T;
}

export default function Signup({ session, onBack, onDone }: { session: Session | null; onBack: () => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>(session ? 'details' : 'account');
  const [email, setEmail] = useState(session?.user.email || '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [whatsappUrl, setWhatsappUrl] = useState('');

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function createAccount(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
      const auth = await authClient();
      const emailRedirectTo = import.meta.env.VITE_API_BASE_URL ? externalUrl('/app/') : `${window.location.origin}/app/`;
      const { data, error: signupError } = await auth.auth.signUp({ email: email.trim().toLowerCase(), password, options: { emailRedirectTo } });
      if (signupError) throw signupError;
      if (data.user?.identities?.length === 0) throw new Error('Este e-mail já tem conta. Volte e entre com sua senha.');
      setStep(data.session ? 'details' : 'email');
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  async function sendCode(event?: FormEvent) {
    event?.preventDefault(); setBusy(true); setError('');
    try {
      if (name.trim().length < 3) throw new Error('Informe seu nome com pelo menos 3 letras.');
      if (digits(phone).length < 10 || digits(phone).length > 11) throw new Error('Informe um WhatsApp válido com DDD.');
      if (!terms) throw new Error('Leia e aceite os Termos de uso e a Política de privacidade para continuar.');
      await post('/api/signup/otp/send', { phone: digits(phone) });
      setCode(''); setCooldown(45); setStep('code');
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (digits(code).length !== 6) throw new Error('Digite o código de 6 dígitos enviado por SMS.');
      const verified = await post<{ verificationToken: string }>('/api/signup/otp/verify', { phone: digits(phone), code: digits(code) });
      const completed = await api<{ whatsappOpenUrl?: string }>('/api/signup/complete', { method: 'POST', body: JSON.stringify({ name: name.trim(), phone: digits(phone), email: email.trim(), verificationToken: verified.verificationToken, signupSource: 'app' }) });
      setWhatsappUrl(completed.whatsappOpenUrl || 'https://wa.me/');
      setStep('done');
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  const steps = ['account', 'details', 'code'];
  const current = steps.indexOf(step);
  return <main className="signup-shell">
    <div className="signup-art"><div className="signup-art-shade"/><div className="login-brand"><div className="brand-mark">AG</div><span>AG Assist</span></div><div className="signup-art-copy"><span className="login-eyebrow">Comece por aqui</span><h1>Mais tempo para o que importa no campo.</h1><p>Crie sua conta, conecte seu WhatsApp e deixe a Lida ajudar na rotina da fazenda.</p></div><div className="signup-art-foot"><Sprout size={20}/> Seu próximo dia começa mais leve.</div></div>
    <div className="signup-content"><button className="signup-back" onClick={step === 'account' || step === 'email' || step === 'done' ? onBack : () => { setError(''); setStep(step === 'code' ? 'details' : 'account'); }}><ArrowLeft size={18}/> {step === 'account' || step === 'email' || step === 'done' ? 'Voltar ao início' : 'Voltar'}</button>
      {current >= 0 && <div className="signup-progress" aria-label={`Etapa ${current + 1} de 3`}>{steps.map((item, index) => <span key={item} className={index <= current ? 'active' : ''}/>)}</div>}
      {step === 'account' && <form className="signup-card" onSubmit={createAccount}><span className="signup-kicker">01 · Sua conta</span><div className="signup-symbol"><LockKeyhole size={24}/></div><h2>Prazer, vamos começar?</h2><p>Seu acesso para acompanhar a Lida e a fazenda de qualquer lugar.</p><label>E-mail<input type="email" autoComplete="email" required placeholder="voce@exemplo.com" value={email} onChange={event => setEmail(event.target.value)}/></label><label>Crie uma senha<input type="password" autoComplete="new-password" minLength={6} required placeholder="Pelo menos 6 caracteres" value={password} onChange={event => setPassword(event.target.value)}/></label>{error && <p className="notice error" role="alert">{error}</p>}<button className="button primary signup-next" disabled={busy}>{busy ? 'Criando sua conta…' : <>Continuar <ArrowRight size={18}/></>}</button><p className="signup-alt">Já tem conta? <button type="button" onClick={onBack}>Entrar</button></p></form>}
      {step === 'email' && <div className="signup-card signup-center"><div className="signup-symbol"><MessageCircle size={25}/></div><h2>Confira seu e-mail</h2><p>Enviamos uma confirmação para <strong>{email}</strong>. Confirme o endereço e depois volte ao app para entrar e concluir o cadastro.</p><button className="button primary signup-next" onClick={onBack}>Ir para o início <ArrowRight size={18}/></button></div>}
      {step === 'details' && <form className="signup-card" onSubmit={sendCode}><span className="signup-kicker">02 · Seus dados</span><div className="signup-symbol"><Sprout size={25}/></div><h2>Como podemos chamar você?</h2><p>Seu WhatsApp conecta você à Lida. Enviaremos um código por SMS para confirmar o número.</p><label>Seu nome<input autoComplete="name" required minLength={3} placeholder="Nome completo" value={name} onChange={event => setName(event.target.value)}/></label><label>WhatsApp com DDD<input type="tel" inputMode="tel" autoComplete="tel" required placeholder="(24) 99999-9999" value={phone} onChange={event => setPhone(event.target.value)}/></label><label className="signup-consent"><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)}/><span>Li e aceito os <a href={externalUrl('/legal/termos-de-uso')} target="_blank" rel="noreferrer">Termos de uso</a> e a <a href={externalUrl('/legal/politica-de-privacidade')} target="_blank" rel="noreferrer">Política de privacidade</a>.</span></label>{error && <p className="notice error" role="alert">{error}</p>}<button className="button primary signup-next" disabled={busy}>{busy ? 'Enviando código…' : <>Enviar código <ArrowRight size={18}/></>}</button></form>}
      {step === 'code' && <form className="signup-card" onSubmit={verifyCode}><span className="signup-kicker">03 · Confirmação</span><div className="signup-symbol"><MessageCircle size={25}/></div><h2>Chegou um código por SMS</h2><p>Digite os 6 números enviados para <strong>{phone}</strong>. Assim protegemos o acesso à sua conta.</p><label>Código de verificação<input className="signup-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required placeholder="000000" value={code} onChange={event => setCode(digits(event.target.value).slice(0, 6))}/></label>{error && <p className="notice error" role="alert">{error}</p>}<button className="button primary signup-next" disabled={busy}>{busy ? 'Concluindo cadastro…' : <>Confirmar e começar <Check size={18}/></>}</button><button className="signup-resend" type="button" disabled={busy || cooldown > 0} onClick={() => void sendCode()}>{cooldown > 0 ? `Reenviar código em ${cooldown}s` : 'Reenviar código'}</button></form>}
      {step === 'done' && <div className="signup-card signup-center"><div className="signup-symbol"><CheckCircle2 size={29}/></div><h2>Pronto para começar!</h2><p>Sua conta está criada. A Lida já pode ajudar pelo WhatsApp, e seu espaço de controle está aqui no app.</p><button className="button primary signup-next" onClick={onDone}>Abrir meu app <ArrowRight size={18}/></button><a className="signup-whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={18}/> Conversar com a Lida</a></div>}
    </div>
  </main>;
}
