import { normalizeName } from "../../rural/validation.js";
export function intentHint(text, hasImage = false) {
  const t = normalizeName(text || "");
  if (hasImage) return "diagnosis";
  for (const [intent, pattern] of [
    ["reminder", /lembra|lembrete/],
    ["weather", /chuva|chover|clima|previsao/],
    ["market", /cotacao|quanto esta a/],
    ["report", /relatorio|pdf/],
    ["calculator", /calcula|hectares.*metros|metros.*hectares/],
    ["expense_registration", /gastei|paguei/],
    ["inventory", /comprei|estoque|usei.*sacos/],
    [
      "farm_query",
      /quanto.*gast|quando.*plant|como esta.*fazenda|aconteceu.*semana|quantos hectares|quanto.*(?:produziu|produzimos|recebi|recebeu|vendi|vendido)|historico (?:do|da|de)|saldo.*(?:lote|venda)|(?:liste|mostre|consulte).*(?:fichas|animais|cavalos|lotes|treinos|pesagens|leite|recebimentos|vendas)/,
    ],
    ["task", /tarefa|vistoria.*feita/],
    ["operation_registration", /plantei|colhi|irriguei|pesou|produziu|treinei|ordenhei|despesquei/],
    ["farm_registration", /tenho.*fazenda|talhao.*tem/],
    ["plan", /plano|assinatura/],
  ])
    if (pattern.test(t)) return intent;
  return "conversation";
}
export function isExplicitWriteRequest(text) {
  const t = normalizeName(text || "");
  if (/\b(seria interessante|e se|hipoteticamente)\b/.test(t)) return false;
  if (/\b(registr(?:e|ar)|cadastr(?:e|ar)|anot(?:e|ar)|adicion(?:e|ar)|agend(?:e|ar)|cri(?:e|ar)|salv(?:e|ar))\b/.test(t)) return true;
  if (/^(quanto|quando|qual|quais|o que|mostre|liste|consulta|consulte|me diga)\b/.test(t) || /\b(quanto|quantos|qual valor)\?$/.test(t)) return false;
  return /\b(gastei|paguei|comprei|plantei|colhi|irriguei|pesou|produziu|treinei|ordenhei|despesquei)\b/.test(t);
}
export function deterministicSafety(text) {
  const t = normalizeName(text || "");
  if (
    /(vaca|boi|cavalo|animal|bezerro|egua|porco)/.test(t) &&
    /(caid[oa]|sangramento intenso|hemorragia|parto complicado|nao (consegue )?respir|falta de ar)/.test(
      t,
    )
  )
    return "Procure um médico veterinário imediatamente. Mantenha distância segura e evite medicar ou forçar o animal a se levantar sem orientação.";
  if (
    /(qual|quanto|me (diga|passe)|recomende|prescreva).*(dose|dosagem)|quantos (ml|litros|gramas).*(aplicar|dar|injetar)/.test(
      t,
    )
  )
    return "Não posso prescrever doses de medicamentos ou defensivos. Confira a bula e o receituário com o veterinário ou agrônomo responsável. Posso registrar uma quantidade que você já utilizou.";
  return null;
}
