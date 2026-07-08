import { sql } from './lib.mjs';
const q = async (label, query) => { try { const r = await sql(query); console.log(label, JSON.stringify(r)); } catch(e){ console.log(label,'ERR',String(e.message).slice(0,150)); } };
await q('farms:', `select count(*) n from farms`);
await q('farm_items:', `select count(*) n from farm_items`);
await q('vouchers total:', `select count(*) n, min(voucher_date) mn, max(voucher_date) mx from daily_vouchers`);
await q('vouchers submitted:', `select count(*) n, min(voucher_date) mn, max(voucher_date) mx from daily_vouchers where status::text='submitted'`);
await q('voucher_lines:', `select count(*) n from daily_voucher_lines`);
await q('suppliers:', `select count(*) n from suppliers`);
// find the month with most submitted voucher activity
await q('activity by month:', `select to_char(voucher_date,'YYYY-MM') ym, count(*) n from daily_vouchers where status::text='submitted' group by 1 order by n desc limit 6`);
// inventory movement tables for ledger
await q('purchases:', `select count(*) n, min(purchase_date) mn, max(purchase_date) mx from purchases`);
