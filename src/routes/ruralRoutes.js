import express from "express";
import { randomUUID } from "node:crypto";
import { requireLinkedCustomer } from "../middleware/customerAuth.js";
import { RuralService } from "../rural/service.js";
import { hasFeature } from "../rural/features.js";
import { WeatherService } from "../rural/weather.js";
import { generateFarmReport } from "../rural/reports.js";
import { publicActivity, recordHistory } from "../rural/activity.js";
import { AppError } from "../utils/errors.js";
import { ruralQuery } from "../rural/httpQuery.js";
import { agroCatalog } from '../rural/agroCatalog.js';
const router = express.Router();
router.use(requireLinkedCustomer);
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!hasFeature(req.customerUser, "agent"))
    return res
      .status(404)
      .json({ ok: false, error: "Área rural ainda não habilitada." });
  const key = req.get("Idempotency-Key");
  if (key && !/^[a-zA-Z0-9_-]{8,100}$/.test(key))
    return res
      .status(400)
      .json({ ok: false, error: "Chave de solicitação inválida." });
  req.rural = new RuralService(
    req.customerUser,
    undefined,
    `web:${key || randomUUID()}`,
  );
  next();
});
const handle = (fn) => async (req, res, next) => {
  try {
    res.json({ ok: true, data: await fn(req) });
  } catch (e) {
    next(e);
  }
};
router.get(
  '/agro/catalog',
  handle(req => { req.rural.feature('modules'); return agroCatalog(); }),
);
router.get(
  '/farms/:farmId/agro/overview',
  handle(req => req.rural.agroOverview(req.params.farmId, ruralQuery(req.query))),
);
router.get(
  "/farms",
  handle((req) => req.rural.farms()),
);
router.post(
  "/farms",
  handle((req) => req.rural.save("farms", null, req.body)),
);
router.patch(
  "/farms/:farmId",
  handle((req) =>
    req.rural.save("farms", req.params.farmId, req.body, req.params.farmId),
  ),
);
router.get(
  "/farms/:farmId/summary",
  handle((req) => req.rural.summary(req.params.farmId)),
);
router.get(
  '/farms/:farmId/dashboard',
  handle(req => req.rural.dashboard(req.params.farmId, ruralQuery(req.query))),
);
router.get('/farms/:farmId/:entity/:recordId/history', handle(req => {
  const filters = ruralQuery(req.query);
  if (Object.keys(filters).some(key => key !== 'offset')) throw new AppError('Filtro inválido.', 400);
  return recordHistory(req.rural, req.params.farmId, req.params.entity, req.params.recordId, filters.offset || 0);
}));
router.get(
  "/farms/:farmId/activity",
  handle(async (req) => {
    const farm = await req.rural.farm(req.params.farmId);
    const offset = ruralQuery(req.query).offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
      throw new AppError("Página inválida.", 400);
    const rows = await req.rural.repo.result(
      req.rural.repo.db
        .from("assistant_actions")
        .select("id,created_at,source_message_id,status,input_json")
        .eq("user_id", req.customerUser.id)
        .eq("farm_id", farm.id)
        .eq("action_type", "WRITE")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + 20),
    );
    return { items: rows.slice(0, 20).map(publicActivity), has_more: rows.length > 20 };
  }),
);
router.get(
  "/farms/:farmId/weather",
  handle(async (req) => {
    req.rural.feature("weather");
    return new WeatherService(req.rural.repo).forecast(
      await req.rural.farm(req.params.farmId),
    );
  }),
);
router.get(
  "/farms/:farmId/expenses/summary",
  handle((req) => req.rural.expenses(req.params.farmId, ruralQuery(req.query))),
);
router.post(
  "/farms/:farmId/report",
  handle((req) => {
    req.rural.feature("reports");
    return generateFarmReport(req.rural, req.params.farmId, req.body || {});
  }),
);
router.get(
  "/farms/:farmId/:entity/:recordId",
  handle(async (req) => {
    if (req.params.entity === "farms") {
      if (req.params.farmId !== req.params.recordId)
        throw new AppError("Registro não encontrado nesta propriedade.", 404);
      return req.rural.farm(req.params.farmId);
    }
    return req.rural.one(req.params.entity, req.params.farmId, req.params.recordId);
  }),
);
router.get(
  "/farms/:farmId/:entity",
  handle((req) =>
    req.rural.list(req.params.entity, req.params.farmId, ruralQuery(req.query)),
  ),
);
router.post(
  "/farms/:farmId/:entity",
  handle((req) =>
    req.rural.save(req.params.entity, req.params.farmId, req.body),
  ),
);
router.patch(
  "/farms/:farmId/:entity/:recordId",
  handle((req) => {
    if (req.params.entity === "farm_tasks" && req.body.status === "cancelled")
      throw new AppError("Confirme o cancelamento pelo WhatsApp.", 400);
    return req.rural.save(
      req.params.entity,
      req.params.farmId,
      req.body,
      req.params.recordId,
    );
  }),
);
export default router;
