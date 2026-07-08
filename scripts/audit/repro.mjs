import { sql, signIn, clientWithJwt } from './lib.mjs';
console.log('--- consumption_summary group_by=item over Feb 2026 (has data), via Mgmt SQL ---');
try { const r = await sql(`select * from reporting_consumption_summary('2026-02-01'::date,'2026-02-28'::date,null::uuid,null::text,'item'::text)`); console.log('SQL OK rows=',r.length); }
catch(e){ const m=String(e.message); const i=m.indexOf('ERROR:'); console.log('SQL CRASH:', i>=0?m.slice(i,i+90):m.slice(0,90)); }
console.log('--- same via authenticated user RPC (what the app does) ---');
const { jwt } = await signIn();
const sb = clientWithJwt(jwt);
const { data, error } = await sb.rpc('reporting_consumption_summary', { p_date_from:'2026-02-01', p_date_to:'2026-02-28', p_group_by:'item' });
console.log('item RPC error:', error?.message || 'none', '| rows:', data?.length);
const { data:d2, error:e2 } = await sb.rpc('reporting_consumption_summary', { p_date_from:'2026-02-01', p_date_to:'2026-02-28', p_group_by:'day' });
console.log('day  RPC error:', e2?.message || 'none', '| rows:', d2?.length);
