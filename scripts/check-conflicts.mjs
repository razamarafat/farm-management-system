import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist']);
const MARKERS = [/^<<<<<<< /m, /^=======$/m, /^>>>>>>> /m];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!IGNORE_DIRS.has(entry)) walk(full, files);
      continue;
    }
    files.push(full);
  }
  return files;
}

const candidates = walk(ROOT).filter((p) => /\.(ts|tsx|js|jsx|css|md|html|json|cjs)$/i.test(p));
const conflicts = [];

for (const file of candidates) {
  const txt = readFileSync(file, 'utf8');
  if (MARKERS.some((r) => r.test(txt))) {
    conflicts.push(file.replace(`${ROOT}/`, ''));
  }
}

if (conflicts.length > 0) {
  console.error('Merge conflict markers found in:');
  for (const f of conflicts) console.error(`- ${f}`);
  process.exit(1);
}

console.log('No merge conflict markers found.');
