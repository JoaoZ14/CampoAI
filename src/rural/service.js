import { createHash } from "node:crypto";
import { RuralRepository } from "./repository.js";
import { schemas, tableFeatures, filtersSchema } from "./schemas.js";
import { validate, fail, id, normalizeName } from "./validation.js";
import { hasFeature, farmEntitlements } from "./features.js";
const stable = (v) =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])]),
        )
      : v;
export const actionKey = (tool, args) =>
  createHash("sha256")
    .update(JSON.stringify(stable({ tool, args })))
    .digest("hex");
export function expenseTotals(rows, area) {
  const cents = rows.reduce(
    (n, r) => n + Math.round(Number(r.amount) * 100),
    0,
  );
  const by_category = {},
    by_field = {};
  for (const r of rows) {
    const c = Math.round(Number(r.amount) * 100);
    by_category[r.category] = (by_category[r.category] || 0) + c;
    by_field[r.field_id || "sem_talhao"] =
      (by_field[r.field_id || "sem_talhao"] || 0) + c;
  }
  return {
    amount: cents / 100,
    currency: "BRL",
    count: rows.length,
    cost_per_ha: area > 0 ? Math.round(cents / area) / 100 : null,
    area_ha: area || null,
    by_category: Object.fromEntries(
      Object.entries(by_category).map(([k, v]) => [k, v / 100]),
    ),
    by_field: Object.fromEntries(
      Object.entries(by_field).map(([k, v]) => [k, v / 100]),
    ),
  };
}
export class RuralService {
  constructor(user, repo = new RuralRepository(), source) {
    if (!user?.id) fail("Usuário autenticado necessário.");
    this.user = user;
    this.repo = repo;
    this.source = source;
  }
  feature(feature) {
    if (!hasFeature(this.user, feature))
      fail("Este recurso ainda não está habilitado.");
  }
  async farms() {
    return this.repo.farms(this.user.id);
  }
  async farm(farmId) {
    if (farmId) {
      validate(id, farmId);
      const farm = await this.repo.farm(this.user.id, farmId);
      if (!farm) fail("Propriedade não encontrada ou sem acesso.");
      return farm;
    }
    const farms = await this.farms();
    if (farms.length === 1) return farms[0];
    const active = await this.repo.context(this.user.id);
    if (active && Date.parse(active.expires_at) > Date.now()) {
      const farm = farms.find((f) => f.id === active.farm_id);
      if (farm) return farm;
    }
    fail(
      farms.length
        ? "Em qual propriedade?"
        : "Qual é o nome ou a cidade da sua propriedade?",
    );
  }
  async one(table, farmId, recordId) {
    this.table(table);
    validate(id, recordId);
    const farm = await this.farm(farmId);
    const row = await this.repo.one(table, farm.id, recordId);
    if (!row) fail("Registro não encontrado nesta propriedade.");
    return row;
  }
  table(table) {
    if (!Object.hasOwn(schemas, table)) fail("Entidade inválida.");
    if (tableFeatures[table]) this.feature(tableFeatures[table]);
  }
  async list(table, farmId, filters = {}) {
    this.table(table);
    validate(filtersSchema, filters);
    if (filters.category)
      filters = {
        ...filters,
        category: normalizeName(filters.category).replaceAll(" ", "_"),
      };
    const farm = await this.farm(farmId);
    const allowed = new Set([
      ...Object.keys(schemas[table].properties),
      "from",
      "to",
      "offset",
    ]);
    for (const k of Object.keys(filters))
      if (!allowed.has(k)) fail("Filtro incompatível com o registro.");
    return this.repo.list(table, farm.id, filters);
  }
  async references(farmId, values) {
    for (const [key, table] of Object.entries({
      field_id: "fields",
      crop_season_id: "crop_seasons",
      field_cycle_id: "field_cycles",
      inventory_item_id: "inventory_items",
      operation_id: "farm_operations",
      occurrence_id: "field_occurrences",
    })) {
      if (values[key]) {
        const row = await this.repo.one(table, farmId, values[key]);
        if (!row) fail("Registro relacionado não pertence à propriedade.");
        if (
          key === "field_cycle_id" &&
          ((values.field_id && row.field_id !== values.field_id) ||
            (values.crop_season_id &&
              row.crop_season_id !== values.crop_season_id))
        )
          fail("Ciclo incompatível com talhão ou safra.");
      }
    }
  }
  async change(table, farmId, values, recordId) {
    this.table(table);
    const schema = recordId
      ? { ...schemas[table], required: [] }
      : schemas[table];
    validate(schema, values);
    if (values.category)
      values = {
        ...values,
        category: normalizeName(values.category).replaceAll(" ", "_"),
      };
    if (table === "farms" && values.state)
      values = { ...values, state: values.state.toUpperCase() };
    if (!Object.keys(values).length) fail("Informe os dados a registrar.");
    if (recordId) validate(id, recordId);
    const farm =
      table === "farms" && !recordId
        ? null
        : await this.farm(table === "farms" ? recordId : farmId);
    const old =
      recordId && table !== "farms"
        ? await this.one(table, farm.id, recordId)
        : farm;
    const merged = { ...old, ...values };
    if (farm) await this.references(farm.id, merged);
    if (table === "alert_rules") {
      this.feature("inventory");
      this.feature("reminders");
      if (!process.env.REMINDER_CONTENT_SID)
        fail("Alertas aguardam configuração do template WhatsApp.");
      await this.references(farm.id, {
        inventory_item_id: merged.config_json.inventory_item_id,
      });
    }
    if (
      table === "inventory_items" &&
      recordId &&
      values.unit &&
      values.unit !== old.unit
    )
      fail(
        "A unidade do item é fixa para preservar o histórico. Cadastre outro item.",
      );
    if (table === "farms") {
      if (values.timezone)
        try {
          new Intl.DateTimeFormat("pt-BR", {
            timeZone: values.timezone,
          }).format();
        } catch {
          fail("Fuso horário inválido.");
        }
      if ((merged.latitude != null) !== (merged.longitude != null))
        fail("Informe latitude e longitude juntas.");
      if (
        !recordId &&
        (await this.farms()).length >= farmEntitlements(this.user).max_farms
      )
        fail("Limite de propriedades atingido.");
    }
    if (
      table === "fields" &&
      !recordId &&
      (await this.repo.all("fields", farm.id)).length >=
        farmEntitlements(this.user).max_fields
    )
      fail("Limite de talhões atingido.");
    if (table === "farm_operations" && !!merged.quantity !== !!merged.unit)
      fail("Informe quantidade e unidade.");
    if (table === "farm_tasks") {
      if (recordId && values.due_at) {
        if (Date.parse(values.due_at) <= Date.now())
          fail("Informe uma data futura.");
        const jobs = await this.repo.result(
          this.repo.db
            .from("scheduled_jobs")
            .select("status")
            .eq("task_id", recordId)
            .maybeSingle(),
        );
        if (jobs && ["sending", "uncertain", "locked"].includes(jobs.status))
          fail(
            "O lembrete está em envio ou aguardando conferência. Tente corrigir depois.",
          );
      }
      if (merged.remind) {
        this.feature("reminders");
        if (
          !process.env.REMINDER_CONTENT_SID &&
          process.env.MOCK_WHATSAPP !== "true"
        )
          fail("Lembretes aguardam configuração do template WhatsApp.");
      }
      if (!recordId && Date.parse(merged.due_at) <= Date.now())
        fail("Informe uma data futura para a tarefa.");
      if (values.status === "completed")
        values = { ...values, completed_at: new Date().toISOString() };
    }
    if (table === "assistant_memories" && !values.confirmed)
      fail("Confirme esse fato antes de guardar na memória.");
    if (table === "field_aliases")
      values = { ...values, alias: normalizeName(values.alias) };
    return {
      table,
      ...(recordId ? { id: recordId } : {}),
      values: {
        ...values,
        ...(farm && table !== "farms" ? { farm_id: farm.id } : {}),
      },
    };
  }
  async commit(tool, args, changes) {
    if (!this.source) fail("Identificador da solicitação obrigatório.");
    return this.repo.action(
      this.user.id,
      this.source,
      actionKey(tool, args),
      tool,
      changes,
    );
  }
  async save(table, farmId, values, recordId) {
    const change = await this.change(table, farmId, values, recordId);
    const rows = await this.commit(
      recordId ? "update_" + table : "create_" + table,
      { farmId, values, recordId },
      [change],
    );
    return rows[0];
  }
  async setActive(farmId, fieldId, cycleId) {
    const farm = await this.farm(farmId);
    await this.references(farm.id, {
      field_id: fieldId,
      field_cycle_id: cycleId,
    });
    await this.repo.setContext(this.user.id, {
      farm_id: farm.id,
      field_id: fieldId || null,
      field_cycle_id: cycleId || null,
    });
    return {
      farm_id: farm.id,
      field_id: fieldId || null,
      field_cycle_id: cycleId || null,
    };
  }
  async cancelTask(farmId, taskId, text) {
    const task = await this.one("farm_tasks", farmId, taskId);
    const ctx = await this.repo.context(this.user.id);
    const pending = ctx?.pending_action;
    if (
      pending?.task_id === task.id &&
      Date.parse(pending.expires_at) > Date.now() &&
      /^(sim|confirmo|pode cancelar|sim,? pode cancelar)[.! ]*$/i.test(
        String(text).trim(),
      )
    ) {
      const result = await this.save(
        "farm_tasks",
        task.farm_id,
        { status: "cancelled" },
        task.id,
      );
      await this.repo.result(
        this.repo.db
          .from("assistant_context")
          .update({ pending_action: null })
          .eq("user_id", this.user.id),
      );
      return { cancelled: true, task: result };
    }
    await this.repo.setContext(this.user.id, {
      farm_id: task.farm_id,
      pending_action: {
        task_id: task.id,
        expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
      },
    });
    return {
      confirmation_required: true,
      message: `Confirma cancelar “${task.title}”? Responda “sim” para confirmar.`,
    };
  }
  async resolveField(farmId, name) {
    const farm = await this.farm(farmId),
      needle = normalizeName(name);
    const [fields, aliases] = await Promise.all([
      this.repo.all("fields", farm.id),
      this.repo.all("field_aliases", farm.id),
    ]);
    const matches = fields.filter(
      (f) =>
        f.is_active &&
        (normalizeName(f.name) === needle ||
          aliases.some(
            (a) => a.field_id === f.id && normalizeName(a.alias) === needle,
          )),
    );
    return {
      matches,
      ambiguous: matches.length > 1,
      found: matches.length === 1,
    };
  }
  async currentSeason(farmId) {
    const seasons = await this.list("crop_seasons", farmId, {
      status: "active",
    });
    return {
      season: seasons.length === 1 ? seasons[0] : null,
      choices: seasons,
      ambiguous: seasons.length > 1,
    };
  }
  async expenses(farmId, filters = {}) {
    this.feature("financial");
    validate(filtersSchema, filters);
    if (filters.category)
      filters = {
        ...filters,
        category: normalizeName(filters.category).replaceAll(" ", "_"),
      };
    const farm = await this.farm(farmId);
    let area = Number(farm.total_area_ha) || null;
    await this.references(farm.id, filters);
    if (filters.field_cycle_id)
      area =
        Number(
          (await this.one("field_cycles", farm.id, filters.field_cycle_id))
            .area_ha,
        ) || null;
    else if (filters.field_id)
      area =
        Number((await this.one("fields", farm.id, filters.field_id)).area_ha) ||
        null;
    else if (filters.crop_season_id) {
      const cycles = await this.repo.all("field_cycles", farm.id, {
        crop_season_id: filters.crop_season_id,
      });
      area =
        cycles.length && cycles.every((c) => Number(c.area_ha) > 0)
          ? cycles.reduce((n, c) => n + Number(c.area_ha), 0)
          : null;
    }
    const rows = await this.repo.all("farm_expenses", farm.id, filters);
    return {
      ...expenseTotals(rows, area),
      period: { from: filters.from || null, to_exclusive: filters.to || null },
      scope: filters.crop_season_id
        ? "safra"
        : "filtros informados / todas as safras",
    };
  }
  async setInventoryAlert(farmId, itemId, minimum) {
    this.feature("inventory");
    this.feature("reminders");
    const item = await this.one("inventory_items", farmId, itemId);
    const rule = await this.change("alert_rules", item.farm_id, {
      type: "low_stock",
      config_json: { inventory_item_id: itemId },
      active: true,
    });
    const threshold = await this.change(
      "inventory_items",
      item.farm_id,
      { minimum_quantity: minimum },
      itemId,
    );
    return this.commit("set_inventory_alert", { itemId, minimum }, [
      rule,
      threshold,
    ]);
  }
  async purchase(farmId, args) {
    this.feature("financial");
    this.feature("inventory");
    const farm = await this.farm(farmId);
    const item = await this.one(
      "inventory_items",
      farm.id,
      args.inventory_item_id,
    );
    const amount =
      Math.round(args.quantity * Math.round(args.unit_price * 100)) / 100;
    const expense = await this.change("farm_expenses", farm.id, {
      category: item.category,
      description: `Compra: ${item.name}`,
      amount,
      quantity: args.quantity,
      unit: item.unit,
      expense_date: args.expense_date,
      ...(args.crop_season_id ? { crop_season_id: args.crop_season_id } : {}),
    });
    const movement = await this.change("inventory_movements", farm.id, {
      inventory_item_id: item.id,
      type: "entry",
      quantity: args.quantity,
    });
    return this.commit("record_purchase", args, [expense, movement]);
  }
  async weekly(farmId, from, to) {
    validate(filtersSchema, { from, to });
    const farm = await this.farm(farmId);
    const [operations, tasks, occurrences] = await Promise.all([
      this.repo.all("farm_operations", farm.id, { from, to }),
      this.repo.all("farm_tasks", farm.id),
      hasFeature(this.user, "occurrences")
        ? this.repo.all("field_occurrences", farm.id, { from, to })
        : [],
    ]);
    const completed = tasks.filter(
      (t) => t.completed_at && t.completed_at >= from && t.completed_at < to,
    );
    return {
      farm: farm.name,
      from,
      to_exclusive: to,
      operations_count: operations.length,
      worked_area_ha: operations.reduce(
        (n, o) => n + Number(o.area_ha || 0),
        0,
      ),
      area_note:
        "Soma das áreas das operações; uma área pode ter sido trabalhada mais de uma vez.",
      completed_tasks: completed.length,
      pending_tasks: tasks.filter((t) => t.status === "pending").length,
      occurrences_count: occurrences.length,
      expenses: hasFeature(this.user, "financial")
        ? await this.expenses(farm.id, { from, to })
        : null,
    };
  }
  async summary(farmId, filters = {}) {
    const farm = await this.farm(farmId);
    validate(filtersSchema, filters);
    const time = Object.fromEntries(
      Object.entries(filters).filter(([k]) => ["from", "to"].includes(k)),
    );
    const tasksFilter = filters.field_id ? { field_id: filters.field_id } : {};
    const [fields, seasons, cycles, operations, tasks, occurrences, inventory] =
      await Promise.all([
        this.repo.list("fields", farm.id),
        this.repo.list("crop_seasons", farm.id),
        this.repo.list("field_cycles", farm.id),
        this.repo.list("farm_operations", farm.id, { ...time, ...tasksFilter }),
        this.repo.list("farm_tasks", farm.id, tasksFilter),
        hasFeature(this.user, "occurrences")
          ? this.repo.list("field_occurrences", farm.id, {
              ...time,
              ...tasksFilter,
            })
          : [],
        hasFeature(this.user, "inventory")
          ? this.repo.list("inventory_items", farm.id)
          : [],
      ]);
    const alerts = await this.repo.result(
      this.repo.db
        .from("assistant_alerts")
        .select("id,title,message,severity,status")
        .eq("farm_id", farm.id)
        .eq("status", "pending")
        .limit(20),
    );
    return {
      farm,
      fields,
      seasons,
      cycles,
      operations,
      tasks,
      occurrences,
      inventory,
      alerts,
      scope_note: 'Operações e ocorrências usam período/talhão; tarefas são recentes. Filtro de safra aplica-se aos custos. Demais listas descrevem a propriedade.',
      expenses: hasFeature(this.user, "financial")
        ? await this.expenses(farm.id, filters)
        : null,
      list_limit: 50,
      generated_at: new Date().toISOString(),
    };
  }
}
