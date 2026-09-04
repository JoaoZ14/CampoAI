import { AppError } from '../utils/errors.js';
import { normalizePhone } from '../utils/phone.js';
import { assertSignupVerification } from './signup/signupOtpService.js';
import {
  assertCanAttachAuthUser,
  findUserByPhone,
  updateUserById,
} from './userService.js';

/**
 * Liga uma conta Supabase Auth a um usuário existente (trial ou pago) após OTP.
 * @param {{ authUserId: string, email?: string|null, phone: string, verificationToken: string }} input
 */
export async function linkPhoneToAuthUser(input) {
  const phone = normalizePhone(String(input.phone ?? '').trim());
  if (!phone || phone.length < 10) throw new AppError('Telefone inválido.', 400);

  await assertSignupVerification({
    phone,
    verificationToken: input.verificationToken,
  });

  const user = await findUserByPhone(phone);
  if (!user || !user.signupCompletedAt) {
    throw new AppError(
      'Não encontramos conta neste WhatsApp. Crie a sua em /cadastro.',
      404
    );
  }

  await assertCanAttachAuthUser(user, input.authUserId);

  const email =
    String(input.email ?? '').trim().toLowerCase() || user.email || null;

  const updated = await updateUserById(user.id, {
    authUserId: input.authUserId,
    phoneVerifiedAt: user.phoneVerifiedAt || new Date().toISOString(),
    ...(email ? { email } : {}),
  });

  return {
    ok: true,
    userId: updated.id,
    phone: updated.phone,
  };
}
