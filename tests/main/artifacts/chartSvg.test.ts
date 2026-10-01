import { describe, expect, it } from 'vitest';
import { renderChartSvg } from '../../../src/main/artifacts/chartSvg';
import type { ChartArtifact } from '../../../src/shared/artifacts';

const chart = (spec: Record<string, unknown>): ChartArtifact => ({
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'chart',
  title: 'Units',
  spec: spec as ChartArtifact['spec'],
  sql: 'SELECT 1',
  rowCount: 2,
  truncated: false,
  createdAt: '2026-10-01T00:00:00.000Z',
});

const values = [
  { region: '<script>alert(1)</script>', units: 14 },
  { region: 'East', units: 7 },
];

describe('renderChartSvg (headless Vega in main)', () => {
  it('renders a stored chart to SVG with text escaped', async () => {
    const svg = await renderChartSvg(
      chart({
        title: 'JavaScript: usage',
        mark: 'bar',
        encoding: {
          x: { field: 'region', type: 'nominal' },
          y: { field: 'units', type: 'quantitative' },
          color: { condition: { test: 'datum.units > 10', value: 'teal' }, value: 'gray' },
        },
        data: { values },
      }),
    );
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>$/);
    expect(svg).toContain('JavaScript: usage');
    expect(svg).not.toContain('<script');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('refuses tampered or broken artifacts instead of throwing', async () => {
    const tampered = chart({
      mark: 'image',
      encoding: { url: { value: 'https://evil.example/y.png' } },
      data: { values },
    });
    await expect(renderChartSvg(tampered)).resolves.toBeNull();
    await expect(renderChartSvg(chart({ mark: 'nonsense', data: { values } }))).resolves.toBeNull();
    await expect(renderChartSvg(chart({ mark: 'bar' }))).resolves.toBeNull();
  });
});
