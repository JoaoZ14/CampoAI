import { createSupabaseClient } from '../../models/supabaseClient.js';
import { mapUserRow } from '../../models/userModel.js';
import { AppError } from '../../utils/errors.js';
import { normalizePhone } from '../../utils/phone.js';
import {
  assertCanAttachAuthUser,
  computeTrialEndsAt,
  findUserByAuthUserId,
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
 *   authUserId: string,
 *   verificationToken: string,
 *   signupSource?: string,
 * }} input
 */
export async function completeSignup(input) {
  const authUserId = String(input.authUserId ?? '').trim();
  if (!authUserId) throw new AppError('Sessão web ausente. Entre ou crie a conta no site.', 401);

  const name = String(input.name ?? '').trim();
  if (name.length < 3) throw new AppError('Informe um nome válido.', 400);

  const phone = normalizePhone(String(input.phone ?? '').trim());
  if (!phone || phone.length < 10) throw new AppError('Telefone inválido.', 400);

  const emailRaw = String(input.email ?? '').trim();
  const email = emailRaw && emailRaw.includes('@') ? emailRaw.toLowerCase() : null;

  await assertSignupVerification({
    phone,
    verificationToken: input.verificationToken,
  });

  const linkedAlready = await findUserByAuthUserId(authUserId);
  const existing = await findUserByPhone(phone);

  if (linkedAlready && existing && linkedAlready.id !== existing.id) {
    throw new AppError('Esta conta web já está vinculada a outro WhatsApp.', 409);
  }
  if (linkedAlready && !existing) {
    throw new AppError('Esta conta web já está vinculada a outro WhatsApp.', 409);
  }

  if (existing?.authUserId && existing.authUserId !== authUserId) {
    throw new AppError('Este WhatsApp já está vinculado a outra conta web.', 409);
  }

  // Conta WhatsApp já existente (trial ou pago) sem vínculo web: só liga o Auth.
  if (existing?.signupCompletedAt) {
    await assertCanAttachAuthUser(existing, authUserId);
    const nowIso = new Date().toISOString();
    const updated = await updateUserById(existing.id, {
      authUserId,
      phoneVerifiedAt: existing.phoneVerifiedAt || nowIso,
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
    });
    return {
      ok: true,
      userId: updated.id,
      phone,
      trialEndsAt: updated.trialEndsAt,
      welcomeChannel: null,
      whatsappOpenUrl: getSignupWhatsappOpenUrl() || null,
      welcomeEmailQueued: false,
      linkedExisting: true,
    };
  }

  const now = new Date().toISOString();
  const trialEndsAt = computeTrialEndsAt(new Date());
  const signupSource = String(input.signupSource ?? 'landing').trim() || 'landing';
  const supabase = getClient();

  let user;
  if (existing) {
    await assertCanAttachAuthUser(existing, authUserId);
    const { data, error } = await supabase
      .from('users')
      .update({
        name,
        email,
        auth_user_id: authUserId,
        phone_verified_at: now,
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
        auth_user_id: authUserId,
        phone_verified_at: now,
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
        if (/auth_user_id/i.test(String(error.message || ''))) {
          throw new AppError('Esta conta web já está vinculada a outro WhatsApp.', 409);
        }
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
