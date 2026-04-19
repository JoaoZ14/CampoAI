import { fetchGNewsArticles } from './gnewsService.js';

function defaultHeader() {
  const h = process.env.WEEKLY_NEWS_HEADER?.trim();
  return h || 'Resumo semanal — AG Assist (Brasil)';
}

function titleMaxChars() {
  const n = Number(process.env.WEEKLY_NEWS_TITLE_MAX_CHARS);
  if (Number.isFinite(n) && n >= 40 && n <= 160) return n;
  return 72;
}

/**
 * @param {string} title
 */
function clipTitle(title) {
  const max = titleMaxChars();
  const t = title.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * @param {{ title: string, url: string, sourceName?: string }[]} articles
 */
function formatGNewsBlocks(articles) {
  return articles.map((a, i) => {
    const n = i + 1;
    const src =
      a.sourceName && process.env.WEEKLY_NEWS_SHOW_SOURCE !== 'false'
        ? ` · ${a.sourceName}`
        : '';
    const line1 = `${n}) ${clipTitle(a.title)}${src}`;
    return `${line1}\n${a.url}`;
  });
}

/**
 * Monta o texto do WhatsApp: GNews (se houver chave) com fallback em WEEKLY_NEWS_BODY.
 * @returns {Promise<string>} Corpo não vazio ou string vazia (caller trata erro).
 */
export async function buildWeeklyNewsWhatsAppBody() {
  const staticBody = process.env.WEEKLY_NEWS_BODY?.trim() ?? '';
  const apiKey = process.env.GNEWS_API_KEY?.trim() ?? '';

  if (!apiKey) {
    return staticBody;
  }

  try {
    const articles = await fetchGNewsArticles(apiKey);
    if (articles.length === 0) {
      console.warn('[weekly-news] GNews retornou 0 artigos — usando texto estático se houver.');
      return staticBody;
    }

    const header = defaultHeader();
    const footer = process.env.WEEKLY_NEWS_FOOTER?.trim() ?? '';

    const blocks = formatGNewsBlocks(articles);
    let body = `${header}\n\n${blocks.join('\n\n')}`;
    if (footer) {
      body += `\n\n${footer}`;
    }
    return body;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[weekly-news] GNews falhou:', msg);
    return staticBody;
  }
}
