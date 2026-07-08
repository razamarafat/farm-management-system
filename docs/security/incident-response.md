# Security Incident Response — Morvarid-Farm

This playbook assumes one of:

1. The Supabase service-role JWT was leaked (committed, copied to a
   public file, or shared). Treat it as **burned on the moment of
   disclosure**.
2. The `repomix-output.xml` snapshot file is in the working tree and
   contains real keys.
3. The frontend bundle contains an elevated key (this PR's spec goal:
   it must NOT).

Each section is self-contained; copy-paste runnable.

---

> **Doc-secret sanity:** examples in this playbook use placeholders
> (`sb_secret_REPLACE_ME`, `sb_secret_XXXXXX`, `eyJh…leaked…`). If
> updating examples with a realistic-looking secret for documentation
> purposes, keep the prefix intact but append at least 20 chars of
> junk (`sb_secret_REPLACE_ME_aBcDeFgHiJkLmN1234`). The
> `scripts/check-secrets.mjs` regex requires `sb_secret_<20+chars>` to
> trigger a hit; anything shorter is treated as a placeholder and
> ignored.

## Step 0 — Stop the bleeding

Before doing anything else, **revoke the leaked key** in Supabase and
invalidate any active sessions. Order matters: rotation is what
actually stops an attacker; everything else is housekeeping.

### 0.1  Supabase legacy keys (anon + service_role)

HUMAN STEPS — Supabase dashboard:

1. Sign in to <https://supabase.com/dashboard>.
2. Open **Project → Settings → API**.
3. Under **Project API keys**:
   * Click **Roll anon JWT secret** if the anon JWT was leaked — this
     logs every browser session out. Users must sign in again.
   * Click **Roll service_role JWT secret** if the service-role JWT
     was leaked.
   * **Copy the new values** into a private 1Password / Bitwarden
     entry. Never commit them.
4. Under **JWT Settings** (same page), note the **JWT Secret** value.
   This is a separate secret that signs all user JWTs (anon + service
   + new sb_*). You only need to rotate it if *that* secret was leaked.

Then in **this repo**:

```bash
# 1. Update local .env AND .env files anywhere they live (laptop, .envrc, etc.).
#    Do NOT commit. .gitignore already protects these.
sed -i.bak 's|eyJh…leaked…|'<NEW-ANON>'|' .env            # macOS / Linux.
# (Windows: edit by hand. There is no safe shell one-liner that won’t
#  accidentally paste secrets in shell history.)

# 2. Wipe the system clipboard / terminal scrollback if you copied a
#    secret through them.
```

### 0.2  Supabase new-format keys (`sb_publishable_`, `sb_secret_`)

If your project is on the new Supabase API key format, the rotation
shape is different. HUMAN STEPS:

1. In Supabase Dashboard → **Settings → API Keys**, click **Generate
   new secret key** to mint a fresh `sb_secret_<…>`. Save it offline.
2. The `sb_publishable_<…>` key is treated as safely-shippable (it
   replaces the legacy `anon` key). Re-issue it after rotating the
   `sb_secret_` to fully invalidate older trusted tokens.
3. In this repo, set `VITE_SUPABASE_ANON_KEY=<new sb_publishable_>`
   (SPA) and `VITE_SUPABASE_SERVICE_ROLE_KEY=<new sb_secret_>` (BFF).
4. Redeploy.

> **Best practice for new projects going forward:** prefer the new
> `sb_publishable_` + `sb_secret_` keys. Legacy `anon` / `service_role`
> are deprecated end-of-2026 (per Supabase guidance).

### 0.3  Render env-var layer

HUMAN STEPS — Render dashboard:

1. For the **morvarid-farm** Static Site (SPA), open
   **Environment** and replace the env values. The SPA never sees the
   service-role key.
2. For the **morvarid-farm-bff** Web Service, open **Environment** and
   replace `VITE_SUPABASE_SERVICE_ROLE_KEY`. **Always do this BEFORE
   purging git history**, otherwise a re-deploy will fail.
3. Click **Manual Deploy** on both services to roll out the new env.

---

## Step 0.5 — Rotate GitHub PATs and CI secrets BEFORE Step 1

Step 1 force-pushes rewritten git history. If your GitHub PAT was in
any leaked file (`.env`, CI yml, prior commit), it is now in the new
history's push request — treat it as burned. Rotate BEFORE any push.

HUMAN STEPS — GitHub dashboard:

1. **Settings → Developer settings → Personal access tokens → Tokens
   (classic): revoke every PAT** that has `repo` or `workflow` scope on
   this repo. Generate a fresh one; do this even if you believe the
   PAT was not leaked — defense in depth.
2. **Settings → Developer settings → GitHub Apps**: if any GitHub App
   is installed on the repo with push / workflow permissions, rotate
   its private key.
3. **Repo → Settings → Secrets and variables → Actions**: rotate any
   `RENDER_DEPLOY_HOOK`, `SUPABASE_*`, or webhook secrets. Re-issue
   the deploy hook URL after rotating Render tokens (see Step 4).
4. **Render → Account → API Keys**: reissue the Render API token used
   by the GitHub-Actions deploy step, then update the GitHub Actions
   secret in step 3 above.

After rotation, capture the new values offline (1Password). Do NOT
paste tokens into the README, `.env.example`, or any chat.

---

## Step 1 — Purge secrets from git history

