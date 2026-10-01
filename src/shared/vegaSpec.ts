/**
 * Vega-Lite specs come from the model, so they are untrusted input to the renderer.
 * This sanitizer (used by the MCP server before storing, and again by the renderer before
 * rendering) allowlists top-level keys and rejects anything that could reach the network or
 * embed data we didn't provide: `url`/`href` anywhere, nested `data`/`datasets`, `usermeta`.
 * The server injects the query rows as the only data source.
 */

const ALLOWED_TOP_LEVEL = new Set([
  'mark',
  'encoding',
  'layer',
  'hconcat',
  'vconcat',
  'concat',
  'columns',
  'facet',
  'spec',
  'repeat',
  'resolve',
  'transform',
  'params',
  'width',
  'height',
  'autosize',
  'title',
  'description',
  'config',
  'projection',
  'view',
  'padding',
  'background',
  'align',
  'bounds',
  'center',
  'spacing',
]);

/** Keys that can load external resources or smuggle in other data. */
const FORBIDDEN_ANYWHERE = new Set(['url', 'href', 'data', 'datasets', 'usermeta', 'loader']);

const MAX_SPEC_CHARS = 50_000;
const MAX_DEPTH = 30;

export type SanitizeResult =
  { ok: true; spec: Record<string, unknown>; fields: string[] } | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sanitizeVegaLiteSpec(input: unknown): SanitizeResult {
  if (!isPlainObject(input)) return { ok: false, error: 'The spec must be a JSON object.' };
  if (JSON.stringify(input).length > MAX_SPEC_CHARS) {
    return {
      ok: false,
      error: `The spec is too large (max ${String(MAX_SPEC_CHARS)} characters).`,
    };
  }

  const spec: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    // The server provides the data; a $schema is implied (we always render as Vega-Lite).
    if (key === 'data' || key === '$schema') continue;
    if (!ALLOWED_TOP_LEVEL.has(key)) {
      return { ok: false, error: `Unsupported top-level key "${key}".` };
    }
    spec[key] = value;
  }
  if (
    !('mark' in spec) &&
    !['layer', 'hconcat', 'vconcat', 'concat', 'facet', 'repeat'].some((k) => k in spec)
  ) {
    return { ok: false, error: 'The spec needs a "mark" (or a layer/concat/facet/repeat).' };
  }

  const fields = new Set<string>();
  const problems: string[] = [];
  const walk = (value: unknown, path: string, depth: number): void => {
    if (depth > MAX_DEPTH) {
      problems.push(`${path} is nested too deeply`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        walk(v, `${path}[${String(i)}]`, depth + 1);
      });
      return;
    }
    if (!isPlainObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_ANYWHERE.has(key)) {
        problems.push(
          `"${key}" is not allowed (${path}.${key}); charts may only use the query result`,
        );
        continue;
      }
      if (key === 'field' && typeof child === 'string') fields.add(child);
      walk(child, `${path}.${key}`, depth + 1);
    }
  };
  walk(spec, 'spec', 0);
  if (problems.length > 0) return { ok: false, error: problems.slice(0, 5).join('; ') };

  return { ok: true, spec, fields: [...fields] };
}

/** Rows as arrays + column names → the objects Vega-Lite expects in data.values. */
export function rowsToValues(columns: string[], rows: unknown[][]): Record<string, unknown>[] {
  return rows.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i] ?? null])));
}
