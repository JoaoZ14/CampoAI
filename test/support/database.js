import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export async function database() {
  const pg = new PGlite();
  await pg.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  await pg.exec(
    await readFile(
      new URL("../../supabase/schema.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const file of [
    "migration_021_rural_domain.sql",
    "migration_022_rural_transactions.sql",
    "migration_023_rural_followups.sql",
    "migration_024_agro_modules.sql",
  ])
    await pg.exec(
      await readFile(
        new URL("../../supabase/" + file, import.meta.url),
        "utf8",
      ),
    );
  return { pg, db: new Adapter(pg) };
}
const quote = (s) => `"${s.replaceAll('"', '""')}"`;
class Query {
  constructor(pg, table) {
    this.pg = pg;
    this.table = table;
    this.filters = [];
    this.orders = [];
    this.columns = "*";
    this.method = "select";
  }
  select(cols = "*") {
    this.columns = cols;
    return this;
  }
  eq(k, v) {
    this.filters.push([k, "=", v]);
    return this;
  }
  lt(k, v) {
    this.filters.push([k, "<", v]);
    return this;
  }
  gte(k, v) {
    this.filters.push([k, ">=", v]);
    return this;
  }
  order(k, { ascending = true } = {}) {
    this.orders.push(`${quote(k)} ${ascending ? "asc" : "desc"}`);
    return this;
  }
  limit(n) {
    this.take = n;
    return this;
  }
  range(a, b) {
    this.skip = a;
    this.take = b - a + 1;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  insert(v) {
    this.method = "insert";
    this.value = v;
    return this;
  }
  update(v) {
    this.method = "update";
    this.value = v;
    return this;
  }
  upsert(v, opts = {}) {
    this.method = "insert";
    this.value = v;
    this.upsertOpts = opts;
    return this;
  }
  delete() {
    this.method = "delete";
    return this;
  }
  async run() {
    const params = [];
    const param = (v) => {
      params.push(typeof v === "object" && v !== null ? JSON.stringify(v) : v);
      return "$" + params.length;
    };
    let sql;
    if (this.method === "select")
      sql = `select ${this.columns === "*" ? "*" : this.columns.split(",").map(quote).join(",")} from ${quote(this.table)}`;
    else if (this.method === "insert") {
      const keys = Object.keys(this.value);
      sql = `insert into ${quote(this.table)} (${keys.map(quote)}) values (${keys.map((k) => param(this.value[k]))})`;
      if (this.upsertOpts) {
        const key =
          this.upsertOpts.onConflict ||
          { assistant_context: "user_id", weather_cache: "key" }[this.table] ||
          "id";
        sql +=
          ` on conflict (${quote(key)}) ` +
          (this.upsertOpts.ignoreDuplicates
            ? "do nothing"
            : `do update set ${keys.map((k) => `${quote(k)}=excluded.${quote(k)}`).join(",")}`);
      }
    } else if (this.method === "update")
      sql = `update ${quote(this.table)} set ${Object.entries(this.value)
        .map(([k, v]) => `${quote(k)}=${param(v)}`)
        .join(",")}`;
    else sql = `delete from ${quote(this.table)}`;
    if (this.filters.length)
      sql +=
        " where " +
        this.filters
          .map(([k, op, v]) => `${quote(k)} ${op} ${param(v)}`)
          .join(" and ");
    if (this.method === "select") {
      if (this.orders.length) sql += " order by " + this.orders.join(",");
      if (this.take != null) sql += " limit " + this.take;
      if (this.skip) sql += " offset " + this.skip;
    } else sql += " returning *";
    try {
      const result = await this.pg.query(sql, params);
      const rows = result.rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [
            k,
            v instanceof Date
              ? /_date$/.test(k)
                ? v.toISOString().slice(0, 10)
                : v.toISOString()
              : v,
          ]),
        ),
      );
      return { data: this.single ? rows[0] || null : rows, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }
  then(resolve, reject) {
    return this.run().then(resolve, reject);
  }
}
class Adapter {
  constructor(pg) {
    this.pg = pg;
  }
  from(table) {
    return new Query(this.pg, table);
  }
  async rpc(name, args = {}) {
    const keys = Object.keys(args);
    const values = keys.map((k) =>
      typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k],
    );
    try {
      const { rows } = await this.pg.query(
        `select * from ${quote(name)}(${keys.map((k, i) => `${quote(k)} => $${i + 1}`).join(",")})`,
        values,
      );
      return {
        data: name === "apply_rural_action" ? rows[0][name] : rows,
        error: null,
      };
    } catch (error) {
      return { data: null, error };
    }
  }
}
