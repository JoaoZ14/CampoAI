import { eventDefinitions } from '../../rural/agroCatalog.js';
const money = (value) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Write acknowledgements are generated from successful backend results, never invented by the LLM.
const day = value => String(value).split('-').reverse().join('/');
const categories = { combustivel: 'Combustível', mao_de_obra: 'Mão de obra', racao: 'Ração', fertilizantes: 'Fertilizantes', veterinaria: 'Veterinária' };
export function actionReceipt(name, result, timeZone = "America/Sao_Paulo", farmName) {
  const receipt = baseReceipt(name, result, timeZone);
  if (!receipt) return null;
  if (name === 'create_farm') return receipt + '\nAgora me diga uma tarefa que precisa fazer, com dia e horário. Após a confirmação, veja em Minhas tarefas no app.';
  const destination = name.includes('expense') || name === 'record_purchase' ? 'Meus gastos' : name.endsWith('_task') || name === 'cancel_reminder' ? 'Minhas tarefas' : name === 'save_agro_record' && result.entity === 'production_units' ? 'Meus animais e áreas' : name === 'save_agro_record' && result.entity === 'production_events' ? 'Minha produção' : 'Últimos registros do Início';
  const scope = farmName && !name.endsWith('_farm') ? '\nPropriedade: ' + farmName + '.' : '';
  return receipt + scope + '\nConfira em ' + destination + ' no app.';
}
function baseReceipt(name, result, timeZone) {
  if (name === 'save_agro_record') {
    const r = result.record;
    const verb = result.updated ? 'Atualizei' : 'Registrei';
    if (result.entity === 'farm_activities') return `${verb} a atividade “${r.name}”.`;
    if (result.entity === 'production_units') return `${verb} a ficha de “${r.name}”${r.identifier ? `, identificação ${r.identifier}` : ''}.`;
    if (result.entity === 'production_events') return `${r.status === 'voided' ? 'Anulei' : verb} ${eventDefinitions[r.event_type].label.toLowerCase()}: ${r.description}, em ${r.event_date}${r.quantity ? ` — ${r.quantity} ${r.unit}` : ''}.`;
    if (result.entity === 'farm_sales') return `${r.status === 'cancelled' ? 'Cancelei' : verb} a venda/serviço “${r.description}”: ${money(r.amount)}, cliente ${r.customer}, vencimento ${r.due_date}. Isso não confirma recebimento.`;
    if (result.entity === 'sale_payments') return `${r.status === 'voided' ? 'Anulei' : verb} o recebimento de ${money(r.amount)}, em ${r.payment_date}.`;
  }
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
    return `${verb} ${money(result.amount)} de ${result.description || result.category} (${categories[result.category] || result.category}), em ${day(result.expense_date)}.`;
  if (name.endsWith("_task") && result.title) {
    if (result.status === 'completed') return `Concluí a tarefa “${result.title}”. Não há lembrete pendente para esta tarefa.`;
    if (result.status === 'cancelled') return `Cancelei a tarefa “${result.title}” e seu lembrete, se havia um.`;
    const when = new Date(result.due_at).toLocaleString('pt-BR', { timeZone, dateStyle: 'short', timeStyle: 'short' });
    return `${name.startsWith('update_') ? 'Atualizei' : 'Agendei'} a tarefa “${result.title}” para ${when} (horário da propriedade). ${result.remind ? 'Lembrete no WhatsApp ativado.' : 'Sem lembrete no WhatsApp.'}`;
  }
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
