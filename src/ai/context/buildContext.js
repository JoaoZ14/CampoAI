import { hasFeature } from "../../rural/features.js";
import { localCalendar } from '../../rural/time.js';
export async function buildContext(service, now = new Date()) {
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
    now: now.toISOString(),
    ...localCalendar(now, farm?.timezone || 'America/Sao_Paulo'),
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
  if (hasFeature(service.user, 'modules')) {
    const activities = await service.repo.list('farm_activities', farm.id, { status: 'active' }, 30);
    context.agro_activities = activities.map(({ id, name, module_key }) => ({ id, name, module_key }));
    context.agro_activities_partial = activities.length === 30;
  }
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
