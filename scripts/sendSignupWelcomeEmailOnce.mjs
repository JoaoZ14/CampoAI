import 'dotenv/config';
import { getSignupWhatsappOpenUrl } from '../src/services/signup/welcomeService.js';
import { sendSignupWelcomeEmail } from '../src/services/signup/signupEmailService.js';
import { canSendSignupEmail } from '../src/services/email/resendClient.js';

/**
 * Envia um e-mail de boas-vindas de teste (mesmo template do pós-cadastro).
 *
 * Uso:
 *   npm run test:signup-email -- seu@email.com
 *   npm run test:signup-email -- --email seu@email.com --name "Maria Silva"
 *   npm run test:signup-email -- seu@email.com --mock
 *
 * Variáveis: RESEND_API_KEY, SIGNUP_EMAIL_FROM
 * MOCK_EMAIL=true no .env ou flag --mock para só logar no console.
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  /** @type {{ email: string, name: string, whatsappUrl: string, mock: boolean }} */
  const out = {
    email: '',
    name: 'Maria Silva',
    whatsappUrl: '',
    mock: process.env.MOCK_EMAIL === 'true',
  };

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--email' && args[i + 1]) {
      out.email = args[++i].trim().toLowerCase();
      continue;
    }
    if (a === '--name' && args[i + 1]) {
      out.name = args[++i].trim();
      continue;
    }
    if (a === '--whatsapp-url' && args[i + 1]) {
      out.whatsappUrl = args[++i].trim();
      continue;
    }
    if (a === '--mock') {
      out.mock = true;
      continue;
    }
    if (!a.startsWith('-') && a.includes('@')) {
      out.email = a.trim().toLowerCase();
    }
  }

  return out;
}

function printUsage() {
  console.log(`Uso:
  npm run test:signup-email -- seu@email.com
  npm run test:signup-email -- --email seu@email.com --name "João"
  npm run test:signup-email -- seu@email.com --mock

Opções:
  --email <endereço>     Destinatário (obrigatório)
  --name <nome>          Nome no template (padrão: Maria Silva)
  --whatsapp-url <url>   Link do botão (padrão: wa.me do TWILIO_WHATSAPP_FROM)
  --mock                 Não envia; só loga (equivale a MOCK_EMAIL=true)`);
}

const { email, name, whatsappUrl, mock } = parseArgs(process.argv);

if (!email) {
  printUsage();
  process.exit(1);
}

if (mock) {
  process.env.MOCK_EMAIL = 'true';
}

if (!canSendSignupEmail() && process.env.MOCK_EMAIL !== 'true') {
  console.error(
    '[signup-email] RESEND_API_KEY ausente ou SIGNUP_EMAIL_ENABLED=false. Configure o .env ou use --mock.'
  );
  process.exit(1);
}

const resolvedWhatsappUrl = whatsappUrl || getSignupWhatsappOpenUrl() || '';

console.log('[signup-email] Enviando teste…');
console.log(`  Para: ${email}`);
console.log(`  Nome: ${name}`);
console.log(`  WhatsApp: ${resolvedWhatsappUrl || '(sem link — configure TWILIO_WHATSAPP_FROM)'}`);
console.log(`  Modo: ${process.env.MOCK_EMAIL === 'true' ? 'mock' : 'resend'}`);

try {
  const result = await sendSignupWelcomeEmail({
    name,
    email,
    whatsappUrl: resolvedWhatsappUrl,
  });

  if (result.skipped) {
    console.error('[signup-email] Envio ignorado:', result.reason);
    process.exitCode = 1;
  } else {
    console.log('[signup-email] OK', result);
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[signup-email] Falha:', msg);
  if (msg.includes('domain is not verified')) {
    console.error(`
[signup-email] O domínio do remetente (SIGNUP_EMAIL_FROM) não está verificado no Resend.
  • Teste rápido: SIGNUP_EMAIL_FROM=AGGI <onboarding@resend.dev>
    (só entrega para o e-mail da sua conta Resend)
  • Produção: verifique um domínio seu em https://resend.com/domains
    (subdomínios *.netlify.app não permitem DNS de e-mail — use domínio próprio)`);
  } else if (msg.includes('only send testing emails to your own email')) {
    const match = msg.match(/\(([^)]+@[^)]+)\)/);
    const resendAccount = match?.[1] ?? 'o e-mail da sua conta Resend';
    console.error(`
[signup-email] Com onboarding@resend.dev você só pode enviar para ${resendAccount}.
  • Teste: npm run test:signup-email -- --email ${resendAccount}
  • Para enviar a qualquer destinatário: verifique um domínio em https://resend.com/domains
    e use SIGNUP_EMAIL_FROM=AGGI <boas-vindas@seudominio.com>`);
  }
  process.exitCode = 1;
}
