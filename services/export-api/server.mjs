// =====================================================================
// services/export-api/server.mjs
//
// Morvarid-Farm — Report Export API (Fastify 4 + ExcelJS).
//
// Pipeline for POST /api/export/:reportId:
//
//   1. CORS allowlist (handled by @fastify/cors using ALLOWED_ORIGIN).
//   2. JWT verification via supabase.auth.getUser(token). We do NOT
//      fall back to a service-role key — the user's RLS policies
//      apply naturally because every RPC call goes through a
//      per-request scoped client that carries the user's Bearer JWT.
//   3. RBAC lookup — profiles.role + per-report allowedRoles gate.
//   4. RPC dispatch — single-shot for valuation/consumption/aging/
//      pareto; keyset cursor drain for the ledger (RPC max p_limit=500).
//   5. buildReportWorkbook() from xlsx-template.mjs emits the .xlsx
//      business-logic-free — styles, fill, RTL, frozen panes, ABC
//      conditional formatting, totals row + reconciliation, optional
//      Dashboard Summary sheet, are all owned by the template module.
//
//   GET /health → liveness, used by Render.
//
// Security model + Excel Design System spec:
//   docs/reports/excel-export-architecture.md (§3, §12)
// =====================================================================

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

import { reportRegistry } from './registry.mjs';
import { buildReportWorkbook, buildMultiReportWorkbook } from './xlsx-template.mjs';

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Fail fast — never run the export service without explicit keys.
  console.error(
    '[fatal] SUPABASE_URL and SUPABASE_ANON_KEY are both required env vars. ' +
    'See services/export-api/.env.example.',
  );
  process.exit(1);
}

class DisabledRealtimeWebSocket {
  constructor() {
    throw new Error('Realtime is disabled in the export API runtime.');
  }
}

const supabaseRuntimeOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: {
    transport: globalThis.WebSocket || DisabledRealtimeWebSocket,
  },
};

// One client for AUTH verification only. It uses the anon key + a brief
// per-token exchange; it never sees the user's RLS-scoped queries because
// each request gets its own scoped client (see buildScopedClient()).
const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  ...supabaseRuntimeOptions,
});

const fastify = Fastify({
  logger: NODE_ENV !== 'test' ? { level: NODE_ENV === 'production' ? 'info' : 'debug' } : false,
  // Render-friendly body limit. Reports stay under 5MB in practice.
  bodyLimit: 5 * 1024 * 1024,
});

await fastify.register(cors, {
  // In dev, allow any origin if ALLOWED_ORIGIN is empty (handy for the
  // smoke test). In production, lock to the SPA + smoke caller.
  origin: ALLOWED_ORIGIN.length
    ? ALLOWED_ORIGIN
    : NODE_ENV === 'production'
      ? false   // refuse all cross-origin in prod if not allow-listed
      : true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

fastify.get('/health', async () => ({ status: 'ok', service: 'export-api' }));

/**
 * Build a request-scoped Supabase client that forwards the user's JWT.
 * Because Postgres RPCs declared SECURITY INVOKER honor the caller's
 * JWT, RLS policies on the underlying tables apply naturally.
 *
 * IMPORTANT: we use the ANON key here, never the service-role key. The
 * anon key is safe to ship — RLS does the actual gating.
 */
function buildScopedClient(jwt) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    ...supabaseRuntimeOptions,
  });
}

async function verifyJwt(req, reply) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    reply.code(401).send({ error: 'missing_or_malformed_authorization_header' });
    return null;
  }
  const token = match[1].trim();
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    reply.code(401).send({
      error: 'invalid_or_expired_jwt',
      detail: NODE_ENV === 'production'
        ? 'توکن نامعتبر یا منقضی شده — دوباره وارد شوید'
        : error?.message,
    });
    return null;
  }
  return { token, user: data.user };
}

async function fetchProfile(scopedClient, userId) {
  const { data, error } = await scopedClient
    .from('profiles')
    .select('role, farm_id, is_active')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return data;
}

