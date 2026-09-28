import { buildConversationReportPdf } from "../services/reportPdfService.js";
import { uploadReportPdfAndGetSignedUrl } from "../services/reportStorageService.js";
import { validate } from "./validation.js";
import { filtersSchema } from "./schemas.js";
export async function buildFarmReportText(service, farmId, filters = {}) {
  validate(filtersSchema, filters);
  const farm = await service.farm(farmId);
  await service.references(farm.id, filters);
  const field = filters.field_id
    ? await service.one("fields", farm.id, filters.field_id)
    : null;
  const season = filters.crop_season_id
    ? await service.one("crop_seasons", farm.id, filters.crop_season_id)
    : null;
  const sections = [
    `PROPRIEDADE\n${farm.name}\n${farm.city || "Cidade não informada"} / ${farm.state || "UF não informada"}\nÁrea cadastrada: ${farm.total_area_ha || "não informada"} ha`,
    `ESCOPO\nTalhão: ${field?.name || "todos"}\nSafra: ${season?.name || "todas"}\nDe ${filters.from || "início"} até ${filters.to || "hoje"} (limite final exclusivo)`,
  ];
  const relevant = { ...filters };
  delete relevant.offset;
  const fields = await service.repo.all("fields", farm.id);
  sections.push(
    "TALHÕES\n" +
      fields
        .filter((f) => !field || f.id === field.id)
        .map((f) => `${f.name}: ${f.area_ha || "área não informada"} ha`)
        .join("\n"),
  );
  const cycleFilter = {
    ...(field ? { field_id: field.id } : {}),
    ...(season ? { crop_season_id: season.id } : {}),
  };
  const cycles = await service.repo.all("field_cycles", farm.id, cycleFilter);
  sections.push(
    "CULTURAS E CICLOS\n" +
      (cycles
        .map(
          (c) =>
            `${c.crop_name} — ${c.area_ha || "área não informada"} ha — plantio ${c.planting_date || "não informado"} — ${c.status}`,
        )
        .join("\n") || "Nenhum ciclo registrado."),
  );
  if (season) {
    // Other domain tables do not carry season_id: use season dates, explicitly stated.
    if (!relevant.from) relevant.from = season.start_date;
    if (!relevant.to && season.end_date)
      relevant.to = new Date(Date.parse(season.end_date) + 86400000)
        .toISOString()
        .slice(0, 10);
    if (!relevant.from || !relevant.to)
      throw new Error(
        "Informe o período da safra para incluir operações, tarefas e ocorrências no relatório.",
      );
    sections.push(
      "CRITÉRIO DE PERÍODO\nCustos vinculados à safra selecionada. Operações, tarefas e ocorrências usam o intervalo de datas da safra e o talhão informado.",
    );
  }
  for (const [table, title, description, dateKey] of [
    ["farm_operations", "OPERAÇÕES", "description", "operation_date"],
    ["farm_tasks", "TAREFAS", "title", "due_at"],
    ["field_occurrences", "OCORRÊNCIAS", "description", "detected_at"],
  ]) {
    if (
      table === "field_occurrences" &&
      process.env.OCCURRENCES_ENABLED !== "true"
    )
      continue;
    const query = Object.fromEntries(
      Object.entries(relevant).filter(
        ([k, v]) => v && ["field_id", "from", "to"].includes(k),
      ),
    );
    const rows = await service.repo.all(table, farm.id, query);
    sections.push(
      `${title}\n` +
        (rows
          .map(
            (r) =>
              `${r[dateKey]} — ${r[description]}${r.status ? ` (${r.status})` : ""}`,
          )
          .join("\n") || "Nenhum registro no período."),
    );
  }
  if (process.env.EXPENSES_ENABLED === "true") {
    const totals = await service.expenses(farm.id, filters);
    sections.push(
      `CUSTOS REGISTRADOS\n${totals.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\n${totals.count} despesas\n` +
        Object.entries(totals.by_category)
          .map(([k, v]) => `${k}: R$ ${v.toFixed(2)}`)
          .join("\n"),
    );
  }
  sections.push(
    "OBSERVAÇÕES\nSomente dados registrados. Ausência de registro não significa ausência de atividade ou custo. Não constitui laudo, receituário ou recomendação técnica.",
  );
  if (sections.join("\n\n").length > 115000)
    throw new Error(
      "Relatório muito grande. Selecione um período ou talhão menor.",
    );
  return sections.join("\n\n");
}
export async function generateFarmReport(service, farmId, filters = {}) {
  const body = await buildFarmReportText(service, farmId, filters);
  const pdf = await buildConversationReportPdf({
    title: "Relatório da propriedade — AG Assist",
    body,
  });
  return {
    url: await uploadReportPdfAndGetSignedUrl(service.user.id, pdf),
    expires_in_seconds:
      Number(process.env.REPORT_PDF_SIGNED_URL_SECONDS) || 3600,
  };
}
