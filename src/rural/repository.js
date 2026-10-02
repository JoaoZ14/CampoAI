import { createSupabaseClient } from "../models/supabaseClient.js";
import { AppError } from "../utils/errors.js";
export class RuralRepository {
  constructor(db = createSupabaseClient()) {
    this.db = db;
  }
  async result(query) {
    const { data, error } = await query;
    if (error) {
      const text = String(error.message || '');
      const known = [
        ['Invalid group balance', 'Essa alteração deixaria o grupo com quantidade negativa ou acima do limite. Confira as entradas, saídas e datas.'],
        ['Overlapping milk period', 'Já existe produção para este período. Corrija o registro existente; não some o total do dia com as ordenhas.'],
        ['Invalid payment balance', 'O recebimento ultrapassa o saldo da venda ou a venda está cancelada.'],
        ['Payments must be corrected first', 'Corrija ou anule os recebimentos antes de cancelar ou reduzir a venda.'],
        ['production_weighing_day_idx', 'Já existe pesagem desta unidade nesta data. Corrija a pesagem existente.'],
        ['production_milk_period_idx', 'Já existe produção de leite desta unidade neste período. Corrija o registro existente.'],
        ['production_units_identifier_idx', 'Esta identificação já está cadastrada no estabelecimento.'],
        ['farm_activities_name_idx', 'Já existe uma atividade com este nome no estabelecimento.'],
        ['inventory_items_current_quantity_check', 'O consumo ultrapassa o estoque disponível. Confira o saldo antes de registrar.'],
      ].find(([code]) => text.includes(code));
      throw new AppError(known ? known[1] : "Não foi possível acessar os dados rurais.", known ? 400 : 503);
    }
    return data;
  }
  farms(userId) {
    return this.result(
      this.db
        .from("farms")
        .select("*")
        .eq("owner_user_id", userId)
        .order("created_at")
        .limit(101),
    );
  }
  farm(userId, farmId) {
    return this.result(
      this.db
        .from("farms")
        .select("*")
        .eq("owner_user_id", userId)
        .eq("id", farmId)
        .maybeSingle(),
    );
  }
  one(table, farmId, id) {
    return this.result(
      this.db
        .from(table)
        .select("*")
        .eq("farm_id", farmId)
        .eq("id", id)
        .maybeSingle(),
    );
  }
  list(table, farmId, filters = {}, limit = 50) {
    let q = this.db.from(table).select("*").eq("farm_id", farmId);
    const dateCol =
      {
        farm_expenses: "expense_date",
        farm_operations: "operation_date",
        farm_tasks: "due_at",
        field_occurrences: "detected_at",
        production_events: 'event_date',
        farm_sales: 'sale_date',
        sale_payments: 'payment_date',
      }[table] || "created_at";
    for (const [k, v] of Object.entries(filters)) {
      if (k === "from") q = q.gte(dateCol, v);
      else if (k === "to")
        q = q.lt(dateCol, v); // half-open intervals throughout API
      else if (k !== "offset") q = q.eq(k, v);
    }
    return this.result(
      q
        .order(dateCol, { ascending: false })
        .order("id")
        .range(filters.offset || 0, (filters.offset || 0) + limit - 1),
    );
  }
  async all(table, farmId, filters = {}) {
    const rows = [];
    for (let offset = 0; offset < 100000; offset += 500) {
      const page = await this.list(table, farmId, { ...filters, offset }, 500);
      rows.push(...page);
      if (page.length < 500) return rows;
    }
    throw new AppError("Período muito amplo. Informe um intervalo menor.", 400);
  }
  context(userId) {
    return this.result(
      this.db
        .from("assistant_context")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
    );
  }
  setContext(userId, patch) {
    return this.result(
      this.db.from("assistant_context").upsert({
        user_id: userId,
        field_id: null,
        field_cycle_id: null,
        ...patch,
        expires_at: new Date(Date.now() + 12 * 3600000).toISOString(),
        updated_at: new Date().toISOString(),
      }),
    );
  }
  action(userId, source, key, tool, changes) {
    return this.result(
      this.db.rpc("apply_rural_action", {
        p_user: userId,
        p_source: source,
        p_key: key,
        p_tool: tool,
        p_changes: changes,
      }),
    );
  }
  audit(row) {
    return this.result(this.db.from("assistant_actions").insert(row));
  }
}
