import { fail, normalizeName } from "./validation.js";
// Accepts the existing landing's cotacoes.json contract. Provider is replaceable.
export class MarketPriceProvider {
  constructor(fetcher = fetch) {
    this.fetch = fetcher;
    this.cache = null;
  }
  async prices(commodity, uf) {
    const endpoint = process.env.MARKET_PRICES_URL;
    if (!endpoint) fail("Fonte de cotações não configurada.");
    const url = new URL(endpoint);
    if (url.protocol !== "https:") fail("Fonte de cotações inválida.");
    if (!this.cache || this.cache.expires < Date.now()) {
      const res = await this.fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) fail("Não consegui consultar as cotações agora.");
      const data = await res.json();
      if (!Array.isArray(data.items))
        fail("Fonte retornou cotações inválidas.");
      this.cache = { data, expires: Date.now() + 900000 };
    }
    const today = new Date().toISOString().slice(0, 10);
    const items = this.cache.data.items.filter(
      (p) =>
        normalizeName(p.commodity) === normalizeName(commodity) &&
        (!uf || p.uf === uf || p.uf === "BR"),
    );
    return {
      items: items
        .filter(
          (p) =>
            Number.isFinite(p.price) &&
            p.source &&
            p.unit &&
            /^\d{4}-\d\d-\d\d$/.test(p.date) &&
            Number.isFinite(Date.parse(p.date)) &&
            p.date <= today,
        )
        .slice(0, 50)
        .map((p) => ({
          commodity: String(p.commodity).slice(0, 80),
          uf: String(p.uf).slice(0, 2),
          price: p.price,
          unit: String(p.unit).slice(0, 40),
          source: String(p.source).slice(0, 200),
          date: p.date,
          stale: Date.now() - Date.parse(p.date) > 3 * 86400000,
        })),
      retrieved_at: this.cache.data.fetchedAt || null,
      notice:
        "Valores são referências da fonte/região/data indicadas. stale=true significa cotação antiga, nunca preço atual.",
    };
  }
}
export const marketProvider = new MarketPriceProvider();
