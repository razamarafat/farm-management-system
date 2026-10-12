// =====================================================================
// src/utils/catalogueSync.test.ts — unit tests for catalogue-driven
// assignment helpers. Synthetic names only — no DB, no fabricated business
// entities (AGENTS.md RULE 1). Runs in the vitest "node" project.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { missingCatalogueItems } from './catalogueSync';

const catalogue = [
  { id: 'c1', name: 'ذرت', default_unit: 'کیلوگرم' },
  { id: 'c2', name: 'سویا', default_unit: 'کیلوگرم' },
  { id: 'c3', name: 'کارتن', default_unit: 'عدد' },
];

describe('missingCatalogueItems', () => {
  it('returns catalogue items with no farm row', () => {
    expect(missingCatalogueItems(catalogue, ['ذرت']).map((c) => c.id)).toEqual(['c2', 'c3']);
  });

  it('matches names after normalization (trim / whitespace collapse)', () => {
    expect(missingCatalogueItems(catalogue, ['  ذرت ', 'سویا', 'کارتن']).map((c) => c.id)).toEqual([]);
  });

  it('returns everything when the farm has no items', () => {
    expect(missingCatalogueItems(catalogue, []).map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('skips catalogue entries with empty normalized names', () => {
    const withBlank = [...catalogue, { id: 'c4', name: '   ', default_unit: 'عدد' }];
    expect(missingCatalogueItems(withBlank, []).map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });
});
