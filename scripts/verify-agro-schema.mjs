// Read-only schema probe. It does not apply migrations or certify triggers/RPC behavior.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const probes = {
  farm_activities: 'id,farm_id,name,module_key,status',
  production_units: 'id,farm_id,activity_id,unit_type,species,opening_count,current_count',
  production_events: 'id,activity_id,production_unit_id,event_type,event_date,quantity,unit,time_seconds,inventory_item_id',
  farm_sales: 'id,activity_id,production_unit_id,amount,sale_date,due_date',
  sale_payments: 'id,sale_id,amount,payment_date,status',
  farm_expenses: 'id,activity_id,production_unit_id',
  farm_tasks: 'id,activity_id,production_unit_id',
  inventory_movements: 'id,production_event_id',
};
const results = await Promise.allSettled(Object.entries(probes).map(async ([table, columns]) => {
  const { error } = await db.from(table).select(columns, { head: true }).limit(1);
  if (error) throw new Error(table);
  return table;
}));
let failed = 0;
for (let n = 0; n < results.length; n++) {
  const result = results[n];
  const table = Object.keys(probes)[n];
  if (result.status === 'fulfilled') console.log(`OK: ${table}`);
  else { failed++; console.error(`FALHOU: ${table}. Confira a migração 024, permissões e conexão do servidor.`); }
}
console.log('Esta checagem verifica tabelas/colunas. Gravação, auditoria e entrega WhatsApp exigem teste funcional.');
process.exitCode = failed ? 1 : 0;
