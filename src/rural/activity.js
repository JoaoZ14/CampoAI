const labels = {
  farm_activities: 'Atividade produtiva',
  production_units: 'Unidade de produção',
  production_events: 'Registro de produção',
  farm_sales: 'Venda / serviço',
  sale_payments: 'Recebimento',
  farms: "Propriedade",
  fields: "Talhão",
  crop_seasons: "Safra",
  field_cycles: "Cultivo",
  farm_operations: "Atividade de campo",
  farm_expenses: "Despesa",
  farm_tasks: "Tarefa",
  field_occurrences: "Ocorrência",
  occurrence_followups: "Acompanhamento",
  inventory_items: "Item de estoque",
  inventory_movements: "Movimento de estoque",
  alert_rules: "Alerta",
};

export function publicActivity(row) {
  const snapshots = Array.isArray(row.input_json?.changes)
    ? row.input_json.changes
    : [];
  const changes = snapshots
    .filter((change) => Object.hasOwn(labels, change.table))
    .map((change) => {
      const after = change.after || {};
      const before = change.before || null;
      return {
        entity: change.table,
        entity_id: typeof after.id === "string" ? after.id : null,
        type: before ? "updated" : "created",
        label: labels[change.table],
        title: String(after.title || after.name || after.description || labels[change.table]).slice(0, 140),
      };
    });
  return {
    id: row.id,
    created_at: row.created_at,
    source: row.source_message_id?.startsWith("web:") ? "app" : "lida",
    status: row.status === "success" ? "completed" : "failed",
    changes,
  };
}
