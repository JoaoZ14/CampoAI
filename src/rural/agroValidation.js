import { agroModules, eventDefinitions, groupTypes } from './agroCatalog.js';
import { fail } from './validation.js';

const localDay = farm => new Intl.DateTimeFormat('en-CA', { timeZone: farm.timezone || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format();
const monetary = value => {
  if (Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) fail('Informe o valor em reais com até duas casas decimais.');
};
export async function validateAgro(service, table, farm, merged, old, creating) {
  const activity = merged.activity_id ? await service.repo.one('farm_activities', farm.id, merged.activity_id) : null;
  const unit = merged.production_unit_id ? await service.repo.one('production_units', farm.id, merged.production_unit_id) : null;
  const module = activity ? agroModules.find(m => m.key === activity.module_key) : null;
  if (activity && creating && activity.status !== 'active') fail('Reative a atividade antes de registrar novos dados.');
  if (unit && unit.activity_id !== merged.activity_id) fail('A unidade não pertence à atividade escolhida.');
  if (unit && creating && unit.status !== 'active') fail('Reative a unidade antes de registrar novos dados.');
  if (old && old.activity_id && merged.activity_id !== old.activity_id) fail('O vínculo com a atividade é fixo para preservar o histórico.');
  if (old && old.production_unit_id && merged.production_unit_id !== old.production_unit_id) fail('O vínculo com a unidade é fixo para preservar o histórico.');
  if (table === 'farm_activities' && old && merged.module_key !== old.module_key) fail('O tipo da atividade é fixo. Cadastre outra atividade.');
  if (table === 'production_units') {
    if (!creating && merged.location !== old.location && (await service.repo.list('production_events', farm.id, { production_unit_id: old.id, event_type: 'movement' }, 1)).length) fail('O local inicial já tem histórico. Registre uma mudança de local para atualizar a localização.');
    if (!module || !module.types.includes(merged.unit_type)) fail('Tipo de unidade incompatível com a atividade.');
    if (module.species.length && !module.species.includes(merged.species)) fail('Informe uma espécie compatível com a atividade.');
    if (!module.species.length && merged.species) fail('Esta unidade não utiliza espécie animal.');
    if (!groupTypes.includes(merged.unit_type) && Number(merged.opening_count || 0) !== 0) fail('Quantidade inicial é usada somente para grupos, viveiros e apiários.');
    if (merged.birth_date && merged.birth_date > localDay(farm)) fail('Nascimento não pode ser uma data futura.');
    if (old && (merged.unit_type !== old.unit_type || merged.species !== old.species)) fail('Tipo e espécie são fixos para preservar o histórico.');
    if (old && Number(merged.opening_count) !== Number(old.opening_count)) fail('Corrija a quantidade com uma entrada ou saída do grupo.');
  }
  if (table === 'production_events') {
    if (merged.inventory_item_id) {
      service.feature('inventory');
      if (merged.event_type !== 'feeding') fail('Vínculo com estoque é usado somente no consumo de alimento.');
      const item = await service.one('inventory_items', farm.id, merged.inventory_item_id);
      if (item.unit !== 'kg') fail('Selecione um item de estoque em kg. Não convertemos sacos ou outras unidades automaticamente.');
    }
    if (old && merged.inventory_item_id !== old.inventory_item_id) fail('O vínculo com estoque é fixo. Anule o registro incorreto e registre novamente.');
    if (!module || !unit || !module.events.includes(merged.event_type)) fail('Registro incompatível com a atividade.');
    const definition = eventDefinitions[merged.event_type];
    if (merged.event_date > localDay(farm)) fail('Registre o que já aconteceu. Para uma ação futura, crie uma tarefa na agenda.');
    if (creating && merged.status === 'voided') fail('Um novo registro precisa estar ativo.');
    for (const field of definition.fields) {
      if (field.required && (merged[field.key] == null || merged[field.key] === '')) fail(`Informe ${field.label.toLowerCase()}.`);
      if (field.options && merged[field.key] && !field.options.includes(merged[field.key])) fail(`Unidade ou opção incompatível: ${field.label}.`);
    }
    if (definition.fixedUnit && merged.unit !== definition.fixedUnit) fail(`A unidade deste registro é ${definition.fixedUnit}.`);
    const allowed = new Set(['activity_id', 'production_unit_id', 'event_type', 'event_date', 'description', 'status', ...definition.fields.map(f => f.key), ...(definition.fixedUnit ? ['unit'] : [])]);
    for (const key of Object.keys(merged)) {
      if (['quantity', 'unit', 'duration_minutes', 'time_seconds', 'penalty_seconds', 'period', 'destination', 'operator'].includes(key) && merged[key] != null && !allowed.has(key)) fail(`O campo ${key} não pertence a este tipo de registro.`);
    }
    if (old && merged.event_type !== old.event_type) fail('O tipo do registro é fixo; anule o incorreto e registre novamente.');
    if (['stock_entry', 'stock_exit', 'mortality'].includes(merged.event_type) && !groupTypes.includes(unit.unit_type)) fail('Entrada e saída de quantidade exigem um grupo, viveiro ou apiário.');
    if (['stock_entry', 'stock_exit', 'mortality', 'production'].includes(merged.event_type) && !Number.isInteger(merged.quantity)) fail('Informe uma quantidade inteira.');
    if (merged.event_type === 'harvest') {
      if (!module.harvest_units.includes(merged.unit)) fail('Unidade de colheita incompatível com a atividade.');
    }
  }
  if (['farm_sales', 'sale_payments'].includes(table)) {
    service.feature('financial');
    monetary(merged.amount);
    if (creating && ['cancelled', 'voided'].includes(merged.status)) fail('Um novo registro financeiro precisa estar ativo.');
    if (table === 'farm_sales') {
      if (merged.due_date < merged.sale_date) fail('O vencimento não pode ser anterior à venda.');
      if (!!merged.quantity !== !!merged.unit) fail('Informe quantidade e unidade juntas.');
    } else {
      if (old && merged.sale_id !== old.sale_id) fail('O recebimento pertence à venda original.');
      if (merged.payment_date > localDay(farm)) fail('Recebimento exige a data em que o dinheiro entrou.');
    }
  }
  if (table === 'farm_expenses') monetary(merged.amount);
  if (activity && merged.field_id && !['horticulture', 'crops', 'orchards', 'forestry'].includes(module.key)) fail('Esta atividade usa unidades próprias, sem vínculo com talhão agrícola.');
}
