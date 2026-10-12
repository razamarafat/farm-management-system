// =====================================================================
// src/lib/catalogBus.test.ts — unit tests for the catalog invalidation bus.
//
// Synthetic in-memory assertions only — no DB, no fabricated business
// entities (AGENTS.md RULE 1). Runs in the vitest "node" project.
// =====================================================================

import { describe, expect, it, vi } from 'vitest';
import { bumpCatalog, subscribeCatalog } from './catalogBus';

describe('catalogBus', () => {
  it('notifies subscribers on bump and stops after unsubscribe', () => {
    const seen: string[] = [];
    const unsubscribe = subscribeCatalog((scope) => {
      seen.push(scope);
    });

    bumpCatalog('farm-items');
    bumpCatalog('inputs');

    expect(seen).toEqual(['farm-items', 'inputs']);

    unsubscribe();
    bumpCatalog('farm-items');
    expect(seen).toEqual(['farm-items', 'inputs']);
  });

  it('a throwing subscriber never breaks delivery to others', () => {
    const healthy = vi.fn();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const offBad = subscribeCatalog(bad);
    const offHealthy = subscribeCatalog(healthy);

    expect(() => bumpCatalog('all')).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);

    offBad();
    offHealthy();
  });

  it('defaults to the "all" scope', () => {
    const seen: string[] = [];
    const off = subscribeCatalog((scope) => {
      seen.push(scope);
    });
    bumpCatalog();
    expect(seen).toEqual(['all']);
    off();
  });
});
