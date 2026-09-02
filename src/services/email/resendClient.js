import { AppError } from '../../utils/errors.js';

function resendApiKey() {
  return process.env.RESEND_API_KEY?.trim() || '';
}

function isEmailEnabled() {
  if (process.env.SIGNUP_EMAIL_ENABLED === 'false') return false;
  return Boolean(resendApiKey());
}

/**
 * @param {{ to: string, subject: string, html: string, text: string, from?: string }} input
 */
export async function sendTransactionalEmail(input) {
  const to = String(input.to ?? '').trim().toLowerCase();
  if (!to || !to.includes('@')) {
    throw new AppError('Destinatário de e-mail inválido.', 400);
  }

  const from =
    input.from?.trim() ||
    process.env.SIGNUP_EMAIL_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    '';

  if (!from) {
    throw new AppError('Remetente não configurado (SIGNUP_EMAIL_FROM).', 500);
  }

  if (process.env.MOCK_EMAIL === 'true') {
    console.log(
      `[MOCK_EMAIL] Para: ${to} | De: ${from} | Assunto: ${input.subject}\n${input.text}`
    );
    return { id: 'MOCK_EMAIL_ID', mocked: true };
  }

  const apiKey = resendApiKey();
  if (!apiKey) {
    throw new AppError('RESEND_API_KEY não configurada.', 500);
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.error || `HTTP ${res.status}`;
    throw new AppError(`Falha ao enviar e-mail: ${msg}`, 502);
  }

  return data;
}

export function canSendSignupEmail() {
  return isEmailEnabled();
}
