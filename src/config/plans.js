/**
 * Valores padrão e validação do catálogo de planos.
 * Os dados publicados vêm da tabela `plan_catalog` no Supabase (ver planCatalogService).
 */

export const DEFAULT_VERSION = '2026-04';

/** @typedef {{ code: string, name: string, priceBrl: number, period: string, summary: string, bullets: string[], seats?: number }} PublicPlan */

/** @type {PublicPlan[]} */
export const DEFAULT_PLANS = [
  {
    code: 'personal',
    name: 'Pessoal',
    priceBrl: 59,
    period: 'mês',
    summary: 'Um número de WhatsApp com acesso ilimitado à IA (uso razoável no campo).',
    bullets: [
      'Só o seu WhatsApp; sem cadastro de empresa',
      'Após o checkout (quando integrar pagamento), o número liberado automaticamente',
      'Memória da conversa e relatório em PDF conforme configuração do servidor',
    ],
  },
  {
    code: 'family_team',
    name: 'Família ou equipe',
    priceBrl: 139,
    period: 'mês',
    seats: 3,
    summary: 'Até 3 números de WhatsApp no mesmo plano (fazenda, família ou time pequeno).',
    bullets: [
      'Um responsável contrata; você cadastra os 3 números que podem usar',
      'Cada número com o mesmo tipo de acesso à IA',
      'Gestão dos números pelo painel administrativo (AG Assist)',
    ],
  },
  {
    code: 'business_team',
    name: 'Empresa',
    priceBrl: 379,
    period: 'mês',
    seats: 10,
    summary: 'Até 10 números de WhatsApp para cooperativa, empresa rural ou consultoria.',
    bullets: [
      'Até 10 números cadastrados pelo administrador do plano',
      'Ideal para equipes que falam com produtores ou uso interno',
      'Suporte à gestão de assentos pelo painel administrativo',
    ],
  },
];

export const DEFAULT_NOTES = [
  'Plano pessoal: o produtor usa só o WhatsApp; não precisa criar conta de empresa.',
  'Planos equipe: a organização é só para gestão de números e cobrança — cada pessoa continua no próprio WhatsApp.',
];

/**
 * @param {unknown} p
 * @returns {PublicPlan|null}
 */
export function normalizePlan(p, index) {
  if (!p || typeof p !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (p);
  const code = String(o.code ?? '').trim();
  const name = String(o.name ?? '').trim();
  const period = String(o.period ?? 'mês').trim() || 'mês';
  const summary = String(o.summary ?? '').trim();
  if (!code || !/^[a-z0-9_-]{1,64}$/i.test(code)) {
    console.warn(`[plans] Plano #${index}: code inválido ou ausente.`);
    return null;
  }
  if (!name || name.length > 120) {
    console.warn(`[plans] Plano "${code}": name inválido.`);
    return null;
  }
  if (!summary || summary.length > 600) {
    console.warn(`[plans] Plano "${code}": summary obrigatório (máx. 600 caracteres).`);
    return null;
  }
  const priceRaw = o.priceBrl ?? o.price_brl;
  const priceBrl = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw);
  if (!Number.isFinite(priceBrl) || priceBrl < 0 || priceBrl > 1_000_000) {
    console.warn(`[plans] Plano "${code}": priceBrl inválido.`);
    return null;
  }
  const bulletsIn = o.bullets;
  if (!Array.isArray(bulletsIn) || bulletsIn.length < 1 || bulletsIn.length > 20) {
    console.warn(`[plans] Plano "${code}": bullets deve ser array com 1 a 20 strings.`);
    return null;
  }
  const bullets = bulletsIn.map((b) => String(b ?? '').trim()).filter(Boolean);
  if (bullets.length < 1) {
    console.warn(`[plans] Plano "${code}": bullets vazias após normalizar.`);
    return null;
  }
  for (const b of bullets) {
    if (b.length > 500) {
      console.warn(`[plans] Plano "${code}": bullet muito longa (>500).`);
      return null;
    }
  }
  /** @type {PublicPlan} */
  const plan = { code, name, priceBrl, period, summary, bullets };
  if (o.seats != null && o.seats !== '') {
    const seats = typeof o.seats === 'number' ? o.seats : Number(o.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 500) {
      console.warn(`[plans] Plano "${code}": seats inválido (use inteiro 1–500 ou omita).`);
      return null;
    }
    plan.seats = seats;
  }
  return plan;
}

/**
 * Valida `plans` e `notes` vindos do JSON/JSONB.
 * @param {{ plans: unknown, notes?: unknown, version?: unknown }} input
 * @returns {{ version: string, plans: PublicPlan[], notes: string[] }}
 */
export function parseAndValidateCatalog(input) {
  const versionRaw = input.version;
  const version =
    typeof versionRaw === 'string' && versionRaw.trim()
      ? versionRaw.trim().slice(0, 64)
      : DEFAULT_VERSION;

  const plansIn = input.plans;
  if (!Array.isArray(plansIn) || plansIn.length < 1 || plansIn.length > 20) {
    throw new Error('plans deve ser um array JSON com 1 a 20 itens.');
  }
  const plans = [];
  for (let i = 0; i < plansIn.length; i++) {
    const pl = normalizePlan(plansIn[i], i);
    if (pl) plans.push(pl);
  }
  if (plans.length === 0) {
    throw new Error('Nenhum plano válido após validação.');
  }
  const codes = new Set(plans.map((p) => p.code));
  if (codes.size !== plans.length) {
    throw new Error('Códigos de plano (code) duplicados.');
  }

  let notes = DEFAULT_NOTES;
  if (input.notes != null) {
    if (!Array.isArray(input.notes)) {
      throw new Error('notes deve ser um array de strings.');
    }
    if (input.notes.length > 30) {
      throw new Error('notes: no máximo 30 itens.');
    }
    const n = input.notes.map((x) => String(x ?? '').trim()).filter(Boolean);
    if (n.length >= 1) {
      notes = n;
    }
  }

  return { version, plans, notes };
}
