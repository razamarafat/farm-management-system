import { sql } from './lib.mjs';
for (const gb of ['item','day','hall','formula']) {
  try {
    const r = await sql(`select * from reporting_consumption_summary('2026-06-01'::date,'2026-07-07'::date,null::uuid,null::text,'${gb}'::text) limit 2`);
    console.log(`group_by=${gb}: OK rows=${r.length} sample=${JSON.stringify(r[0]||null)}`);
  } catch (e) { console.log(`group_by=${gb}: ERROR ${String(e.message).slice(0,200)}`); }
}
