/**
 * Valores padrão e validação do catálogo de planos.
 * Os dados publicados vêm da tabela `plan_catalog` no Supabase (ver planCatalogService).
 */

export const DEFAULT_VERSION = '2026-10';

/**
 * @typedef {{
 *   code: string,
 *   name: string,
 *   priceBrl: number,
 *   period: string,
 *   summary: string,
 *   bullets: string[],
 *   seats?: number,
 *   customerSegment?: 'personal'|'company',
 *   highlight?: boolean,
 *   maxAnalysesPerMonth?: number|null,
 * }} PublicPlan
 */

/** @type {PublicPlan[]} */
export const DEFAULT_PLANS = [
  {
    code: 'lite',
    name: 'Essencial',
    priceBrl: 39,
    seats: 1,
    customerSegment: 'personal',
    maxAnalysesPerMonth: 40,
    period: 'mês',
    summary:
      'Para começar: 40 análises de IA por mês e um número de WhatsApp.',
    bullets: [
      'Até 40 análises de IA por mês',
      'Um número de WhatsApp',
      'Registrar, editar e consultar pelo app sem consumir análises de IA',
    ],
  },
  {
    code: 'basic',
    name: 'Starter',
    priceBrl: 79,
    seats: 1,
    customerSegment: 'personal',
    maxAnalysesPerMonth: 100,
    highlight: true,
    period: 'mês',
    summary:
      'Para a rotina: 100 análises de IA por mês e um número de WhatsApp.',
    bullets: [
      'Até 100 análises de IA por mês',
      'Um número de WhatsApp',
      'Registrar, editar e consultar pelo app sem consumir análises de IA',
    ],
  },
  {
    code: 'premium',
    name: 'Team',
    priceBrl: 179,
    customerSegment: 'personal',
    maxAnalysesPerMonth: 250,
    period: 'mês',
    seats: 3,
    summary:
      'Até três números de WhatsApp com 250 análises de IA por mês compartilhadas pela assinatura.',
    bullets: [
      'Até 3 números de WhatsApp no mesmo plano',
      'Até 250 análises de IA por mês, compartilhadas entre os números',
      'Registrar, editar e consultar pelo app sem consumir análises de IA',
    ],
  },
  {
    code: 'premium', name: 'Business', customerSegment: 'company',
    priceBrl: 299, period: 'mês', seats: 5, maxAnalysesPerMonth: 400, highlight: true,
    summary: 'Para empresas: até cinco números de WhatsApp com 400 análises de IA por mês compartilhadas pela assinatura.',
    bullets: ['Até 5 números de WhatsApp no mesmo plano', 'Até 400 análises de IA por mês, compartilhadas entre os números', 'Cadastro e contratação com CNPJ', 'Registrar, editar e consultar pelo app sem consumir análises de IA'],
  },
];

export const DEFAULT_NOTES = [
  'Posicionamento: o cliente compra clareza e tempo — menos erro operacional e menos ida e volta na busca por informação.',
  'As franquias são mensais, inclusive na assinatura anual, e renovam no primeiro dia do mês em horário de Brasília. Não acumulam e não geram cobrança automática de excedente.',
  'Uma análise é um pedido processado com sucesso pela IA, seja texto, foto ou áudio. Falhas e respostas de comandos sem IA não consomem a franquia. Pedidos de esclarecimento processados pela IA contam como uma análise.',
  'Os números dos planos Team e Business dividem a mesma franquia. Ao atingir o limite, você pode continuar registrando, editando e consultando pelo app durante a assinatura ativa.',
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
  plan.customerSegment = o.customerSegment === 'company' ? 'company' : 'personal';
  plan.highlight = Boolean(o.highlight);
  if (o.maxAnalysesPerMonth != null) {
    const cap = Number(o.maxAnalysesPerMonth);
    if (!Number.isInteger(cap) || cap < 1 || cap > 100000) return null;
    plan.maxAnalysesPerMonth = cap;
  }
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
  const codes = new Set(plans.map((p) => `${p.customerSegment}:${p.code}`));
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
