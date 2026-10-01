import { normalizeName } from "../../rural/validation.js";
import { isExplicitWriteRequest } from "../policies/intent.js";

// O registro direto cobre somente despesas simples e inequívocas de combustível.
// Outros pedidos seguem para o agente e suas ferramentas.
export function simpleFuelExpense(text) {
  if (typeof text !== "string" || text.length > 500 || !isExplicitWriteRequest(text)) return null;
  // Match the whole request. Dates, other farms, extra amounts and conditions
  // require the agent's clarification instead of silently using today's context.
  const input = normalizeName(text).replace(/[?!.]$/, '').trim();
  const match = input.match(/^(?:(?:consegue|pode) (?:registrar|anotar|salvar)(?: para mim)?|(?:registre|anote|salve)(?: para mim)?|(?:quero|preciso) registrar|(?:eu )?(?:gastei|paguei))\s+(?:r\$\s*(\d+(?:\.\d{3})*(?:,\d{1,2})?)|(\d+(?:\.\d{3})*(?:,\d{1,2})?)\s+reais?)\s+(?:de|em|com)\s+(diesel|gasolina)(?:\s+que (?:eu )?gastei)?(?:\s+hoje)?$/);
  if (!match) return null;
  const rawAmount = match[1] || match[2];
  // Reject malformed thousands groups, e.g. 35.00 or 1.23.456.
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(rawAmount)) return null;
  const amount = Number(rawAmount.replaceAll('.', '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) return null;
  return { amount, category: "combustivel", description: match[3] === "diesel" ? "Diesel" : "Gasolina" };
}

export async function registerSimpleFuelExpense(service, context, expense, onOutcome = () => {}) {
  if (!context.active_farm) {
    onOutcome({ charge: false });
    if (!context.farms.length) return "Antes de registrar a despesa, como você chama sua propriedade?";
    return `Em qual propriedade devo registrar a despesa: ${context.farms.map((farm) => farm.name).join(", ")}?`;
  }
  try {
    const saved = await service.save("farm_expenses", context.active_farm.id, {
      ...expense,
      expense_date: context.local_date,
    });
    const date = saved.expense_date.split("-").reverse().join("/");
    const value = Number(saved.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return `Registrei ${value} de ${saved.description.toLowerCase()} como despesa em ${date}. Usei a data de hoje; se foi em outro dia, me diga para corrigir.`;
  } catch (error) {
    onOutcome({ charge: false });
    if (error.statusCode && error.statusCode < 500) return `Não consegui registrar a despesa: ${error.message}`;
    console.warn(JSON.stringify({ event: "direct_expense_failed", correlation_id: service.source, status: error.statusCode || null }));
    return "Não consegui confirmar o registro da despesa agora. Antes de repetir, peça para consultar as despesas recentes.";
  }
}
