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
  title = kind === 'chart' ? chart.title : report.title,
) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('agent:event', payload);
    },
    {
      kind: 'artifact',
      artifactKind: kind,
      id,
      title,
      seq,
      at: Date.now(),
    },
  );
}

async function stubSaveDialog(app: ElectronApplication, filePath: string) {
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path });
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

const LINE_ID = '33333333-3333-4333-8333-333333333333';
const lineChart = {
  ...chart,
  id: LINE_ID,
  title: 'Units over time',
  spec: {
    mark: 'line',
    encoding: {
      x: { field: 'day', type: 'temporal' },
      y: { field: 'units', type: 'quantitative' },
      color: { field: 'region', type: 'nominal' },
    },
    data: {
      values: ['South', 'East'].flatMap((region, r) =>
        [1, 2, 3, 4].map((d) => ({ region, day: `2026-01-0${String(d)}`, units: d * (r + 2) })),
      ),
    },
  },
};

test('charts follow the theme, zoom, filter by legend and save as PNG and SVG', async ({
  electronApp,
  page,
}) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
  });
  const userData = await seedArtifacts(electronApp);
  writeFileSync(
    join(userData, 'artifacts', 'charts', `${LINE_ID}.json`),
    JSON.stringify(lineChart),
  );
  await announce(electronApp, 'chart', LINE_ID, 1000, lineChart.title);

  const figure = page.getByRole('figure', { name: 'Chart: Units over time' });
  const svg = figure.locator('.vega-embed svg');
  await expect(svg).toBeVisible();
  // Dark theme background, not Vega's white.
  expect(await svg.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(14, 14, 14)');

  // Fills the panel, and follows it when a splitter makes the panel narrower.
  const chartWidth = () => svg.evaluate((el) => el.getBoundingClientRect().width);
  const panelWidth = await page
    .getByRole('region', { name: 'Charts & report' })
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(await chartWidth()).toBeGreaterThan(panelWidth * 0.8);
  const wide = await chartWidth();
  await page.getByRole('separator', { name: 'Resize chat' }).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(chartWidth).toBeLessThan(wide - 60);

  const lines = figure.locator('.mark-line path');
  await expect(lines).toHaveCount(2);

  // Zoom: the wheel changes the x axis labels.
  const axisText = () => figure.locator('.mark-text.role-axis-label text').allTextContents();
  const before = await axisText();
  const box = await svg.boundingBox();
  if (!box) throw new Error('chart not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(axisText).not.toEqual(before);

  // Legend filter: clicking "East" fades the South line.
  const label = await figure.locator('.role-legend-label text').first().boundingBox();
  if (!label) throw new Error('legend not visible');
  await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2);
  await expect
    .poll(() =>
      lines.evaluateAll((paths) =>
        paths.map((p) => p.getAttribute('opacity') ?? p.getAttribute('stroke-opacity') ?? '1'),
      ),
    )
    .toContain('0.15');

  // Reset view re-renders from the spec: zoom and filter are gone.
  await figure.getByRole('button', { name: 'Reset view' }).click();
  await expect.poll(axisText).toEqual(before);

  const outDir = join(userData, 'exports');
  mkdirSync(outDir, { recursive: true });
  await stubSaveDialog(electronApp, join(outDir, 'units.png'));
  await figure.getByRole('button', { name: 'Save PNG' }).click();
  await expect(figure.getByRole('status')).toContainText('units.png');
  const png = readFileSync(join(outDir, 'units.png'));
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.length).toBeGreaterThan(2000);

  await stubSaveDialog(electronApp, join(outDir, 'units.svg'));
  await figure.getByRole('button', { name: 'Save SVG' }).click();
  await expect(figure.getByRole('status')).toContainText('units.svg');
  const saved = readFileSync(join(outDir, 'units.svg'), 'utf8');
  expect(saved).toMatch(/^<svg[\s\S]*<\/svg>$/);
  expect(saved).toContain('#0e0e0e');
  expect(saved).not.toMatch(/<script/i);

  expect(violations).toEqual([]);
});

test('horizontal bars are actually drawn, not clipped away', async ({ electronApp, page }) => {
  // Regression: zoom's clip on a bar with the theme's rounded ends left every bar invisible
  // while the paths still existed, so counting paths wasn't enough.
  const id = '55555555-5555-4555-8555-555555555555';
  const userData = await seedArtifacts(electronApp);
  const bars = {
    ...chart,
    id,
    title: 'Accidents by car',
    spec: {
      mark: 'bar',
      encoding: {
        y: { field: 'car', type: 'nominal', sort: '-x' },
        x: { field: 'accidents', type: 'quantitative' },
      },
      data: {
        values: [
          { car: 'GLE', accidents: 69 },
          { car: 'Passat', accidents: 59 },
          { car: 'Mustang', accidents: 57 },
        ],
      },
    },
  };
  writeFileSync(join(userData, 'artifacts', 'charts', `${id}.json`), JSON.stringify(bars));
  await announce(electronApp, 'chart', id, 1000, bars.title);

  const paths = page.locator('.vega-embed .mark-rect path');
  await expect(paths).toHaveCount(3);
  // Hit-testing respects clip-path: a clipped-away bar can't be hit at its own centre.
  const hits = await paths.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
    }),
  );
  expect(hits).toEqual([true, true, true]);
});
