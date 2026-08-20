# Plan 004: Consolidate confirmations onto ConfirmDialog and harden Modal semantics

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Your reviewer maintains `plans/README.md` — do
> not edit it.
>
> **Drift check (run first)**: `git diff --stat f3395fe..HEAD -- src/components/ui/Modal.tsx src/components/ui/ConfirmDialog.tsx src/pages/InventoryPage.tsx src/pages/FormulaManagementPage.tsx src/components/reports/ReportSavedViews.tsx`
> `ReportSavedViews.tsx` HAS drifted cosmetically since f3395fe (a date-format
> helper changed); the `window.confirm` block is unchanged — verify it matches
> the excerpt and proceed. Any other mismatch: STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: ux (UX-06, UX-08 core)
- **Planned at**: commit `f3395fe`, 2026-07-20

## Why this matters

Deleting a financial transaction — a money-relevant, irreversible action —
uses a native `confirm()` (unstyled, not RTL, thread-blocking), while trivial
actions get the polished `ConfirmDialog`. Two pages hand-roll their own modal
markup, and a stray backdrop tap silently discards a half-filled inventory
form. The shared `Modal` also lacks dialog semantics (`role="dialog"`,
`aria-modal`, labelled title) and closes on any backdrop click with no way for
data-entry forms to opt out. Consolidating onto the existing components fixes
the worst confirmation inconsistencies and gives every dialog in the app the
semantics fix in one place.

## Current state

- `src/components/ui/Modal.tsx` (69 lines, full excerpt of the shell):

```tsx
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-[fadeIn_200ms_ease-out]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'w-[92vw] max-w-[520px] rounded-2xl bg-[var(--c-card)] text-[var(--c-fg)]',
          ...
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)]">
            <h3 className="text-lg font-bold">{title}</h3>
```

  Props: `{ isOpen, onClose, title?, children, footer?, className? }`. Escape
  handling exists (lines 16-27). No `role`, no `aria-modal`, no
  `aria-labelledby`, no focus management, no backdrop opt-out.

- `src/components/ui/ConfirmDialog.tsx` — thin wrapper over Modal with
  `variant?: 'primary' | 'destructive'`, `isLoading?`; exemplar usage at
  `src/pages/InputsPage.tsx:457-470`.

- `src/pages/InventoryPage.tsx:236` (inside `handleDeleteTransaction`):

```tsx
const handleDeleteTransaction = async (id: string) => {
  if (!confirm('آیا از حذف این تراکنش اطمینان دارید؟')) return;

  const success = await deleteTransaction(id);
  if (success) {
    refetchBalances();
    refetchTransactions();
    refetchInitialCheck();
  }
};
```

  Call site: delete button at lines 755-764
  (`onClick={() => handleDeleteTransaction(txn.id)}`). The page already
  imports framer-motion, `Input`, etc.; check whether `ConfirmDialog` is
  imported (it is NOT at f3395fe).

- `src/pages/InventoryPage.tsx:861-868` — hand-rolled add-transaction modal:

```tsx
<motion.div
  ...
  className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
  onClick={() => setShowAddModal(false)}
>
```

  KEEP this modal hand-rolled (converting the whole form is out of scope) but
  remove the backdrop-click dismissal (Step 4).

- `src/pages/FormulaManagementPage.tsx:373-401` — hand-rolled delete dialog
  (full excerpt in repo; backdrop `onClick={() => setDeleteConfirm(null)}`,
  raw buttons, `isSaving` spinner inline). State: `deleteConfirm` holds the
  formula id or null; `handleDelete(deleteConfirm)` performs the delete.

- `src/components/reports/ReportSavedViews.tsx:168-180` — `window.confirm`
  inside the delete icon Button's onClick; component already renders inside a
  `Modal` and has `onDelete(view.id)` available.

- `src/pages/DailySheetPage.tsx`, `src/pages/InputsPage.tsx`,
  `src/pages/SuppliersPage.tsx`, `src/components/layout/Sidebar.tsx`,
  `src/components/users/UserForm.tsx` — existing correct `ConfirmDialog`
  consumers; do not modify.

