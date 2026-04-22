import { subscribeUserWithCreditCardMonthly } from '../services/asaasSubscriptionService.js';
import { createSubscriptionRequest } from '../services/billing/subscriptionRequestService.js';
import {
  assertPhoneVerification,
  sendPhoneOtp,
  verifyPhoneOtp,
} from '../services/billing/phoneOtpService.js';
import { sendWhatsAppMessage } from '../services/whatsappService.js';
import { AppError } from '../utils/errors.js';

function assertCheckoutSecret(req) {
  const prod = process.env.NODE_ENV === 'production';
  const secret = process.env.ASAAS_CHECKOUT_API_SECRET?.trim();
  if (prod && !secret) {
    throw new AppError(
      'Em produção defina ASAAS_CHECKOUT_API_SECRET e envie no header x-ag-checkout-secret.',
      500
    );
  }
  if (!secret) {
    console.warn('[billing] ASAAS_CHECKOUT_API_SECRET vazio — endpoint de checkout desprotegido.');
    return;
  }
  const got = String(req.headers['x-ag-checkout-secret'] ?? '').trim();
  if (got !== secret) {
    throw new AppError('Não autorizado (x-ag-checkout-secret).', 401);
  }
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  if (xf) return xf;
  return String(req.socket?.remoteAddress || '').trim() || '127.0.0.1';
}

/**
 * POST /api/billing/asaas/subscribe
 * Body: { phone, planCode, customer, creditCard, creditCardHolderInfo }
 */
function normCustomerType(body) {
  return body?.customerType === 'company' ? 'company' : 'personal';
}

export async function handleAsaasSubscribe(req, res, next) {
  try {
    assertCheckoutSecret(req);
    const ip = clientIp(req);
    const result = await subscribeUserWithCreditCardMonthly({
      ...req.body,
      customerType: normCustomerType(req.body),
      remoteIp: ip,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/billing/requests
 * Cadastro simplificado para página /planos.
 */
export async function handleCreateSubscriptionRequest(req, res, next) {
  try {
    const data = await createSubscriptionRequest(req.body ?? {});
    res.status(201).json({
      ok: true,
      message:
        data.customer_type === 'company'
          ? 'Solicitação da empresa recebida. Nosso time vai entrar em contato.'
          : 'Cadastro recebido. Vamos te chamar no WhatsApp para ativar o plano.',
      request: data,
    });
  } catch (e) {
    next(e);
  }
}

export async function handleBillingOtpSend(req, res, next) {
  try {
    const out = await sendPhoneOtp({
      phone: req.body?.phone,
      planCode: req.body?.planCode,
      customerSegment: normCustomerType(req.body),
    });
    res.status(200).json(out);
  } catch (e) {
    next(e);
  }
}

export async function handleBillingOtpVerify(req, res, next) {
  try {
    const out = await verifyPhoneOtp({
      phone: req.body?.phone,
      planCode: req.body?.planCode,
      code: req.body?.code,
      customerSegment: normCustomerType(req.body),
    });
    res.status(200).json(out);
  } catch (e) {
    next(e);
  }
}

/**
 * Checkout da página /planos (após OTP).
 * Reaproveita assinatura mensal com cartão no Asaas.
 */
export async function handleCheckoutAfterOtp(req, res, next) {
  try {
    const body = req.body ?? {};
    const customerType = normCustomerType(body);
    await assertPhoneVerification({
      phone: body.phone,
      planCode: body.planCode,
      verificationToken: body.verificationToken,
      customerSegment: customerType,
    });

    const ip = clientIp(req);
    const result = await subscribeUserWithCreditCardMonthly({
      phone: body.phone,
      planCode: body.planCode,
      customerType,
      customer: {
        name: body.name,
        email: body.email,
        cpfCnpj: body.cpfCnpj,
        mobilePhone: body.phone,
      },
      creditCard: body.creditCard,
      creditCardHolderInfo: body.creditCardHolderInfo,
      remoteIp: ip,
    });

    const planLabel = result.planName || String(result.planCode || '').toUpperCase() || 'AG Assist';
    const welcomeMsg =
      `Parabéns — você agora faz parte do AG Assist.\n\n` +
      `Plano: ${planLabel}\n` +
      `Status: ${result.status}\n` +
      `Próximo vencimento (referência): ${result.nextDueDate}\n\n` +
      `Continue neste WhatsApp para análises no campo, notícias do agro e suporte no dia a dia. ` +
      `A cobrança mensal segue no cartão que você cadastrou.\n\n` +
      `Bem-vindo e bom trabalho na roça.`;

    try {
      await sendWhatsAppMessage(body.phone, welcomeMsg);
    } catch (e) {
      console.warn('[billing] falha ao enviar confirmação no WhatsApp:', e);
    }

    res.status(201).json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
}
