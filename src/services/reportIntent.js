/**
 * Detecta pedido de relatório/PDF **da conversa** com o assistente (não análise solta em PDF).
 * @param {string} raw
 * @returns {boolean}
 */
export function wantsConversationPdfReport(raw) {
  const t = String(raw ?? '').trim().toLowerCase();
  if (t.length < 6) return false;

  const wantsDoc =
    /relat[óo]rio|\bpdf\b|export(ar|a|e)?|documento|síntese\s+(da|em)|sintese\s+(da|em)/i.test(t);
  if (!wantsDoc) return false;

  const aboutConvo =
    /conversa|nossa\s+conversa|que\s+(conversamos|falamos|discutimos)|hist[oó]rico|mensagens|nesse\s+chat|desta\s+conversa|dessa\s+conversa|o\s+assunto\s+(que\s+)?(falamos|tratamos)|resumo\s+do\s+que\s+falamos/i.test(
      t
    );

  const action =
    /gera|gere|cria|crie|quero|manda|mande|faz|faça|faca|elabore|elabores|preciso|pod(e|ia)\s+gerar|gostaria|poderia|monta|monte|emite|emitir|baix(a|ar)|download|fazer\s+um|faz\s+um/i.test(
      t
    );

  // "exportar conversa", "pdf do chat", etc.
  if (wantsDoc && aboutConvo) return true;

  // "gera um relatório" / "quero relatório" — neste produto assume-se relatório da sessão
  if (/relat[óo]rio/i.test(t) && action) return true;

  // PDF exige menção à conversa (evita "pdf da análise da lavoura" sem contexto de chat)
  if (/\bpdf\b/i.test(t) && action && aboutConvo) return true;

  return false;
}
