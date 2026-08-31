import { AppError } from '../utils/errors.js';
import {
  filterAgroNews,
  isAgroFilterEnabled,
  resolveExtraBlocklist,
  resolveGNewsQuery,
} from './agroNewsFilter.js';

const GNEWS_SEARCH = 'https://gnews.io/api/v4/search';

/**
 * Busca artigos na GNews (v4) com filtros de idioma e país.
 * @param {string} apiKey
 * @param {{
 *   q?: string,
 *   lang?: string,
 *   country?: string,
 *   max?: number,
 *   fromIso?: string,
 *   inFields?: string,
 * }} [opts]
 * @returns {Promise<{ title: string, url: string, sourceName?: string }[]>}
 */
export async function fetchGNewsArticles(apiKey, opts = {}) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) {
    throw new AppError('GNews: apiKey vazio.', 500);
  }

  const q = (opts.q ?? resolveGNewsQuery()).trim();
  const lang = (opts.lang ?? process.env.WEEKLY_NEWS_GNEWS_LANG?.trim()) || 'pt';
  const country = (opts.country ?? process.env.WEEKLY_NEWS_GNEWS_COUNTRY?.trim()) || 'br';
  const rawMax = opts.max ?? Number(process.env.WEEKLY_NEWS_GNEWS_MAX);
  const max = Math.min(100, Math.max(1, Number.isFinite(rawMax) ? rawMax : 3));

  const daysRaw = Number(process.env.WEEKLY_NEWS_GNEWS_DAYS);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 30) : 7;
  const fromIso =
    opts.fromIso ??
    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const inTrim = opts.inFields ?? process.env.WEEKLY_NEWS_GNEWS_IN?.trim();
  const inFields = inTrim && inTrim.length ? inTrim : 'title,description';

  const filterEnabled = isAgroFilterEnabled();
  const extraBlocklist = resolveExtraBlocklist();
  const fetchMax = filterEnabled ? Math.min(100, Math.max(max * 4, max)) : max;

  const params = new URLSearchParams({
    q,
    lang,
    country,
    max: String(fetchMax),
    apikey: key,
    sortby: 'publishedAt',
    from: fromIso,
    in: inFields,
  });

  const url = `${GNEWS_SEARCH}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AG-Assist/1.0 (CampoAI weekly-news)' },
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    const errPiece =
      (Array.isArray(data.errors) && data.errors[0]) ||
      data.message ||
      res.statusText;
    throw new AppError(`GNews HTTP ${res.status}: ${errPiece}`, 502);
  }

  if (Array.isArray(data.errors) && data.errors.length) {
    throw new AppError(`GNews: ${data.errors.join('; ')}`, 502);
  }

  const articles = Array.isArray(data.articles) ? data.articles : [];
  /** @type {Map<string, { title: string, url: string, sourceName?: string, publishedAt?: string }>} */
  const byUrl = new Map();

  for (const a of articles) {
    const title = String(a.title ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    const urlOne = String(a.url ?? '').trim();
    const sourceName = String(a.source?.name ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
    const publishedAt = String(a.publishedAt ?? '').trim();
    if (!title || !urlOne) continue;
    if (!byUrl.has(urlOne)) {
      byUrl.set(urlOne, {
        title,
        url: urlOne,
        ...(sourceName ? { sourceName } : {}),
        ...(publishedAt ? { publishedAt } : {}),
      });
    }
  }

  let result = [...byUrl.values()];

  if (filterEnabled) {
    result = filterAgroNews(result, { extraBlocklist, enabled: true });
    if (result.length > max) {
      result = result.slice(0, max);
    }
  }

  return result.map(({ title, url, sourceName }) => ({
    title,
    url,
    ...(sourceName ? { sourceName } : {}),
  }));
}
