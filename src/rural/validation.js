import { AppError } from "../utils/errors.js";
export const fail = (message) => {
  throw new AppError(message, 400);
};
export const uuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const normalizeName = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
export const str = { type: "string", maxLength: 500 };
export const id = { type: "string", format: "uuid" };
export const positive = { type: "number", minimum: 0.000001, maximum: 1e9 };
export const date = { type: "string", format: "date" };
export const instant = { type: "string", format: "date-time" };
export const object = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export function validate(schema, value, path = "dados") {
  if (value === null && schema.nullable) return value;
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      fail(`${path}: objeto inválido.`);
    for (const key of Object.keys(value))
      if (!Object.hasOwn(schema.properties, key))
        fail(`${path}: campo não permitido (${key}).`);
    for (const key of schema.required || [])
      if (value[key] === undefined) fail(`Informe ${key}.`);
    for (const [key, val] of Object.entries(value))
      validate(schema.properties[key], val, key);
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || value.length > (schema.maxItems || 20))
      fail(`${path}: lista inválida.`);
    value.forEach((v) => validate(schema.items, v, path));
  } else if (schema.type === "string") {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > (schema.maxLength || 500)
    )
      fail(`${path}: texto inválido.`);
    if (schema.format === "uuid" && !uuid(value))
      fail(`${path}: identificador inválido.`);
    if (
      schema.format === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      fail(`${path}: data inválida.`);
    if (
      schema.format === "date-time" &&
      (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
        !Number.isFinite(Date.parse(value)))
    )
      fail(`${path}: informe data/hora com fuso.`);
  } else if (schema.type === "number" || schema.type === "integer") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (schema.type === "integer" && !Number.isInteger(value)) ||
      value < (schema.minimum ?? -Infinity) ||
      value > (schema.maximum ?? Infinity)
    )
      fail(`${path}: número fora do intervalo.`);
  } else if (schema.type === "boolean" && typeof value !== "boolean")
    fail(`${path}: booleano inválido.`);
  if (schema.enum && !schema.enum.includes(value))
    fail(`${path}: opção inválida.`);
  return value;
}
