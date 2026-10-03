import { schemas, tableFeatures, filtersSchema } from "../../rural/schemas.js";
import {
  object,
  id,
  str,
  positive,
  date,
  validate,
  fail,
} from "../../rural/validation.js";
import { hasFeature } from "../../rural/features.js";
import { WeatherService } from "../../rural/weather.js";
import { tryResolveFieldCalcMessage } from "../../services/fieldCalcService.js";
import { actionKey } from "../../rural/service.js";
import { generateFarmReport } from "../../rural/reports.js";
import { marketProvider } from "../../rural/market.js";
import { attachPendingMedia, loadOccurrenceMedia } from "../../rural/media.js";
import { agroTools } from './agroTools.js';
import { taskValues } from '../../rural/time.js';
const farm = { farm_id: id };
const tool = (name, description, classification, parameters, run) => ({
  name,
  description,
  classification,
  parameters,
  run,
});
export function createTools(
  service,
  { text = "", now = new Date(), weather = new WeatherService(service.repo) } = {},
) {
  const tools = [
    tool(
      "get_commodity_price",
      "Cotação da fonte configurada; sempre informar fonte, unidade, UF e data. stale=true NÃO é preço atual.",
      "EXTERNAL",
      object({ commodity: str, uf: { type: "string", maxLength: 2 } }, [
        "commodity",
      ]),
      (a) => marketProvider.prices(a.commodity, a.uf),
    ),
    tool(
      "get_user_farms",
      "Lista propriedades acessíveis ao usuário autenticado.",
      "READ",
      object({}),
      () => service.farms(),
    ),
    tool(
      "cancel_reminder",
      "Pede confirmação de cancelamento de tarefa/lembrete. Só cancela após confirmação explícita numa mensagem seguinte.",
      "DESTRUCTIVE",
      object({ ...farm, task_id: id }, ["task_id"]),
      (a) => service.cancelTask(a.farm_id, a.task_id, text),
    ),
    tool(
      "get_farm_details",
      "Consulta dados reais da propriedade.",
      "READ",
      object(farm),
      (a) => service.farm(a.farm_id),
    ),
    tool(
      "create_farm",
      "Cadastra propriedade com informações declaradas, progressivamente.",
      "WRITE",
      schemas.farms,
      (a) => service.save("farms", null, a),
    ),
    tool(
      "update_farm",
      "Corrige dados da propriedade.",
      "WRITE",
      object({ ...farm, values: schemas.farms }, ["farm_id", "values"]),
      (a) => service.save("farms", a.farm_id, a.values, a.farm_id),
    ),
    tool(
      "set_active_context",
      "Seleciona propriedade/talhão/ciclo; contexto expira em 12h.",
      "WRITE",
      object({ ...farm, field_id: id, field_cycle_id: id }, ["farm_id"]),
      (a) => service.setActive(a.farm_id, a.field_id, a.field_cycle_id),
    ),
    tool(
      "resolve_field_alias",
      "Resolve nome ou alias confirmado. Múltiplos matches exigem pergunta.",
      "READ",
      object({ ...farm, name: str }, ["name"]),
      (a) => service.resolveField(a.farm_id, a.name),
    ),
    tool(
      "get_current_season",
      "Lista safras ativas; não escolhe se houver ambiguidade.",
      "READ",
      object(farm),
      (a) => service.currentSeason(a.farm_id),
    ),
    tool(
      "get_farm_summary",
      "Resumo estruturado, listas recentes limitadas a 50; custos totais determinísticos. from inclusivo, to exclusivo.",
      "READ",
      object({ ...farm, filters: filtersSchema }),
      (a) => service.summary(a.farm_id, a.filters),
    ),
    tool(
      "get_weekly_summary",
      "Resumo completo de operações, despesas, ocorrências e tarefas concluídas no período (from inclusivo, to exclusivo).",
      "READ",
      object({ ...farm, from: date, to: date }, ["from", "to"]),
      (a) => service.weekly(a.farm_id, a.from, a.to),
    ),
    tool(
      "get_last_action",
      "Consulta última gravação para correção auditável.",
      "READ",
      object({}),
      async () =>
        service.repo.result(
          service.repo.db
            .from("assistant_actions")
            .select("tool_name,output_json,created_at")
            .eq("user_id", service.user.id)
            .eq("action_type", "WRITE")
            .eq("status", "success")
            .order("created_at", { ascending: false })
            .limit(1),
        ),
    ),
    tool(
      "calculator",
      "Motor numérico existente. Exemplo: calc area-ret 320 180. Não calcula doses.",
      "READ",
      object({ command: str }, ["command"]),
      (a) => {
        if (
          !/^calc (m2-ha|ha-m2|area-ret|plantas|semente-kg|semente-sac|volume-ret|litros-m3|m3-litros|vazao-lh|encher|lotacao|alq-ha|ha-alq)(?:\s+[0-9]+(?:[.,][0-9]+)?)+$/i.test(
            a.command,
          )
        )
          fail("Comando de cálculo inválido.");
        return { result: tryResolveFieldCalcMessage(a.command) };
      },
    ),
  ];
  const labels = {
    fields: ["field", "fields"],
    crop_seasons: ["crop_season", "crop_seasons"],
    field_cycles: ["crop_cycle", "crop_cycles"],
    farm_operations: ["farm_operation", "farm_operations"],
    farm_expenses: ["expense", "expenses"],
    farm_tasks: ["task", "tasks"],
    field_occurrences: ["field_occurrence", "field_occurrences"],
    occurrence_followups: ["occurrence_followup", "occurrence_followups"],
    inventory_items: ["inventory_item", "inventory_items"],
    inventory_movements: ["inventory_movement", "inventory_movements"],
    field_aliases: ["field_alias", "field_aliases"],
    assistant_memories: ["memory", "memories"],
  };
  for (const [table, [singular, plural]] of Object.entries(labels)) {
    if (tableFeatures[table] && !hasFeature(service.user, tableFeatures[table]))
      continue;
    tools.push(
      tool(
        `list_${plural}`,
        `Consulta ${plural}. Até 50 por página; offset para próxima. Datas from inclusivo/to exclusivo.`,
        "READ",
        object({ ...farm, filters: filtersSchema }),
        (a) => service.list(table, a.farm_id, a.filters),
      ),
    );
    tools.push(
      tool(
        `get_${singular}`,
        `Consulta um registro de ${singular} por ID.`,
        "READ",
        object({ ...farm, record_id: id }, ["record_id"]),
        (a) => service.one(table, a.farm_id, a.record_id),
      ),
    );
    const createSchema =
      table === "farm_tasks"
        ? {
            ...schemas[table],
            properties: {
              ...schemas[table].properties,
              status: { type: "string", enum: ["pending"] },
            },
          }
        : schemas[table];
    tools.push(
      tool(
        `create_${singular}`,
        `Registra ${singular} explicitamente relatado pelo usuário.`,
        "WRITE",
        object({ ...farm, values: createSchema }, ["values"]),
        async (a) => {
          const values = table === 'farm_tasks' ? await taskValues(service, a.farm_id, a.values, null, text, now) : a.values;
          const result = await service.save(table, a.farm_id, values);
          if (table === "field_occurrences")
            await attachPendingMedia(service, result);
          if (table === "occurrence_followups")
            await attachPendingMedia(
              service,
              await service.one(
                "field_occurrences",
                a.farm_id,
                a.values.occurrence_id,
              ),
            );
          return result;
        },
      ),
    );
    if (
      ![
        "inventory_movements",
        "field_aliases",
        "assistant_memories",
        "occurrence_followups",
      ].includes(table)
    ) {
      const patch = { ...schemas[table], required: [] };
      if (table === "farm_tasks")
        patch.properties = {
          ...patch.properties,
          status: { type: "string", enum: ["pending", "completed"] },
        };
      tools.push(
        tool(
          `update_${singular}`,
          `Corrige ${singular}; preserves audit trail.`,
          "WRITE",
          object({ ...farm, record_id: id, values: patch }, [
            "record_id",
            "values",
          ]),
          async (a) => service.save(table, a.farm_id, table === 'farm_tasks' ? await taskValues(service, a.farm_id, a.values, a.record_id, text, now) : a.values, a.record_id),
        ),
      );
    }
  }
  tools.push(
    tool(
      "register_planting",
      "Cria ciclo e operação de plantio juntos em transação. Talhão deve existir.",
      "WRITE",
      object({ ...farm, values: schemas.field_cycles }, ["values"]),
      async (a) => {
        if (!a.values.planting_date) fail("Qual foi a data do plantio?");
        const f = await service.farm(a.farm_id);
        const cycle = await service.change("field_cycles", f.id, a.values);
        const operation = await service.change("farm_operations", f.id, {
          field_id: a.values.field_id,
          operation_type: "plantio",
          operation_date: a.values.planting_date,
          description: `Plantio de ${a.values.crop_name}`,
          ...(a.values.area_ha ? { area_ha: a.values.area_ha } : {}),
        });
        const result = await service.commit("register_planting", a, [
          cycle,
          { ...operation, link_previous_cycle: true },
        ]);
        await service.setActive(f.id, a.values.field_id, result[0].id);
        return result;
      },
    ),
  );
  if (hasFeature(service.user, "financial"))
    tools.push(
      tool(
        "get_expense_summary",
        "Soma real em BRL, por categoria, talhão e por hectare. Use crop_season_id para consulta de safra.",
        "READ",
        object({ ...farm, filters: filtersSchema }),
        (a) => service.expenses(a.farm_id, a.filters),
      ),
    );
  if (
    hasFeature(service.user, "inventory") &&
    hasFeature(service.user, "financial")
  )
    tools.push(
      tool(
        "record_purchase",
        "Compra: calcula total e grava despesa + entrada de estoque atomicamente.",
        "WRITE",
        object(
          {
            ...farm,
            inventory_item_id: id,
            quantity: positive,
            unit_price: positive,
            expense_date: date,
            crop_season_id: id,
          },
          ["inventory_item_id", "quantity", "unit_price", "expense_date"],
        ),
        (a) => service.purchase(a.farm_id, a),
      ),
    );
  if (hasFeature(service.user, "weather"))
    tools.push(
      tool(
        "get_weather_forecast",
        "Condições atuais e previsão, com fonte, unidades e data; localização da propriedade.",
        "EXTERNAL",
        object({ ...farm, days: { type: "integer", minimum: 1, maximum: 7 } }),
        async (a) =>
          weather.forecast(await service.farm(a.farm_id), a.days || 3),
      ),
    );
  if (hasFeature(service.user, "reports"))
    tools.push(
      tool(
        "generate_farm_report",
        "PDF com dados estruturados, opcionalmente safra/talhão/período. Link privado temporário.",
        "EXTERNAL",
        object({ ...farm, filters: filtersSchema }),
        (a) => generateFarmReport(service, a.farm_id, a.filters),
      ),
    );
  if (
    hasFeature(service.user, "media") &&
    hasFeature(service.user, "occurrences")
  )
    tools.push(
      tool(
        "get_occurrence_media",
        "Recupera até 3 mídias recentes da ocorrência para comparação visual; mídia tem retenção de 30 dias.",
        "READ",
        object({ ...farm, occurrence_id: id }, ["occurrence_id"]),
        (a) => loadOccurrenceMedia(service, a.farm_id, a.occurrence_id),
      ),
    );
  if (
    hasFeature(service.user, "inventory") &&
    hasFeature(service.user, "reminders")
  )
    tools.push(
      tool(
        "set_inventory_alert",
        "Ativa aviso WhatsApp quando estoque ficar abaixo do mínimo informado.",
        "WRITE",
        object(
          {
            ...farm,
            inventory_item_id: id,
            minimum_quantity: { type: "number", minimum: 0, maximum: 1e9 },
          },
          ["inventory_item_id", "minimum_quantity"],
        ),
        (a) =>
          service.setInventoryAlert(
            a.farm_id,
            a.inventory_item_id,
            a.minimum_quantity,
          ),
      ),
    );
  if (hasFeature(service.user, 'modules')) tools.push(...agroTools(service));
  const plain = text.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const moduleRequest = /\b(cavalo|egua|equino|treino|passada|pesagem|pesou|ordenha|leite|ovos|colmeia|apiario|viveiro|despesca|lote|brinco)\b/i.test(plain);
  const cropRequest = /\b(talhao|plantio|plantei|safra|milho|horta|colhi|alface)\b/i.test(plain);
  if (hasFeature(service.user, 'modules') && moduleRequest && !cropRequest) {
    return tools.filter(t => t.name.includes('agro') || t.name === 'resolve_production_unit' || /farm|task|expense|inventory|reminder|calculator|last_action|active_context/.test(t.name));
  }
  return tools;
}
export async function executeTool(tool, args, service) {
  validate(tool.parameters, args);
  const started = Date.now();
  try {
    const result = await tool.run(args);
    if (
      tool.classification === "READ" ||
      tool.classification === "EXTERNAL" ||
      tool.name === "set_active_context"
    ) {
      await service.repo.audit({
        user_id: service.user.id,
        action_type: tool.classification,
        tool_name: tool.name,
        input_json: {},
        output_json: { ok: true },
        status: "success",
        source_message_id: service.source,
        idempotency_key: actionKey(tool.name, { args, at: Date.now() }),
      });
    }
    console.info(
      JSON.stringify({
        event: "tool_completed",
        correlation_id: service.source,
        tool: tool.name,
        duration_ms: Date.now() - started,
      }),
    );
    return result;
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "tool_failed",
        correlation_id: service.source,
        tool: tool.name,
        duration_ms: Date.now() - started,
      }),
    );
    try {
      await service.repo.audit({
        user_id: service.user.id,
        action_type: tool.classification,
        tool_name: tool.name,
        input_json: {},
        output_json: { error: "tool_failed" },
        status: "error",
        source_message_id: service.source,
        idempotency_key: actionKey(tool.name, { args, error: true }),
      });
    } catch {
      /* original error wins */
    }
    throw error;
  }
}
