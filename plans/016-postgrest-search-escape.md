# Plan 016: Escape user search text before PostgREST `or()`/`ilike` interpolation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a9257dd..HEAD -- src/hooks/useFarms.ts src/hooks/useUsers.ts src/hooks/useInventory.ts src/hooks/useInputs.ts src/hooks/useSuppliers.ts src/utils/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/013-vitest-unit-test-floor.md (new pure-helper tests use its vitest setup)
- **Category**: bug
- **Planned at**: commit `a9257dd`, 2026-09-07

## Why this matters

Five list hooks interpolate raw keystrokes into PostgREST filter strings. A
search containing `, . ( ) " \` breaks `or()` parsing (the whole list errors
to «خطا در دریافت اطلاعات»), while `%`/`_` silently act as wildcards and `:`
splits predicates — so ordinary input (a pasted "a,b", a code with dots, a
`100%` note) empties or corrupts farm/user/inventory/supplier lists. One
shared escape helper applied at all five sites fixes the class, not one box.

## Current state

The five interpolation sites (verified 2026-09-07):

```ts
// src/hooks/useFarms.ts:44-47
if (debouncedSearch) {
  const s = `%${debouncedSearch}%`;
  q = q.or(`name.ilike.${s},code.ilike.${s}`);
}
```

```ts
// src/hooks/useUsers.ts:56
query = query.or(`first_name.ilike.${search},last_name.ilike.${search},username.ilike.${search}`);
```

```ts
// src/hooks/useInventory.ts:154
query = query.or(`notes.ilike.%${filters.search}%,reference_no.ilike.%${filters.search}%`);
```

```ts
// src/hooks/useInputs.ts:30
if (debouncedSearch) query = query.ilike('name', `%${debouncedSearch}%`);
// src/hooks/useSuppliers.ts:28 — identical shape on suppliers
if (debouncedSearch) query = query.ilike('name', `%${debouncedSearch}%`);
```

Notes for the implementer:

- The `.or()` form needs TWO escapes: PostgREST reserved chars in the `or()`
  list (`,`, `.`, `(`, `)`, `"`, `\`, `:`) must be backslash-escaped AND LIKE
  wildcards (`%`, `_`, and the escape char itself) escaped so they match
  literally. The plain `.ilike(name, value)` form needs only the LIKE-side
  escape (postgrest-js passes the value as a query param; wildcards the user
  typed must still be literal).
