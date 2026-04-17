/**
 * Detecta se a mensagem recebida é texto, imagem (URL), áudio (URL) ou combinações.
 */

/**
 * @param {string | undefined} text
 * @param {string | undefined} imageUrl
 * @param {string | undefined} audioUrl
 * @returns {{ hasText: boolean, hasImage: boolean, hasAudio: boolean, isEmpty: boolean, kind: string }}
 */
export function detectMessageType(text, imageUrl, audioUrl) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  const hasText = trimmed.length > 0;
  const hasImage =
    typeof imageUrl === 'string' &&
    imageUrl.trim().length > 0 &&
    isHttpUrl(imageUrl.trim());
  const hasAudio =
    typeof audioUrl === 'string' &&
    audioUrl.trim().length > 0 &&
    isHttpUrl(audioUrl.trim());

  const isEmpty = !hasText && !hasImage && !hasAudio;

  let kind = 'empty';
  if (hasText && hasImage && hasAudio) kind = 'text_image_audio';
  else if (hasText && hasImage) kind = 'text_and_image';
  else if (hasText && hasAudio) kind = 'text_and_audio';
  else if (hasImage && hasAudio) kind = 'image_and_audio';
  else if (hasText) kind = 'text';
  else if (hasImage) kind = 'image';
  else if (hasAudio) kind = 'audio';

  return { hasText, hasImage, hasAudio, isEmpty, kind };
}

/** URL http(s) */
function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
