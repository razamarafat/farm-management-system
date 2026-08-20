# Plan 005: Accessible form kit — Input label/error wiring, Toggle switch semantics, Spinner status, NumericInput with Persian-digit support

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Your reviewer maintains `plans/README.md` — do
> not edit it.
>
> **Drift check (run first)**: `git diff --stat f3395fe..HEAD -- src/components/ui/Input.tsx src/components/ui/Toggle.tsx src/components/ui/Spinner.tsx src/components/consumption/DailySheetTable.tsx src/utils/persianNumbers.ts`
> `persianNumbers.ts` has a 1-char regex change vs f3395fe (an escape removed
> in `formatRial`) — that is expected; anything else mismatching: STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (numeric-input behavior change on the core entry surface)
- **Depends on**: none
- **Category**: ux/accessibility (UX-09, UX-07 core)
- **Planned at**: commit `f3395fe`, 2026-07-20

## Why this matters

The UI kit's primitives are silent to assistive tech and hostile to Persian
keyboards. `Input` renders a `label` with no `htmlFor` (tap-on-label doesn't
focus; screen readers announce nothing) and its error text isn't associated
with the field. `Toggle` is a bare button with no switch semantics. `Spinner`
announces nothing while every page shows one on load. And every numeric field
is `<input type="number">`, which drops the ۰–۹ digits Persian Android
keyboards emit — a per-keystroke failure on the app's core data-entry
workflow, even though `toEnglishDigits` already exists and is used by
`JalaliDatePicker` for exactly this. Fixing the kit fixes most call sites at
once; a `NumericInput` adopted at the daily sheet gives operators typed-digit
safety on the hottest path.

## Current state

- `src/components/ui/Input.tsx` (full 49-line file; key parts):

```tsx
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, label, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--c-fg)] mb-1.5">
            {label}
          </label>
        )}
        <input
          type={type}
          ...
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-[var(--c-destructive)] font-medium">{error}</p>
        )}
```

- `src/components/ui/Toggle.tsx` (full file, 29 lines) — `<button>` with no
  `role`, no `aria-checked`, no accessible name. Consumers (7 files:
  FarmItemsPanel, FarmList, UserCard, UserList, FormulaManagementPage,
  InputsPage, SuppliersPage) pass only `{checked, onChange, disabled}`.
- `src/components/ui/Spinner.tsx` (11 lines) — bare `Loader2` icon.
- `src/utils/persianNumbers.ts:13-17`:

```ts
export function toEnglishDigits(n: string): string {
  if (n === null || n === undefined) return '';
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return n.replace(/[۰-۹]/g, (w) => farsiDigits.indexOf(w).toString());
}
```

  NOTE: covers Persian U+06F0–06F9 only; Arabic-Indic ٠–٩ (U+0660–0669) pass
  through. The new NumericInput must normalize BOTH (do it locally in the
  component; do not change `toEnglishDigits` semantics in this plan).
- `src/components/consumption/DailySheetTable.tsx:38-48` (NumericCell):

```tsx
  return (
    <Input
      type="number"
      value={displayVal || ''}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 text-sm text-left w-24"
      dir="ltr"
      min={0}
      step="0.01"
    />
  );
```

  The `onChange` consumer (`updateLine` in useDailySheet) parses the string
  with `parseFloat` — it must keep receiving ASCII-digit strings.
- `src/pages/DailySheetPage.tsx:325-336` — hall mixer-count input, raw
  `<input type="number" ... className="w-12 h-6 ...">` parsed with
  `parseInt(e.target.value) || 1`.
- Icon-only buttons lacking names (fix in this plan, page-level):
  - `src/pages/InventoryPage.tsx:755-764` — Trash2 delete Button
  - `src/pages/DailySheetPage.tsx:188-190` — ArrowRight back Button
- Conventions: forwardRef + displayName in kit files; `cn()` for classes.

## Commands you will need

