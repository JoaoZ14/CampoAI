import { canSendSignupEmail, sendTransactionalEmail } from '../email/resendClient.js';

function firstName(name) {
  return String(name ?? '').trim().split(/\s+/)[0] || 'produtor';
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * @param {{ name: string, whatsappUrl: string }} input
 */
export function buildSignupWelcomeEmail(input) {
  const nome = firstName(input.name);
  const whatsappUrl = String(input.whatsappUrl ?? '').trim();
  const hasWhatsappLink = whatsappUrl.startsWith('https://');

  const subject = `${nome}, seu AGGI está pronto`;

  const textLines = [
    `Olá, ${nome}! Que bom ter você aqui.`,
    '',
    'Sou a Lida, assistente do AGGI: seu apoio no WhatsApp para dúvidas de planta, animal e manejo no campo.',
    '',
    'Mande uma foto, um áudio ou sua pergunta — vamos começar?',
  ];
  if (hasWhatsappLink) {
    textLines.push('', `Abrir conversa no WhatsApp: ${whatsappUrl}`);
  }
  textLines.push('', '— Equipe AGGI');

  const ctaBlock = hasWhatsappLink
    ? `<tr>
        <td style="padding:28px 32px 8px;text-align:center;">
          <a href="${escapeHtml(whatsappUrl)}" style="display:inline-block;padding:14px 28px;background-color:#25D366;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:6px;">
            Começar no WhatsApp
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 32px 0;text-align:center;font-size:13px;color:#5c5c58;">
          Ou copie o link: <a href="${escapeHtml(whatsappUrl)}" style="color:#8a5f36;">${escapeHtml(whatsappUrl)}</a>
        </td>
      </tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f6f3ec;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f6f3ec;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#fdfcfa;border:1px solid rgba(42,56,42,0.1);border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 0;text-align:center;">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#2a382a;">AGGI</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 0;color:#3a3a38;font-size:16px;line-height:1.65;">
              <p style="margin:0 0 16px;">Olá, <strong>${escapeHtml(nome)}</strong>! Que bom ter você aqui.</p>
              <p style="margin:0 0 16px;">Sou a Lida, assistente do AGGI: seu apoio no WhatsApp para dúvidas de planta, animal e manejo no campo.</p>
              <p style="margin:0;">Mande uma foto, um áudio ou sua pergunta — vamos começar?</p>
            </td>
          </tr>
          ${ctaBlock}
          <tr>
            <td style="padding:28px 32px;color:#5c5c58;font-size:13px;line-height:1.5;border-top:1px solid rgba(42,56,42,0.08);margin-top:24px;">
              Você recebeu este e-mail porque se cadastrou no AGGI. Se não foi você, ignore esta mensagem.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text: textLines.join('\n') };
}

/**
 * @param {{ name: string, email: string, whatsappUrl?: string|null }} input
 */
export async function sendSignupWelcomeEmail(input) {
  const email = String(input.email ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) return { skipped: true, reason: 'no_email' };
  if (!canSendSignupEmail()) return { skipped: true, reason: 'email_disabled' };

  const content = buildSignupWelcomeEmail({
    name: input.name,
    whatsappUrl: input.whatsappUrl || '',
  });

  const out = await sendTransactionalEmail({
    to: email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  return { sent: true, id: out.id ?? null };
}
