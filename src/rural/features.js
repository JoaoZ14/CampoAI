const flags = {
  agent: "AGENT_TOOLS_ENABLED",
  memory: "FARM_MEMORY_ENABLED",
  weather: "WEATHER_ENABLED",
  reminders: "REMINDERS_ENABLED",
  financial: "EXPENSES_ENABLED",
  inventory: "INVENTORY_ENABLED",
  reports: "FARM_REPORTS_ENABLED",
  occurrences: "OCCURRENCES_ENABLED",
  media: "FARM_MEDIA_ENABLED",
  modules: "AGRO_MODULES_ENABLED",
};
export function hasFeature(user, feature) {
  const flag = flags[feature];
  return !!user?.id && !!flag && process.env[flag] === "true";
}
export function farmEntitlements(user) {
  return {
    max_farms: 100,
    max_fields: 1000,
    ...Object.fromEntries(
      Object.keys(flags).map((k) => [k, hasFeature(user, k)]),
    ),
  };
}
