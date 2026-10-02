import { parse, View } from 'vega';
import { compile, type TopLevelSpec } from 'vega-lite';
import { describe, expect, it } from 'vitest';
import { CHART_INK, chartConfig } from '../../src/shared/chartTheme';

const values = [
  { make: 'A', price: 1 },
  { make: 'A', price: 5 },
  { make: 'A', price: 9 },
  { make: 'B', price: 2 },
  { make: 'B', price: 7 },
];

async function ruleStrokes(mark: string, theme: 'dark' | 'light' | 'slate'): Promise<string[]> {
  const spec = {
    mark,
    data: { values },
    encoding: {
      x: { field: 'make', type: 'nominal' },
      y: { field: 'price', type: 'quantitative' },
    },
  } as unknown as TopLevelSpec;
  const view = new View(parse(compile(spec, { config: chartConfig(theme) }).spec), {
    renderer: 'none',
  });
  await view.runAsync();
  const svg = await view.toSVG();
  view.finalize();
  return [...svg.matchAll(/class="mark-rule role-mark[^"]*"[^>]*>(<line[^>]*>)/g)].map(
    (m) => /stroke="([^"]*)"/.exec(m[1] ?? '')?.[1] ?? 'none',
  );
}

describe('chartConfig', () => {
  it.each(['boxplot', 'errorbar'])(
    'draws %s whiskers in the theme ink, not black on a dark canvas',
    async (mark) => {
      for (const theme of ['dark', 'light', 'slate'] as const) {
        const strokes = await ruleStrokes(mark, theme);
        expect(strokes.length).toBeGreaterThan(0);
        expect(new Set(strokes)).toEqual(new Set([CHART_INK[theme].muted]));
      }
    },
  );
});
