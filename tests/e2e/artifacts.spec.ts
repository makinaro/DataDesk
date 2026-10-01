import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ElectronApplication } from '@playwright/test';
import { expect, test } from './fixtures';

const CHART_ID = '11111111-1111-4111-8111-111111111111';
const REPORT_ID = '22222222-2222-4222-8222-222222222222';

const chart = {
  id: CHART_ID,
  kind: 'chart',
  title: 'Units by region',
  spec: {
    mark: { type: 'bar', tooltip: true },
    encoding: {
      x: { field: 'region', type: 'nominal' },
      y: { field: 'units', type: 'quantitative', axis: { format: ',.0f' } },
      // An expression: proves the interpreter path works without eval under the CSP.
      color: { condition: { test: 'datum.units > 10', value: 'teal' }, value: 'gray' },
    },
    data: {
      values: [
        { region: 'South', units: 14 },
        { region: 'East', units: 7 },
      ],
    },
  },
  sql: 'SELECT region, units FROM sales',
  rowCount: 2,
  truncated: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

const report = {
  id: REPORT_ID,
  kind: 'report',
  title: 'Sales summary',
  markdown: `# Sales summary\n\nSouth leads.\n\n[[chart:${CHART_ID}]]\n\n| region | units |\n|---|---|\n| South | 14 |`,
  chartIds: [CHART_ID],
  createdAt: '2026-10-01T00:00:00.000Z',
};

async function seedArtifacts(app: ElectronApplication): Promise<string> {
  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
  const dir = join(userData, 'artifacts');
  mkdirSync(join(dir, 'charts'), { recursive: true });
  mkdirSync(join(dir, 'reports'), { recursive: true });
  writeFileSync(join(dir, 'charts', `${CHART_ID}.json`), JSON.stringify(chart));
  writeFileSync(join(dir, 'reports', `${REPORT_ID}.json`), JSON.stringify(report));
  return userData;
}

/** Sends an artifact event the way the agent runtime does after create_chart/save_report. */
async function announce(
  app: ElectronApplication,
  kind: 'chart' | 'report',
  id: string,
  seq: number,
) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('agent:event', payload);
    },
    {
      kind: 'artifact',
      artifactKind: kind,
      id,
      title: kind === 'chart' ? chart.title : report.title,
      seq,
      at: Date.now(),
    },
  );
}

async function stubSaveDialog(app: ElectronApplication, filePath: string) {
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (() =>
      Promise.resolve({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
  }, filePath);
}

test('renders an agent chart with Vega under the strict CSP', async ({ electronApp, page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
  });
  await seedArtifacts(electronApp);
  await announce(electronApp, 'chart', CHART_ID, 1000);

  await expect(page.getByRole('tab', { name: /Units by region/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const svg = page.locator('.vega-embed svg');
  await expect(svg).toBeVisible();
  await expect(page.locator('.vega-embed svg .mark-rect path')).toHaveCount(2);
  // No actions menu, no injected <style> elements.
  await expect(page.locator('.vega-embed details')).toHaveCount(0);
  expect(await page.locator('style').count()).toBe(0);
  expect(violations).toEqual([]);
});

test('exports a report to Markdown (with SVG files) and to PDF', async ({ electronApp, page }) => {
  const userData = await seedArtifacts(electronApp);
  await announce(electronApp, 'report', REPORT_ID, 1000);
  const article = page.getByRole('article', { name: 'Report: Sales summary' });
  await expect(article.getByRole('heading', { name: 'Sales summary' })).toBeVisible();
  await expect(article.locator('.vega-embed svg')).toBeVisible();

  const outDir = join(userData, 'exports');
  mkdirSync(outDir, { recursive: true });

  await stubSaveDialog(electronApp, join(outDir, 'sales.md'));
  await page.getByRole('button', { name: 'Export Markdown' }).click();
  await expect(page.getByText(/Saved to .*sales\.md/)).toBeVisible();
  const md = readFileSync(join(outDir, 'sales.md'), 'utf8');
  expect(md).toContain('![Units by region](sales-chart-1.svg)');
  expect(readFileSync(join(outDir, 'sales-chart-1.svg'), 'utf8')).toMatch(/^<svg[\s\S]*<\/svg>$/);

  await stubSaveDialog(electronApp, join(outDir, 'sales.pdf'));
  await page.getByRole('button', { name: 'Export PDF' }).click();
  await expect(page.getByText(/Saved to .*sales\.pdf/)).toBeVisible({ timeout: 20_000 });
  const pdf = readFileSync(join(outDir, 'sales.pdf'));
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(2000);
  // The print window's temp file was cleaned up.
  expect(readdirSync(outDir).sort()).toEqual(['sales-chart-1.svg', 'sales.md', 'sales.pdf']);
});
