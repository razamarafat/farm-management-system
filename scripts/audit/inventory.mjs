import { sql } from './lib.mjs';
const fns = await sql(`
  select p.proname,
         pg_get_function_arguments(p.oid) as args,
         pg_get_function_result(p.oid) as returns,
         case p.provolatile when 'i' then 'IMMUTABLE' when 's' then 'STABLE' else 'VOLATILE' end as vol,
         case when p.prosecdef then 'DEFINER' else 'INVOKER' end as security,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'reporting_%'
  order by p.proname`);
console.log('=== REPORTING FUNCTIONS ===');
for (const f of fns) console.log(`\n${f.proname}(${f.args})\n  -> ${f.returns}\n  ${f.vol} SECURITY ${f.security} | authenticated EXECUTE=${f.auth_exec}`);
