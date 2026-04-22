import { createSupabaseClient } from '../models/supabaseClient.js';
import { DEFAULT_PLANS } from '../config/plans.js';

const defaultByCode = Object.fromEntries(DEFAULT_PLANS.map((p) => [p.code, p]));

/**
 * Preço e nome do plano ativo (tabela product_plans) com fallback no código.
 * @param {string} code basic | pro | premium
 * @param {'personal'|'company'} [customerSegment]
 * @returns {Promise<{ priceBrl: number, name: string } | null>}
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
      .select('price_brl, name')
      .eq('code', c)
      .eq('customer_segment', seg)
      .eq('active', true)
      .maybeSingle();

    if (!error && data && Number(data.price_brl) >= 0) {
      return { priceBrl: Number(data.price_brl), name: String(data.name || c) };
    }
  } catch {
    // tabela pode não existir ainda
  }

  if (seg === 'company') return null;
  const d = defaultByCode[c];
  if (!d) return null;
  return { priceBrl: d.priceBrl, name: d.name };
}
