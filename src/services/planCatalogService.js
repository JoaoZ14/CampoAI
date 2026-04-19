import {
  DEFAULT_NOTES,
  DEFAULT_PLANS,
  DEFAULT_VERSION,
  parseAndValidateCatalog,
} from '../config/plans.js';
import { createSupabaseClient } from '../models/supabaseClient.js';
import { AppError } from '../utils/errors.js';

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
      return buildPayload(DEFAULT_VERSION, DEFAULT_PLANS, DEFAULT_NOTES, 'fallback');
    }
    if (!data || data.plans == null) {
      return buildPayload(DEFAULT_VERSION, DEFAULT_PLANS, DEFAULT_NOTES, 'fallback');
    }

    const validated = parseAndValidateCatalog({
      plans: data.plans,
      notes: data.notes ?? DEFAULT_NOTES,
      version: data.version,
    });
    return buildPayload(validated.version, validated.plans, validated.notes, 'database');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[plan_catalog] validação do banco:', msg);
    return buildPayload(DEFAULT_VERSION, DEFAULT_PLANS, DEFAULT_NOTES, 'fallback');
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
