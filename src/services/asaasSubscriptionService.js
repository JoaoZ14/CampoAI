import { asaasRequest } from './asaasClient.js';
import {
  brazilMonthYm,
  subscriptionChargeFromMonthlyPrice,
  normalizeBillingCycle,
} from '../config/billing.js';
import { getProductPlanPriceByCode } from './productPlanRepository.js';
import { normalizePhone } from '../utils/phone.js';
import {
  findOrCreateUser,
  updateUserById,
  claimAsaasCheckoutLock,
  releaseAsaasCheckoutClaim,
} from './userService.js';
import { createSupabaseClient } from '../models/supabaseClient.js';
import { AppError } from '../utils/errors.js';
import { addSeatToOrganization, createOrganization } from './organizationService.js';

const ALLOWED_PLANS = new Set(['lite', 'basic', 'pro', 'premium']);

/** Data YYYY-MM-DD em America/Sao_Paulo (vencimento / primeira cobrança). */
export function brazilTodayYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function digits(s) {
  return String(s ?? '').replace(/\D/g, '');
}

/**
 * @param {string} phone E.164
 */
async function loadUserBillingRow(phone) {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, phone, asaas_customer_id, asaas_subscription_id, is_paid, organization_id')
    .eq('phone', phone)
    .maybeSingle();

  if (error) {
    throw new AppError(`Erro ao ler usuário: ${error.message}`, 500);
  }
  return data;
}

/**
 * Cria cliente + assinatura com cartão no Asaas (ciclo mensal ou anual) e marca usuário como pago.
 * A primeira cobrança usa `nextDueDate` (padrão: hoje no horário de Brasília) para cobrar na criação quando o Asaas processar o ciclo.
 *
 * @param {{
 *   phone: string,
 *   planCode: string,
 *   customerType?: 'personal'|'company',
 *   customer: { name: string, email: string, cpfCnpj: string, mobilePhone?: string },
 *   creditCard: { holderName: string, number: string, expiryMonth: string, expiryYear: string, ccv: string },
 *   creditCardHolderInfo: Record<string, string>,
 *   remoteIp: string,
 *   billingCycle?: 'MONTHLY'|'YEARLY'|string,
 * }} input
 */