/**
 * Resolve farm_id and item_id UUIDs to their human-readable names so the
 * frozen Parameters band can show what the user filtered on, not opaque
 * UUIDs. Two RLS-scoped, indexed reads; both short-circuit on NULL.
 * Non-fatal — silent fallback to null so the Parameters band still
 * renders even if the join misses (deleted entity etc.).
 */
async function resolveFilterNames(scoped, baseArgs) {
  const result = {};
  if (baseArgs.p_farm_id) {
    const { data } = await scoped
      .from('farms')
      .select('name')
      .eq('id', baseArgs.p_farm_id)
      .maybeSingle();
    result.farm_name = data?.name || null;
  }
  if (baseArgs.p_item_id) {
    const { data } = await scoped
      .from('farm_items')
      .select('name')
      .eq('id', baseArgs.p_item_id)
      .maybeSingle();
    result.item_name = data?.name || null;
  }
  return result;
}

/**
 * Build the Parameters band rows for an export — only NON-empty fields
 * are returned. Order driven by reportDef.parametersOrder. Caller picks
 * which order makes sense for the report (ledger: dates, farm, item,
 * category, txn type).
 *
 * Labels are spelled-out Persian so the audit archive makes sense
 * without a glossary lookup. Date fields are passed through as ISO YYYY-MM-DD
 * (the user already sees Persian dates in the SPA filter chip).
 */
function buildParametersList(reportDef, baseArgs, resolvedNames) {
  const labels = {
    date_from: 'تاریخ شروع',
    date_to:   'تاریخ پایان',
    farm_name: 'فارم',
    item_name: 'کالا',
    category:  'دسته',
    txn_type:  'نوع تراکنش',
  };
  const order = Array.isArray(reportDef.parametersOrder) ? reportDef.parametersOrder : [];
  const out = [];
  for (const key of order) {
    let value = null;
    if (key === 'farm_name')      value = resolvedNames.farm_name || null;
    else if (key === 'item_name') value = resolvedNames.item_name || null;
    else if (key === 'date_from') value = baseArgs.p_date_from || null;
    else if (key === 'date_to')   value = baseArgs.p_date_to   || null;
    else if (key === 'category')  value = baseArgs.p_category || null;
    else if (key === 'txn_type')  value = baseArgs.p_txn_type || null;
    if (value !== null && value !== undefined && value !== '') {
      out.push({ key, label: labels[key] || key, value: String(value) });
    }
  }
  return out;
}

/**
 * Sort rows in-place DESC by the named column, treating NULL/non-numeric
 * as the smallest value (so unpriced rows always sink to the bottom of
 * a "top-N by value" report). Stable on equal values so RPC ordering
 * is preserved.
 */
function sortByColumnDesc(rows, col) {
  return rows.slice().sort((a, b) => {
    const av = Number(a?.[col]);
    const bv = Number(b?.[col]);
    const aValid = Number.isFinite(av);
    const bValid = Number.isFinite(bv);
    if (aValid && bValid) {
      if (bv === av) return 0;
      return bv - av;
    }
    if (aValid) return -1;
    if (bValid) return 1;
    return 0;
  });
}

/**
 * Drain a keyset-paginated RPC (ledger-style) by following the
 * `has_more` flag + passing the last row's cursor back. The SPA section
 * does the same loop; the server does it here so the export reflects
 * the COMPLETE ledger, not just the first 50 rows the user can see.
 *
 * Most other RPCs are non-paginated and ignore the cursor fields.
 */
