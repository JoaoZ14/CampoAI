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
      /quanto.*gast|quando.*plant|como esta.*fazenda|aconteceu.*semana|quantos hectares/,
    ],
    ["task", /tarefa|vistoria.*feita/],
    ["operation_registration", /plantei|colhi|irriguei/],
    ["farm_registration", /tenho.*fazenda|talhao.*tem/],
    ["plan", /plano|assinatura/],
  ])
    if (pattern.test(t)) return intent;
  return "conversation";
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