export async function subscribeUserWithCreditCardMonthly(input) {
  const phone = normalizePhone(input.phone);
  if (!phone || phone.length < 10) {
    throw new AppError('Telefone inválido.', 400);
  }

  const planCode = String(input.planCode ?? '')
    .trim()
    .toLowerCase();
  if (!ALLOWED_PLANS.has(planCode)) {
    throw new AppError('planCode deve ser lite, basic, pro ou premium.', 400);
  }

  const customerType = input.customerType === 'company' ? 'company' : 'personal';
  const plan = await getProductPlanPriceByCode(planCode, customerType);
  if (!plan) {
    throw new AppError('Plano não encontrado.', 404);
  }

  const billingCycle = normalizeBillingCycle(input.billingCycle);
  const { value: chargeValue, cycle: asaasCycle } = subscriptionChargeFromMonthlyPrice(
    plan.priceBrl,
    billingCycle
  );

  await findOrCreateUser(phone);
  const row = await loadUserBillingRow(phone);
  if (!row) {
    throw new AppError('Usuário não encontrado após criação.', 500);
  }

  if (row.asaas_subscription_id) {
    throw new AppError(
      'Este número já possui assinatura Asaas cadastrada. Use o painel Asaas ou suporte para alterar.',
      409
    );
  }

  const cust = input.customer;
  if (!cust?.name?.trim() || !cust?.email?.trim() || !cust?.cpfCnpj?.trim()) {
    throw new AppError('customer.name, customer.email e customer.cpfCnpj são obrigatórios.', 400);
  }

  const cc = input.creditCard;
  if (!cc?.holderName || !cc?.number || !cc?.expiryMonth || !cc?.expiryYear || !cc?.ccv) {
    throw new AppError('Dados do cartão incompletos.', 400);
  }

  const holder = input.creditCardHolderInfo;
  if (!holder || typeof holder !== 'object') {
    throw new AppError('creditCardHolderInfo é obrigatório.', 400);
  }
  if (!String(holder.postalCode || '').trim()) {
    throw new AppError('creditCardHolderInfo.postalCode é obrigatório (CEP).', 400);
  }
  if (!String(holder.addressNumber || '').trim()) {
    throw new AppError('creditCardHolderInfo.addressNumber é obrigatório.', 400);
  }

  const claimed = await claimAsaasCheckoutLock(row.id);
  if (!claimed) {
    throw new AppError(
      'Este número já possui assinatura ativa ou há um pagamento em andamento. Aguarde alguns minutos e tente novamente.',
      409
    );
  }

  try {
    const rowFresh = await loadUserBillingRow(phone);
    if (rowFresh?.asaas_subscription_id) {
      throw new AppError(
        'Este número já possui assinatura Asaas cadastrada. Use o painel Asaas ou suporte para alterar.',
        409
      );
    }

    const remoteIp = String(input.remoteIp || '').trim() || '127.0.0.1';
    const userId = row.id;

    let customerId =
      rowFresh?.asaas_customer_id?.trim() || row.asaas_customer_id?.trim() || '';
    if (!customerId) {
      const customerBody = {
        name: cust.name.trim(),
        email: cust.email.trim().toLowerCase(),
        cpfCnpj: digits(cust.cpfCnpj),
        mobilePhone: digits(cust.mobilePhone || phone),
        externalReference: userId,
        notificationDisabled: false,
      };
      const created = await asaasRequest('/customers', { method: 'POST', body: customerBody });
      customerId = String(created.id || '').trim();
      if (!customerId) {
        throw new AppError('Asaas não retornou o id do cliente.', 502);
      }
      await updateUserById(userId, { asaasCustomerId: customerId });
    }

    const nextDue =
      process.env.ASAAS_FIRST_CHARGE_DATE?.trim() || brazilTodayYmd();

    const cycleLabel = asaasCycle === 'YEARLY' ? 'anual' : 'mensal';
    const subBody = {
      customer: customerId,
      billingType: 'CREDIT_CARD',
      value: chargeValue,
      nextDueDate: nextDue,
      cycle: asaasCycle,
      description: `AG Assist — ${plan.name} (${cycleLabel})`.slice(0, 500),
      externalReference: userId,
      creditCard: {
        holderName: String(cc.holderName).trim(),
        number: digits(cc.number),
        expiryMonth: String(cc.expiryMonth).trim(),
        expiryYear: String(cc.expiryYear).trim(),
        ccv: String(cc.ccv).trim(),
      },
      creditCardHolderInfo: {
        ...holder,
        cpfCnpj: digits(holder.cpfCnpj || cust.cpfCnpj),
        email: String(holder.email || cust.email)
          .trim()
          .toLowerCase(),
        name: String(holder.name || cust.name).trim(),
      },
      remoteIp,
    };

    const sub = await asaasRequest('/subscriptions', { method: 'POST', body: subBody });
    const subId = String(sub.id || '').trim();
    const status = String(sub.status || 'ACTIVE').trim();

    if (!subId) {
      throw new AppError('Asaas não retornou o id da assinatura.', 502);
    }

    await updateUserById(userId, {
      isPaid: true,
      billingKind: customerType === 'company' ? 'team' : 'personal',
      asaasCustomerId: customerId,
      asaasSubscriptionId: subId,
      subscriptionPlanCode: planCode,
      asaasSubscriptionStatus: status,
      asaasCheckoutStartedAt: null,
      billingUsageYm: brazilMonthYm(),
      billingUsageCount: 0,
    });

    if (customerType === 'company') {
      let organizationId = rowFresh?.organization_id || row.organization_id || null;
      if (!organizationId) {
        const org = await createOrganization({
          name: cust.name.trim(),
          maxSeats: plan.maxWhatsAppSeats ?? 1,
          ownerUserId: userId,
        });
        organizationId = org.id;
      }

      await updateUserById(userId, {
        organizationId,
        billingKind: 'team',
        isPaid: true,
      });
      await addSeatToOrganization(organizationId, phone);
    }

    return {
      subscriptionId: subId,
      customerId,
      status,
      planCode,
      planName: plan.name,
      customerType,
      value: chargeValue,
      monthlyPriceBrl: plan.priceBrl,
      billingCycle: asaasCycle,
      nextDueDate: nextDue,
      userId,
    };
  } catch (e) {
    await releaseAsaasCheckoutClaim(row.id);
    throw e;
  }
}

/**
 * Libera acesso ao receber cobrança confirmada (webhook).
 * @param {string} subscriptionId sub_...
 */
export async function activateUserByAsaasSubscriptionId(subscriptionId) {
  const id = String(subscriptionId ?? '').trim();
  if (!id) return { ok: false, reason: 'empty' };

  const supabase = createSupabaseClient();
  const { data: rows, error } = await supabase
    .from('users')
    .select('id')
    .eq('asaas_subscription_id', id)
    .limit(1);

  if (error) {
    console.error('[asaas] webhook find user:', error.message);
    return { ok: false, reason: 'db' };
  }

  const row = rows?.[0];
  if (!row) {
    return { ok: false, reason: 'unknown_subscription' };
  }

  await updateUserById(row.id, {
    isPaid: true,
    billingKind: 'personal',
  });
  return { ok: true, userId: row.id };
}