## Commands you will need

Run inside the execution worktree (deps preinstalled).

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Typecheck | `npx tsc --noEmit`| exit 0              |
| Lint      | `npm run lint`    | exit 0; no NEW errors beyond the 7 pre-existing at f3395fe |
| Build     | `npm run build`   | exit 0              |

## Scope

**In scope**:
- `src/components/ui/Modal.tsx`
- `src/pages/InventoryPage.tsx` (confirm → ConfirmDialog; backdrop opt-out on
  the add modal)
- `src/pages/FormulaManagementPage.tsx` (hand-rolled dialog → ConfirmDialog)
- `src/components/reports/ReportSavedViews.tsx` (window.confirm → ConfirmDialog)
- `dist/index.html` (rebuild artifact)

**Out of scope**:
- `ConfirmDialog.tsx` itself (no API change needed).
- Full conversion of InventoryPage's add modal or FormulaManagementPage's
  form modal to the shared `Modal` component.
- `JalaliDatePicker`, `SearchableSelect`, `SidePanel` accessibility (follow-up).
- Focus-trap implementation (deferred — see Maintenance notes).

## Git workflow

- Shared advisor branch; one commit, e.g.
  `fix(ux): consolidate destructive confirmations; dialog semantics on Modal`.
- Rebuild `dist/index.html` same commit. Do NOT push.

## Steps

### Step 1: Harden `Modal.tsx`

Add to the props: `disableBackdropClose?: boolean`. Changes:

- Backdrop `onClick`: `if (!disableBackdropClose && e.target === e.currentTarget) onClose();`
- Escape handler: also gate on `!disableBackdropClose`? NO — Escape should
  still close (cheap to reopen; only pointer mis-taps are the hazard). Leave
  Escape as-is.
- Dialog semantics on the inner panel div:
  `role="dialog"`, `aria-modal="true"`, and when `title` is present
  `aria-labelledby={titleId}` with `const titleId = useId();` applied to the
  `<h3 id={titleId}>`.
- Initial focus: on open, focus the panel — add `ref` + `tabIndex={-1}` to the
  panel div and `useEffect(() => { if (isOpen) panelRef.current?.focus(); }, [isOpen])`.
  (Full Tab-trapping is deferred; initial focus + Escape + semantics is the
  scoped win.)

**Verify**: `npx tsc --noEmit` → exit 0. `grep -n "role=\"dialog\"" src/components/ui/Modal.tsx` → 1 match.

### Step 2: InventoryPage — native confirm → ConfirmDialog

- Add state: `const [deleteTxnId, setDeleteTxnId] = useState<string | null>(null);`
- Delete button onClick → `setDeleteTxnId(txn.id)`.
- `handleDeleteTransaction` becomes the dialog's `onConfirm` (no `confirm()`;
  operate on `deleteTxnId`, then `setDeleteTxnId(null)`).
- Render near the page root (beside the existing AnimatePresence blocks):

```tsx
<ConfirmDialog
  isOpen={deleteTxnId !== null}
  onClose={() => setDeleteTxnId(null)}
  title="حذف تراکنش"
  message="آیا از حذف این تراکنش اطمینان دارید؟ این عمل قابل بازگشت نیست."
  confirmLabel="حذف"
  cancelLabel="انصراف"
  onConfirm={confirmDeleteTransaction}
  isLoading={isSubmitting}
  variant="destructive"
/>
```

  (`isSubmitting` already comes from `useInventoryMutations` at line 100.)
- Import `ConfirmDialog`.

**Verify**: `grep -cn "confirm('" src/pages/InventoryPage.tsx` → 0.

### Step 3: FormulaManagementPage — hand-rolled dialog → ConfirmDialog

Replace the entire AnimatePresence delete-dialog block (lines 373-401 region)
with a `ConfirmDialog` driven by the existing `deleteConfirm` state:

