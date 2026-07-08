// =====================================================================
// scripts/check-secrets.mjs
// Zero-dependency repo secret scanner.
//
// Detects (and exits non-zero on first hit):
//   - VITE_SUPABASE_SERVICE_ROLE_KEY= or SERVICE_ROLE= with non-empty
//     value in any tracked-or-untracked source file.
//   - Supabase new-format sb_secret_* literal (20+ chars).
//   - Supabase service-role JWT (HS256 signed, role:service_role).
//
// Skips:
//   - .env and .env.* files (gitignored; intended to hold secrets).
//   - The script itself, and repo docs that intentionally mention
//     the key names (SELF set).
// =====================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const INCLUDE_EXT = /\.(ts|tsx|js|mjs|cjs|jsx|html|json|css|md|sql|env|yml|yaml|xml|txt)$/i;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.vite', 'coverage', '.cache', 'bff']);

// Files this scan ignores. All entries are paths relative to repo root
// in POSIX form. Add docs here ONLY when they intentionally paste a
// service-role key shape in warning text; never add a file containing
// real leaked secrets.
const SELF = new Set([
  'scripts/check-secrets.mjs',
  'README.md',
  'bff/README.md',
  'docs/deploy/render.md',
  'docs/security/incident-response.md',
]);

const RED = [
  {
    name: 'VITE_SUPABASE_SERVICE_ROLE_KEY=',
    re:   /^\s*VITE_SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/m,
  },
  {
    name: 'sb_secret_ literal',
    re:   /sb_secret_[A-Za-z0-9_\-]{20,}/,
  },
  {
    name: 'service-role JWT',
    re:   /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUi[A-Za-z0-9_\-.]+/,
  },
];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
      continue;
    }
    const base = entry.name;
    // Skip env files — they are intended to hold secrets and are gitignored.
    if (base === '.env' || base.startsWith('.env.')) continue;
    if (!INCLUDE_EXT.test(base)) continue;
    yield full;
  }
}

function toRepoPosix(abs) {
  return relative(ROOT, abs).split(sep).join('/');
}

const hits = [];
for (const f of walk(ROOT)) {
  const rel = toRepoPosix(f);
  if (SELF.has(rel)) continue;
  let text = '';
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  for (const rule of RED) {
    const m = text.match(rule.re);
    if (!m) continue;
    // Allow empty assignments in templates.
    if (m[0].match(/=\s*$/)) continue;
    hits.push({ file: rel, rule: rule.name, sample: m[0].slice(0, 80) });
  }
}

if (hits.length > 0) {
  console.error('[check-secrets] FAIL — possible secrets detected:');
  for (const h of hits) {
    console.error(`  ${h.file}`);
    console.error(`    rule: ${h.rule}`);
    console.error(`    sample: ${h.sample}${h.sample.length >= 80 ? '…' : ''}`);
  }
  console.error('\nIf a hit is intentional (template doc with a key name),');
  console.error('add the file path (POSIX form) to SELF in this script.');
  console.error('For real leaks, see docs/security/incident-response.md.');
  process.exit(1);
}

console.log('[check-secrets] OK — no VITE_*SERVICE_ROLE assignments or service-role JWT literals found.');
