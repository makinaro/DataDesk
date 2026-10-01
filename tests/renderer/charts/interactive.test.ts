import type { TopLevelSpec } from 'vega-lite';
import { describe, expect, it } from 'vitest';
import { addInteractivity, fillWidth } from '../../../src/renderer/src/charts/interactive';

const spec = (s: Record<string, unknown>) =>
  ({ data: { values: [] }, ...s }) as unknown as TopLevelSpec;
const json = (s: TopLevelSpec) => s as unknown as Record<string, unknown>;

describe('fillWidth', () => {
  it('lets a single view fill its panel, unless the spec sets a width or is composite', () => {
    expect(json(fillWidth(spec({ mark: 'bar', encoding: {} }))).width).toBe('container');
    for (const input of [
      spec({ mark: 'bar', width: 240 }),
      spec({ facet: { field: 'r' }, spec: { mark: 'bar' } }),
      spec({ vconcat: [{ mark: 'bar' }] }),
    ]) {
      expect(fillWidth(input)).toBe(input);
    }
  });
});

describe('addInteractivity', () => {
  it('zooms and pans along continuous axes, clipping marks to the plot', () => {
    const out = json(
      addInteractivity(
        spec({
          mark: 'line',
          encoding: {
            x: { field: 'day', type: 'temporal' },
            y: { field: 'units', type: 'quantitative' },
          },
        }),
      ),
    );
    expect(out.params).toEqual([
      { name: 'zoom', select: { type: 'interval', encodings: ['x', 'y'] }, bind: 'scales' },
    ]);
    expect(out.mark).toEqual({ type: 'line', clip: true });
  });

  it('does not zoom a bar chart over categories, or a binned histogram', () => {
    for (const x of [
      { field: 'region', type: 'nominal' },
      { field: 'units', type: 'quantitative', bin: true },
    ]) {
      const input = spec({
        mark: { type: 'bar', cornerRadius: 2 },
        encoding: { x, y: { aggregate: 'count', type: 'quantitative' } },
      });
      expect(addInteractivity(input)).toBe(input);
    }
  });

  it('never zooms or clips bars, even horizontal ones with a quantitative x', () => {
    // Clipping a bar under the theme's cornerRadiusEnd hid every bar (a zero-width clip group).
    for (const mark of ['bar', { type: 'bar' }, 'rect', 'arc', 'text']) {
      const input = spec({
        mark,
        encoding: {
          y: { field: 'car', type: 'nominal' },
          x: { field: 'total_accidents', type: 'quantitative' },
        },
      });
      expect(addInteractivity(input)).toBe(input);
    }
  });

  it('leaves composite marks (boxplot, error bars) alone', () => {
    // Regression: a legend param on a boxplot failed with 'Unrecognized signal name: "legend"'.
    for (const mark of [
      'boxplot',
      { type: 'boxplot', extent: 'min-max' },
      'errorbar',
      'errorband',
    ]) {
      const input = spec({
        mark,
        encoding: {
          x: { field: 'year', type: 'quantitative' },
          y: { field: 'price', type: 'quantitative' },
          color: { field: 'make', type: 'nominal' },
        },
      });
      expect(addInteractivity(input)).toBe(input);
    }
  });

  it('makes a categorical legend a filter that fades the other series', () => {
    const out = json(
      addInteractivity(
        spec({
          mark: { type: 'bar' },
          encoding: {
            x: { field: 'region', type: 'nominal' },
            y: { field: 'units', type: 'quantitative' },
            color: { field: 'product', type: 'nominal' },
          },
        }),
      ),
    );
    expect(out.params).toEqual([
      { name: 'legend', select: { type: 'point', fields: ['product'] }, bind: 'legend' },
    ]);
    expect((out.encoding as Record<string, unknown>).opacity).toEqual({
      condition: { param: 'legend', value: 1 },
      value: 0.15,
    });
  });

  it('leaves composite charts and charts with their own params or opacity alone', () => {
    const line = {
      mark: 'line',
      encoding: {
        x: { field: 'day', type: 'temporal' },
        color: { field: 'region', type: 'nominal' },
      },
    };
    for (const input of [
      spec({ layer: [line] }),
      spec({ ...line, params: [{ name: 'p', value: 1 }] }),
      spec({ hconcat: [line] }),
    ]) {
      expect(addInteractivity(input)).toBe(input);
    }
    const withOpacity = json(
      addInteractivity(spec({ ...line, encoding: { ...line.encoding, opacity: { value: 0.5 } } })),
    );
    expect((withOpacity.params as { name: string }[]).map((p) => p.name)).toEqual(['zoom']);
  });
});

describe('every prepared chart actually runs in Vega', () => {
  const values = [
    { make: 'BMW', year: 2019, price: 30, n: 3 },
    { make: 'BMW', year: 2020, price: 34, n: 5 },
    { make: 'Audi', year: 2019, price: 28, n: 4 },
    { make: 'Audi', year: 2020, price: 31, n: 2 },
  ];
  const nominal = (field: string) => ({ field, type: 'nominal' });
  const quant = (field: string) => ({ field, type: 'quantitative' });
  const cases: Record<string, Record<string, unknown>> = {
    'vertical bars': { mark: 'bar', encoding: { x: nominal('make'), y: quant('price') } },
    'horizontal bars': { mark: 'bar', encoding: { y: nominal('make'), x: quant('price') } },
    'stacked bars': {
      mark: 'bar',
      encoding: { x: nominal('year'), y: quant('n'), color: nominal('make') },
    },
    'line with points': {
      mark: { type: 'line', point: true },
      encoding: { x: quant('year'), y: quant('price'), color: nominal('make') },
    },
    area: { mark: 'area', encoding: { x: quant('year'), y: quant('n'), color: nominal('make') } },
    scatter: {
      mark: 'point',
      encoding: { x: quant('n'), y: quant('price'), color: nominal('make') },
    },
    boxplot: {
      mark: 'boxplot',
      encoding: { x: nominal('make'), y: quant('price'), color: nominal('make') },
    },
    errorbar: { mark: 'errorbar', encoding: { x: nominal('make'), y: quant('price') } },
    arc: { mark: 'arc', encoding: { theta: quant('n'), color: nominal('make') } },
  };

  it.each(Object.entries(cases))('%s', async (_name, body) => {
    const { compile } = await import('vega-lite');
    const { parse, View } = await import('vega');
    const { chartConfig } = await import('../../../src/shared/chartTheme');
    const prepared = addInteractivity(fillWidth(spec({ ...body, data: { values } })));
    const vg = compile(prepared, { config: chartConfig('dark') }).spec;
    const view = new View(parse(vg), { renderer: 'none' });
    await expect(view.runAsync()).resolves.toBe(view);
    view.finalize();
  });
});
