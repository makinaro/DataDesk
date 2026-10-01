import type { TopLevelSpec } from 'vega-lite';
import { sanitizeVegaLiteSpec } from '../../../shared/vegaSpec';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Re-sanitizes a stored chart spec in the renderer (defense in depth: the artifact file could
 * have been edited) and keeps only inline data rows. The sanitizer also rejects `usermeta`,
 * which vega-embed would otherwise merge over our embed options.
 */
export function prepareSpec(
  stored: Record<string, unknown>,
): { ok: true; spec: TopLevelSpec } | { ok: false; error: string } {
  const data = stored.data;
  const values = isRecord(data) ? data.values : undefined;
  if (!Array.isArray(values) || !values.every(isRecord)) {
    return { ok: false, error: 'Chart data is missing or malformed.' };
  }
  const clean = sanitizeVegaLiteSpec(stored);
  if (!clean.ok) return { ok: false, error: clean.error };
  return { ok: true, spec: { ...clean.spec, data: { values } } as TopLevelSpec };
}
