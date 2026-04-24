import crypto from 'node:crypto';
import { createSupabaseClient } from '../../models/supabaseClient.js';
import { normalizePhone } from '../../utils/phone.js';
import { AppError } from '../../utils/errors.js';

function getClient() {
  return createSupabaseClient();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

function normalizePlanCode(planCode) {
  const code = String(planCode ?? '')
    .trim()
    .toLowerCase();
  if (code === 'lite' || code === 'basic' || code === 'pro' || code === 'premium') return code;
  throw new AppError('Plano inválido. Use basic, pro ou premium.', 400);
}

async function assertProductPlanPair(planCode, customerType) {
  const supabase = getClient();
  const segment = customerType === 'company' ? 'company' : 'personal';
  const { data, error } = await supabase
    .from('product_plans')
    .select('id')
    .eq('code', planCode)
    .eq('customer_segment', segment)
    .eq('active', true)
    .maybeSingle();
  if (error || !data) {
    throw new AppError('Plano indisponível para este tipo de conta (CPF/CNPJ).', 400);
  }
}

/**
 * @param {{
 *  customerType: 'personal'|'company',
 *  planCode: string,
 *  name: string,
 *  phone: string,
 *  password: string,
 *  companyName?: string,
 *  cnpj?: string,
 *  contactName?: string,
 *  email?: string,
 *  notes?: string,
 * }} body
 */
export async function createSubscriptionRequest(body) {
  const customerType = body.customerType === 'company' ? 'company' : 'personal';
  const planCode = normalizePlanCode(body.planCode);
  await assertProductPlanPair(planCode, customerType);
  const name = String(body.name ?? '').trim();
  if (name.length < 3) {
    throw new AppError('Informe um nome válido.', 400);
  }

  const phone = normalizePhone(String(body.phone ?? '').trim());
  if (!phone || phone.length < 10) {
    throw new AppError('Telefone inválido.', 400);
  }

  const password = String(body.password ?? '');
  if (password.length < 4) {
    throw new AppError('Senha deve ter no mínimo 4 caracteres.', 400);
  }
  const passwordHash = hashPassword(password);

  const payload = {
    customer_type: customerType,
    plan_code: planCode,
    name,
    phone,
    password_hash: passwordHash,
    company_name: null,
    cnpj: null,
    contact_name: null,
    email: null,
    notes: null,
    status: 'new',
  };

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new AppError('Informe um e-mail válido para acessar a área do cliente.', 400);
  }
  payload.email = email;

  if (customerType === 'company') {
    const companyName = String(body.companyName ?? '').trim();
    const cnpj = String(body.cnpj ?? '').replace(/\D/g, '');
    const contactName = String(body.contactName ?? '').trim();
    const notes = String(body.notes ?? '').trim();

    if (companyName.length < 2) {
      throw new AppError('Empresa: informe a razão social/nome da empresa.', 400);
    }
    if (cnpj.length !== 14) {
      throw new AppError('Empresa: CNPJ inválido.', 400);
    }
    if (contactName.length < 3) {
      throw new AppError('Empresa: informe o nome do responsável.', 400);
    }
    if (!email || !email.includes('@')) {
      throw new AppError('Empresa: e-mail inválido.', 400);
    }

    payload.company_name = companyName;
    payload.cnpj = cnpj;
    payload.contact_name = contactName;
    payload.notes = notes || null;
  }

  const supabase = getClient();
  const { data, error } = await supabase
    .from('subscription_requests')
    .insert(payload)
    .select('id, customer_type, plan_code, name, phone, status, created_at')
    .single();

  if (error) {
    throw new AppError(`Erro ao salvar solicitação: ${error.message}`, 500);
  }
  return data;
}
