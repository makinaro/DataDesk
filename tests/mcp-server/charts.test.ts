import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtifactInputError, createChart, saveReport } from '../../src/mcp-server/charts';
import { createWorkspace, SECRET, sqlPath } from './fixtures';

let ws: ReturnType<typeof createWorkspace>;
beforeEach(async () => {
  ws = createWorkspace();
  await ws.db.register(ws.entry('sales', 'sales.csv', 'csv'));
});
afterEach(() => {
  ws.cleanup();
});

const spec = {
  mark: 'bar',
  encoding: {
    x: { field: 'region', type: 'nominal' },
    y: { field: 'units', type: 'quantitative' },
  },
};
const sql = 'SELECT region, sum(units) AS units FROM sales GROUP BY 1 ORDER BY 1';

describe('createChart', () => {
  it('stores the sanitized spec with the query rows inlined and returns only a summary', async () => {
    const chart = await createChart(ws.db, ws.artifacts, { title: 'Units by region', sql, spec });
    expect(chart).toMatchObject({ title: 'Units by region', rowCount: 4, truncated: false });
    expect(chart.columns).toEqual(['region', 'units']);
    // The summary for the model carries no data values.
    expect(JSON.stringify(chart)).not.toMatch(/North|South|East|West/);

    const stored = await ws.artifacts.getChart(chart.chartId);
    const values = (stored?.spec.data as { values: unknown[] }).values;
    expect(values).toHaveLength(4);
    expect(values[0]).toMatchObject({ region: 'East' });
    expect(stored?.sql).toBe(sql);
  });

  it('allows more rows than run_sql (chart cap) and flags truncation at that cap', async () => {
    const small = createWorkspace({ chartMaxRows: 50 });
    try {
      await small.db.register(small.entry('sales', 'sales.csv', 'csv'));
      const r = await createChart(small.db, small.artifacts, {
        title: 'All orders',
        sql: 'SELECT order_id, units FROM sales',
        spec: { mark: 'point', encoding: { x: { field: 'order_id', type: 'quantitative' } } },
      });
      expect(r).toMatchObject({ rowCount: 50, truncated: true });
    } finally {
      small.cleanup();
    }
  });

  it('tells the model which columns exist when the spec uses unknown fields', async () => {
    const bad = { ...spec, encoding: { ...spec.encoding, color: { field: 'colour' } } };
    await expect(createChart(ws.db, ws.artifacts, { title: 't', sql, spec: bad })).rejects.toThrow(
      /colour.*Query columns: region, units/,
    );
  });

  it('rejects specs that try to load external data, before running any SQL', async () => {
    const evil = { ...spec, layer: [{ mark: 'bar', data: { url: 'https://evil.example/x.csv' } }] };
    await expect(
      createChart(ws.db, ws.artifacts, { title: 't', sql, spec: evil }),
    ).rejects.toBeInstanceOf(ArtifactInputError);
  });

  it('uses the same SQL guard and lockdown as run_sql', async () => {
    await expect(
      createChart(ws.db, ws.artifacts, { title: 't', sql: 'DROP VIEW sales', spec }),
    ).rejects.toThrow(/Only SELECT/);
    const message = await createChart(ws.db, ws.artifacts, {
      title: 't',
      sql: `SELECT content AS region, 1 AS units FROM read_text('${sqlPath(ws.secretPath)}')`,
      spec,
    }).then(
      () => 'unexpectedly succeeded',
      (e: unknown) => (e instanceof Error ? e.message : 'non-error rejection'),
    );
    expect(message).toMatch(/Permission Error/);
    expect(message).not.toContain(SECRET);
  });

  it('reports empty results and specs Vega-Lite cannot compile', async () => {
    await expect(
      createChart(ws.db, ws.artifacts, { title: 't', sql: `${sql} LIMIT 0`, spec }),
    ).rejects.toThrow(/no rows/);
    await expect(
      createChart(ws.db, ws.artifacts, { title: 't', sql, spec: { ...spec, mark: 'not-a-mark' } }),
    ).rejects.toThrow(/could not compile/);
  });
});

describe('saveReport', () => {
  it('stores a report and records the charts it references', async () => {
    const chart = await createChart(ws.db, ws.artifacts, { title: 'Units', sql, spec });
    const report = await saveReport(ws.artifacts, {
      title: 'Sales overview',
      markdown: `# Sales\n\nWest leads.\n\n[[chart:${chart.chartId}]]\n`,
    });
    expect(report.chartIds).toEqual([chart.chartId]);
    const stored = await ws.artifacts.getReport(report.reportId);
    expect(stored?.markdown).toContain('West leads.');
  });

  it('rejects references to charts that do not exist', async () => {
    await expect(
      saveReport(ws.artifacts, {
        title: 'Bad',
        markdown: '[[chart:11111111-1111-4111-8111-111111111111]]',
      }),
    ).rejects.toThrow(/don't exist/);
  });

  it('stores artifacts as one JSON file per id inside the artifact dir', async () => {
    const chart = await createChart(ws.db, ws.artifacts, { title: 'Units', sql, spec });
    expect(readdirSync(join(ws.root, 'artifacts', 'charts'))).toEqual([`${chart.chartId}.json`]);
    await expect(ws.artifacts.getChart('../../catalog')).rejects.toThrow();
  });
});
