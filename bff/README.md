# morvarid-farm-bff

Minimal **Backend-for-Frontend** Web Service deployed alongside the
**Morvarid-Farm** static SPA. The BFF exists for ONE reason: **Supabase
`auth.admin.*` operations (`createUser`, `listUsers`, `updateUserById`,
`deleteUser`, password resets) cannot run from the browser without the
service-role key**, and that key must never be shipped to a Vite client
bundle. The BFF holds the key server-side and proxies these five calls
after verifying the caller has an admin profile.

The SPA's other ~50 privileged table operations (farms, inputs,
suppliers, formulas, vouchers, inventory ledger) are handled by
**SECURITY DEFINER RPCs** defined in
[`scripts/migrations/003_admin_rpcs.sql`](../scripts/migrations/003_admin_rpcs.sql)
— those are called directly from `supabase.rpc(...)` on the anon client.

## Endpoints

All endpoints require `Authorization: Bearer <user_access_token>` and
verify the caller is an active `admin`.

| Method | Path                                                | Purpose |
|--------|-----------------------------------------------------|---------|
| POST   | `/api/auth-admin/users`                             | `auth.admin.createUser` |
| GET    | `/api/auth-admin/users?page=&perPage=`              | `auth.admin.listUsers` |
| PATCH  | `/api/auth-admin/users/:id`                         | `auth.admin.updateUserById` (role, username, email, password, …) |
| DELETE | `/api/auth-admin/users/:id`                         | `auth.admin.deleteUser` |
| POST   | `/api/auth-admin/users/:id/password`                | `auth.admin.updateUserById({password})` (admin password reset) |

## Env vars

| Name | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | same as the SPA |
| `VITE_SUPABASE_ANON_KEY` | yes | used by the admin client to verify caller JWT |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | yes | **never** sent to the client |
| `ALLOWED_ORIGIN` | recommended | e.g. `https://morvarid-farm.onrender.com` |
| `PORT` | auto | Render injects this |

## Local dev

```bash
# From repo root:
echo "VITE_SUPABASE_URL=https://YOUR.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJ...
ALLOWED_ORIGIN=http://localhost:5173" > bff/.env

cd bff
npm start
```

The SPA wires its base URL via `VITE_BFF_URL` (see `docs/deploy/render.md`).

## Security properties

* The service-role JWT lives only in the Render service's env vars and in
  the running Node process. It is **never** written to disk, never logged.
* `autoRefreshToken: false` and `persistSession: false` are passed to the
  admin client so it cannot accidentally store tokens.
* Every request is authenticated AND role-checked server-side; an anon
  call to the BFF cannot reach the admin client.
* Self-delete via the BFF is rejected (prevents admin lockout).
* Payload size capped at 64 KB.

## Render deploy

Defined in [`render.yaml`](../render.yaml) as the `morvarid-farm-bff`
service. See [`docs/deploy/render.md`](../docs/deploy/render.md) for the
end-to-end setup.
