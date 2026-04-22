import crypto from 'node:crypto';
import { createSupabaseClient } from '../../models/supabaseClient.js';
import { normalizePhone } from '../../utils/phone.js';
import { AppError } from '../../utils/errors.js';
import { sendWhatsAppMessage } from '../whatsappService.js';

const OTP_TTL_MIN = Math.max(1, Number(process.env.OTP_PHONE_TTL_MIN) || 5);
const TOKEN_TTL_MIN = Math.max(5, Number(process.env.OTP_PHONE_TOKEN_TTL_MIN) || 30);
const RESEND_COOLDOWN_SEC = 45;
const MAX_ATTEMPTS = 5;

function getClient() {
  return createSupabaseClient();
}

function nowPlusMin(min) {
  return new Date(Date.now() + min * 60 * 1000).toISOString();
}

function sha(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function randomCode6() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

function normCustomerSegment(v) {
  return v === 'company' ? 'company' : 'personal';
}

function validPlanCode(planCode) {
  const p = String(planCode ?? '')
    .trim()
    .toLowerCase();
  if (p === 'basic' || p === 'pro' || p === 'premium') return p;
  throw new AppError('Plano inválido para confirmação.', 400);
}

export async function sendPhoneOtp({ phone, planCode, customerSegment }) {
  const normalized = normalizePhone(String(phone ?? '').trim());
  if (!normalized || normalized.length < 10) throw new AppError('Telefone inválido.', 400);
  const plan = validPlanCode(planCode);
  const segment = normCustomerSegment(customerSegment);
  const supabase = getClient();

  const { data: lastRows, error: qErr } = await supabase
    .from('billing_phone_otp')
    .select('created_at')
    .eq('phone', normalized)
    .order('created_at', { ascending: false })
    .limit(1);
  if (qErr) throw new AppError(`Erro ao consultar OTP: ${qErr.message}`, 500);

  const last = lastRows?.[0];
  if (last?.created_at) {
    const sec = Math.floor((Date.now() - new Date(last.created_at).getTime()) / 1000);
    if (sec < RESEND_COOLDOWN_SEC) {
      throw new AppError(
        `Aguarde ${RESEND_COOLDOWN_SEC - sec}s para pedir outro código.`,
        429
      );
    }
  }

  const code = randomCode6();
  const insertRow = {
    phone: normalized,
    plan_code: plan,
    customer_segment: segment,
    code_hash: sha(code),
    expires_at: nowPlusMin(OTP_TTL_MIN),
  };

  const { error: insErr } = await supabase.from('billing_phone_otp').insert(insertRow);
  if (insErr) throw new AppError(`Erro ao salvar OTP: ${insErr.message}`, 500);

  await sendWhatsAppMessage(
    normalized,
    `Código AG Assist: ${code}\n\nValidade: ${OTP_TTL_MIN} minutos.\nSe não foi você, ignore esta mensagem.`
  );
  return { ok: true, phone: normalized, planCode: plan, expiresInMinutes: OTP_TTL_MIN };
}

export async function verifyPhoneOtp({ phone, planCode, code, customerSegment }) {
  const normalized = normalizePhone(String(phone ?? '').trim());
  if (!normalized || normalized.length < 10) throw new AppError('Telefone inválido.', 400);
  const plan = validPlanCode(planCode);
  const segment = normCustomerSegment(customerSegment);
  const codeRaw = String(code ?? '').replaceAll(/\D/g, '');
  if (codeRaw.length !== 6) throw new AppError('Código deve ter 6 dígitos.', 400);

  const supabase = getClient();
  const { data: rows, error } = await supabase
    .from('billing_phone_otp')
    .select('id, code_hash, attempt_count, expires_at, verified_at')
    .eq('phone', normalized)
    .eq('plan_code', plan)
    .eq('customer_segment', segment)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new AppError(`Erro ao verificar OTP: ${error.message}`, 500);
  const row = rows?.[0];
  if (!row) throw new AppError('Nenhum código encontrado para este telefone.', 404);
  if (row.verified_at) throw new AppError('Este código já foi usado.', 409);
  if (new Date(row.expires_at).getTime() < Date.now()) throw new AppError('Código expirado.', 400);
  if ((row.attempt_count ?? 0) >= MAX_ATTEMPTS) throw new AppError('Muitas tentativas. Peça novo código.', 429);

  if (sha(codeRaw) !== row.code_hash) {
    await supabase
      .from('billing_phone_otp')
      .update({ attempt_count: (row.attempt_count ?? 0) + 1 })
      .eq('id', row.id);
    throw new AppError('Código inválido.', 400);
  }

  const token = randomToken();
  const tokenExp = nowPlusMin(TOKEN_TTL_MIN);
  const { error: upErr } = await supabase
    .from('billing_phone_otp')
    .update({
      verified_at: new Date().toISOString(),
      verification_token: token,
      token_expires_at: tokenExp,
    })
    .eq('id', row.id);
  if (upErr) throw new AppError(`Erro ao salvar validação OTP: ${upErr.message}`, 500);

  await sendWhatsAppMessage(normalized, 'Telefone confirmado com sucesso. Você pode continuar sua assinatura.');
  return { ok: true, verificationToken: token, tokenExpiresAt: tokenExp };
}

export async function assertPhoneVerification({ phone, planCode, verificationToken, customerSegment }) {
  const normalized = normalizePhone(String(phone ?? '').trim());
  const plan = validPlanCode(planCode);
  const segment = normCustomerSegment(customerSegment);
  const token = String(verificationToken ?? '').trim();
  if (!normalized || !token) throw new AppError('Verificação inválida.', 401);

  const supabase = getClient();
  const { data: rows, error } = await supabase
    .from('billing_phone_otp')
    .select('id, token_expires_at')
    .eq('phone', normalized)
    .eq('plan_code', plan)
    .eq('customer_segment', segment)
    .eq('verification_token', token)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new AppError(`Erro ao validar token: ${error.message}`, 500);
  const row = rows?.[0];
  if (!row) throw new AppError('Token de verificação inválido.', 401);
  if (!row.token_expires_at || new Date(row.token_expires_at).getTime() < Date.now()) {
    throw new AppError('Token de verificação expirado.', 401);
  }
}
