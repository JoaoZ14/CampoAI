/** Títulos de seção padronizados (CAIXA ALTA, sem marcador). */
const SECTION_CANONICAL = [
  'POSSÍVEIS CAUSAS',
  'O QUE OBSERVAR',
  'O QUE FAZER AGORA',
  'QUANDO CHAMAR UM PROFISSIONAL',
];

const ALERT_SECTION = 'QUANDO CHAMAR UM PROFISSIONAL';
const ALERT_SECTION_TITLE = '⚠️ QUANDO CHAMAR UM PROFISSIONAL';

const SECTION_LOOKUP = new Map(
  SECTION_CANONICAL.map((title) => [
    title
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase(),
    title,
  ])
);

/**
 * @param {string} line
 * @returns {string | null}
 */
function matchSectionTitle(line) {
  const raw = String(line ?? '').trim();
  if (!raw) return null;

  let candidate = raw.replace(/^[\s•\-–—]+/, '').trim();
  candidate = candidate.replace(/^(?:⚠️|🌱|🌾)\s*/u, '').trim();
  candidate = candidate.replace(/^\*([^*]+)\*$/, '$1').trim();
  const titlePart = candidate.split(/\s*[—–:-]\s*/)[0].trim();
  const key = titlePart
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

  return SECTION_LOOKUP.get(key) ?? null;
}

/**
 * @param {string} line
 * @returns {string}
 */
function formatContentLine(line) {
  let content = String(line ?? '').trim();
  content = content.replace(/^[\s•*]+/, '').trim();
  content = content.replace(/^[-–—]\s*/, '').trim();
  content = content.replace(/^\d+[.)]\s*/, '').trim();
  return content ? `- ${content}` : '';
}

/**
 * @param {string[]} lines
 * @returns {string}
 */
function structureAgriculturalReply(lines) {
  /** @type {string[]} */
  const out = [];

  for (const rawLine of lines) {
    const trimmed = String(rawLine ?? '').trim();
    if (!trimmed) continue;

    const section = matchSectionTitle(trimmed);
    if (section) {
      if (out.length > 0) out.push('');
      out.push(section === ALERT_SECTION ? ALERT_SECTION_TITLE : section);

      const inline = trimmed
        .replace(/^(?:[\s•\-–—]+|(?:⚠️|🌱|🌾)\s*)*/u, '')
        .replace(/^\*([^*]+)\*$/, '$1')
        .trim();
      const afterTitle = inline.split(/\s*[—–:-]\s*/).slice(1).join(' ').trim();
      if (afterTitle) {
        const item = formatContentLine(afterTitle);
        if (item) out.push(item);
      }
      continue;
    }

    const item = formatContentLine(trimmed);
    if (item) out.push(item);
  }

  return out.join('\n');
}

/**
 * Normaliza texto da IA para leitura no WhatsApp (regex leve, sem I/O).
 * @param {string} text
 * @param {{ fieldCalcMode?: boolean }} [opts]
 * @returns {string}
 */
export function formatWhatsAppReply(text, opts = {}) {
  const fieldCalcMode = Boolean(opts.fieldCalcMode);
  let s = String(text ?? '').trim();
  if (!s) return s;

  s = s.replace(/\*\*([^*\n]+)\*\*/g, '*$1*');
  s = s.replace(/__([^_\n]+)__/g, '_$1_');
  s = s.replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/```[\w-]*\n?/g, '');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2');

  if (!fieldCalcMode) {
    const lines = s.split('\n');
    s = structureAgriculturalReply(lines);
  }

  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}
