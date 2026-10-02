import { object, id, str, date, positive } from './validation.js';

const choice = values => ({ type: 'string', enum: values });
const count = { type: 'integer', minimum: 0, maximum: 10000000 };
const amount = { type: 'number', minimum: 0.01, maximum: 1000000000 };
const numberField = (key, label, unit, extra = {}) => ({ key, label, type: 'number', min: 0.000001, step: 'any', ...(unit ? { unit } : {}), ...extra });
const textField = (key, label, required = false) => ({ key, label, type: 'text', required });
const quantity = units => [numberField('quantity', 'Quantidade', null, { required: true }), { key: 'unit', label: 'Unidade', type: 'select', options: units, required: true }];
export const eventDefinitions = {
  planting: { label: 'Plantio', fields: [textField('description', 'Cultura e detalhes', true), ...quantity(['un', 'kg', 'ha', 'm2'])] },
  harvest: { label: 'Colheita', fields: [textField('description', 'Produto e detalhes', true), ...quantity(['kg', 'un', 'maço', 'caixa', 'm3'])] },
  production: { label: 'Produção de ovos', fields: [numberField('quantity', 'Quantidade produzida', 'un', { required: true, min: 1, step: '1' })], fixedUnit: 'un' },
  milk: { label: 'Produção de leite', fields: [numberField('quantity', 'Leite produzido', 'L', { required: true }), { key: 'period', label: 'Período', type: 'select', options: ['morning', 'afternoon', 'evening', 'day'], required: true }], fixedUnit: 'L' },
  weighing: { label: 'Pesagem', fields: [numberField('quantity', 'Peso', 'kg', { required: true })], fixedUnit: 'kg' },
  feeding: { label: 'Consumo de alimento', fields: [numberField('quantity', 'Quantidade consumida', 'kg', { required: true }), textField('description', 'Alimento e detalhes', true)], fixedUnit: 'kg' },
  training: { label: 'Treino realizado', fields: [numberField('duration_minutes', 'Duração', 'min', { required: true }), textField('operator', 'Cavaleiro / responsável'), textField('description', 'Trabalho realizado', true)] },
  competition: { label: 'Passada em prova', fields: [numberField('time_seconds', 'Tempo medido', 's', { required: true }), numberField('penalty_seconds', 'Penalidade informada', 's', { min: 0 }), textField('operator', 'Cavaleiro'), textField('description', 'Prova e passada', true)] },
  care: { label: 'Cuidado realizado', fields: [textField('description', 'Cuidado e orientação recebida', true), textField('operator', 'Profissional / responsável')] },
  reproduction: { label: 'Evento reprodutivo', fields: [textField('description', 'Evento observado ou confirmado', true), textField('operator', 'Profissional / responsável')] },
  inspection: { label: 'Inspeção / observação', fields: [textField('description', 'O que foi observado', true), textField('operator', 'Responsável')] },
  movement: { label: 'Mudança de local', fields: [textField('destination', 'Novo local', true), textField('description', 'Motivo / observações', true)] },
  stock_entry: { label: 'Entrada no grupo', fields: [numberField('quantity', 'Quantidade de entrada', 'un', { required: true, min: 1, step: '1' }), textField('description', 'Origem / motivo', true)], fixedUnit: 'un' },
  stock_exit: { label: 'Saída do grupo', fields: [numberField('quantity', 'Quantidade de saída', 'un', { required: true, min: 1, step: '1' }), textField('description', 'Destino / motivo', true)], fixedUnit: 'un' },
  mortality: { label: 'Baixas no grupo', fields: [numberField('quantity', 'Quantidade de baixas', 'un', { required: true, min: 1, step: '1' }), textField('description', 'Observações das baixas', true)], fixedUnit: 'un' },
};
const common = ['inspection', 'care', 'movement'];
const livestock = ['weighing', 'feeding', 'reproduction', 'stock_entry', 'stock_exit', 'mortality', ...common];
const crop = ['planting', 'harvest', ...common];
export const agroModules = [
  { key: 'horticulture', label: 'Horta e hortaliças', unitLabel: 'Canteiro / área', types: ['crop_area'], species: [], events: crop, purpose: 'Plantios, colheitas parciais e histórico por canteiro.' },
  { key: 'crops', label: 'Lavouras e grãos', unitLabel: 'Área de produção', types: ['crop_area'], species: [], events: crop, purpose: 'Produção, manejo e custos por área.' },
  { key: 'orchards', label: 'Fruticultura', unitLabel: 'Pomar / área', types: ['orchard'], species: [], events: crop, purpose: 'Acompanhar áreas permanentes, colheitas e cuidados.' },
  { key: 'equines', label: 'Equinos e centros de treinamento', unitLabel: 'Cavalo', types: ['animal'], species: ['equine'], events: ['training', 'competition', 'weighing', 'feeding', 'reproduction', ...common], purpose: 'Histórico individual, treinos, passadas e despesas por cavalo.' },
  { key: 'beef_cattle', label: 'Bovinos de corte', unitLabel: 'Animal / lote', types: ['animal', 'herd'], species: ['bovine'], events: livestock, purpose: 'Pesagens, lotes, movimentações e manejo.' },
  { key: 'dairy_cattle', label: 'Bovinos de leite', unitLabel: 'Animal / lote', types: ['animal', 'herd'], species: ['bovine'], events: ['milk', ...livestock], purpose: 'Produção por período, histórico e custos vinculados.' },
  { key: 'poultry', label: 'Aves e produção de ovos', unitLabel: 'Lote de aves', types: ['flock'], species: ['poultry'], events: ['production', 'harvest', 'feeding', 'stock_entry', 'stock_exit', 'mortality', ...common], purpose: 'Plantel, ovos produzidos, baixas e alimentação.' },
  { key: 'pigs', label: 'Suinocultura', unitLabel: 'Animal / lote', types: ['animal', 'herd'], species: ['pig'], events: livestock, purpose: 'Lotes, entradas, baixas, alimentação e pesagens.' },
  { key: 'sheep_goats', label: 'Ovinos e caprinos', unitLabel: 'Animal / lote', types: ['animal', 'herd'], species: ['sheep', 'goat'], events: ['milk', ...livestock], purpose: 'Identificação, lotes, produção e histórico de manejo.' },
  { key: 'aquaculture', label: 'Aquicultura', unitLabel: 'Viveiro / tanque', types: ['pond'], species: ['fish'], events: ['harvest', 'feeding', 'stock_entry', 'stock_exit', 'mortality', ...common], purpose: 'Povoamento, baixas, consumo e despesca por viveiro.' },
  { key: 'beekeeping', label: 'Apicultura', unitLabel: 'Colmeia / apiário', types: ['hive', 'apiary'], species: [], events: ['harvest', 'feeding', 'stock_entry', 'stock_exit', ...common], purpose: 'Inspeções, colheita de mel e movimentação de colmeias.' },
  { key: 'forestry', label: 'Silvicultura', unitLabel: 'Área florestal', types: ['forestry_block'], species: [], events: crop, purpose: 'Implantação, manutenção e colheitas com unidade explícita.' },
  { key: 'other', label: 'Outra atividade rural', unitLabel: 'Unidade de trabalho', types: ['facility'], species: [], events: common, purpose: 'Agenda, observações, despesas e vendas. Sem indicadores específicos.' },
];
export const groupTypes = ['herd', 'flock', 'pond', 'apiary'];
for (const module of agroModules) {
  module.harvest_units = ['beekeeping', 'aquaculture'].includes(module.key) ? ['kg'] : module.key === 'forestry' ? ['m3', 'kg', 'un'] : ['kg', 'un', 'maço', 'caixa'];
}
export const agroTables = ['farm_activities', 'production_units', 'production_events', 'farm_sales', 'sale_payments'];
export const agroSchemas = {
  farm_activities: object({ name: str, module_key: choice(agroModules.map(m => m.key)), status: choice(['active', 'inactive']), notes: str }, ['name', 'module_key']),
  production_units: object({ activity_id: id, name: str, unit_type: choice([...new Set(agroModules.flatMap(m => m.types))]), species: choice([...new Set(agroModules.flatMap(m => m.species))]), identifier: str, sex: choice(['female', 'male', 'unknown']), birth_date: date, owner_name: str, location: str, opening_count: count, status: choice(['active', 'inactive']), notes: str }, ['activity_id', 'name', 'unit_type']),
  production_events: object({ activity_id: id, production_unit_id: id, inventory_item_id: id, event_type: choice(Object.keys(eventDefinitions)), event_date: date, description: str, quantity: positive, unit: choice(['kg', 'L', 'un', 'ha', 'm2', 'maço', 'caixa', 'm3']), duration_minutes: positive, time_seconds: positive, penalty_seconds: { type: 'number', minimum: 0, maximum: 1e9 }, operator: str, period: choice(['morning', 'afternoon', 'evening', 'day']), destination: str, status: choice(['active', 'voided']) }, ['activity_id', 'production_unit_id', 'event_type', 'event_date', 'description']),
  farm_sales: object({ activity_id: id, production_unit_id: id, description: str, customer: str, amount, quantity: positive, unit: str, sale_date: date, due_date: date, status: choice(['active', 'cancelled']) }, ['activity_id', 'description', 'customer', 'amount', 'sale_date', 'due_date']),
  sale_payments: object({ sale_id: id, amount, payment_date: date, method: choice(['pix', 'cash', 'transfer', 'card', 'other']), status: choice(['active', 'voided']), notes: str }, ['sale_id', 'amount', 'payment_date', 'method']),
};
for (const [table, keys] of Object.entries({ production_units: ['identifier', 'sex', 'birth_date', 'owner_name', 'location', 'notes'], production_events: ['operator'], farm_sales: ['quantity', 'unit'], sale_payments: ['notes'], farm_activities: ['notes'] })) {
  for (const key of keys) agroSchemas[table].properties[key] = { ...agroSchemas[table].properties[key], nullable: true };
}

export function agroCatalog() {
  return { modules: agroModules, events: eventDefinitions, group_types: groupTypes, version: 1 };
}
