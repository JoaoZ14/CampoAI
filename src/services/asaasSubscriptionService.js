import { asaasRequest } from './asaasClient.js';
import {
  brazilMonthYm,
  subscriptionChargeFromMonthlyPrice,
  normalizeBillingCycle,
  assertAcceptedOffer,
} from '../config/billing.js';
import { getProductPlanPriceByCode } from './productPlanRepository.js';
import { normalizePhone } from '../utils/phone.js';
import * as userService from './userService.js';
import { createSupabaseClient } from '../models/supabaseClient.js';
import { AppError } from '../utils/errors.js';
import * as organizationService from './organizationService.js';
import { reconcileAsaasSubscription } from './billing/asaasAccessService.js';

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
async function loadUserBillingRow(phone, supabase) {
  const { data, error } = await supabase
    .from('users')
    .select('id, phone, asaas_customer_id, asaas_subscription_id, is_paid, organization_id, asaas_checkout_uncertain, subscription_terms')
    .eq('phone', phone)
    .maybeSingle();

  if (error) {
    throw new AppError(`Erro ao ler usuário: ${error.message}`, 500);
  }
  return data;
}

/**
 * Cria cliente + assinatura com cartão. Acesso depende de pagamento confirmado.
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
 *   authUserId?: string,
 * }} input
 */
