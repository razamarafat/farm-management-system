import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist']);
const MARKERS = [/^<<<<<<< /m, /^=======$/m, /^>>>>>>> /m];
const INCLUDE_EXT = /\.(ts|tsx|js|jsx|css|md|html|json|cjs|mjs)$/i;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
      continue;
    }
    files.push(full);
  }
  return files;
}

const candidates = walk(ROOT).filter((p) => INCLUDE_EXT.test(p));
const conflicts = [];

for (const file of candidates) {
  const txt = readFileSync(file, 'utf8');
  if (MARKERS.some((r) => r.test(txt))) {
    // POSIX-style relative path for portable output (Windows OK).
    conflicts.push(relative(ROOT, file).split(sep).join('/'));
  }
}

if (conflicts.length > 0) {
  console.error('Merge conflict markers found in:');
  for (const f of conflicts) console.error(`- ${f}`);
  process.exit(1);
}

console.log('No merge conflict markers found.');
