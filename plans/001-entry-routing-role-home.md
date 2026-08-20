# Plan 001: Route authenticated users to their role dashboard instead of the login form

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Your reviewer maintains `plans/README.md` — do
> not edit it.
>
> **Drift check (run first)**: `git diff --stat f3395fe..HEAD -- src/router/routes.tsx src/components/auth/LoginForm.tsx src/utils/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UX-01)
- **Planned at**: commit `f3395fe`, 2026-07-20

## Why this matters

The root route `/` unconditionally redirects to `/login`, and the login surface
never checks whether the user is already authenticated. Sessions ARE persisted
(zustand `persist` + Supabase session restore), so every PWA launch and every
"بازگشت به صفحه اصلی" recovery path drops a still-authenticated farm operator
onto the login form — they re-enter credentials needlessly or believe they were
logged out. This is the first screen of every session for every user.

## Current state

- `src/router/routes.tsx` — route table. Lines 40–54 today:

```tsx
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Navigate to="/login" replace />,
  },
  {
    path: '/login',
    element: <AuthLayout />,
    children: [
      {
        index: true,
        element: <LoginPage />,
      },
    ],
  },
```

- `src/components/layout/Header.tsx:14-22` — the role→path mapping already
  exists (do NOT modify Header; replicate the mapping in a shared util):

```tsx
const getDashboardPath = () => {
  if (!profile) return '/';
  switch (profile.role) {
    case 'admin': return '/admin';
    case 'supervisor': return '/supervisor';
    case 'operator': return '/operator';
    default: return '/';
  }
};
```

- `src/components/layout/ProtectedRoute.tsx:29-31` — sets `state.from` on
  redirect to login: `return <Navigate to="/login" state={{ from: location }} replace />;`
- `src/components/auth/LoginForm.tsx:91-103` — after login, navigates by a
  hardcoded role switch (`case 'admin': navigate('/admin')` …) and ignores
  `location.state.from`.
- `src/store/authStore.ts` — exposes `isAuthenticated`, `profile`, `isLoading`
  via `useAuthStore`. `ProtectedRoute.tsx:11-27` shows the exemplar read
  pattern (`useShallow`) and the `isLoading` spinner branch — match it.
- `src/pages/NotFoundPage.tsx:15` — `<Link to="/">` (correct automatically once
  `/` becomes role-aware; do not modify NotFoundPage).
- Repo conventions: path alias `@/`, function components with explicit
  `export const`, Persian UI strings, `Spinner` from `@/components/ui/Spinner`.

## Commands you will need

Run all commands inside the execution worktree (your dispatch message names
its path; `node_modules` is already installed there).

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Typecheck | `npx tsc --noEmit`| exit 0, no output   |
| Lint      | `npm run lint`    | exit 0; no NEW errors beyond the 7 pre-existing at f3395fe (4× no-explicit-any, 2× prefer-const, 1× no-useless-escape in persianNumbers.ts) |
| Build     | `npm run build`   | exit 0, `dist/index.html` regenerated |

## Scope

**In scope** (the only files you may modify/create):
- `src/utils/roleHome.ts` (create)
- `src/components/layout/RoleHomeRedirect.tsx` (create)
- `src/router/routes.tsx`
- `src/components/auth/LoginForm.tsx`
- `dist/index.html` (rebuild artifact — AGENTS.md RULE 2)

**Out of scope** (do NOT touch):
- `src/components/layout/Header.tsx` — keep its local mapping as-is.
- `src/components/layout/ProtectedRoute.tsx` — its redirect behavior is correct.
- `src/store/authStore.ts` — no auth-logic changes.
- `src/pages/NotFoundPage.tsx`.

## Git workflow

- Work on the branch named in your dispatch message (shared advisor branch).
- One commit for this whole plan. Message style is conventional commits, e.g.
  `fix(router): send authenticated users to their role dashboard`.
- AGENTS.md RULE 2 is binding: run `npm run build` and include the updated
  `dist/index.html` in the SAME commit as the source change.
- Do NOT push.

## Steps

### Step 1: Create `src/utils/roleHome.ts`

```ts
// Role → dashboard base path. Single source used by routing and the
// login redirect (Header.tsx keeps its local copy for now).
export function roleHome(role: string | null | undefined): string {
  switch (role) {
    case 'admin': return '/admin';
    case 'supervisor': return '/supervisor';
    case 'operator': return '/operator';
    default: return '/login';
  }
}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Create `src/components/layout/RoleHomeRedirect.tsx`

