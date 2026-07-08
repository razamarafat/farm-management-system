import { sql } from './lib.mjs';
const run = async (label, q) => { try { const r = await sql(q); console.log(label, 'OK rows='+r.length); } catch(e){ const m=String(e.message); const i=m.indexOf('ERROR:'); console.log(label, 'CRASH', i>=0?m.slice(i,i+80):m.slice(0,80)); } };
console.log('=== consumption item branch determinism (Mgmt SQL, service-role) ===');
await run('Feb 2026     :', `select * from reporting_consumption_summary('2026-02-01'::date,'2026-02-28'::date,null::uuid,null::text,'item'::text)`);
await run('2020-2030    :', `select * from reporting_consumption_summary('2020-01-01'::date,'2030-07-07'::date,null::uuid,null::text,'item'::text)`);
await run('Jun-Jul 2026 :', `select * from reporting_consumption_summary('2026-06-01'::date,'2026-07-07'::date,null::uuid,null::text,'item'::text)`);
console.log('\n=== profiles RLS policies (source of recursion?) ===');
const pol = await sql(`select policyname, cmd, qual, with_check from pg_policies where schemaname='public' and tablename='profiles'`);
console.log(JSON.stringify(pol, null, 2));
