# Legacy admin-client migration tracker

Every file in `src/` that still imports `@/lib/supabase-admin` keeps
the SPA bound to the legacy stub. Each row is the migration target.

`scripts/check-legacy-admin.mjs` auto-detects these imports and fails
the build until the count is zero. Run:

```bash
npm run check:legacy-admin
```

## Status after the **hook rewrites for farms/inputs/suppliers/formulas** PR

| File | Type | Migration target | Status |
|---|---|---|---|
| src/hooks/useFarms.ts | hook | anon + `rpc_admin_{create,update,delete,toggle}_farm` | ✅ migrated |
| src/hooks/useInputs.ts | hook | anon + `rpc_admin_{create,update,delete,toggle}_input` | ✅ migrated |
| src/hooks/useSuppliers.ts | hook | anon + `rpc_admin_{create,update,delete,toggle}_supplier` + `rpc_supplier_usage_count` | ✅ migrated |
| src/hooks/useFormulas.ts | hook | anon + `rpc_admin_{create,update,delete,toggle,duplicate}_formula` (jsonb items) | ✅ migrated |
| src/hooks/useUsers.ts | hook | anon + `rpc_admin_{upsert,soft_delete,hard_delete,toggle}_profile` + BFF `auth.admin.*` | ⏳ next PR |
| src/hooks/useInventory.ts | hook | anon + `rpc_create_inventory_txn` + `rpc_admin_{update,delete}_inventory_txn` + `rpc_initial_stock_exists` | ⏳ next PR |
| src/hooks/useDailySheet.ts | hook | anon + `rpc_get_or_create_draft_voucher` + `rpc_upsert_voucher_line`; submit/revert stay on existing `submit_daily_sheet` / `revert_daily_sheet` | ⏳ next PR |
| src/components/farms/FarmItemsPanel.tsx | component | anon + `rpc_admin_{create,delete}_farm_item` | ⏳ next PR |
| src/components/ui/FileUpload.tsx | component | anon client + storage RLS; bucket policy migration required | ⏳ next PR |
| src/pages/AdminFarmsPage.tsx | page | direct `supabaseAdmin` calls remain — drop the import | ⏳ audit |
| src/pages/AdminInputsPage.tsx | page | direct `supabaseAdmin` calls remain — drop the import | ⏳ audit |
| src/pages/ConsumptionPage.tsx | page | (via useDailySheet) | ⏳ next PR |
| src/pages/FormulaManagementPage.tsx | page | direct + via useFormulas | ⏳ audit |
| src/pages/InventoryPage.tsx | page | (via useInventory) | ⏳ next PR |
| src/pages/InventoryItemHistoryPage.tsx | page | (via useInventory) | ⏳ next PR |
| src/pages/PurchasesPage.tsx | page | (via useInventory) | ⏳ next PR |
| src/pages/ReportsPage.tsx | page | direct + via useInventory | ⏳ audit |
| src/pages/ReorderPointPage.tsx | page | (via useInventory) | ⏳ next PR |
| src/pages/SuppliersPage.tsx | page | direct `supabaseAdmin` calls remain — drop the import | ⏳ audit |
| src/pages/SupervisorPage.tsx | page | (read-only path — should already be anon) | ⏳ audit |

> The script `scripts/check-legacy-admin.mjs` counts FILE IMPORTS,
> not call-graph. Even if a page only calls an already-migrated hook,
> an explicit `import { supabaseAdmin }` in the page still trips the
> guard. Drop the import from each remaining page row above before
> unblocking deletion of `src/lib/supabase-admin.ts`.

## How to migrate any remaining file

1. Replace every `supabaseAdmin.from('X').{insert,update,delete,upsert}(…)`
   with `supabase.rpc('rpc_admin_<op>', payload)` from
   [`scripts/migrations/003_admin_rpcs.sql`](../../scripts/migrations/003_admin_rpcs.sql).
2. Replace every `supabaseAdmin.auth.admin.*` with a `fetch(...)` to
   `${VITE_BFF_URL}/api/auth-admin/...` carrying the caller's bearer
   token. See [`bff/server.mjs`](../../bff/server.mjs).
3. Replace `supabaseAdmin.from('X').select(...)` reads — most can move
   to the `supabase` (anon) client if RLS allows; some need a dedicated
   read RPC such as `rpc_supplier_usage_count`.
4. Run `npm run check:legacy-admin` until zero hits remain.
5. Delete `src/lib/supabase-admin.ts`.

## Verification

```bash
npm run check          # runs all four guards in sequence
npm run check:legacy-admin   # ≤12 hits expected after this PR (was 16)
```
