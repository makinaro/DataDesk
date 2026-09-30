import { renameSync } from 'node:fs';
import { join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { afterEach, describe, expect, it } from 'vitest';
import { listDatasets, registerDataset } from '../../../src/mcp-server/datasets';
import { QueryTimeoutError } from '../../../src/mcp-server/db/datasetDb';
import { createWorkspace, sqlPath } from '../fixtures';

let ws: ReturnType<typeof createWorkspace> | undefined;
afterEach(() => {
  ws?.cleanup();
  ws = undefined;
});
const policy = { denyDirs: [], maxFileBytes: 1_000_000_000 };

describe('long-lived sessions (review regressions)', () => {
  it('a file removed while the session is alive shows as an error, and recovers when restored', async () => {
    ws = createWorkspace();
    const events = join(ws.dataDir, 'events.ndjson');
    await registerDataset(ws.db, policy, { path: join(ws.dataDir, 'sales.csv') });
    await registerDataset(ws.db, policy, { path: events });

    renameSync(events, `${events}.moved`); // no close(): the session stays alive
    const broken = await listDatasets(ws.db);
    expect(broken.find((d) => d.name === 'events')?.error).toBeTruthy();
    expect(broken.find((d) => d.name === 'sales')).toMatchObject({ rowCount: 60, columnCount: 7 });

    renameSync(`${events}.moved`, events); // e.g. the USB drive is plugged back in
    const healed = await listDatasets(ws.db);
    const events2 = healed.find((d) => d.name === 'events');
    expect(events2?.rowCount).toBe(15);
    expect(events2?.error).toBeUndefined();
  });

  it('stores the row count at registration so listings never scan files', async () => {
    ws = createWorkspace();
    await registerDataset(ws.db, policy, { path: join(ws.dataDir, 'sales.csv') });
    expect(await ws.catalog.get('sales')).toMatchObject({ rowCount: 60 });
  });
});

describe('result size limits', () => {
  it('clips very long text cells and reports how many', async () => {
    ws = createWorkspace({ maxCellChars: 100 });
    const r = await ws.db.query(`SELECT repeat('x', 5000) AS big, 'short' AS small FROM range(3)`);
    expect(r.clippedCells).toBe(3);
    expect(r.rows[0]?.[0]).toMatch(/^x{100}… \[4900 more characters\]$/);
    expect(r.rows[0]?.[1]).toBe('short');
  });

  it('stops reading once the byte budget is reached and marks the result truncated', async () => {
    ws = createWorkspace({ maxResultBytes: 20_000, maxCellChars: 10_000 });
    const r = await ws.db.query(`SELECT repeat('y', 1000) AS s FROM range(100)`);
    expect(r.truncated).toBe(true);
    expect(r.rowCount).toBeGreaterThan(0);
    expect(r.rowCount).toBeLessThan(100);
    expect(JSON.stringify(r.rows).length).toBeLessThanOrEqual(20_000);
  });
});

describe('guard gaps (review regressions)', () => {
  it('rejects IMPORT DATABASE and never reads the directory', async () => {
    ws = createWorkspace();
    await expect(ws.db.query(`IMPORT DATABASE '${sqlPath(ws.dataDir)}'`)).rejects.toThrow();
    await expect(ws.db.query('SELECT 1')).resolves.toMatchObject({ rows: [[1]] });
  });
});

describe('timeouts cover binding, not just execution', () => {
  it('interrupts an expensive bind (full-file CSV sniffing) on a registered large file', async () => {
    ws = createWorkspace({ queryTimeoutMs: 300 });
    const big = join(ws.dataDir, 'big.csv');
    const gen = await DuckDBInstance.create(':memory:');
    const c = await gen.connect();
    await c.run(
      `COPY (SELECT i, md5(i::VARCHAR) AS h, i % 97 AS k FROM range(3000000) t(i)) TO '${sqlPath(big)}' (HEADER)`,
    );
    c.closeSync();
    gen.closeSync();
    await registerDataset(ws.db, policy, { path: big });

    const started = Date.now();
    await expect(
      ws.db.query(`SELECT count(*) FROM read_csv('${sqlPath(big)}', sample_size = -1)`),
    ).rejects.toBeInstanceOf(QueryTimeoutError);
    // Interrupted promptly, rather than after sniffing the whole file.
    expect(Date.now() - started).toBeLessThan(5_000);
    await expect(ws.db.query('SELECT 42')).resolves.toMatchObject({ rows: [[42]] });
  }, 60_000);
});
