import { hasFeature } from "../../rural/features.js";
export async function buildContext(service) {
  const farms = await service.farms();
  const saved = await service.repo.context(service.user.id);
  const active =
    saved &&
    Date.parse(saved.expires_at) > Date.now() &&
    farms.some((f) => f.id === saved.farm_id)
      ? saved
      : null;
  const farm =
    farms.length === 1 ? farms[0] : farms.find((f) => f.id === active?.farm_id);
  const context = {
    now: new Date().toISOString(),
    farms: farms.map(({ id, name, city, state }) => ({
      id,
      name,
      city,
      state,
    })),
    active_farm: farm || null,
    active_field: null,
    active_cycle: null,
  };
  context.pending_confirmation =
    saved?.pending_action &&
    Date.parse(saved.pending_action.expires_at) > Date.now()
      ? saved.pending_action
      : null;
  if (!farm) return context;
  context.local_date = new Intl.DateTimeFormat("en-CA", {
    timeZone: farm.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format();
  if (active?.field_id)
    context.active_field = await service.repo.one(
      "fields",
      farm.id,
      active.field_id,
    );
  if (active?.field_cycle_id)
    context.active_cycle = await service.repo.one(
      "field_cycles",
      farm.id,
      active.field_cycle_id,
    );
  context.current_seasons = await service.repo.list(
    "crop_seasons",
    farm.id,
    { status: "active" },
    5,
  );
  if (hasFeature(service.user, "memory")) {
    const memories = await service.repo.list(
      "assistant_memories",
      farm.id,
      { user_id: service.user.id, confirmed: true },
      10,
    );
    context.memories = memories.filter(
      (m) => !m.expires_at || Date.parse(m.expires_at) > Date.now(),
    );
  }
  return context;
}
