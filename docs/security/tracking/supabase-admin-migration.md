# Tracking issue — purge `@/lib/supabase-admin` from the SPA bundle

**Status:** open (12 of 16 client-side imports remaining)
**Goal:** `npm run check:legacy-admin` exits 0 and `src/lib/supabase-admin.ts` is deleted.
**Driven by:** `scripts/check-legacy-admin.mjs` (CI guard, fails on any import).

This document tracks every consumer of the legacy `supabaseAdmin` client
(`src/lib/supabase-admin.ts`). The module itself was kept during the
foundation PR to keep the build green; the contract is now:

| Surface | Replacement |
|---|---|
| Table SELECT (`supabaseAdmin.from('X').select(…)`) | `supabase.from('X').select(…)` (anon, RLS-gated) — for the read paths |
| Table INSERT/UPDATE/DELETE                           | `supabase.rpc('rpc_admin_*', payload)` — see [RPC contract](#rpc-contract) |
| `supabaseAdmin.auth.admin.{createUser,listUsers,updateUserById,deleteUser}` | `fetch('${VITE_BFF_URL}/api/auth-admin/…')` — see [BFF endpoints](#bff-endpoints) |
| `supabaseAdmin.storage.from('…').upload/getPublicUrl/remove`             | anon client + storage RLS (separate migration, see [Storage](#storage-rls)) |

After every consumer is migrated, the close-out procedure is:

```bash
# 1. The guard should already exit 0 from the last sub-task.
npm run check:legacy-admin
# 2. Delete the module.
rm src/lib/supabase-admin.ts
# 3. Re-run the full check.
npm run check        # check:conflicts + check:env + check:secrets + check:legacy-admin
npx tsc --noEmit
npm run build
# 4. Update src/vite-env.d.ts — remove VITE_BFF_URL comment if no BFF
#    endpoints are still needed. (Today BFF is still needed for users.ts.)
```

## Done (4)

- [x] `src/hooks/useFarms.ts` — writes migrated to `rpc_admin_create_farm` /
      `rpc_admin_update_farm` / `rpc_admin_delete_farm` / `rpc_admin_toggle_farm`.
      Reads via `supabase.from('farms')`.
- [x] `src/hooks/useInputs.ts` — writes `rpc_admin_create_input` /
      `rpc_admin_update_input` / `rpc_admin_delete_input` / `rpc_admin_toggle_input`.
      Reads via `supabase.from('inputs')`.
- [x] `src/hooks/useSuppliers.ts` — writes `rpc_admin_create_supplier` /
      `rpc_admin_update_supplier` / `rpc_admin_delete_supplier` /
      `rpc_admin_toggle_supplier`. Probe via `rpc_supplier_usage_count`.
      Reads via `supabase.from('suppliers')`.
- [x] `src/hooks/useFormulas.ts` — writes `rpc_admin_create_formula` /
      `rpc_admin_update_formula` / `rpc_admin_delete_formula` /
      `rpc_admin_toggle_formula` / `rpc_admin_duplicate_formula`. Reads via
      `supabase.from('farm_feed_formulas' | 'farm_formula_items' | 'farm_items')`.

## Open — hooks (3)

- [ ] `src/hooks/useUsers.ts` — **highest priority** (auth.admin surface).
      Profile writes (upsert/toggle/soft-delete/hard-delete) → RPCs:
      `rpc_admin_upsert_profile`, `rpc_admin_toggle_profile`,
      `rpc_admin_soft_delete_profile`, `rpc_admin_hard_delete_profile`,
      `rpc_admin_log_activity`. Auth writes
      (`auth.admin.createUser`, `updateUserById`, `deleteUser`,
      `listUsers`, plus the password-reset updateUserById) → BFF. See
      `bff/server.mjs` (5 endpoints).
- [ ] `src/hooks/useDailySheet.ts` — voucher lines / inventory transactions
      / daily_vouchers updates. Sub-tasks:
      - voucher draft create-or-fetch → `rpc_get_or_create_draft_voucher`
      - single line upsert → `rpc_upsert_voucher_line`
      - inventory txn insert (initial/purchase/consumption/waste/
        transfer_in/out/adjustment) → `rpc_create_inventory_txn`
      - **admin-override branch in `submitSheet`** — clears prior txns
        before re-posting via `supabaseAdmin.from('inventory_transactions').delete().eq('source_type','daily_voucher').eq('source_id',…)`.
        Needs a new RPC, e.g.:
        ```sql
        CREATE OR REPLACE FUNCTION public.rpc_admin_delete_inventory_txn_by_source(
          p_source_type text,
          p_source_id   text
        ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
        BEGIN
          IF NOT public.is_admin_user() THEN
            RAISE EXCEPTION 'forbidden: admin role required';
          END IF;
          DELETE FROM public.inventory_transactions
            WHERE source_type = p_source_type
              AND source_id   = p_source_id;
        END;
        $$;
        GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_inventory_txn_by_source(
          text, text
        ) TO anon, authenticated;
        ```
        Add this to `003_admin_rpcs.sql` BEFORE migrating useDailySheet.
        The is_admin_user() guard is mandatory — without it any
        authenticated role could DELETE inventory rows by source.
      - submit (`submitSheet`) → `supabase.rpc('submit_daily_sheet', …)`
        (existing RPC, keep the contract).
      - revert (`revertSheet`) → `supabase.rpc('revert_daily_sheet', …)`
        (existing RPC, keep the contract).
      - Reads for formulas / halls / items / current lines / balances:
        anon client (RLS-gated).
- [ ] `src/hooks/useInventory.ts` — transactions, balances, item initial
      check. Writes → `rpc_create_inventory_txn`, `rpc_admin_update_inventory_txn`,
      `rpc_admin_delete_inventory_txn`, plus the exists probe
      `rpc_initial_stock_exists`. Reads → anon client.

## Open — components (2)

- [ ] `src/components/farms/FarmItemsPanel.tsx` — `farm_items` writes →
      `rpc_admin_create_farm_item`, `rpc_admin_delete_farm_item`. Reads →
      anon client.
- [ ] `src/components/ui/FileUpload.tsx` — `supabaseAdmin.storage.from(...).upload(...)`,
      `getPublicUrl`, `remove`. Plan: anon client + storage RLS policy
      (see [Storage](#storage-rls)).

## Open — page components (7)

Read vs. write per page — confirmed by inspecting current imports.

| File | Reads (move to `supabase.from`) | Writes (move to RPC) |
|---|---|---|
| `src/pages/ConsumptionPage.tsx` | `daily_vouchers` select | — (writes are via DailySheet hook) |
| `src/pages/FormulaManagementPage.tsx` | formula queries (also covered by `useFormulas`) | — |
| `src/pages/InventoryItemHistoryPage.tsx` | `inventory_transactions` | — |
| `src/pages/InventoryPage.tsx` | `farm_items`, `inventory_transactions` | — |
| `src/pages/PurchasesPage.tsx` | `farm_items`, `inventory_transactions` | `inventory_transactions` insert → `rpc_create_inventory_txn` |
| `src/pages/ReorderPointPage.tsx` | `farm_items`, `inventory_transactions` | `inventory_transactions` delete → `rpc_admin_delete_inventory_txn` |
| `src/pages/ReportsPage.tsx` | `farm_feed_formulas`, `farm_formula_items`, `farm_items`, `inventory_transactions`, `daily_vouchers`, `daily_voucher_lines` | `inventory_transactions` delete (admin override) → `rpc_admin_delete_inventory_txn` |

## RPC contract

Source of truth: [`scripts/migrations/003_admin_rpcs.sql`](../../scripts/migrations/003_admin_rpcs.sql).
Every function returns `void` / `int` / `jsonb` / `uuid` and is wrapped
via the small client helper at `@/utils/rpc`:

```ts
import { rpc } from '@/utils/rpc';
const { error } = await rpc('rpc_admin_delete_input', { p_id, p_hard: false });
```

Returned `data` shapes match the SQL return types; only call sites that
care about a return value (e.g. toggle returning the new `is_active`)
use the generic form `rpc<{ is_active: boolean }>(...)`.

## BFF endpoints

Source of truth: [`bff/server.mjs`](../../bff/server.mjs).

| Method | Path                                                | Body / params |
|---|---|---|
| POST   | `/api/auth-admin/users`                             | `{ email, password, role, username, email_confirm }` |
| GET    | `/api/auth-admin/users?page=&perPage=`              | query |
| PATCH  | `/api/auth-admin/users/:id`                         | partial `{ role?, username?, email?, password?, email_confirm? }` |
| DELETE | `/api/auth-admin/users/:id`                         | – |
| POST   | `/api/auth-admin/users/:id/password`                | `{ password }` |

Every call must carry `Authorization: Bearer <user_access_token>`. The
BFF verifies the JWT bearer AND the caller's `profiles.role = 'admin'`
+ `is_active = true`. An anon or non-admin call cannot reach the admin
client. See [bff/README.md](../../bff/README.md) for the security
guarantees and the local-dev recipe.

## Storage RLS

`FileUpload.tsx` references `supabaseAdmin.storage.from(...).upload(...)`,
`getPublicUrl`, and `remove`. The migration script
[`scripts/migrations/004_storage_rls.sql`](../../scripts/migrations/004_storage_rls.sql)
(author when migrating `FileUpload`) must include:

```sql
-- 'attachments' bucket — allow authenticated uploads, admin deletes.
CREATE POLICY "authenticated upload attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "authenticated read public attachments"
  ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'attachments');

CREATE POLICY "admin delete attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attachments' AND public.is_admin_user());
```

Until that migration lands, `FileUpload.tsx` keeps the
`supabaseAdmin.storage.*` calls, and the import stays.
