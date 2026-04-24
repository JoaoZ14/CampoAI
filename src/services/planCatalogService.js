import {
  DEFAULT_NOTES,
  DEFAULT_PLANS,
  DEFAULT_VERSION,
  parseAndValidateCatalog,
} from '../config/plans.js';
import { createSupabaseClient } from '../models/supabaseClient.js';
import { AppError } from '../utils/errors.js';

/**
 * Alinha texto dos bullets ao teto de WhatsApp do `product_plans` (ex.: Team 3 vs Business 5).
 * @param {string[]|undefined} bullets
 * @param {unknown} maxSeatsRow
 * @returns {string[]|undefined}
 */
function bulletsWithProductSeatCap(bullets, maxSeatsRow) {
  if (!Array.isArray(bullets) || maxSeatsRow == null || maxSeatsRow === '') return bullets;
  const seats = Number(maxSeatsRow);
  if (!Number.isFinite(seats) || seats < 1) return bullets;
  return bullets.map((b) =>
    String(b)
      .replace(/[Aa]té\s+\d+\s+números?\b/g, `Até ${seats} números`)
      .replace(/\b\d+\s+números\s+de\s+WhatsApp\b/gi, `${seats} números de WhatsApp`)
      .replace(/\b\d+\s+números\s+no\s+mesmo\s+plano\b/gi, `${seats} números no mesmo plano`)
  );
}

/**
 * Sobrescreve preço/nome/resumo com `product_plans` e define `customerSegment` por linha.
 * @param {import('../config/plans.js').PublicPlan[]} catalogPlans
 */
async function mergePlansWithProductRows(catalogPlans) {
  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from('product_plans')
      .select(
        'code, customer_segment, name, price_brl, summary, max_whatsapp_seats, highlight, sort_order, active'
      )
      .eq('active', true)
      .order('sort_order', { ascending: true });

    if (error || !Array.isArray(data) || data.length === 0) {
      return catalogPlans.map((p) => ({ ...p, customerSegment: 'personal' }));
    }

    return data.map((row) => {
      const code = String(row.code ?? '').trim();
      const cat =
        catalogPlans.find((p) => p.code === code) || DEFAULT_PLANS.find((p) => p.code === code);
      const segment = row.customer_segment === 'company' ? 'company' : 'personal';
      if (!cat) {
        return {
          code,
          name: String(row.name || code),
          priceBrl: Number(row.price_brl),
          period: 'mês',
          summary: String(row.summary || ''),
          bullets: ['Detalhes no checkout.'],
          customerSegment: segment,
          highlight: Boolean(row.highlight),
          seats:
            row.max_whatsapp_seats != null && row.max_whatsapp_seats !== ''
              ? Number(row.max_whatsapp_seats)
              : undefined,
        };
      }
      return {
        ...cat,
        code,
        customerSegment: segment,
        name: String(row.name || cat.name),
        priceBrl: Number(row.price_brl),
        summary: row.summary ? String(row.summary) : cat.summary,
        highlight: Boolean(row.highlight),
        seats:
          row.max_whatsapp_seats != null && row.max_whatsapp_seats !== ''
            ? Number(row.max_whatsapp_seats)
            : cat.seats,
        bullets:
          bulletsWithProductSeatCap(cat.bullets, row.max_whatsapp_seats) ?? cat.bullets,
      };
    });
  } catch {
    return catalogPlans.map((p) => ({ ...p, customerSegment: 'personal' }));
  }
}

const ROW_ID = 'default';

function getClient() {
  return createSupabaseClient();
}

/**
 * @param {string} version
 * @param {import('../config/plans.js').PublicPlan[]} plans
 * @param {string[]} notes
 * @param {'database' | 'fallback'} catalogSource
 */
function buildPayload(version, plans, notes, catalogSource) {
  return {
    ok: true,
    version,
    currency: 'BRL',
    plans,
    notes,
    catalogSource,
  };
}

/**
 * Catálogo público (lê `plan_catalog` no Supabase; se vazio/erro, usa padrão do código).
 */
export async function getPublicPlanCatalogPayload() {
  const supabase = getClient();
  try {
    const { data, error } = await supabase
      .from('plan_catalog')
      .select('version, plans, notes')
      .eq('id', ROW_ID)
      .maybeSingle();

    if (error) {
      console.warn('[plan_catalog] select:', error.message);
      const fb = await mergePlansWithProductRows(DEFAULT_PLANS);
      return buildPayload(DEFAULT_VERSION, fb, DEFAULT_NOTES, 'fallback');
    }
    if (!data || data.plans == null) {
      const fb = await mergePlansWithProductRows(DEFAULT_PLANS);
      return buildPayload(DEFAULT_VERSION, fb, DEFAULT_NOTES, 'fallback');
    }

    const validated = parseAndValidateCatalog({
      plans: data.plans,
      notes: data.notes ?? DEFAULT_NOTES,
      version: data.version,
    });
    const mergedPlans = await mergePlansWithProductRows(validated.plans);
    return buildPayload(validated.version, mergedPlans, validated.notes, 'database');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[plan_catalog] validação do banco:', msg);
    const fb = await mergePlansWithProductRows(DEFAULT_PLANS);
    return buildPayload(DEFAULT_VERSION, fb, DEFAULT_NOTES, 'fallback');
  }
}

/**
 * Corpo bruto para o editor admin (sem alterar).
 */
export async function getPlanCatalogRowForAdmin() {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('plan_catalog')
    .select('id, version, plans, notes, updated_at')
    .eq('id', ROW_ID)
    .maybeSingle();

  if (error) {
    throw new AppError(`Erro ao ler plan_catalog: ${error.message}`, 500);
  }
  if (!data) {
    return {
      id: ROW_ID,
      version: DEFAULT_VERSION,
      plans: DEFAULT_PLANS,
      notes: DEFAULT_NOTES,
      updated_at: null,
      seeded: false,
    };
  }
  return { ...data, seeded: true };
}

/**
 * @param {{ version?: string, plans: unknown, notes?: unknown }} body
 */
export async function savePlanCatalog(body) {
  let validated;
  try {
    validated = parseAndValidateCatalog({
      plans: body.plans,
      notes: body.notes,
      version: body.version,
    });
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : 'Dados inválidos.', 400);
  }

  const supabase = getClient();
  const { error } = await supabase.from('plan_catalog').upsert(
    {
      id: ROW_ID,
      version: validated.version,
      plans: validated.plans,
      notes: validated.notes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    throw new AppError(`Erro ao salvar plan_catalog: ${error.message}`, 500);
  }

  return getPublicPlanCatalogPayload();
}
