/**
 * Detecta se a mensagem recebida é texto, imagem (URL) ou ambos.
 */

/**
 * @param {string | undefined} text
 * @param {string | undefined} imageUrl
 * @returns {{ hasText: boolean, hasImage: boolean, isEmpty: boolean, kind: 'empty' | 'text' | 'image' | 'text_and_image' }}
 */
export function detectMessageType(text, imageUrl) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  const hasText = trimmed.length > 0;
  const hasImage =
    typeof imageUrl === 'string' &&
    imageUrl.trim().length > 0 &&
    isHttpUrl(imageUrl.trim());

  const isEmpty = !hasText && !hasImage;

  let kind = 'empty';
  if (hasText && hasImage) kind = 'text_and_image';
  else if (hasText) kind = 'text';
  else if (hasImage) kind = 'image';

  return { hasText, hasImage, isEmpty, kind };
}

/** URL http(s) — a API OpenAI valida se o recurso é imagem. */
function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
