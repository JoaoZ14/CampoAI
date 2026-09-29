import { normalizeName } from '../../rural/validation.js';

/** Primeiro contato sem propriedade: apresenta o trabalho operacional sem gravar suposições. */
export function firstContactReply(text, context) {
  if (context.farms?.length || typeof text !== 'string') return null;
  const input = normalizeName(text);
  if (!input || input.length > 500) return null;

  // Pedidos claros de registro e dúvidas técnicas seguem para o agente e suas ferramentas.
  if (/(cadastr|registr|anot|agend|crie|criar|plantei|colhi|gastei|paguei|lembre)/.test(input)) return null;
  if (/(doenca|doente|praga|mancha|amarel|problema|como tratar|o que fazer com)/.test(input)) return null;

  const beginner = /(acabei de (conhecer|chegar|me cadastrar)|sou novo|primeira vez|como (voce|vc|a lida|voces) (pode|podem|vai|vao)? ?(me )?ajudar|queria entender como|tenho (um|uma) (sitio|fazenda|propriedade))/.test(input);
  const describesWork = /\b(planto|cultivo|produzo|crio|tenho (galinhas|gado|animais|horta|lavoura))\b/.test(input);
  if (!beginner && !describesWork) return null;

  if (describesWork && !beginner) {
    return 'Legal! Posso ajudar com o que você planta e cria, e também organizar a rotina do sítio para você acompanhar no app. Ainda não registrei plantios ou animais só por você me contar isso. Se quiser começar, como você chama sua propriedade?';
  }
  return 'Posso tirar dúvidas do campo e também ajudar a organizar seu sítio: cadastrar a propriedade, talhões e tarefas para você acompanhar no app. Vamos começar pelo básico: como você chama sua propriedade?';
}
