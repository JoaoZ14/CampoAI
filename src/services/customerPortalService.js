import { createSupabaseClient } from '../models/supabaseClient.js';
import { AppError } from '../utils/errors.js';
import { FREE_TRIAL_DAYS } from '../models/userModel.js';
import { buildUsageAccessContext, getUserById, updateUserById } from './userService.js';
import { addSeatToOrganization, listSeatsForOrganization, removeSeatFromOrganization } from './organizationService.js';

function getClient() {
  return createSupabaseClient();
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
      name: user.name,
      email: user.email,
      cpf: user.cpf,
      billingKind: user.billingKind,
      isPaid: user.isPaid,
      subscriptionPlanCode: user.subscriptionPlanCode,
      asaasSubscriptionStatus: user.asaasSubscriptionStatus,
      trialEndsAt: user.trialEndsAt,
      trialDays: FREE_TRIAL_DAYS,
      phoneVerifiedAt: user.phoneVerifiedAt,
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

function digitsOnly(s) {
  return String(s ?? '').replace(/\D/g, '');
}

export async function updateCustomerProfile(userId, patch) {
  const next = {};
  if (patch.cpf !== undefined) {
    const cpf = digitsOnly(patch.cpf);
    if (cpf && cpf.length !== 11) {
      throw new AppError('CPF deve ter 11 dígitos.', 400);
    }
    next.cpf = cpf || null;
  }
  if (patch.name !== undefined) {
    const name = String(patch.name ?? '').trim();
    if (name && name.length < 3) throw new AppError('Informe um nome válido.', 400);
    if (name) next.name = name;
  }
  if (Object.keys(next).length === 0) {
    throw new AppError('Nenhum campo para atualizar.', 400);
  }
  return updateUserById(userId, next);
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
