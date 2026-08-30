export const MSG_SIMPLE_GREETING =
  'Olá! 🌾 Tô por aqui pra te ajudar no que precisar no campo.';

const GREETING_RE =
  /^(ola|olá|oi|oie|oii|eai|e\s*a[ií]|hey|hi|hello|bom\s+dia|boa\s+tarde|boa\s+noite|salve|fala)[!.?\s]*$/iu;

/** Saudação curta — responde sem chamar a IA (economiza tempo no Ollama). */
export function isSimpleGreeting(text) {
  const t = String(text ?? '').trim();
  if (!t || t.length > 40) return false;
  return GREETING_RE.test(t);
}
