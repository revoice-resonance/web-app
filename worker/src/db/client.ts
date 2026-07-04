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
 *
 * Also exports `getStorageAdapter(env)` — the single factory that returns
 * the correct StorageAdapter implementation based on STORAGE_BACKEND.
 */

import type { StorageAdapter } from './adapter';
import { PgAdapter } from './pg';
import { D1Adapter } from './d1';
import type { Env } from '../types/env';

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

// ---------------------------------------------------------------------------
// StorageAdapter factory
// ---------------------------------------------------------------------------

/**
 * Return the correct StorageAdapter implementation based on the
 * STORAGE_BACKEND env variable (defaults to 'd1').
 *
 * - 'pg' → PgAdapter(RESONANCE_DB)
 * - 'd1' → D1Adapter(RESONANCE_D1, RESONANCE_KV)
 *
 * Throws with a clear message if the required binding is missing.
 */
export function getStorageAdapter(env: Env): StorageAdapter {
  const backend = env.STORAGE_BACKEND || 'd1';

  if (backend === 'pg') {
    if (!env.RESONANCE_DB) {
      throw new Error(
        'STORAGE_BACKEND is "pg" but RESONANCE_DB (Hyperdrive) binding is not configured',
      );
    }
    return new PgAdapter(env.RESONANCE_DB);
  }

  // d1
  if (!env.RESONANCE_D1) {
    throw new Error(
      'STORAGE_BACKEND is "d1" but RESONANCE_D1 (D1Database) binding is not configured',
    );
  }
  return new D1Adapter(env.RESONANCE_D1, env.RESONANCE_KV ?? null);
}