export async function subscribeUserWithCreditCardMonthly(input, options = {}) {
  const db = options.db ?? createSupabaseClient();
  const users = options.users ?? userService;
  const organizations = options.organizations ?? organizationService;
  const request = options.request ?? asaasRequest;
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
  const plan = await (options.getPlan ?? getProductPlanPriceByCode)(planCode, customerType);
  if (!plan) {
    throw new AppError('Plano não encontrado.', 404);
  }
  assertAcceptedOffer(plan.terms, input.acceptedOffer);

  const billingCycle = normalizeBillingCycle(input.billingCycle);
  const { value: chargeValue, cycle: asaasCycle } = subscriptionChargeFromMonthlyPrice(
    plan.priceBrl,
    billingCycle
  );

  await users.findOrCreateUser(phone);
  const row = await loadUserBillingRow(phone, db);
  if (!row) {
    throw new AppError('Usuário não encontrado após criação.', 500);
  }

  const authUserId = String(input.authUserId ?? '').trim() || null;
  if (authUserId) {
    const mapped = await users.getUserById(row.id);
    await users.assertCanAttachAuthUser(mapped, authUserId);
  }

  if (row.asaas_subscription_id) {
    throw new AppError(
      'Este número já possui assinatura Asaas cadastrada. Use o painel Asaas ou suporte para alterar.',
      409
    );
  }
  if (row.is_paid) throw new AppError('Este número já possui uma assinatura. Fale com o suporte GMK para alterar o plano.',409);
  if (row.organization_id) {
    const { data: org, error } = await db.from('organizations').select('owner_user_id').eq('id', row.organization_id).maybeSingle();
    if (error || org?.owner_user_id !== row.id) {
      throw new AppError('Este número participa de uma assinatura de equipe. Fale com o titular ou com o suporte antes de contratar outra assinatura.', 409);
    }
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

  const claimed = await users.claimAsaasCheckoutLock(row.id);
  if (!claimed) {
    throw new AppError(
      'Este número já possui assinatura ativa ou há um pagamento em andamento. Aguarde alguns minutos e tente novamente.',
      409
    );
  }

  try {
    const rowFresh = await loadUserBillingRow(phone, db);
    if (rowFresh?.asaas_subscription_id) {
      throw new AppError(
        'Este número já possui assinatura Asaas cadastrada. Use o painel Asaas ou suporte para alterar.',
        409
      );
    }

    const remoteIp = String(input.remoteIp || '').trim() || '127.0.0.1';
    const userId = row.id;
    // Recovery precedes every create. A timeout after POST never permits a blind retry.
    const recovered = await request(`/subscriptions?externalReference=${encodeURIComponent(userId)}&limit=2`);
    if (!Array.isArray(recovered.data) || recovered.hasMore!==false || recovered.data.length>1) throw new AppError('Há uma assinatura em conciliação. Fale com o suporte GMK.',409);
    let sub = recovered.data[0] ?? null;
    if (sub && (sub.externalReference!==userId || sub.billingType!=='CREDIT_CARD'
      || sub.cycle!==asaasCycle || Math.round(Number(sub.value)*100)!==Math.round(chargeValue*100)
      || sub.deleted || sub.status!=='ACTIVE')) throw new AppError('Uma assinatura anterior precisa ser conferida pelo suporte antes de continuar.',409);
    if (!sub && rowFresh.asaas_checkout_uncertain) throw new AppError('Seu pagamento ainda está em conferência. Não é necessário pagar novamente. Fale com o suporte GMK.',409);
    if (sub && rowFresh.subscription_terms) {
      assertAcceptedOffer(plan.terms,rowFresh.subscription_terms);
      if(rowFresh.subscription_terms.billingCycle && rowFresh.subscription_terms.billingCycle!==asaasCycle) throw new AppError('O ciclo da assinatura anterior precisa ser conferido pelo suporte GMK.',409);
    }
    // Preserve the accepted offer before any charge, after validating recovery.
    await users.updateUserById(userId, { subscriptionTerms: {...plan.terms,billingCycle:asaasCycle,chargeValue} });

    let customerId =
      sub?.customer || rowFresh?.asaas_customer_id?.trim() || row.asaas_customer_id?.trim() || '';
    if (!customerId) {
      const customerBody = {
        name: cust.name.trim(),
        email: cust.email.trim().toLowerCase(),
        cpfCnpj: digits(cust.cpfCnpj),
        mobilePhone: digits(cust.mobilePhone || phone),
        externalReference: userId,
        notificationDisabled: false,
      };
      const created = await request('/customers', { method: 'POST', body: customerBody });
      customerId = String(created.id || '').trim();
      if (!customerId) {
        throw new AppError('Asaas não retornou o id do cliente.', 502);
      }
      await users.updateUserById(userId, { asaasCustomerId: customerId });
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
      description: `AGGI — ${plan.name} (${cycleLabel})`.slice(0, 500),
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

    // Prepare account/team before the charge; failures here cannot leave a paid,
    // unusable subscription. Provisioning a seat never grants the owner access.
    let organizationId = rowFresh.organization_id || null;
    await users.updateUserById(userId, {
      billingKind:customerType==='company'?'team':'personal',
      asaasCustomerId:customerId,subscriptionPlanCode:planCode,
      ...(authUserId?{authUserId}:{}),phoneVerifiedAt:new Date().toISOString(),
    });
    if (customerType==='company' || plan.maxWhatsAppSeats>1) {
      if (!organizationId) {
        const org=await organizations.createOrganization({name:cust.name.trim(),maxSeats:plan.maxWhatsAppSeats,ownerUserId:userId});
        organizationId=org.id;
        await users.updateUserById(userId,{organizationId});
      }
      const seats=await organizations.listSeatsForOrganization(organizationId);
      if (!seats.some(seat=>seat.phone===phone && seat.active)) await organizations.addSeatToOrganization(organizationId,phone);
    }
    if (!sub) {
      await users.updateUserById(userId,{asaasCheckoutUncertain:true});
      try { sub = await request('/subscriptions', {method:'POST',body:subBody}); }
      catch(error) {
        if (error.statusCode>=400 && error.statusCode<500 && error.statusCode!==408 && error.statusCode!==429) {
          await users.updateUserById(userId,{asaasCheckoutUncertain:false});
        }
        throw error;
      }
    }
    const subId = String(sub.id || '').trim();
    const status = String(sub.status || 'ACTIVE').trim();

    if (!/^sub_[a-z0-9]+$/i.test(subId)) {
      throw new AppError('Asaas não retornou o id da assinatura.', 502);
    }

    const cpfDigits = digits(cust.cpfCnpj);
    await users.updateUserById(userId, {
      isPaid: false,
      billingAccessStatus: 'PENDING',
      subscriptionPaidUntil: null,
      asaasCheckoutUncertain: false,
      billingKind: customerType === 'company' ? 'team' : 'personal',
      asaasCustomerId: customerId,
      asaasSubscriptionId: subId,
      subscriptionPlanCode: planCode,
      asaasSubscriptionStatus: status,
      asaasCheckoutStartedAt: null,
      billingUsageYm: brazilMonthYm(),
      billingUsageCount: 0,
      ...(authUserId ? { authUserId } : {}),
      phoneVerifiedAt: new Date().toISOString(),
      ...(cpfDigits.length === 11 ? { cpf: cpfDigits } : {}),
      email: cust.email.trim().toLowerCase(),
      name: cust.name.trim(),
    });

    let access = {paymentConfirmed:false,accessStatus:'PENDING'};
    try {access=await reconcileAsaasSubscription(subId,null,{db,request});}
    catch { console.warn('[asaas] Assinatura criada; confirmação financeira pendente de webhook.',{subscriptionId:subId}); }

    return {
      subscriptionId: subId,
      customerId,
      status,
      ...access,
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
    await users.releaseAsaasCheckoutClaim(row.id);
    throw e;
  }
}

/**
 * Libera acesso ao receber cobrança confirmada (webhook).
 * @param {string} subscriptionId sub_...
 */
export async function activateUserByAsaasSubscriptionId(subscriptionId) {
  return reconcileAsaasSubscription(String(subscriptionId ?? '').trim());
}

/** Support recovery after an ambiguous create: GETs only; never asks for a card. */
export async function recoverPendingAsaasCheckout(userId, options={}) {
  const db=options.db ?? createSupabaseClient();
  const request=options.request ?? asaasRequest;
  const users=options.users ?? userService;
  const {data:row,error}=await db.from('users').select('*').eq('id',userId).maybeSingle();
  if(error || !row) throw new AppError('Não foi possível localizar a assinatura para conferência.',503);
  if(row.asaas_subscription_id) return reconcileAsaasSubscription(row.asaas_subscription_id,null,{db,request});
  if(!row.asaas_checkout_uncertain || row.is_paid) throw new AppError('Não há checkout pendente elegível para recuperação.',409);
  if(!await users.claimAsaasCheckoutLock(userId)) throw new AppError('Checkout em andamento. Aguarde para conferir.',409);
  try {
    const terms=row.subscription_terms;
    const found=await request(`/subscriptions?externalReference=${encodeURIComponent(userId)}&limit=2`);
    if(!Array.isArray(found.data) || found.hasMore!==false || found.data.length!==1) throw new AppError('Ainda não há uma assinatura única confirmada para vincular. Nenhuma cobrança foi criada.',409);
    const sub=found.data[0];
    if(!terms || !Number.isFinite(terms.chargeValue) || terms.chargeValue<=0
      || sub.externalReference!==userId || sub.customer!==row.asaas_customer_id
      || sub.cycle!==terms.billingCycle || sub.billingType!=='CREDIT_CARD'
      || Math.round(Number(sub.value)*100)!==Math.round(terms.chargeValue*100)
      || !/^sub_[a-z0-9]+$/i.test(sub.id) || sub.deleted || sub.status!=='ACTIVE') throw new AppError('A assinatura exige conferência manual das condições contratadas.',409);
    await users.updateUserById(userId,{asaasSubscriptionId:sub.id,asaasSubscriptionStatus:sub.status,
      asaasCheckoutUncertain:false,asaasCheckoutStartedAt:null,isPaid:false,billingAccessStatus:'PENDING',subscriptionPaidUntil:null});
    return reconcileAsaasSubscription(sub.id,null,{db,request});
  } finally { await users.releaseAsaasCheckoutClaim(userId); }
}
