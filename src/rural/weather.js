import { fail, normalizeName } from "./validation.js";
const STATES = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapa",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceara",
  DF: "Distrito Federal",
  ES: "Espirito Santo",
  GO: "Goias",
  MA: "Maranhao",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Para",
  PB: "Paraiba",
  PR: "Parana",
  PE: "Pernambuco",
  PI: "Piaui",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondonia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "Sao Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};
// Provider boundary: resolveLocation(farm), forecast(location, days).
export class OpenMeteoProvider {
  constructor(fetcher = fetch) {
    this.fetch = fetcher;
  }
  async json(url) {
    const res = await this.fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) fail("Clima indisponível no momento.");
    return res.json();
  }
  async resolveLocation(farm) {
    if (farm.latitude != null && farm.longitude != null)
      return {
        latitude: Number(farm.latitude),
        longitude: Number(farm.longitude),
        timezone: farm.timezone,
      };
    if (!farm.city) fail("Em qual cidade e UF fica a propriedade?");
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.search = new URLSearchParams({
      name: farm.city,
      count: "100",
      language: "pt",
      countryCode: farm.country || "BR",
    });
    const data = await this.json(url);
    const state = normalizeName(
      STATES[farm.state?.toUpperCase()] || farm.state || "",
    );
    const places = (data.results || []).filter(
      (p) =>
        p.country_code === (farm.country || "BR") &&
        normalizeName(p.name) === normalizeName(farm.city) &&
        (!state || normalizeName(p.admin1) === state),
    );
    if (places.length !== 1)
      fail(
        "Não consegui identificar a localização com segurança. Confirme cidade/UF ou coordenadas.",
      );
    return {
      latitude: places[0].latitude,
      longitude: places[0].longitude,
      timezone: farm.timezone || places[0].timezone,
      precision: "city",
    };
  }
  async forecast(location, days) {
    const key = process.env.OPEN_METEO_API_KEY;
    if (process.env.NODE_ENV === "production" && !key)
      fail("Provider de clima comercial ainda não configurado.");
    const url = new URL(
      key
        ? "https://customer-api.open-meteo.com/v1/forecast"
        : "https://api.open-meteo.com/v1/forecast",
    );
    url.search = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      timezone: location.timezone || "America/Sao_Paulo",
      forecast_days: String(days),
      current:
        "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
      daily:
        "precipitation_probability_max,precipitation_sum,temperature_2m_max,temperature_2m_min",
      hourly:
        "precipitation_probability,precipitation,wind_speed_10m,relative_humidity_2m",
      ...(key ? { apikey: key } : {}),
    });
    const data = await this.json(url);
    if (!data.daily?.time || !data.current)
      fail("O provider retornou dados incompletos.");
    return {
      source: "Open-Meteo",
      source_url: "https://open-meteo.com/",
      retrieved_at: new Date().toISOString(),
      location,
      current: data.current,
      current_units: data.current_units,
      daily: data.daily,
      daily_units: data.daily_units,
      hourly: data.hourly,
      hourly_units: data.hourly_units,
      timezone: data.timezone,
    };
  }
}
export class WeatherService {
  constructor(repo, provider = new OpenMeteoProvider()) {
    this.repo = repo;
    this.provider = provider;
  }
  async forecast(farm, days = 3) {
    if (!Number.isInteger(days) || days < 1 || days > 7)
      fail("Previsão disponível entre 1 e 7 dias.");
    const key = JSON.stringify([
      farm.latitude,
      farm.longitude,
      farm.city,
      farm.state,
      farm.timezone,
      days,
    ]);
    const cached = await this.repo.result(
      this.repo.db
        .from("weather_cache")
        .select("*")
        .eq("key", key)
        .maybeSingle(),
    );
    if (cached && Date.parse(cached.expires_at) > Date.now())
      return { ...cached.value_json, cached: true };
    const location = await this.provider.resolveLocation(farm);
    const result = await this.provider.forecast(location, days);
    await this.repo.result(
      this.repo.db.from("weather_cache").upsert({
        key,
        value_json: result,
        expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
      }),
    );
    return result;
  }
}
