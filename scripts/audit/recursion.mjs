import { sql, signIn, clientWithJwt } from './lib.mjs';
// is_user_admin body — does it SELECT from profiles?
const f = await sql(`select pg_get_functiondef(p.oid) d, case when p.prosecdef then 'DEFINER' else 'INVOKER' end sec from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='is_user_admin' and n.nspname='public'`);
console.log('is_user_admin SECURITY:', f[0]?.sec);
console.log(f[0]?.d);
console.log('\n=== does a plain authenticated SELECT on profiles recurse? ===');
const { jwt, user } = await signIn();
const sb = clientWithJwt(jwt);
const { data, error } = await sb.from('profiles').select('id,role,is_active').eq('id', user.id);
console.log('profiles self-select:', error?.message || ('OK '+JSON.stringify(data)));
console.log('\n=== a report RPC as authenticated user (balance_as_of) ===');
const { data:b, error:be } = await sb.rpc('reporting_inventory_balance_as_of', { p_as_of: '2026-02-28' });
console.log('balance_as_of:', be?.message || ('OK rows='+b?.length));
