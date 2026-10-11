// Web paths start at the app subdomain root; native paths use the local hash root.
export const sections = { today: '', activity: 'registros', agenda: 'tarefas', farm: 'propriedade' } as const;
export const recordSections: Record<string, string> = { farm_expenses: 'gastos', farm_tasks: 'tarefas', farm_operations: 'trabalhos' };
const readableEntities = new Set(['fields', 'crop_seasons', 'farm_occurrences', 'inventory_items', 'farm_activities', 'production_units', 'farm_events', 'farm_sales', 'sale_payments']);
export function farmPath(farmId: string, section = '') { return `/${encodeURIComponent(farmId)}${section ? '/' + section : ''}`; }
export function recordPath(farmId: string, entity: string, id: string) {
  const section = recordSections[entity] || (readableEntities.has(entity) ? `registros/${entity}` : null);
  return section ? `${farmPath(farmId, section)}/${encodeURIComponent(id)}` : null;
}
export function parseRoute(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length) return { root: true };
  if (parts.length === 1 && parts[0] === 'cadastro') return { signup: true };
  let farmId: string, recordId: string | undefined;
  try { farmId = decodeURIComponent(parts[0]); recordId = parts.at(-1) ? decodeURIComponent(parts.at(-1)!) : undefined; } catch { return { invalid: true }; }
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(farmId)) return { invalid: true };
  const section = parts[1] || '';
  const entity = Object.keys(recordSections).find(key => recordSections[key] === section);
  const creating = parts.length === 3 && ((section === 'tarefas' && parts[2] === 'nova') || (['gastos', 'trabalhos'].includes(section) && parts[2] === 'novo'));
  if (creating) return { farmId, section, creating: true };
  if (entity && (parts.length === 3 || parts.length === 4 && parts[3] === 'editar')) {
    try { recordId = decodeURIComponent(parts[2]); } catch { return { farmId, invalid: true }; }
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(recordId)) return { farmId, invalid: true };
    return { farmId, section, entity, recordId, editing: parts[3] === 'editar' };
  }
  if (section === 'registros' && (parts.length === 4 || parts.length === 5 && parts[2] === 'fields' && parts[4] === 'editar') && readableEntities.has(parts[2])) {
    try { recordId = decodeURIComponent(parts[3]); } catch { return { farmId, invalid: true }; }
    if (/^[a-zA-Z0-9_-]{1,160}$/.test(recordId)) return { farmId, section, entity: parts[2], recordId, editing: parts[4] === 'editar' };
  }
  if (parts.length <= 2 && ['', 'registros', 'gastos', 'tarefas', 'trabalhos', 'propriedade', 'producao', 'vendas', 'agenda-da-propriedade'].includes(section)) return { farmId, section };
  return { farmId, invalid: true };
}
export function scopedReturn(value: unknown, farmId: string, fallback: string) {
  if (typeof value !== 'string' || value.startsWith('//')) return fallback;
  const parsed = parseRoute(value.split('?')[0]);
  return !parsed.invalid && parsed.farmId === farmId && !parsed.recordId && !parsed.creating ? value : fallback;
}
export function rangeSearch(range?: { from: string; to: string }) { return range ? '?' + new URLSearchParams({ period: 'range', from: range.from, to: range.to }) : ''; }
export function queryRange(query: URLSearchParams) {
  const from = query.get('from') || '', to = query.get('to') || '';
  const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
  return valid(from) && valid(to) && from < to && Date.parse(to) - Date.parse(from) <= 366 * 86400000 ? { from, to } : undefined;
}
