import { parse, View, type Loader } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { compile, type TopLevelSpec } from 'vega-lite';
import type { ResolvedTheme } from '../../shared/appearance';
import type { ChartArtifact } from '../../shared/artifacts';
import { chartConfig } from '../../shared/chartTheme';
import { prepareStoredSpec } from '../../shared/vegaSpec';

const deny = (): Promise<never> =>
  Promise.reject(new Error('External resources are disabled in DataDesk.'));
const denyAllLoader = { load: deny, sanitize: deny, http: deny, file: deny } as unknown as Loader;

/**
 * Renders a stored chart to SVG in main (headless Vega, no DOM). Export files are built from
 * artifacts main itself read and re-sanitized, so it never writes renderer-supplied markup to
 * disk. Vega escapes text and attribute values, so titles and data can't inject markup.
 */
export async function renderChartSvg(
  chart: ChartArtifact,
  theme?: ResolvedTheme,
): Promise<string | null> {
  const prepared = prepareStoredSpec(chart.spec);
  if (!prepared.ok) return null;
  let view: View | undefined;
  try {
    const options = theme ? { config: chartConfig(theme) } : undefined;
    const vegaSpec = compile(prepared.spec as unknown as TopLevelSpec, options).spec;
    view = new View(parse(vegaSpec, undefined, { ast: true }), {
      renderer: 'none',
      expr: expressionInterpreter,
      loader: denyAllLoader,
    });
    return await view.toSVG();
  } catch {
    return null;
  } finally {
    view?.finalize();
  }
}
