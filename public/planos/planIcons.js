/**
 * Ícones em SVG (estilo outline tipo Lucide / Phosphor) — sem dependência React.
 * @param {string} code basic | pro | premium
 * @param {'personal'|'company'} segment
 * @returns {string} SVG inline (seguro: sem input do usuário)
 */
export function getPlanIconSvg(code, segment) {
  const c = String(code || '').toLowerCase();
  const seg = segment === 'company' ? 'company' : 'personal';

  /** @param {string} inner */
  const wrap = (inner) =>
    `<svg class="plan-icon-svg" width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

  if ((c === 'lite' || c === 'basic') && seg === 'personal') {
    return wrap(
      '<path d="M12 21s-6-5.25-6-10A6 6 0 0 1 18 5c0 4.75-6 10-6 10Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>' +
        '<circle cx="12" cy="11" r="2.25" stroke="currentColor" stroke-width="1.75"/>'
    );
  }
  if (c === 'premium' && seg === 'personal') {
    return wrap(
      '<path d="M3 21h18" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
        '<path d="M5 21V10l7-5 7 5v11" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>' +
        '<path d="M9 21v-6h6v6" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>' +
        '<circle cx="12" cy="6" r="1.5" fill="currentColor"/>'
    );
  }
  if (c === 'premium' && seg === 'company') {
    return wrap(
      '<rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" stroke-width="1.75"/>' +
        '<path d="M9 22v-4h6v4" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>' +
        '<path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    );
  }
  if (c === 'pro') {
    return wrap(
      '<path d="M12 3v3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
        '<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.75"/>' +
        '<path d="M12 18v3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>'
    );
  }
  return wrap(
    '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.75"/>' +
      '<path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>'
  );
}
