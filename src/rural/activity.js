import { fail, id, validate } from './validation.js';
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
        details: Object.fromEntries(['amount', 'quantity', 'unit', 'duration_minutes', 'time_seconds', 'penalty_seconds', 'due_at', 'event_date', 'expense_date', 'operation_date', 'status', 'event_type']
          .filter(key => ['string', 'number'].includes(typeof after[key]))
          .map(key => [key, typeof after[key] === 'string' ? after[key].slice(0, 160) : after[key]])),
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

// Keep the audit trail intact, but present each record only once on the home.
export async function latestRecords(service, farm, limit = 5) {
  const found = new Map();
  for (let offset = 0; offset < 1000 && found.size < limit; offset += 50) {
    const rows = await service.repo.result(service.repo.db.from('assistant_actions')
      .select('id,created_at,source_message_id,status,input_json').eq('user_id', service.user.id).eq('farm_id', farm.id)
      .eq('action_type', 'WRITE').eq('status', 'success').order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 49));
    for (const row of rows) {
      const action = publicActivity(row);
      for (const change of action.changes) {
        if (!change.entity_id) continue;
        try { service.table(change.entity); } catch (error) { if (error.statusCode === 400) continue; throw error; }
        const key = `${change.entity}:${change.entity_id}`;
        if (!found.has(key) && found.size < limit) found.set(key, { ...action, changes: [change] });
      }
    }
    if (rows.length < 50) break;
  }
  const current = await Promise.all([...found.values()].map(async action => {
    const change = action.changes[0];
    const record = change.entity === 'farms' ? change.entity_id === farm.id ? farm : null : await service.repo.one(change.entity, farm.id, change.entity_id);
    if (!record) return null;
    const projection = publicActivity({ ...action, status: 'success', input_json: { changes: [{ table: change.entity, before: change.type === 'updated' ? {} : null, after: record }] } });
    return { ...action, changes: projection.changes };
  }));
  return current.filter(Boolean);
}

export async function recordHistory(service, farmId, entity, recordId, offset = 0) {
  validate(id, recordId);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) fail('Página inválida.');
  if (entity === 'farms') {
    const farm = await service.farm(farmId);
    if (farm.id !== recordId) fail('Propriedade inválida.');
  } else await service.one(entity, farmId, recordId);
  const farm = await service.farm(farmId);
  const rows = await service.repo.result(service.repo.db.from('assistant_actions')
    .select('id,created_at,source_message_id,status,input_json').eq('user_id', service.user.id).eq('farm_id', farm.id)
    .eq('action_type', 'WRITE').eq('status', 'success')
    .contains('input_json', { changes: [{ table: entity, after: { id: recordId } }] })
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 20));
  return { items: rows.slice(0, 20).map(publicActivity).map(action => ({ ...action, changes: action.changes.filter(change => change.entity === entity && change.entity_id === recordId) })), has_more: rows.length > 20 };
}
