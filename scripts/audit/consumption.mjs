import { sql } from './lib.mjs';
// Function definition + declared return type
const def = await sql(`
  select p.proname, pg_get_function_result(p.oid) as returns,
         pg_get_function_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.proname='reporting_consumption_summary' and n.nspname='public'`);
console.log('=== signature ===');
console.log(JSON.stringify(def, null, 2));
// Try to actually call it via SQL to see the raw error
try {
  const r = await sql(`select * from reporting_consumption_summary('2026-06-01','2026-07-07',null,null,null,'item') limit 3`);
  console.log('=== call OK, sample ===', JSON.stringify(r));
} catch (e) {
  console.log('=== call ERROR ===');
  console.log(String(e.message).slice(0, 600));
}
