import { createSupabaseClient } from '../models/supabaseClient.js';
import { fetchGNewsArticles } from './gnewsService.js';

/** @type {Promise<void> | null} */
let refreshInFlight = null;

function ttlMs() {
  const n = Number(process.env.LANDING_NEWS_TTL_HOURS);
  const hours = Number.isFinite(n) && n > 0 ? Math.min(168, n) : 24;
  return hours * 60 * 60 * 1000;
}

function archiveMax() {
  const n = Number(process.env.LANDING_NEWS_ARCHIVE_MAX);
  return Number.isFinite(n) && n > 0 ? Math.min(200, Math.floor(n)) : 60;
}

function fetchBatch() {
  const n = Number(process.env.LANDING_NEWS_FETCH_MAX);
  return Number.isFinite(n) && n > 0 ? Math.min(100, Math.floor(n)) : 10;
}

function lookbackFromIso() {
  const daysRaw = Number(process.env.LANDING_NEWS_GNEWS_DAYS);
  const days =
    Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 30) : 14;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * @param {unknown} row
 */
function rowToItem(row) {
  if (!row || typeof row !== 'object') return null;
  const r = /** @type {Record<string, unknown>} */ (row);
  const title = String(r.title ?? '').trim();
  const url = String(r.url ?? '').trim();
  if (!title || !url) return null;
  return {
    title,
    url,
    source: String(r.source ?? 'GNews').trim() || 'GNews',
    publishedAt: r.published_at ? String(r.published_at) : '',
    image: r.image_url ? String(r.image_url) : '',
  };
}

/**
 * @returns {Promise<{ items: ReturnType<typeof rowToItem>[], fetchedAt: string | null }>}
 */
async function readFromDb() {
  const supabase = createSupabaseClient();
  const max = archiveMax();

  const { data, error } = await supabase
    .from('news_articles')
    .select('title, url, source, published_at, image_url, fetched_at')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(max);

  if (error) {
    throw new Error(`Supabase news_articles: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const items = rows.map(rowToItem).filter(Boolean);
  let fetchedAt = null;
  for (const r of rows) {
    const fa = r?.fetched_at ? String(r.fetched_at) : '';
    if (!fa) continue;
    if (!fetchedAt || Date.parse(fa) > Date.parse(fetchedAt)) fetchedAt = fa;
  }
  return { items, fetchedAt };
}

/**
 * @returns {Promise<string | null>}
 */
async function latestFetchedAt() {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from('news_articles')
    .select('fetched_at')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase news_articles fetched_at: ${error.message}`);
  }
  return data?.fetched_at ? String(data.fetched_at) : null;
}

/**
 * @param {string | null} fetchedAt
 */
function isStale(fetchedAt) {
  if (!fetchedAt) return true;
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > ttlMs();
}

/**
 * @param {{ title: string, url: string, sourceName?: string, publishedAt?: string, image?: string }[]} incoming
 */
async function upsertAndTrim(incoming) {
  const supabase = createSupabaseClient();
  const now = new Date().toISOString();
  const max = archiveMax();

  const rows = incoming
    .filter((a) => a?.title && a?.url)
    .map((a) => {
      const pubMs = a.publishedAt ? Date.parse(a.publishedAt) : NaN;
      return {
        url: a.url.trim(),
        title: a.title.trim(),
        source: (a.sourceName || 'GNews').trim().slice(0, 80) || 'GNews',
        published_at: Number.isFinite(pubMs) ? new Date(pubMs).toISOString() : null,
        image_url: a.image?.trim() || null,
        fetched_at: now,
      };
    });

  if (!rows.length) return;

  const { error: upErr } = await supabase.from('news_articles').upsert(rows, {
    onConflict: 'url',
    ignoreDuplicates: false,
  });
  if (upErr) {
    throw new Error(`Supabase upsert news_articles: ${upErr.message}`);
  }

  const { data: ids, error: listErr } = await supabase
    .from('news_articles')
    .select('id')
    .order('published_at', { ascending: false, nullsFirst: false });

  if (listErr) {
    throw new Error(`Supabase trim list: ${listErr.message}`);
  }

  const all = Array.isArray(ids) ? ids : [];
  if (all.length <= max) return;

  const toDelete = all.slice(max).map((r) => r.id).filter(Boolean);
  if (!toDelete.length) return;

  const { error: delErr } = await supabase
    .from('news_articles')
    .delete()
    .in('id', toDelete);
  if (delErr) {
    throw new Error(`Supabase trim delete: ${delErr.message}`);
  }
}

async function refreshFromGNews() {
  const apiKey = process.env.GNEWS_API_KEY?.trim() ?? '';
  if (!apiKey) {
    throw new Error('GNEWS_API_KEY ausente — não foi possível atualizar notícias.');
  }

  const incoming = await fetchGNewsArticles(apiKey, {
    max: fetchBatch(),
    fromIso: lookbackFromIso(),
    includeExtras: true,
  });

  if (!incoming.length) {
    console.warn('[landing-news] GNews retornou 0 artigos após filtro agro.');
    return;
  }

  await upsertAndTrim(incoming);
  console.log(
    `[landing-news] Sync OK: ${incoming.length} artigo(s) da GNews; arquivo máx. ${archiveMax()}.`
  );
}

async function maybeRefresh() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const last = await latestFetchedAt();
      if (!isStale(last)) return;
      await refreshFromGNews();
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * Payload público para o landing (mesmo shape do antigo noticias.json).
 * @returns {Promise<{ items: object[], fetchedAt: string | null, source: string }>}
 */
export async function getLandingNewsPayload() {
  try {
    await maybeRefresh();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[landing-news] Refresh falhou; servindo cache do banco se houver:', msg);
  }

  const { items, fetchedAt } = await readFromDb();
  return {
    items,
    fetchedAt: fetchedAt || new Date().toISOString(),
    source: 'gnews',
  };
}
