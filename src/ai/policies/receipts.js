const money = (value) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Write acknowledgements are generated from successful backend results, never invented by the LLM.
export function actionReceipt(name, result, timeZone = "America/Sao_Paulo") {
  if (name === "record_purchase") {
    const expense = result[0],
      movement = result[1];
    return `Registrei a compra: +${movement.quantity} ${expense.unit} no estoque e ${money(expense.amount)} em ${expense.category}.`;
  }
  if (name === "register_planting")
    return `Registrei o plantio de ${result[0].crop_name} em ${result[0].planting_date}${result[0].area_ha ? `, ${result[0].area_ha} ha` : ""}.`;
  if (name === "cancel_reminder")
    return result.cancelled
      ? `Cancelei o lembrete “${result.task.title}”.`
      : null;
  if (name === "set_inventory_alert")
    return `Ativei o aviso de estoque abaixo de ${result[1].minimum_quantity} ${result[1].unit} para ${result[1].name}.`;
  if (name === "set_active_context") return null;
  const verb = name.startsWith("update_") ? "Atualizei" : "Registrei";
  if (name.includes("expense") && result.amount)
    return `${verb} ${money(result.amount)} em ${result.category}, em ${result.expense_date}.`;
  if (name.endsWith("_task") && result.title)
    return `${verb} a tarefa “${result.title}” para ${new Date(result.due_at).toLocaleString("pt-BR", { timeZone, dateStyle: "short", timeStyle: "short" })} (${timeZone})${result.remind && result.status === "pending" ? ", com lembrete" : ""}${result.status === "completed" ? " (concluída)" : ""}.`;
  if (name.endsWith("_farm"))
    return `${verb} a propriedade ${result.name}${result.total_area_ha ? `, ${result.total_area_ha} ha` : ""}.`;
  if (name.endsWith("_field"))
    return `${verb} o talhão ${result.name}${result.area_ha ? `, ${result.area_ha} ha` : ""}.`;
  if (name.endsWith("_farm_operation"))
    return `${verb} a operação: ${result.description}, em ${result.operation_date}.`;
  if (name.endsWith("_inventory_movement"))
    return `Registrei ${result.type === "entry" ? "entrada" : "uso"} de ${result.quantity} na unidade cadastrada do item.`;
  if (name.endsWith("_inventory_item"))
    return `${verb} o item ${result.name}, unidade ${result.unit}.`;
  if (name.endsWith("_field_occurrence"))
    return `${verb} a ocorrência “${result.title}”.`;
  if (name.endsWith("_occurrence_followup"))
    return "Registrei a nova observação no histórico da ocorrência.";
  if (name.endsWith("_field_alias"))
    return `Associei o nome “${result.alias}” ao talhão confirmado.`;
  if (name.endsWith("_crop_season")) return `${verb} a safra ${result.name}.`;
  if (name.endsWith("_crop_cycle"))
    return `${verb} o ciclo de ${result.crop_name}${result.planting_date ? `, plantio em ${result.planting_date}` : ""}.`;
  if (name.endsWith("_memory"))
    return "Guardei o fato confirmado para as próximas conversas.";
  return null;
}
