import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF || 'bjrzrmbqwalzqolvzioq';
const file = process.argv[2];

if (!token) {
  console.error('[apply-sql-file] SUPABASE_ACCESS_TOKEN is required.');
  process.exit(2);
}
if (!file) {
  console.error('[apply-sql-file] Usage: node scripts/audit/apply-sql-file.mjs <sql-file>');
  process.exit(2);
}

const sql = readFileSync(resolve(process.cwd(), file), 'utf8');
const query = `BEGIN;\n${sql}\nCOMMIT;`;
const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

const response = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});

const text = await response.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  payload = text.slice(0, 4000);
}

console.log(`[apply-sql-file] HTTP ${response.status} project=${projectRef} file=${file}`);
console.log(JSON.stringify(payload, null, 2));

if (!response.ok) process.exit(1);
