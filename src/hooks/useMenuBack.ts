// =====================================================================
// useMenuBack — navigation history at the MENU (section) level.
//
// "Back to previous page" (browser history) is NOT what users want here:
// entering a report inside the reports menu, or a drill-down page inside
// a section, must not change what "previous menu" means. The example
// from the product owner:
//
//   dashboard → reports menu → inventory-stock report → back to the
//   reports list → [back-to-menu] must land on the DASHBOARD (the
//   previous menu), not on the inventory-stock report (previous page).
//
// A "menu" here is the first path segment after the role base
// (/admin, /supervisor, /operator). Sub-routes (consumption/feed,
// inventory/:id/history) belong to their parent menu, so they never
// push a new entry. The reports hub switches between selector and
// report body via component state (no route change at all), which the
// section model naturally ignores.
// =====================================================================
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { roleBase, type Role } from '@/navigation/manifest';

const DASHBOARD_KEY = '__dashboard__';
const MAX_STACK = 40;
const ROLE_SEGMENTS: readonly string[] = ['admin', 'supervisor', 'operator'];

export function roleFromPath(pathname: string): Role | null {
  const first = pathname.split('/').filter(Boolean)[0] ?? '';
  return ROLE_SEGMENTS.includes(first) ? (first as Role) : null;
}

function sectionKeyOf(pathname: string): string {
  // ['admin', 'reports', ...] → 'reports'; ['admin'] → dashboard.
  const segs = pathname.split('/').filter(Boolean);
  return segs[1] ?? DASHBOARD_KEY;
}

function sectionPathOf(role: Role, key: string): string {
  return key === DASHBOARD_KEY ? roleBase(role) : `${roleBase(role)}/${key}`;
}

export function useMenuBackNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const role = roleFromPath(location.pathname);
  const section = sectionKeyOf(location.pathname);

  const stackRef = useRef<string[]>([section]);
  const lastRef = useRef<string>(section);
  // Refs don't re-render; bump forces one whenever the stack mutates so
  // `canGoBackToMenu` reflects reality immediately (e.g. on the very
  // first section change, before the next location-driven render).
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (section === lastRef.current) return; // StrictMode double-run safe
    lastRef.current = section;
    const stack = stackRef.current;
    if (stack[stack.length - 1] !== section) {
      stack.push(section);
      if (stack.length > MAX_STACK) stack.splice(0, stack.length - MAX_STACK);
      bump();
    }
  }, [section]);

  const backToPreviousMenu = useCallback(() => {
    const stack = stackRef.current;
    if (!role || stack.length < 2) return;
    stack.pop();
    const targetKey = stack[stack.length - 1];
    // Pre-seed lastRef so the upcoming location change (back into the
    // previous menu) is not treated as a fresh section push.
    lastRef.current = targetKey;
    bump();
    navigate(sectionPathOf(role, targetKey));
  }, [role, navigate]);

  const canGoBackToMenu =
    !!role && section !== DASHBOARD_KEY && stackRef.current.length >= 2;

  return { canGoBackToMenu, backToPreviousMenu };
}