Run inside the execution worktree (deps preinstalled).

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Typecheck | `npx tsc --noEmit`| exit 0              |
| Lint      | `npm run lint`    | exit 0; no NEW errors beyond the 7 pre-existing at f3395fe |
| Build     | `npm run build`   | exit 0              |

## Scope

**In scope**:
- `src/components/ui/Input.tsx`
- `src/components/ui/Toggle.tsx`
- `src/components/ui/Spinner.tsx`
- `src/components/ui/NumericInput.tsx` (create)
- `src/components/consumption/DailySheetTable.tsx` (NumericCell → NumericInput)
- `src/pages/DailySheetPage.tsx` (mixer-count input + back-button aria-label)
- `src/pages/InventoryPage.tsx` (delete-button aria-label ONLY)
- `dist/index.html` (rebuild artifact)

**Out of scope**:
- Adopting NumericInput in PurchasesPage / InventoryPage / ReorderPointPage /
  FormulaManagementPage forms (follow-up after the pattern proves out on the
  daily sheet — do NOT convert them now).
- `SearchableSelect` combobox semantics (follow-up).
- `toEnglishDigits` itself (its Arabic-digit gap is tracked elsewhere).
- Toggle consumers (the new aria props are optional).

## Git workflow

- Shared advisor branch; one commit, e.g.
  `feat(a11y): accessible Input/Toggle/Spinner; NumericInput with Persian digits`.
- Rebuild `dist/index.html` same commit. Do NOT push.

## Steps

### Step 1: Wire label + error in `Input.tsx`

- `const autoId = React.useId();` `const inputId = props.id ?? autoId;`
- `const errorId = `${inputId}-error`;`
- `<label htmlFor={inputId} ...>` when label present.
- On the `<input>`: `id={inputId}`, `aria-invalid={error ? true : undefined}`,
  `aria-describedby={error ? errorId : undefined}`.
- Error `<p id={errorId}>`.
- Preserve every existing class and prop passthrough; `props.id` must still
  win when callers pass one.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Switch semantics in `Toggle.tsx`

- Add optional `label?: string` prop (accessible name).
- On the button: `role="switch"`, `aria-checked={checked}`,
  `aria-label={label}` (only when provided).
- No visual change; consumers unchanged.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Status semantics in `Spinner.tsx`

Wrap the icon: `<span role="status" aria-label="در حال بارگذاری" className="inline-flex">…</span>`
(keep the `className`/`size` props on the icon as today; `aria-hidden` on the
icon itself).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Create `src/components/ui/NumericInput.tsx`

A controlled text input that accepts Persian/Arabic/ASCII digits and always
emits ASCII-normalized strings:

```tsx
import * as React from 'react';
import { Input, type InputProps } from './Input';

// Persian ۰-۹ (U+06F0) and Arabic-Indic ٠-٩ (U+0660) → ASCII. Local to this
// component: toEnglishDigits in utils covers only the Persian block.
function normalizeDigits(raw: string): string {
  return raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/٫/g, '.'); // Arabic decimal separator
}

export interface NumericInputProps extends Omit<InputProps, 'type' | 'onChange'> {
  /** Receives the ASCII-normalized string (may be '', '-', or partial like '1.'). */
  onValueChange: (value: string) => void;
  /** Allow decimal point (default true). */
  decimal?: boolean;
}

export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ onValueChange, decimal = true, dir = 'ltr', inputMode, ...props }, ref) => {
    const pattern = decimal ? /^-?\d*(\.\d*)?$/ : /^-?\d*$/;
    return (
      <Input
        ref={ref}
        type="text"
        dir={dir}
        inputMode={inputMode ?? (decimal ? 'decimal' : 'numeric')}
        onChange={(e) => {
          const normalized = normalizeDigits(e.target.value);
          if (normalized === '' || pattern.test(normalized)) {
            onValueChange(normalized);
          }
          // Reject (drop) keystrokes that produce non-numeric text; the
          // controlled value simply doesn't advance.
        }}
        {...props}
      />
    );
  }
);
NumericInput.displayName = 'NumericInput';
```

