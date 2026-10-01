import { parse, View, type Loader } from 'vega';
import embed from 'vega-embed';
import { expressionInterpreter } from 'vega-interpreter';
import { compile, type TopLevelSpec } from 'vega-lite';

/**
 * Vega under DataDesk's strict CSP (no eval, no inline styles, no network):
 * - `ast: true` + vega-interpreter instead of Vega's Function()-based expression codegen
 * - no actions menu (its "Open in Vega Editor" posts the spec and data to an external site)
 * - no injected <style> elements (our stylesheet styles .vega-embed and tooltips)
 * - a loader that refuses every external resource (data urls, images, links)
 * See DECISIONS D-015.
 */
const deny = (): Promise<never> =>
  Promise.reject(new Error('External resources are disabled in DataDesk.'));
export const denyAllLoader = {
  load: deny,
  sanitize: deny,
  http: deny,
  file: deny,
} as unknown as Loader;

/** Renders a chart into `el`; returns a cleanup function. */
export async function renderChart(el: HTMLElement, spec: TopLevelSpec): Promise<() => void> {
  const result = await embed(el, spec, {
    mode: 'vega-lite',
    renderer: 'svg',
    ast: true,
    expr: expressionInterpreter,
    actions: false,
    defaultStyle: false,
    tooltip: { disableDefaultStyle: true },
    loader: denyAllLoader,
  });
  return () => {
    result.finalize();
  };
}

/** Renders a chart to an SVG string off-screen (for Markdown/PDF export). */
export async function chartToSvg(spec: TopLevelSpec): Promise<string> {
  const vegaSpec = compile(spec).spec;
  const view = new View(parse(vegaSpec, undefined, { ast: true }), {
    renderer: 'none',
    expr: expressionInterpreter,
    loader: denyAllLoader,
  });
  try {
    return await view.toSVG();
  } finally {
    view.finalize();
  }
}
