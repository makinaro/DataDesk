import { parse, View, type Loader } from 'vega';
import embed from 'vega-embed';
import { expressionInterpreter } from 'vega-interpreter';
import { compile, type TopLevelSpec } from 'vega-lite';
import type { ResolvedTheme } from '../../../shared/appearance';
import { chartConfig } from '../../../shared/chartTheme';
import { addInteractivity, fillWidth } from './interactive';

/**
 * Vega under DataDesk's strict CSP (no eval, no inline styles, no network):
 * - `ast: true` + vega-interpreter instead of Vega's Function()-based expression codegen
 * - no actions menu (its "Open in Vega Editor" posts the spec and data to an external site)
 * - no injected <style> elements (our stylesheet styles .vega-embed and tooltips)
 * - a loader that refuses every external resource (data urls, images, links)
 * See DECISIONS D-016.
 */
const deny = (): Promise<never> =>
  Promise.reject(new Error('External resources are disabled in DataDesk.'));
export const denyAllLoader = {
  load: deny,
  sanitize: deny,
  http: deny,
  file: deny,
} as unknown as Loader;

export interface RenderedChart {
  dispose: () => void;
  /**
   * Re-fits a container-width chart to its host. Vega only re-measures on window resize, but
   * panels also resize with the splitters.
   */
  fit: (width: number) => void;
  /** The chart as shown (theme, zoom, legend filter), as base64 PNG at 2x. */
  toPngBase64: () => Promise<string>;
}

/** Renders an interactive, themed chart into `el`. */
export async function renderChart(
  el: HTMLElement,
  spec: TopLevelSpec,
  theme: ResolvedTheme,
): Promise<RenderedChart> {
  const prepared = addInteractivity(fillWidth(spec));
  const fitsContainer = (prepared as unknown as { width?: unknown }).width === 'container';
  const result = await embed(el, prepared, {
    config: chartConfig(theme),
    mode: 'vega-lite',
    renderer: 'svg',
    ast: true,
    expr: expressionInterpreter,
    actions: false,
    defaultStyle: false,
    tooltip: { disableDefaultStyle: true },
    loader: denyAllLoader,
  });
  return {
    dispose: () => {
      result.finalize();
    },
    fit: (width) => {
      // The compiled `width` signal is the container's full width (autosize fit-x, padding).
      if (!fitsContainer || width <= 0) return;
      // A resize can land while the view is being finalized; there is nothing left to fit then.
      result.view
        .signal('width', width)
        .runAsync()
        .catch(() => undefined);
    },
    toPngBase64: async () => {
      const url = await result.view.toImageURL('png', 2);
      return url.slice(url.indexOf(',') + 1);
    },
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
