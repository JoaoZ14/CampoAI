import { normalizeName } from "../../rural/validation.js";
import { isExplicitWriteRequest } from "../policies/intent.js";

// O registro direto cobre somente despesas simples e inequívocas de combustível.
// Outros pedidos seguem para o agente e suas ferramentas.
export function simpleFuelExpense(text) {
  if (typeof text !== "string" || text.length > 500 || !isExplicitWriteRequest(text)) return null;
  const input = normalizeName(text);
  if (/\b(nao|nunca|seria|hipoteticamente|ontem|anteontem)\b/.test(input)) return null;
  if (/\b(comprei|compra|estoque|litros?|galoes?|galao)\b/.test(input)) return null;
  if (/\b(semana passada|mes passado|dia \d|\d{1,2}\/\d{1,2})\b/.test(input)) return null;
  if (/\?$/.test(input) && !/\b(registr(?:e|ar)|anot(?:e|ar)|salv(?:e|ar)|cadastr(?:e|ar))\b/.test(input)) return null;
  const fuels = [...new Set((input.match(/\b(diesel|gasolina)\b/g) || []))];
  if (fuels.length !== 1) return null;
  const amounts = [...text.matchAll(/(?:R\$\s*([\d.,]+)|([\d.,]+)\s*(?:reais|real)\b)/gi)];
  if (amounts.length !== 1) return null;
  const rawAmount = amounts[0][1] || amounts[0][2];
  const amount = Number(rawAmount.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) return null;
  return { amount, category: "combustivel", description: fuels[0] === "diesel" ? "Diesel" : "Gasolina" };
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
