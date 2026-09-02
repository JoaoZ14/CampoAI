import { createSupabaseClient } from '../../models/supabaseClient.js';
import { mapUserRow } from '../../models/userModel.js';
import { AppError } from '../../utils/errors.js';
import { normalizePhone } from '../../utils/phone.js';
import {
  computeTrialEndsAt,
  findUserByPhone,
  updateUserById,
} from '../userService.js';
import { assertSignupVerification } from './signupOtpService.js';
import { getSignupWhatsappOpenUrl, sendSignupWelcome } from './welcomeService.js';
import { sendSignupWelcomeEmail } from './signupEmailService.js';

function getClient() {
  return createSupabaseClient();
}

/**
 * @param {{
 *   name: string,
 *   phone: string,
 *   email?: string,
 *   verificationToken: string,
 *   signupSource?: string,
 * }} input
 */
export async function completeSignup(input) {
  const name = String(input.name ?? '').trim();
  if (name.length < 3) throw new AppError('Informe um nome válido.', 400);

  const phone = normalizePhone(String(input.phone ?? '').trim());
  if (!phone || phone.length < 10) throw new AppError('Telefone inválido.', 400);

  const emailRaw = String(input.email ?? '').trim();
  const email = emailRaw && emailRaw.includes('@') ? emailRaw : null;

  await assertSignupVerification({
    phone,
    verificationToken: input.verificationToken,
  });

  const existing = await findUserByPhone(phone);
  if (existing?.signupCompletedAt && !existing.isPaid) {
    throw new AppError('Este telefone já possui cadastro no AG Assist.', 409);
  }
  if (existing?.isPaid) {
    throw new AppError(
      'Este telefone já possui assinatura ativa. Use o WhatsApp ou a área do cliente.',
      409
    );
  }

  const now = new Date().toISOString();
  const trialEndsAt = computeTrialEndsAt(new Date());
  const signupSource = String(input.signupSource ?? 'landing').trim() || 'landing';
  const supabase = getClient();

  let user;
  if (existing) {
    const { data, error } = await supabase
      .from('users')
      .update({
        name,
        email,
        usage_count: 0,
        is_paid: false,
        billing_kind: 'free',
        signup_completed_at: now,
        trial_started_at: now,
        trial_ends_at: trialEndsAt,
        signup_source: signupSource,
        welcome_sent_at: null,
        trial_expired_notified_at: null,
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw new AppError(`Erro ao atualizar cadastro: ${error.message}`, 500);
    user = mapUserRow(data);
  } else {
    const { data, error } = await supabase
      .from('users')
      .insert({
        phone,
        name,
        email,
        usage_count: 0,
        is_paid: false,
        billing_kind: 'free',
        signup_completed_at: now,
        trial_started_at: now,
        trial_ends_at: trialEndsAt,
        signup_source: signupSource,
      })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        throw new AppError('Este telefone já possui cadastro no AG Assist.', 409);
      }
      throw new AppError(`Erro ao criar cadastro: ${error.message}`, 500);
    }
    user = mapUserRow(data);
  }

  const welcome = await sendSignupWelcome(phone, name);
  await updateUserById(user.id, { welcomeSentAt: new Date().toISOString() });

  const whatsappOpenUrl = getSignupWhatsappOpenUrl() || null;

  if (email) {
    void sendSignupWelcomeEmail({ name, email, whatsappUrl: whatsappOpenUrl ?? '' }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[signup] Falha no e-mail de boas-vindas:', msg);
    });
  }

  return {
    ok: true,
    userId: user.id,
    phone,
    trialEndsAt,
    welcomeChannel: welcome.channel,
    whatsappOpenUrl,
    welcomeEmailQueued: Boolean(email),
  };
}

/**
 * Marca signup como concluído após checkout pago (usuário que pulou /cadastro).
 * @param {string} phone
 * @param {string} [name]
 */
export async function markSignupCompletedForPaidUser(phone, name) {
  const normalized = normalizePhone(String(phone ?? '').trim());
  if (!normalized) return;
  const existing = await findUserByPhone(normalized);
  if (!existing) return;
  if (existing.signupCompletedAt) return;

  const now = new Date().toISOString();
  await updateUserById(existing.id, {
    signupCompletedAt: now,
    signupSource: existing.signupSource || 'checkout',
    ...(name?.trim() ? { name: name.trim() } : {}),
  });
}
