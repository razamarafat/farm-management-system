// =====================================================================
// src/hooks/useMenuBack.test.tsx — menu-level back-navigation tests
//
// Pins down the product-owner rule: "منوی قبلی" is the previous top-level
// SECTION, never the previous page. Concretely:
//   dashboard → reports → (select a report / return to the list, which
//   are internal state, no route change) → back-to-menu must land on the
//   DASHBOARD, not on the report that was last open.
//
// Pure in-memory routes (MemoryRouter) — no DB, no network, no
// fabricated business entities (AGENTS.md RULE 1).
// =====================================================================

import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useMenuBackNavigation } from './useMenuBack';

function renderMenuBack(initialPath: string) {
  const navigateRef = { current: null as null | ((to: string) => void) };

  const { result } = renderHook(
    () => {
      const navigate = useNavigate();
      const location = useLocation();
      const back = useMenuBackNavigation();
      useEffect(() => {
        navigateRef.current = navigate;
      }, [navigate]);
      return { ...back, path: location.pathname };
    },
    {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
      ),
    },
  );

  return {
    result,
    goTo: (to: string) => {
      act(() => {
        navigateRef.current?.(to);
      });
    },
  };
}

describe('useMenuBackNavigation', () => {
  it('is hidden on the dashboard and on first entry with no prior menu', () => {
    const { result } = renderMenuBack('/admin');
    expect(result.current.path).toBe('/admin');
    expect(result.current.canGoBackToMenu).toBe(false);

    const deep = renderMenuBack('/admin/inventory');
    expect(deep.result.current.canGoBackToMenu).toBe(false);
  });

  it('appears when a new menu is entered and goes back one menu', () => {
    const { result, goTo } = renderMenuBack('/admin');

    goTo('/admin/reports');
    expect(result.current.canGoBackToMenu).toBe(true);

    act(() => result.current.backToPreviousMenu());
    expect(result.current.path).toBe('/admin');
    expect(result.current.canGoBackToMenu).toBe(false);
  });

  it('ignores sub-pages: consumption → consumption/feed keeps the same previous menu', () => {
    const { result, goTo } = renderMenuBack('/admin');

    goTo('/admin/consumption');
    goTo('/admin/consumption/feed'); // same section — not a new menu
    expect(result.current.canGoBackToMenu).toBe(true);

    act(() => result.current.backToPreviousMenu());
    // Previous MENU is the dashboard, not the consumption sub-page.
    expect(result.current.path).toBe('/admin');
  });

  it('follows the product-owner scenario: dashboard → reports → inventory → back → back', () => {
    const { result, goTo } = renderMenuBack('/admin');

    goTo('/admin/reports');
    goTo('/admin/inventory');
    expect(result.current.path).toBe('/admin/inventory');

    act(() => result.current.backToPreviousMenu());
    expect(result.current.path).toBe('/admin/reports');

    act(() => result.current.backToPreviousMenu());
    expect(result.current.path).toBe('/admin');
    expect(result.current.canGoBackToMenu).toBe(false);
  });

  it('walking back does not re-push the menu you returned to', () => {
    const { result, goTo } = renderMenuBack('/admin');

    goTo('/admin/reports');
    act(() => result.current.backToPreviousMenu());
    // Simulate the reports-list state (selector↔report switch is
    // component state in ReportsHomePage — same route, no push). Here we
    // re-enter reports once more from dashboard to prove the stack is
    // [dashboard, reports], not [dashboard, reports, dashboard, reports].
    goTo('/admin/reports');
    act(() => result.current.backToPreviousMenu());
    expect(result.current.path).toBe('/admin');
  });

  it('works for every role base (supervisor example)', () => {
    const { result, goTo } = renderMenuBack('/supervisor');

    goTo('/supervisor/reports');
    expect(result.current.canGoBackToMenu).toBe(true);
    act(() => result.current.backToPreviousMenu());
    expect(result.current.path).toBe('/supervisor');
  });

  it('ref-mutation guard: back on dashboard is a no-op', () => {
    const { result, goTo } = renderMenuBack('/admin/reports');
    goTo('/admin/reports');
    expect(() => act(() => result.current.backToPreviousMenu())).not.toThrow();
  });
});
