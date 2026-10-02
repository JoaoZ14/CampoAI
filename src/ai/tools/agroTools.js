import { agroCatalog, agroSchemas, agroTables } from '../../rural/agroCatalog.js';
import { filtersSchema } from '../../rural/schemas.js';
import { object, id, str, normalizeName } from '../../rural/validation.js';

// A bounded set of tools serves all modules; the server validates each entity separately.
export function agroTools(service) {
  const values = Object.assign({}, ...Object.values(agroSchemas).map(schema => schema.properties));
  values.status = { type: 'string', enum: ['active', 'inactive', 'voided', 'cancelled'] };
  const entity = { type: 'string', enum: agroTables };
  const make = (name, description, classification, parameters, run) => ({ name, description, classification, parameters, run });
  return [
    make('get_agro_options', 'Consulta atividades e campos válidos. Informe module_key para ver o contrato completo; não invente unidades ou espécie.', 'READ', object({ module_key: str }), args => {
      const catalog = agroCatalog();
      const modules = args.module_key ? catalog.modules.filter(m => m.key === args.module_key) : catalog.modules;
      const keys = [...new Set(modules.flatMap(m => m.events))];
      return { modules, events: args.module_key ? Object.fromEntries(keys.map(key => [key, key === 'harvest' ? { ...catalog.events[key], fields: catalog.events[key].fields.map(f => f.key === 'unit' ? { ...f, options: modules[0].harvest_units } : f) } : catalog.events[key]])) : Object.keys(catalog.events), schemas: args.module_key && modules.length ? agroSchemas : undefined };
    }),
    make('list_agro_records', 'Consulta atividades, unidades, produção, vendas ou recebimentos. Até 50 por página; datas from inclusivo/to exclusivo. Use filtros compatíveis com a entidade.', 'READ', object({ farm_id: id, entity, filters: filtersSchema }, ['entity']), args => service.list(args.entity, args.farm_id, args.filters)),
    make('get_agro_record', 'Consulta ficha por ID na propriedade acessível.', 'READ', object({ farm_id: id, entity, record_id: id }, ['entity', 'record_id']), args => service.one(args.entity, args.farm_id, args.record_id)),
    make('resolve_production_unit', 'Busca nome ou identificação exatos. Vários matches exigem pergunta. Não cria cadastros.', 'READ', object({ farm_id: id, activity_id: id, name: str }, ['name']), async args => {
      const farm = await service.farm(args.farm_id);
      if (args.activity_id) await service.references(farm.id, { activity_id: args.activity_id });
      const units = await service.repo.all('production_units', farm.id, args.activity_id ? { activity_id: args.activity_id } : {});
      const name = normalizeName(args.name);
      const matches = units.filter(u => normalizeName(u.name) === name || (u.identifier && normalizeName(u.identifier) === name));
      return { matches: matches.slice(0, 10).map(({ id, name, identifier, activity_id, unit_type, species, status }) => ({ id, name, identifier, activity_id, unit_type, species, status })), ambiguous: matches.length > 1, count: matches.length };
    }),
    make('save_agro_record', 'Cria/corrige registro; record_id indica correção. Consulte get_agro_options para campos obrigatórios. Vínculos e tipos são fixos. Eventos são fatos; ações futuras são tarefas. Não invente cadastro por simples menção. Anulação: status voided; venda cancelled. Recebimento é dinheiro que entrou.', 'WRITE', object({ farm_id: id, entity, record_id: id, values: object(values) }, ['entity', 'values']), async args => ({ entity: args.entity, record: await service.save(args.entity, args.farm_id, args.values, args.record_id), updated: Boolean(args.record_id) })),
    make('get_agro_summary', 'Totais por tipo/unidade, pesagens, saldo de grupos e financeiro com pagamentos parciais. Não equivale a lucro. Filtre atividade/unidade/período.', 'READ', object({ farm_id: id, filters: object({ activity_id: id, production_unit_id: id, from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' } }) }), async args => {
      const r = await service.agroOverview(args.farm_id, args.filters);
      const units = r.units.filter(u => !args.filters?.production_unit_id || u.id === args.filters.production_unit_id);
      return { activities: r.activities.map(({ id, name, module_key, status }) => ({ id, name, module_key, status })), units: units.slice(0, 20).map(u => ({ id: u.id, name: u.name, identifier: u.identifier, ...r.unit_stats[u.id] })), units_count: units.length, units_partial: units.length > 20, production_totals: r.production_totals, financial: r.financial, period: r.period };
    }),
  ];
}