```tsx
<ConfirmDialog
  isOpen={deleteConfirm !== null}
  onClose={() => setDeleteConfirm(null)}
  title="حذف فرمول"
  message="آیا از حذف این فرمول اطمینان دارید؟ این عمل غیرقابل بازگشت است."
  confirmLabel="حذف"
  cancelLabel="انصراف"
  onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
  isLoading={isSaving}
  variant="destructive"
/>
```

Import `ConfirmDialog`; remove now-unused motion imports ONLY if nothing else
in the file uses them (the form modal still does — check before removing).

**Verify**: `npx tsc --noEmit` → exit 0; the strings «انصراف»/«حذف» in that
region now come from ConfirmDialog only.

### Step 4: InventoryPage add-modal backdrop opt-out

In the hand-rolled add modal (line 861-868 region) remove
`onClick={() => setShowAddModal(false)}` from the backdrop `motion.div` (keep
the inner `stopPropagation` as harmless). The modal already has explicit
انصراف/ثبت buttons in its footer (lines ~960-985), so no close affordance is
lost. Do NOT add new UI.

**Verify**: `grep -n "onClick={() => setShowAddModal(false)}" src/pages/InventoryPage.tsx`
→ only the cancel Button match(es) remain — none on the backdrop div. Report
the remaining match lines.

### Step 5: ReportSavedViews — window.confirm → ConfirmDialog

- Add state `const [pendingDelete, setPendingDelete] = useState<SavedReportView | null>(null);`
- Delete icon onClick → `setPendingDelete(view)`.
- Render a `ConfirmDialog` (title «حذف نما», message
  `` `آیا از حذف «${pendingDelete?.name}» مطمئن هستید؟` ``, destructive) whose
  onConfirm calls `onDelete(pendingDelete.id)` then clears state.
- NOTE this component itself renders inside a `Modal` (z-[70]); ConfirmDialog
  uses the same z-index and portals to `document.body` later in DOM order, so
  it stacks above — no z-index change needed. If it visually stacks under in
  your check of the code, STOP and report rather than adding z-index hacks.
- Import `ConfirmDialog`.

**Verify**: `grep -cn "window.confirm" src/components/reports/ReportSavedViews.tsx` → 0.

### Step 6: Build and commit

`npm run build` → exit 0; commit all in-scope files + `dist/index.html`.

## Test plan

No SPA test runner. Gates: tsc, lint, build, and the greps per step. Report:
(a) count of `confirm(`/`window.confirm` under `src/` after the change
(`grep -rn "window.confirm\|[^.]confirm(" src/ --include="*.tsx"` — expected:
0 relevant matches), (b) that Modal now carries `role="dialog"` +
`aria-modal` + labelled title.

## Done criteria

- [ ] tsc / lint (no new errors) / build all pass
- [ ] No native confirm() remains in src/ (grep evidence)
- [ ] Modal has `role="dialog"`, `aria-modal="true"`, `aria-labelledby` wired
      to the title, initial focus on open, `disableBackdropClose` prop
- [ ] FormulaManagementPage delete flow uses ConfirmDialog with isLoading
- [ ] InventoryPage delete flow uses ConfirmDialog; add-modal backdrop no
      longer dismisses
- [ ] Only in-scope files committed; `dist/index.html` included

## STOP conditions

- Excerpts drifted beyond the noted ReportSavedViews cosmetic change.
- `deleteConfirm` / `handleDelete` in FormulaManagementPage don't have the
  described shapes.
- ConfirmDialog stacking under the saved-views Modal per code analysis.
- Verification fails twice.

## Maintenance notes

- Focus-TRAP (Tab containment) and focus-restore are deliberately deferred;
  a follow-up can add a small trap hook to Modal, which now owns semantics.
- New destructive actions must use ConfirmDialog — reviewers should reject
  new `confirm()` calls.
- If the InventoryPage add modal is ever migrated to the shared Modal, pass
  `disableBackdropClose` there.