Choose **one** of the following. The legacy `bfg` is fast on huge
repos; `git filter-repo` is the modern, recommended path.

### Option A — `git filter-repo` (recommended)

Prereqs:

```bash
# macOS:    brew install git-filter-repo
# pip:      pip install git-filter-repo
# Linux:    apt-get install git-filter-repo  (Ubuntu 22.04+)
```

Run:

```bash
# In a fresh clone. NEVER modify the canonical repo in place.
git clone --no-tags --single-branch --depth=1000 \
  https://github.com/razamarafat/farm-management-system.git purge
cd purge

# Remove repomix-output.xml (known secrets snapshot).
git filter-repo --path repomix-output.xml --invert-paths
# Remove allcode.txt (another known leak surface).
git filter-repo --path allcode.txt --invert-paths
# Remove the prior .env file commit (if it was ever tracked).
git filter-repo --path .env --invert-paths

# Catch any other textual leak escapees.
git filter-repo --replace-text <(cat << 'EOF'
sb_secret_XXXXXX==>sb_secret_REDACTED
EOF
)
```

Force-push the rewritten history:

```bash
# Tell all collaborators! Coordinate this with the team.
git remote add origin https://github.com/razamarafat/farm-management-system.git
git push --force --all --tags --prune-tags --prune-empty --no-verify origin
```

### Option B — `bfg`

```bash
# Clone a fresh mirror.
git clone --mirror https://github.com/razamarafat/farm-management-system.git purge.git
cd purge.git

# Remove the snapshot file from every commit.
bfg --delete-files repomix-output.xml
bfg --delete-files allcode.txt
# Removes inline secrets matching a regex (NEW-key form).
bfg --replace-text passwords.txt  # one regex per line, e.g. ^sb_secret_[A-Za-z0-9_-]{20,}

# Cleanup.
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push
```

After either option, **close and reopen GitHub access tokens** (the
prior push tokens may have been exposed in any leaked PR / CI logs).

---

## Step 2 — Confirm the cleaning worked

```bash
# Locally:
git log --all --oneline -- repomix-output.xml 2>&1
git log --all --oneline -- .env               2>&1
# Both should be empty. If not, re-run filter-repo (it is idempotent).

# Remotely:
gh api repos/razamarafat/farm-management-system/contents/repomix-output.xml
# → 404 expected.

# For inline secret strings (sb_secret_, eyJhbGciOiJI…):
# Use GitHub UI: Code → Search → "VITE_SUPABASE_SERVICE_ROLE_KEY" → 0 results expected.
```

In **this repo**, also run:

```bash
npm run check:secrets
# expected: OK — no VITE_*SERVICE_ROLE assignments or service-role JWT literals found.
```

---

## Step 3 — Storage RLS for the `attachments` bucket

If you are also migrating `FileUpload` away from `supabaseAdmin.storage`
to anon + storage policies, apply this migration. Otherwise **stop**
— direct storage uploads use a separate bucket policy surface.

HUMAN STEPS — Supabase dashboard:

1. **Storage → Buckets → attachments → Policies**.
2. Add a SELECT policy for authenticated users:

   ```sql
   CREATE POLICY "attachments_select_authenticated"
     ON storage.objects FOR SELECT
     USING (bucket_id = 'attachments' AND auth.role() = 'authenticated');
   ```

3. Add an INSERT policy that locks writes to authenticated users
   whose JWT is admin:

   ```sql
   CREATE POLICY "attachments_insert_admin"
     ON storage.objects FOR INSERT
     WITH CHECK (
       bucket_id = 'attachments'
       AND EXISTS (SELECT 1 FROM public.profiles
                   WHERE id = auth.uid() AND role = 'admin' AND is_active = true)
     );
   ```

4. Add a DELETE policy, same `admin` predicate.

After applying, the SPA can replace `supabaseAdmin.storage` with
`supabase.storage` — the policy gates writes, and reads return via
public URLs.

---

## Step 4 — Production deploy verification

HUMAN STEPS — Render dashboard:

1. **morvarid-farm** Static Site: confirm `.env.example` matches the
   Render env keys. Confirm `check:secrets` is green in CI on the
   rewritten-history branch.
2. **morvarid-farm-bff** Web Service: SSH/Fly-into-console if needed
   and `node -e "console.log(process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
   ? 'present' : 'missing')"` to confirm the secret is set.
3. Smoke test the SPA → /login + admin /users in dev; the user listing
   must succeed.
4. Smoke test the BFF: `curl -H "Authorization: Bearer <admin_token>"
   https://<bff>.onrender.com/api/auth-admin/users` must return 200.

---

## Step 5 — Tracking

Open a tracking issue titled `Migrate all hooks off @/lib/supabase-admin`.
Inside, paste the output of:

```bash
npm run check:legacy-admin
```

Each line is a sub-task. Close sub-tasks as the relevant hook rewrite
merges. When the script outputs zero hits, the final sub-task is
"**Delete `src/lib/supabase-admin.ts`**".

---

## References

* Supabase — Service-role key guidance:
  <https://supabase.com/docs/guides/api/api-keys>
* Supabase — New API keys (`sb_publishable_`, `sb_secret_`):
  <https://supabase.com/blog/new-api-key-integrations-for-supabase>
* git-filter-repo — <https://github.com/newren/git-filter-repo>
* BFG Repo-Cleaner — <https://rtyley.github.io/bfg-repo-cleaner/>