async function callRpc(scopedClient, rpcName, baseArgs, opts = {}) {
  const { paginated = false, pageSize = 500 } = opts;
  if (!paginated) {
    const { data, error } = await scopedClient.rpc(rpcName, baseArgs);
    if (error) throw error;
    return data ?? [];
  }
  // Keyset drain.
  const out = [];
  let cursorTs = null;
  let cursorId = null;
  let priorBalance = 0;
  // Cap the total exported rows as a circuit-breaker against runaway
  // queries. Far larger than any realistic export (a full year of
  // ledger entries from one farm).
  const MAX_ROWS = 200_000;
  while (out.length < MAX_ROWS) {
    const { data, error } = await scopedClient.rpc(rpcName, {
      ...baseArgs,
      p_cursor_ts: cursorTs,
      p_cursor_id: cursorId,
      p_prior_balance: priorBalance,
      p_limit: pageSize,
    });
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) break;
    const last = data[data.length - 1];
    out.push(...data);
    if (!last?.has_more) break;
    cursorTs = last.txn_ts;
    cursorId = last.id;
    priorBalance = Number(last.running_balance ?? 0);
    if (data.length < pageSize) break;
  }
  return out;
}

// =====================================================================
// Router
// =====================================================================
fastify.post('/api/export/:reportId', async (req, reply) => {
  const { reportId } = req.params;
  const reportDef = reportRegistry[reportId];
  if (!reportDef) {
    reply.code(404).send({ error: 'report_not_found', reportId });
    return;
  }

  const verified = await verifyJwt(req, reply);
  if (!verified) return;

  const scoped = buildScopedClient(verified.token);

  // RBAC — load profile, default to 'operator' if not found (fail-closed).
  const profile = await fetchProfile(scoped, verified.user.id);
  const role = profile?.role || 'operator';
  if (!profile?.is_active) {
    reply.code(403).send({ error: 'account_inactive' });
    return;
  }
  if (!reportDef.allowedRoles.includes(role)) {
    reply.code(403).send({
      error: 'rbac_denied',
      reportId,
      role,
      allowedRoles: reportDef.allowedRoles,
    });
    return;
  }

  // Dispatch the RPC. Ledger is the only paginated RPC.
  const baseArgs = reportDef.mapFilters(req.body || {});
  let rows;
  try {
    rows = await callRpc(scoped, reportDef.rpcName, baseArgs, {
      paginated: reportId === 'RPT_INVENTORY_LEDGER',
      pageSize: 500,
    });
  } catch (err) {
    req.log.error({ err, reportId, rpcName: reportDef.rpcName }, 'rpc_call_failed');
    reply.code(502).send({
      error: 'rpc_call_failed',
      detail: NODE_ENV === 'production'
        ? 'خطا در فراخوانی پایگاه داده — با پشتیبانی تماس بگیرید'
        : err?.message,
    });
    return;
  }

  // Hard cap on row count — protects the export against runaway queries
  // and Excel's slow-open path on huge workbooks. 413 (Payload Too Large)
  // is the semantically correct code — the request itself was well-formed,
  // it just asked for too much data. Avoid 5xx here so monitoring doesn't
  // mis-flag as upstream outage and generic retry-on-5xx logic doesn't
  // re-fire the same doomed query.
  const maxRows = reportDef.maxRows;
  if (typeof maxRows === 'number' && maxRows > 0 && rows.length > maxRows) {
    req.log.warn(
      { reportId, rows: rows.length, maxRows },
      'export_too_large',
    );
    reply.code(413).send({
      error: 'export_too_large',
      reportId,
      rows: rows.length,
      maxRows,
      detail: NODE_ENV === 'production'
        ? 'خروجی بیش از حد بزرگ است — فیلترها را محدودتر کنید'
        : `Row count ${rows.length} exceeds maxRows ${maxRows}`,
    });
    return;
  }

  // Resolve farm_id + item_id UUIDs to names for the Parameters band.
  // Non-fatal — silent fallback if the join misses (deleted entity etc.).
  const resolvedNames = await resolveFilterNames(scoped, baseArgs);
  const parameters = buildParametersList(reportDef, baseArgs, resolvedNames);

  // Build the workbook via the Excel Design System.
  // - opts.dashboard: opt-in Dashboard Summary sheet (sheet 1).
  //   Three-state semantics: if the SPA explicitly says dashboard=true,
  //   honor it; if it explicitly says false, suppress; otherwise fall
  //   back to registry's dashboardByDefault.
  // - opts.lowStockThreshold: forwarded so the template's cellIs CF
  //   rule can render soft-warning fills. Operator override via body.
  // - opts.parameters: NON-empty filter values surfaced in the frozen
  //   Parameters band on the data sheet.
  // - opts.stream: when rows.length ≥ registry.streamingThreshold the
  //   template switches to ExcelJS WorkbookWriter → bounded peak memory.
  // - All other styling is owned by xlsx-template.mjs.
  let rowsForExport = rows;
  if (reportDef.topN && reportDef.topN.column) {
    rowsForExport = sortByColumnDesc(rows, reportDef.topN.column);
  }
  const dashboardEnabled =
    req.body?.dashboard === true ||
    (req.body?.dashboard === undefined && reportDef.dashboardByDefault === true);
  const streamEnabled =
    typeof reportDef.streamingThreshold === 'number'
    && reportDef.streamingThreshold > 0
    && rows.length >= reportDef.streamingThreshold;

  // Cross-item ledger exports — running_balance is partitioned by
  // (farm_id, item_id) so last-row − first-row sum is misleading.
  // Suppress reconciliation for these exports.
  const effectiveReportDef = { ...reportDef, id: reportId };
  if (reportId === 'RPT_INVENTORY_LEDGER' && !baseArgs.p_item_id) {
    effectiveReportDef.reconcileColumn = null;
  }

  // Multi-sheet dispatch — pivot-ready raw + formula-driven analysis.
  // Mirrors the single-sheet pipeline but feeds buildMultiReportWorkbook
  // which owns both sheets. Distinct categories are pre-computed here so
  // the analysis sheet's SUMIFS region is rectangular (one category per
  // row); the template just paints the block.
  let buffer;
  try {
    if (reportDef.kind === 'multi-sheet') {
      const distinctCategories = Array.from(
        new Set(
          rows
            .map((r) => r && r.item_category)
            .filter((v) => v !== null && v !== undefined && v !== ''),
        ),
      ).sort();
      buffer = await buildMultiReportWorkbook(
        effectiveReportDef,
        rowsForExport,
        {
          dashboard: dashboardEnabled,
          parameters,
          stream: streamEnabled,
          analysisRows: distinctCategories.map((category) => ({ category })),
        },
      );
    } else {
      buffer = await buildReportWorkbook(
        effectiveReportDef,
        rowsForExport,
        {
          dashboard: dashboardEnabled,
          lowStockThreshold:
            typeof req.body?.low_stock_threshold === 'number'
              ? req.body.low_stock_threshold
              : reportDef.lowStockThreshold,
          parameters,
          stream: streamEnabled,
        },
      );
    }
  } catch (err) {
    req.log.error({ err, reportId }, 'xlsx_build_failed');
    reply.code(500).send({
      error: 'xlsx_build_failed',
      detail: NODE_ENV === 'production'
        ? 'خطا در ساخت فایل اکسل — با پشتیبانی تماس بگیرید'
        : err?.message,
    });
    return;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `${reportId}_${ts}.xlsx`;
  reply
    .header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    .header('Content-Disposition', `attachment; filename="${fileName}"`)
    .header('X-Export-Row-Count', String(rows.length))
    .send(Buffer.from(buffer));
});

// Catch-all for unknown routes so the SPA / smoke test gets a clean 404.
fastify.setNotFoundHandler((req, reply) => {
  reply.code(404).send({ error: 'route_not_found', path: req.url });
});

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  fastify.log.info(
    `export-api listening on :${PORT} (NODE_ENV=${NODE_ENV}, allow_origins=${ALLOWED_ORIGIN.join(',') || 'dev-only'})`,
  );
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