A component that (a) shows the standard full-screen spinner while auth state is
loading, (b) redirects authenticated users with a profile to `roleHome(role)`,
(c) otherwise renders its children (for `/login`) or redirects to `/login`
(for `/`). Model the store read on `ProtectedRoute.tsx:12-18` (useShallow).

```tsx
import { Navigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store/authStore';
import { Spinner } from '@/components/ui/Spinner';
import { roleHome } from '@/utils/roleHome';

/** Wrap a public route: authenticated users are sent to their dashboard. */
export const RedirectIfAuthed = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, profile, isLoading } = useAuthStore(
    useShallow((s) => ({
      isAuthenticated: s.isAuthenticated,
      profile: s.profile,
      isLoading: s.isLoading,
    }))
  );
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size={32} />
      </div>
    );
  }
  if (isAuthenticated && profile) {
    return <Navigate to={roleHome(profile.role)} replace />;
  }
  return <>{children}</>;
};

/** The "/" landing: role dashboard when authed, /login otherwise. */
export const RoleHomeRedirect = () => (
  <RedirectIfAuthed>
    <Navigate to="/login" replace />
  </RedirectIfAuthed>
);
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Wire both into `src/router/routes.tsx`

- Replace `element: <Navigate to="/login" replace />` on the `/` route with
  `element: <RoleHomeRedirect />`.
- On the `/login` route's index child, wrap LoginPage:
  `element: <RedirectIfAuthed><LoginPage /></RedirectIfAuthed>`.
- Add the import. Keep `Navigate` imported only if still used; remove unused
  imports so lint stays clean.

**Verify**: `npx tsc --noEmit` → exit 0 AND `npm run lint` → no new errors.

### Step 4: Honor `state.from` in `src/components/auth/LoginForm.tsx`

At lines 91–103 the post-login redirect is a role switch. Change it to:

```tsx
const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
const home = roleHome(profile.role);
// Only honor the saved location if it belongs to this user's role area —
// otherwise an operator bounced off /admin/... would loop into AccessDenied.
const target =
  from?.pathname && from.pathname.startsWith(home)
    ? `${from.pathname}${from.search ?? ''}`
    : home;
navigate(target, { replace: true });
```

Add `useLocation` to the existing `react-router-dom` import and
`const location = useLocation();` beside the existing `useNavigate()`. Import
`roleHome`. Delete the old switch. Do not use `any` (lint rule
`no-explicit-any` is an error).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 5: Build and commit

`npm run build` → exit 0. Commit source + `dist/index.html` together.

**Verify**: `git status --porcelain` inside the worktree → empty after commit.

## Test plan

No test runner exists for SPA components at f3395fe (`npm test` is a script
checker unrelated to this change and is red at HEAD — do not run it as a gate).
Verification is: tsc, lint (no new errors), build. In your report, state the
three route behaviors implied by the code you wrote: `/` + no session →
`/login`; `/` + admin session → `/admin`; `/login` + operator session →
`/operator`.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0 with no errors beyond the 7 pre-existing
- [ ] `npm run build` exits 0
- [ ] `grep -n "RoleHomeRedirect" src/router/routes.tsx` → 1+ match
- [ ] `grep -n "roleHome" src/components/auth/LoginForm.tsx` → 1+ match
- [ ] `git show --stat HEAD` lists ONLY in-scope files
- [ ] `dist/index.html` committed in the same commit

## STOP conditions

- The excerpts above don't match the code you see (drift).
- `useAuthStore` lacks `isLoading`/`isAuthenticated`/`profile` fields.
- A verification fails twice after a reasonable fix attempt.
- The fix appears to require touching ProtectedRoute or authStore.

## Maintenance notes

- Header.tsx still carries a duplicate role→path map; a follow-up may migrate
  it to `roleHome` (deliberately out of scope to keep this diff minimal).
- If a new role is added, `roleHome` and the route table must both change.
- Reviewer: check the `from`-guard (`startsWith(home)`) — it prevents
  cross-role redirect loops.
