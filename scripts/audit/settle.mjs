import { sql } from './lib.mjs';
// 1) Re-pull the EXACT current item-branch line from live def
const def = await sql(`select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='reporting_consumption_summary' and n.nspname='public'`);
const line = def[0].def.split('\n').find(l=>/AS group_label|fi\.name/.test(l) && /group_label/.test(l));
console.log('LIVE item group_label line:', JSON.stringify(line?.trim()));
// show all lines mentioning fi.name in item context
def[0].def.split('\n').forEach((l,i)=>{ if(/fi\.name\b/.test(l)) console.log('  L'+i, l.trim()); });
// 2) Re-run item branch 3x over Feb identically
for (let i=0;i<3;i++){
  try { const r = await sql(`select group_key, group_label, pg_typeof(group_label) tl from reporting_consumption_summary('2026-02-01'::date,'2026-02-28'::date,null::uuid,null::text,'item'::text) limit 2`); console.log(`run${i}: OK`, JSON.stringify(r)); }
  catch(e){ const m=String(e.message); const j=m.indexOf('ERROR:'); console.log(`run${i}: CRASH`, m.slice(j,j+80)); }
}
