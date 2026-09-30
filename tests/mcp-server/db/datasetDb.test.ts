import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Catalog } from '../../../src/mcp-server/catalog';
import {
  DatasetDb,
  DatasetUnavailableError,
  QueryTimeoutError,
} from '../../../src/mcp-server/db/datasetDb';
import { ReadOnlyViolation } from '../../../src/mcp-server/db/readOnlyGuard';
import { createWorkspace, SECRET, sqlPath } from '../fixtures';

let ws: ReturnType<typeof createWorkspace>;

beforeEach(async () => {
  ws = createWorkspace();
  await ws.db.register(ws.entry('sales', 'sales.csv', 'csv'));
});
afterEach(() => {
  ws.cleanup();
});

describe('DatasetDb: registration and querying', () => {
  it('registers CSV, Parquet, JSON and NDJSON as queryable views', async () => {
    await ws.db.register(ws.entry('sales_pq', 'sales.parquet', 'parquet'));
    await ws.db.register(ws.entry('sales_js', 'sales.json', 'json'));
    await ws.db.register(ws.entry('events', 'events.ndjson', 'json'));
    const r = await ws.db.query(
      `SELECT (SELECT count(*) FROM sales) a, (SELECT count(*) FROM sales_pq) b,
              (SELECT count(*) FROM sales_js) c, (SELECT count(*) FROM events) d`,
    );
    expect(r.rows).toEqual([[60, 60, 20, 15]]);
  });

  it('converts BIGINT/DECIMAL to JS numbers and keeps dates as ISO strings', async () => {
    const r = await ws.db.query(
      `SELECT count(*) AS n, sum(units * unit_price)::DECIMAL(18,2) AS revenue, min(order_date) AS first
       FROM sales`,
    );
    expect(r.columns.map((c) => c.type)).toEqual(['BIGINT', 'DECIMAL(18,2)', 'DATE']);
    const [n, revenue, first] = r.rows[0] ?? [];
    expect(n).toBe(60);
    expect(typeof revenue).toBe('number');
    expect(first).toBe('2026-01-01');
  });

  it('caps rows and reports truncation without materializing the full result', async () => {
    const r = await ws.db.query('SELECT * FROM range(1000000)', 10);
    expect(r.rowCount).toBe(10);
    expect(r.truncated).toBe(true);
    const small = await ws.db.query('SELECT * FROM sales', 1000);
    expect(small.rowCount).toBe(60);
    expect(small.truncated).toBe(false);
  });

  it('never returns more than the configured maxRows even if asked', async () => {
    const r = await ws.db.query('SELECT * FROM range(5000)', 1_000_000);
    expect(r.rowCount).toBe(ws.dbOptions.maxRows);
  });

  it('rejects registration of a broken file and leaves the catalog untouched', async () => {
    const bad = { ...ws.entry('broken', 'sales.csv', 'csv'), path: join(ws.dataDir, 'nope.csv') };
    await expect(ws.db.register(bad)).rejects.toBeInstanceOf(DatasetUnavailableError);
    expect((await ws.catalog.list()).map((d) => d.name)).toEqual(['sales']);
  });

  it('keeps a dataset listed with an error when its file disappears later', async () => {
    const { rmSync } = await import('node:fs');
    await ws.db.register(ws.entry('events', 'events.ndjson', 'json'));
    ws.db.close();
    rmSync(join(ws.dataDir, 'events.ndjson'));
    const list = await ws.db.datasets();
    expect(list.find((d) => d.entry.name === 'events')?.error).toBeTruthy();
    await expect(ws.db.assertAvailable('events')).rejects.toBeInstanceOf(DatasetUnavailableError);
    await expect(ws.db.query('SELECT count(*) FROM sales')).resolves.toMatchObject({ rowCount: 1 });
  });

  it('picks up catalog changes made by another server process', async () => {
    const other = new DatasetDb(new Catalog(join(ws.root, 'catalog.json')), ws.dbOptions);
    await other.register(ws.entry('events', 'events.ndjson', 'json'));
    other.close();
    await expect(ws.db.query('SELECT count(*) FROM events')).resolves.toMatchObject({
      rows: [[15]],
    });
  });

  it('cancels long queries with a timeout error, then keeps working', async () => {
    const quick = createWorkspace({ queryTimeoutMs: 200 });
    try {
      await expect(
        quick.db.query('SELECT count(*) FROM range(10000000000) a, range(1000) b'),
      ).rejects.toBeInstanceOf(QueryTimeoutError);
      await expect(quick.db.query('SELECT 42')).resolves.toMatchObject({ rows: [[42]] });
    } finally {
      quick.cleanup();
    }
  });

  it('serializes concurrent queries on the single connection', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => ws.db.query(`SELECT ${String(i)} AS i`)),
    );
    expect(results.map((r) => r.rows[0]?.[0])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('DatasetDb: read-only guard (statement type, not regex)', () => {
  it.each([
    ['SELECT * FROM sales LIMIT 1', 'plain SELECT'],
    ['WITH t AS (SELECT region FROM sales) SELECT count(*) FROM t', 'CTE'],
    ['FROM sales SELECT region LIMIT 1', 'FROM-first'],
    ["SELECT 'DROP TABLE sales; DELETE FROM x' AS s", 'keywords inside a string'],
    ['SELECT 1 -- ; DROP TABLE sales', 'trailing comment with ;'],
    ['SUMMARIZE sales', 'SUMMARIZE'],
    ["PIVOT sales ON region IN ('North', 'South') USING sum(units)", 'PIVOT with explicit IN list'],
    ['SELECT 1;', 'single statement with trailing semicolon'],
  ])('allows %s (%s)', async (sql) => {
    await expect(ws.db.query(sql)).resolves.toBeDefined();
  });

  // Rejected before execution by DuckDB itself while binding (inside prepare): writes through a
  // view are invalid and file access is locked. Either layer is fine; nothing runs.
  it.each([
    ['INSERT INTO sales SELECT * FROM sales', 'INSERT'],
    ['UPDATE sales SET units = 0', 'UPDATE'],
    ['DELETE FROM sales', 'DELETE'],
    ["COPY sales TO 'out.csv'", 'COPY'],
    ["EXPORT DATABASE 'dump'", 'EXPORT'],
  ])('rejects %s (%s) at bind time', async (sql) => {
    await expect(ws.db.query(sql)).rejects.toThrow();
    await expect(ws.db.query('SELECT count(*) FROM sales')).resolves.toMatchObject({
      rows: [[60]],
    });
  });

  it.each([
    ['CREATE TABLE t AS SELECT 1', 'CREATE'],
    ['DROP VIEW sales', 'DROP'],
    ['ALTER VIEW sales RENAME TO s2', 'ALTER'],
    ["ATTACH 'other.duckdb' AS other", 'ATTACH'],
    ['INSTALL httpfs', 'INSTALL'],
    ['LOAD httpfs', 'LOAD'],
    ['SET threads = 1', 'SET'],
    ['RESET threads', 'RESET'],
    ["PRAGMA enable_profiling = 'json'", 'PRAGMA'],
    ['CALL pragma_version()', 'CALL'],
    ['BEGIN TRANSACTION', 'TRANSACTION'],
    ['EXPLAIN ANALYZE SELECT * FROM sales', 'EXPLAIN ANALYZE (executes)'],
    ['PREPARE p AS SELECT 1', 'PREPARE'],
    ['VACUUM', 'VACUUM'],
    ['SELECT 1; DROP VIEW sales', 'stacked statements'],
    ['SELECT 1; SELECT 2', 'two SELECTs'],
    // Statement-form PIVOT without IN expands into several statements (it creates an ENUM type).
    ['PIVOT sales ON region USING sum(units)', 'implicit PIVOT'],
    ['SELECT $1', 'parameters'],
  ])('rejects %s (%s)', async (sql) => {
    await expect(ws.db.query(sql)).rejects.toBeInstanceOf(ReadOnlyViolation);
  });

  it('rejects oversized SQL', async () => {
    await expect(ws.db.query(`SELECT ${'1+'.repeat(20_000)}1`)).rejects.toBeInstanceOf(
      ReadOnlyViolation,
    );
  });

  it('the dataset survives every rejected write attempt', async () => {
    await ws.db.query('SELECT 1').catch(() => undefined);
    await expect(ws.db.query('DROP VIEW sales')).rejects.toThrow();
    await expect(ws.db.query('SELECT count(*) FROM sales')).resolves.toMatchObject({
      rows: [[60]],
    });
  });
});

describe('DatasetDb: lockdown (a SELECT still cannot reach other files)', () => {
  const escapes = (secretPath: string, dataDir: string) => [
    `SELECT content FROM read_text('${sqlPath(secretPath)}')`,
    `SELECT * FROM read_csv('${sqlPath(secretPath)}')`,
    `SELECT * FROM read_text('${sqlPath(dataDir)}/../catalog.json')`,
    `SELECT * FROM read_text('C:/Windows/win.ini')`,
    `SELECT * FROM glob('${sqlPath(dataDir)}/*')`,
    `SELECT * FROM read_json('${sqlPath(dataDir)}/sales.json')`,
    `SELECT * FROM read_blob('${sqlPath(secretPath)}')`,
    `SELECT * FROM query('SELECT content FROM read_text(''${sqlPath(secretPath)}'')')`,
    `SELECT * FROM read_csv('https://example.com/data.csv')`,
  ];

  it('blocks reading unregistered files, globbing, traversal and URLs', async () => {
    for (const sql of escapes(ws.secretPath, ws.dataDir)) {
      const outcome = await ws.db.query(sql).then(
        (r) => JSON.stringify(r.rows),
        (e: unknown) => (e instanceof Error ? e.message : String(e)),
      );
      expect(outcome, sql).not.toContain(SECRET);
      expect(outcome, sql).toMatch(/Permission Error|disabled|not allowed|ReadOnly|Catalog Error/i);
    }
  });

  it('cannot change configuration from a SELECT', async () => {
    const r = await ws.db.query(`SELECT current_setting('enable_external_access') AS v`);
    expect(r.rows).toEqual([[false]]);
    await expect(ws.db.query(`SELECT set_config('threads', '1')`)).rejects.toThrow();
  });

  it('still reads the registered file directly by path', async () => {
    const path = (await ws.catalog.get('sales'))?.path ?? '';
    await expect(
      ws.db.query(`SELECT count(*) FROM read_csv('${sqlPath(path)}')`),
    ).resolves.toMatchObject({ rows: [[60]] });
  });
});
