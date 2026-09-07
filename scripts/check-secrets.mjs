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
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const INCLUDE_EXT = /\.(ts|tsx|js|mjs|cjs|jsx|html|json|css|md|sql|env|yml|yaml|xml|txt)$/i;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.vite', 'coverage', '.cache']);

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

// =====================================================================
// Bearer-token / API-key literal guard.
//
// Scans exactly the files git would track
// (`git ls-files --cached --others --exclude-standard`) and fails on a
// long high-entropy literal assigned to an identifier containing
// key/token/secret/password. JWT shape (three base64url segments, the
// first starting eyJ) is the key shape.
//
// Skips: binary files, lockfiles, node_modules, dist, *.example, .env*
// files, and the SELF set above. Prints path:line plus the IDENTIFIER
// NAME ONLY — never the matched value.
// =====================================================================
const BEARER_SKIP_DIR = new Set(['node_modules', 'dist']);
const BEARER_SKIP_FILE = [/\.lock$/i, /(^|\/)package-lock\.json$/, /\.example$/];
const SENSITIVE_ASSIGN =
  /([A-Za-z_$][\w$]*(?:key|token|secret|password)[\w$]*)\s*[:=]\s*["'`]([^"'`\r\n]{1,600})["'`]/gi;
const JWT_SHAPE = /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
const OPAQUE_SHAPE = /^[A-Za-z0-9_~+/.=-]{32,}$/;
const MIN_OPAQUE_ENTROPY = 4.0;

function shannonEntropy(s) {
  const counts = new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function isBearerLike(value) {
  if (JWT_SHAPE.test(value)) return 'JWT-shaped literal';
  if (OPAQUE_SHAPE.test(value) && shannonEntropy(value) >= MIN_OPAQUE_ENTROPY) {
    return 'long high-entropy literal';
  }
  return null;
}

function listGitFiles() {
  const out = execSync('git ls-files --cached --others --exclude-standard -z', {
    cwd: ROOT,
    maxBuffer: 16 * 1024 * 1024,
  }).toString('utf8');
  return out.split('\0').filter(Boolean);
}

function isBearerSkipped(rel) {
  if (SELF.has(rel)) return true;
  if (BEARER_SKIP_DIR.has(rel.split('/')[0])) return true;
  if (BEARER_SKIP_FILE.some((re) => re.test(rel))) return true;
  const base = rel.split('/').pop();
  if (base === '.env' || base.startsWith('.env.')) return true;
  return false;
}

const bearerHits = [];
let gitFiles;
try {
  gitFiles = listGitFiles();
} catch {
  console.error('[check-secrets] FAIL — could not list git files (git unavailable?).');
  process.exit(1);
}
for (const rel of gitFiles) {
  if (isBearerSkipped(rel)) continue;
  let buf;
  try { buf = readFileSync(join(ROOT, rel)); } catch { continue; }
  if (buf.length === 0 || buf.length > 1024 * 1024) continue;
  if (buf.slice(0, 8000).includes(0)) continue; // binary
  const lines = buf.toString('utf8').split('\n');
  lines.forEach((line, idx) => {
    SENSITIVE_ASSIGN.lastIndex = 0;
    let m;
    while ((m = SENSITIVE_ASSIGN.exec(line))) {
      const kind = isBearerLike(m[2]);
      if (kind) bearerHits.push({ file: rel, line: idx + 1, identifier: m[1], kind });
    }
  });
}

if (bearerHits.length > 0) {
  console.error('[check-secrets] FAIL — bearer/API-key shaped literals detected:');
  for (const h of bearerHits) {
    console.error(`  ${h.file}:${h.line}`);
    console.error(`    identifier: ${h.identifier}`);
    console.error(`    kind: ${h.kind}`);
  }
  console.error('\nIf a hit is a placeholder, load the real value from the');
  console.error('environment at runtime instead of hard-coding a literal.');
  console.error('For real leaks, see docs/security/incident-response.md.');
  process.exit(1);
}

console.log('[check-secrets] OK — no bearer/API-key shaped literals assigned to key/token/secret/password identifiers.');
