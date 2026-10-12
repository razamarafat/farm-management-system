// =====================================================================
// src/utils/catalogueSync.ts — pure helpers for catalogue-driven assignment.
//
// INTEGRITY MODEL: farm_items rows must always trace back to the global
// `inputs` catalogue by EXACT (normalized) name — several server flows join
// on names (e.g. input usage checks), so a typo'd hand-typed name silently
// breaks them. These helpers let assignment UIs offer ONLY catalogue items
// that are missing on the farm, with the unit locked from the catalogue
// definition. No free-text identity, no unit guessing.
//
// NOTE: farm_items carries no input_id FK (Relationships: [] in
// database.types.ts) — the coupling is name-based. Flagged as a data-model
// gap per AGENTS.md RULE 4; these helpers enforce the convention client-side.
// =====================================================================

import { normalizeName } from '@/utils/helpers';

export interface CatalogueOption {
  id: string;
  name: string;
  default_unit: string;
}

/**
 * Catalogue items (already filtered by category by the caller) that have no
 * farm_items row on this farm (normalized-name compare). Pure — unit-tested.
 */
export function missingCatalogueItems(
  catalogue: CatalogueOption[],
  farmItemNames: Iterable<string>,
): CatalogueOption[] {
  const onFarm = new Set<string>();
  for (const n of farmItemNames) {
    const norm = normalizeName(n);
    if (norm) onFarm.add(norm);
  }
  return catalogue.filter((c) => {
    const norm = normalizeName(c.name);
    return norm !== '' && !onFarm.has(norm);
  });
}
