/**
 * Normaliza telefone para um formato consistente (E.164 quando possível).
 * @param {string} raw
 */
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length >= 10 && digits.length <= 13 && !raw.trim().startsWith('+')) {
    if (!digits.startsWith('55') && digits.length === 11) {
      digits = `55${digits}`;
    }
  }
  return digits.length ? `+${digits}` : raw.trim();
}
