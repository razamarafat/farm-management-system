# Archived legacy migrations

These 21 files are the pre-consolidation migration history (July 2026 and earlier).

They were superseded on 2026-08-15 by the consolidated 5-file suite in the parent
directory (`001_schema.sql` … `005_grants.sql`), which reproduces the exact current
production schema — including the security fixes, dead-code removal, and data-integrity
constraints applied during the 2026-08-13/15 audit.

These files are retained for history only. They contain superseded, contradicted, and
over-applied changes (notably `015_advisor_fixes.sql` and its damage-control patches
`016`–`019`), so they must NOT be re-run against the live database.

Summary of the audit history these files represent:
- `001`–`007`: initial schema, admin seed, RPCs, RLS, helpers, missing tables
- `008`–`014`: reporting layer, inventory aging, pareto, suppliers, v3 enhancements
- `015`–`019`: advisor "fixes" and their recursion/aggregate repair patches
- `020`: reporting sales/transfers scope
