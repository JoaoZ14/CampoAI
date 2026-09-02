/**
 * Filtro de relevância agro: remove política, lifestyle e prioriza termos do campo.
 * Espelhado em CampoAILanding/scripts/agro-news-filter.mjs
 */

/** Query padrão GNews (máx. 200 caracteres; sem acentos). */
export const DEFAULT_GNEWS_QUERY =
  '(safra OR colheita OR plantio OR pecuaria OR gado OR milho OR soja OR cafezal OR cafeicultura) NOT (eleicao OR candidato OR presidencia OR governador OR campanha OR partido OR congresso)';

const POLITICA_BLOCKLIST = [
  'eleicao',
  'eleicoes',
  'eleições',
  'candidato',
  'candidata',
  'presidencia',
  'presidência',
  'governador',
  'governadora',
  'prefeito',
  'prefeita',
  'deputado',
  'deputada',
  'senador',
  'senadora',
  'partido',
  'campanha',
  'congresso',
  'stf',
  'ministro da',
  'ministra da',
  'planalto',
  'bolsonaro',
  'lula',
  'tebet',
  'caiado',
  'zema',
  'joao campos',
  'joão campos',
];

const LIFESTYLE_BLOCKLIST = [
  'padaria',
  'pizzaria',
  'frigideira',
  'cuscuz',
  'receita',
  'curiosidade',
  'bebe cafe',
  'borra de cafe',
  'po de cafe',
  'lixeira',
  'fogao',
  'barrashopping',
  'gastronomica',
  'gastronômica',
  'musculos',
  'gordura',
  'emagrecer',
  'dieta',
  'fofinho',
  'queijudo',
  'bar e cafe',
  'bar, cafe',
];

const URL_POLITICA = ['/politica/', '/política/', '/eleicoes/', '/eleições/'];

const URL_LIFESTYLE = [
  '/curiosidades/',
  '/em-alta/',
  '/vivabem/',
  '/receitas/',
  '/gastronomia/',
  '/bairros/',
];

const URL_AGRO = [
  '/agronegocio',
  '/agronegocios',
  '/rural/',
  '/agro/',
  '/economia/agro',
];

const AGRO_POSITIVO = [
  'safra',
  'colheita',
  'plantio',
  'lavoura',
  'gado',
  'boi',
  'bovino',
  'frango',
  'suino',
  'suíno',
  'milho',
  'soja',
  'cafezal',
  'cafezais',
  'cafeicultura',
  'cafeicultor',
  'cafe',
  'café',
  'algodao',
  'algodão',
  'exportacao',
  'exportação',
  'chuva',
  'seca',
  'preco',
  'preço',
  'cotacao',
  'cotação',
  'defensivo',
  'fertilizante',
  'irrigacao',
  'irrigação',
  'rebanho',
  'pecuaria',
  'pecuária',
  'agronegocio',
  'agronegócio',
  'agro',
  'adubo',
  'solo',
  'semente',
  'herbicida',
  'praga',
  'doenca',
  'doença',
  'veterinario',
  'veterinário',
  'abate',
  'arroz',
  'trigo',
  'cana',
  'etanol',
  'cacau',
  'acucar',
  'açúcar',
  'leite',
  'ovos',
  'suinos',
  'suínos',
  'uva',
  'uvas',
  'graos',
  'grãos',
  'commodity',
  'el nino',
  'elnino',
];

export function normalizeAgroText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function parseExtraTerms(envValue) {
  if (!envValue || !String(envValue).trim()) return [];
  return String(envValue)
    .split(',')
    .map((t) => normalizeAgroText(t.trim()))
    .filter(Boolean);
}

function parseMinScore(envValue, fallback) {
  const n = Number.parseInt(String(envValue ?? '').trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * @param {{ title?: string, url?: string }} item
 * @param {string[]} [extraBlocklist]
 */
export function isPoliticaNews(item, extraBlocklist = []) {
  const text = normalizeAgroText(`${item.title || ''} ${item.url || ''}`);
  const urlLower = String(item.url || '').toLowerCase();

  const blocklist = [...POLITICA_BLOCKLIST, ...extraBlocklist];
  if (blocklist.some((t) => text.includes(t))) return true;
  if (URL_POLITICA.some((p) => urlLower.includes(p))) return true;
  return false;
}

/**
 * @param {{ title?: string, url?: string }} item
 */
export function isLifestyleNoise(item) {
  const title = normalizeAgroText(item.title || '');
  const urlLower = String(item.url || '').toLowerCase();

  if (LIFESTYLE_BLOCKLIST.some((t) => title.includes(t))) return true;
  if (URL_LIFESTYLE.some((p) => urlLower.includes(p))) return true;
  return false;
}

/**
 * @param {{ url?: string }} item
 */
export function hasAgroUrl(item) {
  const urlLower = String(item.url || '').toLowerCase();
  return URL_AGRO.some((p) => urlLower.includes(p));
}

/**
 * @param {{ title?: string }} item
 */
export function agroRelevanceScore(item) {
  const text = normalizeAgroText(item.title || '');
  return AGRO_POSITIVO.filter((t) => text.includes(t)).length;
}

/**
 * @param {{ title?: string, url?: string }} item
 * @param {number} [minScore]
 */
export function isAgroRelevant(item, minScore = 1) {
  if (hasAgroUrl(item)) return true;
  return agroRelevanceScore(item) >= minScore;
}

/**
 * @param {Array<{ title?: string, url?: string, publishedAt?: string }>} items
 * @param {{ extraBlocklist?: string[], enabled?: boolean, minScore?: number }} [opts]
 */
export function filterAgroNews(items, opts = {}) {
  const enabled = opts.enabled !== false;
  if (!enabled || !Array.isArray(items)) return items || [];

  const extra = opts.extraBlocklist || [];
  const minScore = opts.minScore ?? resolveMinAgroScore();

  const filtered = items.filter((it) => {
    if (isPoliticaNews(it, extra)) return false;
    if (isLifestyleNoise(it)) return false;
    return isAgroRelevant(it, minScore);
  });

  filtered.sort((a, b) => {
    const scoreDiff = agroRelevanceScore(b) - agroRelevanceScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    const ta = Date.parse(a.publishedAt || '');
    const tb = Date.parse(b.publishedAt || '');
    if (Number.isFinite(tb) && Number.isFinite(ta)) return tb - ta;
    return 0;
  });

  return filtered;
}

export function isAgroFilterEnabled() {
  const v = (process.env.GNEWS_FILTER_AGRO ?? process.env.WEEKLY_NEWS_FILTER_AGRO ?? 'true')
    .trim()
    .toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'no';
}

export function resolveMinAgroScore() {
  const raw =
    process.env.WEEKLY_NEWS_MIN_AGRO_SCORE?.trim() ||
    process.env.GNEWS_MIN_AGRO_SCORE?.trim() ||
    '';
  return parseMinScore(raw, 1);
}

export function resolveGNewsQuery() {
  const custom =
    process.env.WEEKLY_NEWS_GNEWS_QUERY?.trim() ||
    process.env.GNEWS_QUERY?.trim() ||
    '';
  return custom || DEFAULT_GNEWS_QUERY;
}

export function resolveExtraBlocklist() {
  const raw =
    process.env.WEEKLY_NEWS_EXCLUDE_TERMS?.trim() ||
    process.env.GNEWS_EXCLUDE_TERMS?.trim() ||
    '';
  return parseExtraTerms(raw);
}
