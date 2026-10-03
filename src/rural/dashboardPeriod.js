import { date, object, validate, fail } from './validation.js';
import { addDays } from './time.js';

export function dashboardPeriod(today, filters = {}) {
  validate(object({ period: { type: 'string', enum: ['today', 'month', 'previous_month', 'custom'] }, from: date, to: date }), filters);
  const kind = filters.period || 'month';
  if (kind === 'custom') {
    if (!filters.from || !filters.to) fail('Informe o início e o fim do período.');
    const days = (Date.parse(filters.to) - Date.parse(filters.from)) / 86400000;
    if (days <= 0 || days > 366) fail('Escolha um período de até 366 dias, com início anterior ao fim.');
    return { from: filters.from, to_exclusive: filters.to };
  }
  if (filters.from || filters.to) fail('Datas personalizadas exigem o período custom.');
  if (kind === 'today') return { from: today, to_exclusive: addDays(today, 1) };
  const start = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  if (kind === 'previous_month') start.setUTCMonth(start.getUTCMonth() - 1);
  const from = start.toISOString().slice(0, 10);
  start.setUTCMonth(start.getUTCMonth() + 1);
  return { from, to_exclusive: start.toISOString().slice(0, 10) };
}
