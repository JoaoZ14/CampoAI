import express from "express";
import { randomUUID } from "node:crypto";
import { requireLinkedCustomer } from "../middleware/customerAuth.js";
import { RuralService } from "../rural/service.js";
import { hasFeature } from "../rural/features.js";
import { WeatherService } from "../rural/weather.js";
import { generateFarmReport } from "../rural/reports.js";
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
  handle((req) => req.rural.expenses(req.params.farmId, req.query)),
);
router.post(
  "/farms/:farmId/report",
  handle((req) => {
    req.rural.feature("reports");
    return generateFarmReport(req.rural, req.params.farmId, req.body || {});
  }),
);
router.get(
  "/farms/:farmId/:entity",
  handle((req) =>
    req.rural.list(req.params.entity, req.params.farmId, req.query),
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
      throw Object.assign(new Error("Confirme o cancelamento pelo WhatsApp."), {
        statusCode: 400,
      });
    return req.rural.save(
      req.params.entity,
      req.params.farmId,
      req.body,
      req.params.recordId,
    );
  }),
);
export default router;
