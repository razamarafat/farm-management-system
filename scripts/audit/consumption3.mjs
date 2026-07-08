import { sql } from './lib.mjs';
// full error detail
try { await sql(`select * from reporting_consumption_summary('2020-01-01'::date,'2030-07-07'::date,null::uuid,null::text,'item'::text)`); }
catch(e){ console.log('FULL ERROR:\n'+String(e.message)); }
console.log('\n=== FUNCTION BODY ===');
const b = await sql(`select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='reporting_consumption_summary' and n.nspname='public'`);
console.log(b[0].def);
