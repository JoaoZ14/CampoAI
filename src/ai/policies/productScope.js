import { normalizeName } from '../../rural/validation.js';

export const PRODUCT_SCOPE = 'Foco atual: agricultura e criação de animais. CTs, treinos, provas e desempenho esportivo não são recursos do AGGI. Não registre esses pedidos como cuidado, tarefa, serviço ou outra atividade para contornar esse limite. Cuidados e manejo de equinos continuam disponíveis.';

export function isSportsOperation(text) {
  const plain = normalizeName(text || '');
  return /\b(?:treinos?|treinei|treinar|treinamos|adestramento|hipismo|rodeios?|competicoes|competicao|tres tambores|centros? de treinamento)\b/.test(plain)
    || /\b(?:ct|passadas?|provas?|treinamento)\b/.test(plain) && /\b(?:cavalos?|eguas?|equinos?|tambores|esportivo|ct|penalidade|segundos)\b/.test(plain);
}

// Explicit sports requests are answered without loading context or spending model tokens.
export function unsupportedSportReply(text) {
  const plain = normalizeName(text || '');
  const action = /\b(?:registr\w*|cadastr\w*|agend\w*|lemb\w*|remarc\w*|corrig\w*|atualiz\w*|treinei|treinar|treinamos|fiz|anote|anotar|organizar|controle|historico|mostre|liste|consult\w*)\b/.test(plain);
  if (!action || !isSportsOperation(plain)) return null;
  return 'O AGGI está focado em agricultura e criação de animais. Não tenho funções de CT, treino ou prova. Posso ajudar com alimentação, cuidados, pesagens, produção, gastos e tarefas da propriedade.';
}
