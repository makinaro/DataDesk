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