- PostgREST `like` uses `\` as the default escape character.
- Order matters: escape `\` first, then the rest.
- Repo conventions: small pure utils live in `src/utils/` (`persianNumbers.ts`,
  `helpers.ts`); Persian UI strings stay as-is; AGENTS.md RULE 1 forbids
  fabricated business data — unit tests use synthetic adversarial strings
  (`'a,b'`, `'100%'`, `'a(b)c'`, `'x:y'`), never live rows. RULE 2: `src/`
  changes require `npm run build` + dist hygiene grep in the same change.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| New tests | `npx vitest run src/utils/postgrestEscape.test.ts` | all pass |
| Full unit suite | `npm run test:unit` (or plan 013's actual name) | all pass |
| Build | `npm run build` | exit 0 |
| Bundle hygiene | `node -e 'const h=require("fs").readFileSync("dist/index.html","utf8");for(const s of ["demo-1","فارم مرکزی","فارم شماره"])if(h.includes(s))throw new Error(s)'` | exit 0 |

## Scope

**In scope** (the only files you should modify):

- `src/utils/postgrestEscape.ts` (create: `escapePostgrestLike(value)` + `escapePostgrestOrValue(value)`)
- `src/utils/postgrestEscape.test.ts` (create)
- `src/hooks/useFarms.ts`, `src/hooks/useUsers.ts`, `src/hooks/useInventory.ts`,
  `src/hooks/useInputs.ts`, `src/hooks/useSuppliers.ts` (apply helpers at the
  sites above — one line each, no logic changes)

**Out of scope** (do NOT touch):

- Any other query builder, filter semantics, debounce timing, or UI copy.
- `services/export-api/*` (server-side filter mapping is a separate boundary).
- `supabase/migrations/*` — no schema change.

## Git workflow

- Branch: `advisor/016-postgrest-escape`
- Commit per step; message style matches repo (`fix:`, `feat:`, `chore:`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the escape helper + unit tests

Create `src/utils/postgrestEscape.ts`:

```ts
// Escapes backslash FIRST, then PostgREST or() reserved chars.
export function escapePostgrestOrValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/[%_]/g, (m) => `\\${m}`)       // LIKE wildcards literal
    .replace(/[,.()":]/g, (m) => `\\${m}`);  // or() syntax chars
}
export function escapePostgrestLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[%_]/g, (m) => `\\${m}`);
}
```

(If postgrest-js version in `package.json` documents a different escape char,
use that and note the deviation — but do not upgrade the dependency here.)

Create `src/utils/postgrestEscape.test.ts` with cases: plain ASCII unchanged;
`a,b` → comma escaped; `100%_x` → wildcards escaped; `a(b)c:d.e"f\g` → all
syntax chars escaped; backslash-first ordering (`\%` input yields correctly
double-escaped output); empty string → empty string. Assert exact strings.

**Verify**: `npx vitest run src/utils/postgrestEscape.test.ts` → all pass;
`npx tsc --noEmit` → exit 0.

### Step 2: Apply at the five call sites

- `useFarms.ts:45-46`: `const s = \`%${escapePostgrestOrValue(debouncedSearch)}%\`;`
  (escape the raw term, THEN wrap in `%`).
- `useUsers.ts:56`: escape `search` once into a local, interpolate the escaped
  value in all three predicates.
- `useInventory.ts:154`: escape `filters.search` once, interpolate in both
  predicates.
- `useInputs.ts:30` / `useSuppliers.ts:28`: wrap the term with
  `escapePostgrestLike` inside the `%...%`.

**Verify**: `npx tsc --noEmit` → exit 0; `grep -rn "ilike.\${" src/hooks/`
returns no matches (no raw interpolation remains); `npm run test:unit` → all pass.

### Step 3: Rebuild bundle + hygiene

`npm run build` → exit 0; dist hygiene command from the table → exit 0.

**Verify**: both exit 0.

## Test plan

- New `src/utils/postgrestEscape.test.ts`: ≥6 cases listed in Step 1.
- Pattern: plan 013's pure-util tests (e.g. its `persianNumbers` test file) —
  same import/assert style.
- No hook-level or E2E tests needed: the change is a pure string transform;
  normal searches (no special chars) are byte-identical by construction
  (assert one such case explicitly).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run test:unit` exits 0 including the new escape tests
- [ ] `grep -rn 'ilike.\${' src/hooks/ ; grep -rn 'ilike.%${' src/hooks/` return no matches
- [ ] `grep -rn "escapePostgrest" src/hooks/ | wc -l` ≥ 5 (all sites wired)
- [ ] `npm run build` exits 0 and dist hygiene passes
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the five sites doesn't match its excerpt (drift — e.g. already
  migrated to an RPC search).
- Plan 013 has not landed (no vitest) — blocked-on-013, do not add another runner.
- Escaped queries return errors from PostgREST (escape char rejected) — report
  the server response verbatim (minus any secrets) instead of guessing a
  second escaping scheme.
- A sixth interpolation site appears via grep — wire it too IF trivially the
  same shape, else stop and list it.

## Maintenance notes

- Any new `.or(` filter built from user input must use these helpers — note
  this in the PR description so reviewers enforce it.
- If full-text search ever replaces `ilike` filtering, delete this helper and
  its tests in the same PR.
- Reviewers: check the backslash-first ordering test closely; wrong order is
  the classic double-escaping bug.
