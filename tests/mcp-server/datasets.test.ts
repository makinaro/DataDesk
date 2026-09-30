import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getSchema,
  listDatasets,
  profileColumn,
  registerDataset,
  sampleRows,
} from '../../src/mcp-server/datasets';
import { createWorkspace } from './fixtures';

let ws: ReturnType<typeof createWorkspace>;
const policy = () => ({ denyDirs: [join(ws.root, 'userData')], maxFileBytes: 10_000_000 });

beforeEach(async () => {
  ws = createWorkspace();
  await registerDataset(ws.db, policy(), { path: join(ws.dataDir, 'sales.csv') });
});
afterEach(() => {
  ws.cleanup();
});

describe('registerDataset', () => {
  it('derives a safe name, returns schema and row count', async () => {
    const r = await registerDataset(ws.db, policy(), { path: join(ws.dataDir, 'events.ndjson') });
    expect(r.entry.name).toBe('events');
    expect(r.rowCount).toBe(15);
    expect(r.columns.map((c) => c.name)).toEqual(['event_id', 'kind', 'value']);
  });

  it('honours an explicit name', async () => {
    const r = await registerDataset(ws.db, policy(), {
      path: join(ws.dataDir, 'sales.parquet'),
      name: 'sales_pq',
    });
    expect(r.entry).toMatchObject({ name: 'sales_pq', format: 'parquet' });
  });

  it('refuses files outside the import policy before touching DuckDB', async () => {
    await expect(registerDataset(ws.db, policy(), { path: ws.secretPath })).rejects.toThrow(
      /Unsupported/,
    );
    expect((await ws.catalog.list()).map((d) => d.name)).toEqual(['sales']);
  });
});

describe('listDatasets / getSchema', () => {
  it('summarizes registered datasets', async () => {
    const [sales] = await listDatasets(ws.db);
    expect(sales).toMatchObject({ name: 'sales', format: 'csv', rowCount: 60, columnCount: 7 });
  });

  it('describes columns with DuckDB types', async () => {
    const schema = await getSchema(ws.db, 'sales');
    expect(schema).toContainEqual({ name: 'order_date', type: 'DATE', nullable: true });
    expect(schema).toContainEqual({ name: 'unit_price', type: 'DOUBLE', nullable: true });
  });

  it('errors helpfully for unknown datasets', async () => {
    await expect(getSchema(ws.db, 'nope')).rejects.toThrow(/not registered/);
  });
});

describe('sampleRows', () => {
  it('returns the first N rows, capped by maxRows', async () => {
    expect((await sampleRows(ws.db, 'sales', 5, 'head')).rowCount).toBe(5);
    expect((await sampleRows(ws.db, 'sales', 10_000, 'head')).rowCount).toBe(60);
  });

  it('returns a repeatable random sample', async () => {
    const a = await sampleRows(ws.db, 'sales', 5, 'random');
    const b = await sampleRows(ws.db, 'sales', 5, 'random');
    expect(a.rows).toEqual(b.rows);
    expect(a.rowCount).toBe(5);
  });
});

describe('profileColumn', () => {
  it('profiles a numeric column with nulls', async () => {
    const p = await profileColumn(ws.db, 'sales', 'discount');
    expect(p).toMatchObject({ rowCount: 60, nullCount: 6, nullFraction: 0.1, type: 'DOUBLE' });
    expect(p.mean).toBeTypeOf('number');
    expect(p.quantiles).not.toBeNull();
  });

  it('profiles a categorical column with top values', async () => {
    const p = await profileColumn(ws.db, 'sales', 'region');
    expect(p.distinctCount).toBe(4);
    expect(p.topValues).toHaveLength(4);
    expect(p.topValues.reduce((s, v) => s + v.count, 0)).toBe(60);
    expect(p.mean).toBeNull();
  });

  it('handles column names that need quoting and rejects unknown columns', async () => {
    await expect(profileColumn(ws.db, 'sales', 'units"; DROP VIEW sales; --')).rejects.toThrow(
      /not found/,
    );
    await expect(getSchema(ws.db, 'sales')).resolves.toHaveLength(7);
  });
});
