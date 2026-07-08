import { sql } from './lib.mjs';
const helpers = await sql(`select proname, case when prosecdef then 'DEFINER' else 'INVOKER' end sec from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('is_current_user_admin','current_user_farm_id','has_farm_access_v2','current_user_role')`);
console.log('012 helper functions present:', JSON.stringify(helpers));
// migrations tracking table?
try { const m = await sql(`select * from schema_migrations order by 1`); console.log('schema_migrations:', JSON.stringify(m)); } catch(e){ console.log('no schema_migrations table'); }
try { const m = await sql(`select version, name from supabase_migrations.schema_migrations order by version`); console.log('supabase migrations:', JSON.stringify(m)); } catch(e){ console.log('no supabase_migrations schema'); }
// The live recursive policy text, exact
const p = await sql(`select policyname, qual from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_self'`);
console.log('LIVE profiles_select_self qual:', p[0]?.qual);
