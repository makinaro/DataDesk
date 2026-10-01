import type { TopLevelSpec } from 'vega-lite';

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const COMPOSITE = ['layer', 'concat', 'hconcat', 'vconcat', 'facet', 'repeat'];

function channel(encoding: Json, name: string): Json | null {
  const def = encoding[name];
  return isObject(def) && typeof def.field === 'string' ? def : null;
}

const continuous = (def: Json | null) =>
  def !== null && (def.type === 'quantitative' || def.type === 'temporal') && !def.bin;

/**
 * Lets a single-view chart without its own width fill the panel (`width: 'container'`).
 * Composite charts keep their sizes: Vega-Lite can't size a facet or concat to a container.
 */
export function fillWidth(spec: TopLevelSpec): TopLevelSpec {
  const s = spec as unknown as Json;
  if (COMPOSITE.some((k) => k in s) || 'width' in s || !('mark' in s)) return spec;
  return { ...s, width: 'container' } as unknown as TopLevelSpec;
}

/**
 * Adds interaction to a single-view chart the model wrote: drag to pan and wheel to zoom when x
 * is continuous (lines, scatter, areas; a zoomed bar chart only distorts), and a clickable
 * legend that fades the other series. Composite specs and specs with their own params are left
 * as they are, so this never fights the model's design. Tooltips come from the theme config.
 */
export function addInteractivity(spec: TopLevelSpec): TopLevelSpec {
  const s = spec as unknown as Json;
  if (COMPOSITE.some((k) => k in s) || 'params' in s || !isObject(s.encoding) || !('mark' in s)) {
    return spec;
  }
  const encoding: Json = { ...s.encoding };
  const params: Json[] = [];
  let mark: unknown = s.mark;

  const x = channel(encoding, 'x');
  if (continuous(x)) {
    const encodings = continuous(channel(encoding, 'y')) ? ['x', 'y'] : ['x'];
    params.push({ name: 'zoom', select: { type: 'interval', encodings }, bind: 'scales' });
    mark = isObject(mark) ? { ...mark, clip: true } : { type: mark, clip: true };
  }

  const color = channel(encoding, 'color');
  if (color && (color.type === 'nominal' || color.type === 'ordinal') && !('opacity' in encoding)) {
    params.push({
      name: 'legend',
      select: { type: 'point', fields: [color.field] },
      bind: 'legend',
    });
    encoding.opacity = { condition: { param: 'legend', value: 1 }, value: 0.15 };
  }

  if (params.length === 0) return spec;
  return { ...s, mark, encoding, params } as unknown as TopLevelSpec;
}
