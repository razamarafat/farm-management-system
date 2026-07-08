import { sql } from './lib.mjs';
const r = await sql(`
  select p.prosecdef as security_definer, p.provolatile as volatility,
         pg_get_userbyid(p.proowner) as owner,
         (select array_agg(unnest) from unnest(p.proconfig)) as config,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_exec,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_exec
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.proname='reporting_consumption_summary' and n.nspname='public'`);
console.log(JSON.stringify(r, null, 2));
