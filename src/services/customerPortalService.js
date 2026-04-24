import crypto from 'node:crypto';
import { createSupabaseClient } from '../models/supabaseClient.js';
import { AppError } from '../utils/errors.js';
import { normalizePhone } from '../utils/phone.js';
import { createCustomerSessionToken } from '../utils/customerSession.js';
import { buildUsageAccessContext, getUserById } from './userService.js';
import { addSeatToOrganization, listSeatsForOrganization, removeSeatFromOrganization } from './organizationService.js';

function getClient() {
  return createSupabaseClient();
}

function verifyPassword(rawPassword, storedHash) {
  const txt = String(storedHash ?? '');
  if (!txt.startsWith('scrypt$')) return false;
  const parts = txt.split('$');
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const digest = parts[2];
  if (!salt || !digest) return false;
  const probe = crypto.scryptSync(String(rawPassword ?? ''), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(probe), Buffer.from(digest));
}

function safeRole(billingKind) {
  return billingKind === 'team' ? 'company' : 'personal';
}

async function getLatestCredentialByEmail(email) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('subscription_requests')
    .select('email, phone, password_hash, created_at')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new AppError(`Erro ao autenticar: ${error.message}`, 500);
  return data?.[0] ?? null;
}

export async function loginCustomerByEmailPassword(emailRaw, passwordRaw) {
  const email = String(emailRaw ?? '').trim().toLowerCase();
  const password = String(passwordRaw ?? '');
  if (!email || !email.includes('@')) throw new AppError('E-mail inválido.', 400);
  if (password.length < 4) throw new AppError('Senha inválida.', 400);

  const credential = await getLatestCredentialByEmail(email);
  if (!credential || !verifyPassword(password, credential.password_hash)) {
    throw new AppError('Credenciais inválidas.', 401);
  }

  const phone = normalizePhone(String(credential.phone ?? '').trim());
  if (!phone) throw new AppError('Telefone da conta inválido.', 400);

  const supabase = getClient();
  const { data: userRow, error } = await supabase.from('users').select('*').eq('phone', phone).maybeSingle();
  if (error) throw new AppError(`Erro ao carregar conta: ${error.message}`, 500);
  if (!userRow) throw new AppError('Conta não encontrada para esse telefone.', 404);

  const user = {
    id: userRow.id,
    phone: userRow.phone,
    billingKind: userRow.billing_kind,
  };

  const token = createCustomerSessionToken({
    sub: user.id,
    phone: user.phone,
    email,
    role: safeRole(user.billingKind),
  });

  return {
    token,
    account: {
      userId: user.id,
      phone: user.phone,
      email,
      role: safeRole(user.billingKind),
    },
  };
}

async function getPlanMetaForUser(user) {
  const supabase = getClient();
  const code = String(user.subscriptionPlanCode || '').toLowerCase();
  if (!code) return null;
  const seg = user.billingKind === 'team' ? 'company' : 'personal';
  const { data } = await supabase
    .from('product_plans')
    .select('code, name, customer_segment, price_brl, billing_period_label, max_whatsapp_seats, max_analyses_per_month')
    .eq('code', code)
    .eq('customer_segment', seg)
    .maybeSingle();
  return data
    ? {
        code: data.code,
        name: data.name,
        customerSegment: data.customer_segment,
        priceBrl: Number(data.price_brl) || 0,
        billingPeriodLabel: data.billing_period_label || 'mês',
        maxWhatsappSeats: data.max_whatsapp_seats ?? null,
        maxAnalysesPerMonth: data.max_analyses_per_month ?? null,
      }
    : null;
}

async function getOwnedOrganizationOrNull(userId) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, max_seats, is_active, owner_user_id')
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (error) {
    if (/owner_user_id/i.test(String(error.message || ''))) {
      return null;
    }
    throw new AppError(`Erro ao carregar organização: ${error.message}`, 500);
  }
  return data ?? null;
}

export async function getCustomerDashboard(userId) {
  const user = await getUserById(userId);
  const usage = await buildUsageAccessContext(user);
  const plan = await getPlanMetaForUser(user);
  const org = await getOwnedOrganizationOrNull(user.id);
  const seats = org ? await listSeatsForOrganization(org.id) : [];
  return {
    profile: {
      id: user.id,
      phone: user.phone,
      billingKind: user.billingKind,
      isPaid: user.isPaid,
      subscriptionPlanCode: user.subscriptionPlanCode,
      asaasSubscriptionStatus: user.asaasSubscriptionStatus,
    },
    usage,
    plan,
    organization: org
      ? {
          id: org.id,
          name: org.name,
          maxSeats: org.max_seats,
          isActive: org.is_active,
          ownerUserId: org.owner_user_id,
          seats,
        }
      : null,
  };
}

async function requireOwnedOrganization(userId) {
  const org = await getOwnedOrganizationOrNull(userId);
  if (!org) throw new AppError('Somente o titular da conta empresa pode gerenciar números.', 403);
  if (!org.is_active) throw new AppError('Organização inativa.', 400);
  return org;
}

export async function addCustomerSeat(userId, phone) {
  const org = await requireOwnedOrganization(userId);
  return addSeatToOrganization(org.id, phone);
}

export async function removeCustomerSeat(userId, phone) {
  const org = await requireOwnedOrganization(userId);
  return removeSeatFromOrganization(org.id, phone);
}
