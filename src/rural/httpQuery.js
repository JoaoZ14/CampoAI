import { AppError } from '../utils/errors.js';

// HTTP query values are strings; domain filters remain strictly typed.
export function ruralQuery(query) {
  const filters = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== 'string') throw new AppError('Filtro inválido.', 400);
    if (key === 'offset') {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 100000)
        throw new AppError('Página inválida.', 400);
      filters.offset = Number(value);
    } else filters[key] = value;
  }
  if (filters.from && filters.to && filters.from > filters.to)
    throw new AppError('A data inicial deve vir antes da data final.', 400);
  return filters;
}
