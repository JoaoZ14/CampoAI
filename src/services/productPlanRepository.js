import { createSupabaseClient } from '../models/supabaseClient.js';
import { DEFAULT_PLANS } from '../config/plans.js';

const defaultByCode = Object.fromEntries(DEFAULT_PLANS.map((p) => [p.code, p]));

/** Teto mensal quando a tabela ainda não tem a coluna (fallback). */
const FALLBACK_MONTHLY_ANALYSIS_CAP = { lite: 35 };

/**
 * Preço e nome do plano ativo (tabela product_plans) com fallback no código.
 * @param {string} code basic | pro | premium
 * @param {'personal'|'company'} [customerSegment]
 * @returns {Promise<{ priceBrl: number, name: string, maxWhatsAppSeats: number|null } | null>}
 */
export async function getProductPlanPriceByCode(code, customerSegment = 'personal') {
  const c = String(code ?? '')
    .trim()
    .toLowerCase();
  if (!c) return null;
  const seg = customerSegment === 'company' ? 'company' : 'personal';

  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from('product_plans')
      .select('price_brl, name, max_whatsapp_seats')
      .eq('code', c)
      .eq('customer_segment', seg)
      .eq('active', true)
      .maybeSingle();

    if (!error && data && Number(data.price_brl) >= 0) {
      return {
        priceBrl: Number(data.price_brl),
        name: String(data.name || c),
        maxWhatsAppSeats:
          data.max_whatsapp_seats == null ? null : Math.max(1, Number(data.max_whatsapp_seats) || 1),
      };
    }
  } catch {
    // tabela pode não existir ainda
  }

  if (seg === 'company') return null;
  const d = defaultByCode[c];
  if (!d) return null;
  return { priceBrl: d.priceBrl, name: d.name, maxWhatsAppSeats: d.seats ?? 1 };
}

/**
 * Teto de análises com IA por mês (null = ilimitado).
 * @param {string} code
 * @param {'personal'|'company'} [customerSegment]
 * @returns {Promise<number|null>}
 */
export async function getProductPlanAnalysisCap(code, customerSegment = 'personal') {
  const c = String(code ?? '')
    .trim()
    .toLowerCase();
  if (!c) return null;
  const seg = customerSegment === 'company' ? 'company' : 'personal';

  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from('product_plans')
      .select('max_analyses_per_month')
      .eq('code', c)
      .eq('customer_segment', seg)
      .eq('active', true)
      .maybeSingle();

    if (!error && data && data.max_analyses_per_month != null && data.max_analyses_per_month !== '') {
      const n = Number(data.max_analyses_per_month);
      if (Number.isFinite(n) && n >= 1) return n;
    }
    if (error && seg === 'personal') {
      const fb = FALLBACK_MONTHLY_ANALYSIS_CAP[c];
      if (typeof fb === 'number' && fb >= 1) return fb;
    }
  } catch {
    // coluna ou tabela ausente
  }

  if (seg === 'company') return null;
  const fb = FALLBACK_MONTHLY_ANALYSIS_CAP[c];
  return typeof fb === 'number' && fb >= 1 ? fb : null;
}
