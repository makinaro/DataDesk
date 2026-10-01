import type { TopLevelSpec } from 'vega-lite';
import { prepareStoredSpec } from '../../../shared/vegaSpec';

/**
 * Re-sanitizes a stored chart spec in the renderer (defense in depth: the artifact file could
 * have been edited). The sanitizer also rejects `usermeta`, which vega-embed would otherwise
 * merge over our embed options.
 */
export function prepareSpec(
  stored: Record<string, unknown>,
): { ok: true; spec: TopLevelSpec } | { ok: false; error: string } {
  const result = prepareStoredSpec(stored);
  return result.ok ? { ok: true, spec: result.spec as unknown as TopLevelSpec } : result;
}
