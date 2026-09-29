import cron from "node-cron";
import { RuralRepository } from "../rural/repository.js";
import { sendWhatsAppContentTemplate } from "../services/whatsappService.js";
import { processIncomingMessage } from "../services/incomingMessageService.js";
import { expireMedia } from "../rural/media.js";
let schedule,
  running = false;
export async function enqueueRuralMessage(
  payload,
  repo = new RuralRepository(),
) {
  if (!payload.messageSid || !/^(SM|MM)[a-f0-9]{32}$/i.test(payload.messageSid))
    throw new Error("MessageSid inválido.");
  await repo.result(
    repo.db
      .from("assistant_inbox")
      .upsert(
        { id: payload.messageSid, payload },
        { onConflict: "id", ignoreDuplicates: true },
      ),
  );
}
export async function dispatchReminder(
  repo,
  job,
  send = sendWhatsAppContentTemplate,
) {
  let task;
  if (job.alert_id) {
    const alert = await repo.result(
      repo.db
        .from("assistant_alerts")
        .select("*")
        .eq("id", job.alert_id)
        .eq("user_id", job.user_id)
        .maybeSingle(),
    );
    if (alert?.status === "pending") {
      const rules = await repo.result(
        repo.db
          .from("alert_rules")
          .select("config_json")
          .eq("user_id", job.user_id)
          .eq("farm_id", alert.farm_id)
          .eq("type", "low_stock")
          .eq("active", true)
          .limit(1000),
      );
      if (
        rules.some(
          (r) => r.config_json.inventory_item_id === alert.related_entity_id,
        )
      )
        task = { status: "pending", remind: true, title: alert.message };
    }
  } else
    task = await repo.result(
      repo.db
        .from("farm_tasks")
        .select("*")
        .eq("id", job.task_id)
        .maybeSingle(),
    );
  if (!task || task.status !== "pending" || !task.remind) {
    await repo.result(
      repo.db
        .from("scheduled_jobs")
        .update({ status: "cancelled" })
        .eq("id", job.id)
        .eq("lock_token", job.lock_token)
        .eq("status", "locked"),
    );
    return;
  }
  const user = await repo.result(
    repo.db.from("users").select("phone").eq("id", job.user_id).maybeSingle(),
  );
  if (!user?.phone || !process.env.REMINDER_CONTENT_SID) {
    await repo.result(
      repo.db
        .from("scheduled_jobs")
        .update({
          status: "failed",
          last_error: "Missing recipient or approved template",
        })
        .eq("id", job.id)
        .eq("lock_token", job.lock_token),
    );
    return;
  }
  // Compare-and-set before contacting Twilio: unknown outcomes are never retried automatically.
  const claimed = await repo.result(
    repo.db
      .from("scheduled_jobs")
      .update({ status: "sending", locked_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("lock_token", job.lock_token)
      .eq("status", "locked")
      .select("id"),
  );
  if (!claimed.length) return;
  try {
    const result = await send(user.phone, process.env.REMINDER_CONTENT_SID, {
      1: task.title.slice(0, 500),
    });
    await repo.result(
      repo.db
        .from("scheduled_jobs")
        .update({
          status: "completed",
          provider_sid: result.sid,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("lock_token", job.lock_token)
        .eq("status", "sending"),
    );
  } catch {
    await repo.result(
      repo.db
        .from("scheduled_jobs")
        .update({
          status: "uncertain",
          last_error: "Verify delivery in Twilio before any retry",
        })
        .eq("id", job.id)
        .eq("lock_token", job.lock_token)
        .eq("status", "sending"),
    );
  }
}
export async function runRuralWorker({
  repo = new RuralRepository(),
  processMessage = processIncomingMessage,
  send,
} = {}) {
  if (running) return;
  running = true;
  try {
    if (process.env.AGENT_TOOLS_ENABLED === "true") {
      for (let i = 0; i < 5; i++) {
        const messages = await repo.result(repo.db.rpc("claim_rural_inbox"));
        if (!messages?.length) break;
        const message = messages[0];
        try {
          await processMessage(message.payload);
          await repo.result(
            repo.db
              .from("assistant_inbox")
              .update({
                status: "completed",
                completed_at: new Date().toISOString(),
                payload: {},
              })
              .eq("id", message.id)
              .eq("lock_token", message.lock_token),
          );
        } catch {
          await repo.result(
            repo.db
              .from("assistant_inbox")
              .update({
                status: "uncertain",
                last_error: "Review actions and delivery before replay",
              })
              .eq("id", message.id)
              .eq("lock_token", message.lock_token),
          );
        }
      }
    }
    if (process.env.REMINDERS_ENABLED === "true") {
      const jobs = await repo.result(
        repo.db.rpc("claim_rural_jobs", { p_limit: 10 }),
      );
      for (const job of jobs || []) await dispatchReminder(repo, job, send);
    }
    if (process.env.FARM_MEDIA_ENABLED === "true") await expireMedia(repo);
  } finally {
    running = false;
  }
}
export function startRuralWorker() {
  if (
    process.env.AGENT_TOOLS_ENABLED !== "true" &&
    process.env.REMINDERS_ENABLED !== "true"
  )
    return;
  const tick = () =>
    runRuralWorker().catch(() =>
      console.error(JSON.stringify({ event: "rural_worker_failed" })),
    );
  schedule = cron.schedule("*/15 * * * * *", tick);
  void tick();
}
export function stopRuralWorker() {
  schedule?.stop();
}
