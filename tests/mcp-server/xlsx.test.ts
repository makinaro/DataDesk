import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { registerDataset } from '../../src/mcp-server/datasets';
import { DatasetUnavailableError } from '../../src/mcp-server/db/datasetDb';
import { createWorkspace, EXTENSION_DIR } from './fixtures';

const hasExcel = existsSync(join(EXTENSION_DIR, 'v1.5.6'));
let ws: ReturnType<typeof createWorkspace> | undefined;
afterEach(() => {
  ws?.cleanup();
  ws = undefined;
});
const policy = { denyDirs: [], maxFileBytes: 10_000_000 };

describe('Excel (.xlsx) datasets', () => {
  it('fail clearly when the excel extension is not available, without breaking other datasets', async () => {
    ws = createWorkspace({ extensionDir: undefined });
    await registerDataset(ws.db, policy, { path: join(ws.dataDir, 'sales.csv') });
    await expect(
      registerDataset(ws.db, policy, { path: join(ws.dataDir, 'sales.xlsx') }),
    ).rejects.toBeInstanceOf(DatasetUnavailableError);
    await expect(ws.db.query('SELECT count(*) FROM sales')).resolves.toMatchObject({
      rows: [[60]],
    });
  });

  // Run `npm run duckdb:extensions` once to enable these (CI does it before tests).
  it.skipIf(!hasExcel)('registers an .xlsx sheet and queries it under lockdown', async () => {
    ws = createWorkspace({ extensionDir: EXTENSION_DIR });
    const r = await registerDataset(ws.db, policy, {
      path: join(ws.dataDir, 'sales.xlsx'),
      name: 'orders',
      sheet: 'Orders',
    });
    expect(r.rowCount).toBe(25);
    expect(r.entry).toMatchObject({ format: 'xlsx', sheet: 'Orders' });
    // Excel has no integer type: whole numbers arrive as DOUBLE.
    expect(r.columns.find((c) => c.name === 'units')?.type).toBe('DOUBLE');
    const q = await ws.db.query('SELECT count(DISTINCT region) FROM orders');
    expect(q.rows).toEqual([[4]]);
    // Lockdown still applies with the extension loaded.
    await expect(
      ws.db.query(`SELECT * FROM read_text('${ws.secretPath.split('\\').join('/')}')`),
    ).rejects.toThrow(/Permission Error/);
  });
});
