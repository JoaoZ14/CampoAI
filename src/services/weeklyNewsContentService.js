import { fetchGNewsArticles } from './gnewsService.js';

function defaultHeader() {
  const h = process.env.WEEKLY_NEWS_HEADER?.trim();
  return h || 'Resumo semanal — AG Assist (Brasil)';
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

    const bullets = articles.map((a) => `• ${a.title}\n${a.url}`);
    let body = `${header}\n\n${bullets.join('\n\n')}`;
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
