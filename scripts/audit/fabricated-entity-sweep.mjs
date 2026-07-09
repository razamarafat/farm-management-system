import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && line.includes('=') && !line.startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const key = env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(env.VITE_SUPABASE_URL, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const suspiciousTerms = [
  'مرکزی',
  'central',
  'test',
  'demo',
  'sample',
  'default',
  'main farm',
  'تست',
  'دمو',
  'نمونه',
];

const tableSpecs = {
  farms: ['name', 'code', 'address', 'phone'],
  farm_halls: ['name', 'hall_number', 'notes'],
  farm_items: ['name', 'code', 'description', 'unit'],
  farm_feed_formulas: ['name', 'description'],
  suppliers: ['name', 'contact_person', 'phone', 'address'],
  profiles: ['username', 'first_name', 'last_name', 'role'],
};

const publicFields = [
  'id',
  'farm_id',
  'name',
  'code',
  'address',
  'phone',
  'hall_number',
  'notes',
  'item_name',
  'item_code',
  'description',
  'unit',
  'category',
  'formula_name',
  'contact_person',
  'username',
  'first_name',
  'last_name',
  'role',
  'is_active',
  'created_at',
];

function isSuspicious(row, fields) {
  return fields.some((field) => {
    const value = String(row[field] ?? '').toLowerCase();
    return suspiciousTerms.some((term) => value.includes(term.toLowerCase()));
  });
}

function redact(row) {
  return Object.fromEntries(
    publicFields
      .filter((field) => Object.prototype.hasOwnProperty.call(row, field))
      .map((field) => [field, row[field]]),
  );
}

const result = {};

for (const [table, fields] of Object.entries(tableSpecs)) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    result[table] = { error: error.message };
    continue;
  }

  const rows = data ?? [];
  const suspicious = rows.filter((row) => isSuspicious(row, fields));
  result[table] = {
    count: rows.length,
    all: rows.map(redact),
    suspiciousCount: suspicious.length,
    suspicious: suspicious.map(redact),
  };
}

console.log(JSON.stringify(result, null, 2));