Note `min`/`step` HTML attributes have no effect on `type="text"` — callers
must not rely on them; the two adopted call sites below already clamp in JS.
Export `InputProps` from `Input.tsx` if it isn't already exported (it is:
`export interface InputProps`).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 5: Adopt in `DailySheetTable.tsx` NumericCell

Replace the `<Input type="number" ...>` return with:

```tsx
<NumericInput
  value={displayVal || ''}
  onValueChange={(v) => onChange(v)}
  className="h-8 text-sm text-left w-24"
  dir="ltr"
/>
```

Remove now-unused `min`/`step` props. The consumer already `parseFloat`s and
clamps negatives (verify: `updateLine` path in `useDailySheet.ts` — if you
find no negative-clamp there, keep a `v.startsWith('-') ? '' : v` guard in the
onValueChange and note it in your report).

**Verify**: `grep -n "type=\"number\"" src/components/consumption/DailySheetTable.tsx` → 0 matches.

### Step 6: Adopt for the mixer-count input in `DailySheetPage.tsx`

Replace the raw `<input type="number" ...>` (lines ~325-336) with a raw
`<input type="text" inputMode="numeric" ...>` that routes through the same
normalization: import `NumericInput` is NOT suitable here (the 48×24px style
is bespoke), so normalize inline:

```tsx
<input
  type="text"
  inputMode="numeric"
  value={hall.mixerCount}
  onChange={(e) => {
    e.stopPropagation();
    const ascii = e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    setHallMixerCount(hall.hallNumber, parseInt(ascii) || 1);
  }}
  onClick={(e) => e.stopPropagation()}
  aria-label={`تعداد میکسر ${hall.hallName}`}
  className="w-12 h-6 px-1 text-center text-xs rounded border border-[var(--c-border)] bg-[var(--c-card)] text-[var(--c-fg)]"
  disabled={!canEdit}
/>
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 7: aria-labels on the two icon-only buttons

- `DailySheetPage.tsx` back Button (~line 188): add `aria-label="بازگشت"`.
- `InventoryPage.tsx` delete Button (~line 757): add `aria-label="حذف تراکنش"`.

**Verify**: both greps return 1 match each.

### Step 8: Build and commit

`npm run build` → exit 0; commit + `dist/index.html`.

## Test plan

No SPA test runner exists. Gates: tsc, lint, build, step greps. In your
report, walk the NumericCell data path: Persian «۱۲.۵» keystrokes →
normalizeDigits → `'12.5'` → `onChange('12.5')` → `parseFloat` → 12.5, and
confirm empty string still means "cleared" (displayVal falls back to 0 → em
dash in read-only render).

## Done criteria

- [ ] tsc / lint (no new errors) / build pass
- [ ] Input: label `htmlFor`, `aria-invalid`, `aria-describedby` wired
- [ ] Toggle: `role="switch"` + `aria-checked`
- [ ] Spinner: `role="status"` wrapper
- [ ] NumericInput exists; DailySheetTable NumericCell uses it
- [ ] Mixer-count input accepts Persian digits and is aria-labelled
- [ ] Only in-scope files committed; `dist/index.html` included

## STOP conditions

- Excerpts drifted (beyond the noted persianNumbers regex char).
- `updateLine`'s parsing rejects plain ASCII decimal strings.
- Converting NumericCell changes the DailySheetTable memoization signature in
  a way that forces edits outside scope.
- Verification fails twice.

## Maintenance notes

- Follow-up (deliberate): adopt NumericInput at the ~10 remaining
  `type="number"` sites (PurchasesPage, InventoryPage modal, ReorderPointPage
  editor, FormulaManagementPage) once the daily-sheet adoption survives a week
  of real entry.
- Reviewer: scrutinize the reject-keystroke branch — it must drop invalid
  input without clearing valid prior state.
- `min`/`step` on converted inputs are inert; validation lives in JS.
