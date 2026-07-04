/**
 * PostgreSQL query helper over Cloudflare Hyperdrive.
 *
 * Hyperdrive is bound to the Worker as `RESONANCE_DB`.  At runtime it
 * provides a standard SQL query interface via Hyperdrive's connection
 * pool.
 *
 * All SQL statements use parameterized bindings (never string
 * interpolation).  The function signatures accept a generic binding and
 * cast internally to the runtime Hyperdrive interface.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Row {
  [column: string]: unknown;
}

/**
 * Minimal query interface exposed by Hyperdrive at runtime.
 * Modeled after the D1 / `@cloudflare/workers-types` Hyperdrive shape.
 */
interface HyperdriveConnection {
  prepare(sql: string): HyperdriveStatement;
}

interface HyperdriveStatement {
  bind(...params: unknown[]): HyperdriveStatement;
  run(): Promise<HyperdriveResult>;
}

interface HyperdriveResult {
  results: Record<string, unknown>[];
  meta?: {
    rows_written?: number;
    changes?: number;
    last_row_id?: number;
  };
}

// ---------------------------------------------------------------------------
// Internal runner
// ---------------------------------------------------------------------------

function conn(db: Hyperdrive): HyperdriveConnection {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db.connect() as unknown as HyperdriveConnection;
}

async function run(
  db: Hyperdrive,
  sql: string,
  params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  const c = conn(db);
  const cursor = c.prepare(sql);
  const bound =
    params.length > 0
      ? cursor.bind(...(params as [unknown, ...unknown[]]))
      : cursor;
  const result = await bound.run();
  return result.results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a parameterized query and return all result rows.
 * Use for SELECT statements.
 */
export async function query(
  db: Hyperdrive,
  sql: string,
  params: unknown[] = [],
): Promise<Row[]> {
  return run(db, sql, params);
}

/**
 * Execute a parameterized query and return the first row, or null if
 * the result set is empty.  Use for SELECT ... LIMIT 1 or PK lookups.
 */
export async function queryOne(
  db: Hyperdrive,
  sql: string,
  params: unknown[] = [],
): Promise<Row | null> {
  const rows = await run(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute a mutation (INSERT / UPDATE / DELETE) and return the number
 * of affected rows.
 */
export async function execute(
  db: Hyperdrive,
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  const c = conn(db);
  const cursor = c.prepare(sql);
  const bound =
    params.length > 0
      ? cursor.bind(...(params as [unknown, ...unknown[]]))
      : cursor;
  const result = await bound.run();
  return (
    result.meta?.rows_written ??
    result.meta?.changes ??
    0
  );
}
