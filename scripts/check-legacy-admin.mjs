// =====================================================================
// scripts/check-legacy-admin.mjs
// Walks src/ and reports every file that still imports
// `@/lib/supabase-admin`. Designed for gradual rollout:
//
//   - In CI: `npm run check` (the aggregated chain) treats non-zero count
//     as a soft exit code if the count is at or below the
//     `count` recorded in scripts/check-legacy-admin.baseline.json.
//     Any count above baseline, OR any NEW file not listed in
//     baseline.files, fails CI hard.
//
//   - Manually: `npm run check:legacy-admin` always prints the list and
//     exits 0 (advisory).
//
// The intent: once a hook is migrated off `supabaseAdmin`, edit
// scripts/check-legacy-admin.baseline.json (decrement `count`, remove
// the file from `files`). When `count` reaches 0 and
// `src/lib/supabase-admin.ts` has been deleted, remove the baseline
// file too.
// =====================================================================
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const BASELINE_PATH = join(ROOT, 'scripts', 'check-legacy-admin.baseline.json');

const INCLUDE_EXT = /\.(ts|tsx|js|mjs|cjs|jsx)$/i;
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', '.vite', 'coverage', '.cache', 'bff',
]);
const SEARCH = /from\s+['"]@\/lib\/supabase-admin['"]/g;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
      continue;
    }
    if (entry.isFile() && INCLUDE_EXT.test(entry.name)) {
      yield full;
    }
  }
}

function posix(p) {
  return relative(ROOT, p).split(sep).join('/');
}

const hits = [];
for (const file of walk(join(ROOT, 'src'))) {
  const text = readFileSync(file, 'utf8');
  if (SEARCH.test(text)) hits.push(posix(file));
}

// Voluntary skip flag (used by `npm run check` to soften the gate).
const advisory = process.argv.includes('--advisory');

console.log(`\n supabaseAdmin consumers in src/ (${hits.length}):`);
for (const f of hits) console.log('   -', f);

let exitCode = 0;
try {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const baseCount = Number(baseline.count) || 0;
  const baseFiles = new Set((baseline.files || []).map((f) => f.split(' ')[0]));

  if (hits.length > baseCount) {
    console.error(
      `\n FAIL  baseline allows ${baseCount} consumer(s); found ${hits.length}.`
      + ' Migrate a hook or bump scripts/check-legacy-admin.baseline.json.',
    );
    exitCode = 2;
  }
  const unexpectedNew = hits.filter((f) => !baseFiles.has(f));
  if (unexpectedNew.length > 0) {
    console.error(
      `\n FAIL  ${unexpectedNew.length} new file(s) not in baseline.files:`
      + ` ${unexpectedNew.join(', ')}.`
      + ' Add to baseline ONLY if the file must keep importing supabaseAdmin.',
    );
    exitCode = 2;
  }
  if (hits.length === 0) {
    console.log(
      '\n info  src/ no longer references @/lib/supabase-admin.'
      + ' Consider deleting scripts/check-legacy-admin.baseline.json'
      + ' and src/lib/supabase-admin.ts in the next PR.',
    );
  }
} catch (e) {
  console.warn(
    `\n WARN  could not read ${posix(BASELINE_PATH)} (${e.code || e.message}).`
    + ' CI will fail until the baseline file is present.',
  );
  exitCode = 2;
}

if (advisory) {
  console.log('\n running in --advisory mode; ignoring exit code from baseline diff.');
  exitCode = 0;
}

process.exit(exitCode);
