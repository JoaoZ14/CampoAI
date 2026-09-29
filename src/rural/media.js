import { fetchMediaAsInlineData } from "../services/aiService.js";
import { hasFeature } from "./features.js";
import { fail } from "./validation.js";
function trustedMedia(url) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.hostname !== "api.twilio.com" ||
    !u.pathname.includes("/Messages/")
  )
    fail("Origem de mídia inválida.");
  return u.toString();
}
export async function rememberIncomingMedia(
  service,
  context,
  { imageUrl, audioUrl },
) {
  if (
    !hasFeature(service.user, "media") ||
    (!imageUrl && !audioUrl) ||
    !context.active_farm
  )
    return;
  await service.repo.setContext(service.user.id, {
    farm_id: context.active_farm.id,
    field_id: context.active_field?.id || null,
    field_cycle_id: context.active_cycle?.id || null,
    pending_media: {
      url: trustedMedia(imageUrl || audioUrl),
      type: imageUrl ? "image" : "audio",
      message_id: service.source,
      farm_id: context.active_farm.id,
      expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
    },
  });
}
export async function attachPendingMedia(service, occurrence) {
  if (!hasFeature(service.user, "media")) return { attached: false };
  const ctx = await service.repo.context(service.user.id),
    media = ctx?.pending_media;
  if (
    !media ||
    media.farm_id !== occurrence.farm_id ||
    Date.parse(media.expires_at) <= Date.now()
  )
    return { attached: false };
  const inline = await fetchMediaAsInlineData(
    trustedMedia(media.url),
    media.type,
  );
  const path = `${service.user.id}/${occurrence.id}/${media.message_id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const bucket = service.repo.db.storage.from("farm-media");
  const { error } = await bucket.upload(
    path,
    Buffer.from(inline.data, "base64"),
    { contentType: inline.mimeType, upsert: true },
  );
  if (error)
    fail("A ocorrência foi registrada, mas não consegui guardar a mídia.");
  await service.repo.result(
    service.repo.db.from("message_attachments").upsert(
      {
        message_id: media.message_id,
        user_id: service.user.id,
        farm_id: occurrence.farm_id,
        field_id: occurrence.field_id,
        occurrence_id: occurrence.id,
        type: media.type,
        storage_path: path,
        mime_type: inline.mimeType,
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      { onConflict: "storage_path" },
    ),
  );
  await service.repo.result(
    service.repo.db
      .from("assistant_context")
      .update({ pending_media: null })
      .eq("user_id", service.user.id),
  );
  return { attached: true, retention_days: 30 };
}
export async function loadOccurrenceMedia(service, farmId, occurrenceId) {
  await service.one("field_occurrences", farmId, occurrenceId);
  service.feature("media");
  const rows = await service.repo.result(
    service.repo.db
      .from("message_attachments")
      .select("*")
      .eq("user_id", service.user.id)
      .eq("occurrence_id", occurrenceId)
      .order("created_at", { ascending: false })
      .limit(3),
  );
  const available = rows.filter((r) => Date.parse(r.expires_at) > Date.now());
  service.toolMedia ||= [];
  if (service.toolMedia.length + available.length > 6)
    fail("Compare no máximo duas ocorrências por vez.");
  for (const row of available) {
    const { data, error } = await service.repo.db.storage
      .from("farm-media")
      .download(row.storage_path);
    if (error) fail("Não consegui recuperar a mídia para comparação.");
    service.toolMedia.push({
      inlineData: {
        mimeType: row.mime_type,
        data: Buffer.from(await data.arrayBuffer()).toString("base64"),
      },
    });
  }
  return {
    attachments: available.map(({ id, type, created_at }) => ({
      id,
      type,
      created_at,
    })),
    note: "Compare apenas evidências visuais disponíveis. Não concluir melhora/piora sem base.",
  };
}
export async function expireMedia(repo) {
  const rows = await repo.result(
    repo.db
      .from("message_attachments")
      .select("id,storage_path")
      .lt("expires_at", new Date().toISOString())
      .limit(100),
  );
  for (const row of rows) {
    const { error } = await repo.db.storage
      .from("farm-media")
      .remove([row.storage_path]);
    if (!error)
      await repo.result(
        repo.db.from("message_attachments").delete().eq("id", row.id),
      );
  }
}
