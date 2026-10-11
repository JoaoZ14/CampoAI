import { createSupabaseClient } from '../models/supabaseClient.js';
import { AppError } from '../utils/errors.js';

// Checkout requires the typed database offer. Never charge a fallback price.
export async function getProductPlanPriceByCode(code, customerSegment = 'personal') {
  const segment = customerSegment === 'company' ? 'company' : 'personal';
  const { data, error } = await createSupabaseClient().from('product_plans')
    .select('code, customer_segment, price_brl, name, max_whatsapp_seats, max_analyses_per_month, pricing_version')
    .eq('code', String(code ?? '').trim().toLowerCase()).eq('customer_segment', segment).eq('active', true).maybeSingle();
  if (error) throw new AppError('Não foi possível confirmar o preço e as condições do plano. Tente novamente em instantes.', 503);
  if (!data) return null;
  const price = Number(data.price_brl);
  const cap = data.max_analyses_per_month == null ? null : Number(data.max_analyses_per_month);
  if (!Number.isFinite(price) || price <= 0 || (data.pricing_version === '2026-10' && cap == null) || (cap != null && (!Number.isInteger(cap) || cap < 1))) {
    throw new AppError('As condições deste plano estão indisponíveis. Fale com o suporte.', 503);
  }
  const terms = { version: data.pricing_version, code: data.code, customerSegment: segment, name: data.name, priceBrl: price, maxAnalysesPerMonth: cap, seats: Number(data.max_whatsapp_seats) || 1 };
  return { priceBrl: price, name: data.name, maxWhatsAppSeats: terms.seats, terms };
}

// Only for legacy accounts without a stored subscription snapshot.
export async function getProductPlanAnalysisCap(code, customerSegment = 'personal') {
  const { data, error } = await createSupabaseClient().from('product_plans').select('max_analyses_per_month')
    .eq('code', String(code ?? '').trim().toLowerCase()).eq('customer_segment', customerSegment).maybeSingle();
  if (error) throw new AppError('Não foi possível conferir o uso da assinatura agora. Tente novamente.', 503);
  return data?.max_analyses_per_month ?? null;
}
