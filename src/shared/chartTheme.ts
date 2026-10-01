import type { Config } from 'vega-lite';
import type { ResolvedTheme } from './appearance';

/**
 * Chart colours per theme. Ink colours equal the stylesheet's tokens (a tooling test checks),
 * so charts sit on the page instead of on a white card. The categorical order is the dataviz
 * reference palette: validated for colour-vision deficiency on these exact surfaces, light
 * steps for Light and dark steps for Dark and Slate (DECISIONS D-028). Shared so main renders
 * exported SVGs in the same theme the user sees.
 */
const DARK_CATEGORY = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
];

export const CHART_INK: Record<
  ResolvedTheme,
  { canvas: string; fg: string; muted: string; faint: string; line: string; category: string[] }
> = {
  dark: {
    canvas: '#0e0e0e',
    fg: '#ececec',
    muted: '#b4b4b4',
    faint: '#8a8a8a',
    line: '#262626',
    category: DARK_CATEGORY,
  },
  light: {
    canvas: '#ffffff',
    fg: '#171717',
    muted: '#464646',
    faint: '#6b6b6b',
    line: '#e4e4e3',
    category: [
      '#2a78d6',
      '#eb6834',
      '#1baf7a',
      '#eda100',
      '#e87ba4',
      '#008300',
      '#4a3aa7',
      '#e34948',
    ],
  },
  slate: {
    canvas: '#020617',
    fg: '#f1f5f9',
    muted: '#b4c0d0',
    faint: '#8391a7',
    line: '#1e293b',
    category: DARK_CATEGORY,
  },
};

const FONT = "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif";

/** A Vega-Lite config for a theme: recessive axes and grid, thin marks, tooltips on. */
export function chartConfig(theme: ResolvedTheme): Config {
  const ink = CHART_INK[theme];
  const text = { labelColor: ink.muted, titleColor: ink.muted, labelFont: FONT, titleFont: FONT };
  return {
    background: ink.canvas,
    font: FONT,
    padding: 8,
    view: { stroke: 'transparent' },
    axis: {
      ...text,
      domainColor: ink.line,
      gridColor: ink.line,
      tickColor: ink.line,
      titleFontWeight: 500,
    },
    legend: { ...text, titleFontWeight: 500 },
    header: { ...text },
    title: { color: ink.fg, subtitleColor: ink.muted, font: FONT, fontWeight: 600 },
    range: { category: ink.category },
    mark: { color: ink.category[0], tooltip: true },
    bar: { cornerRadiusEnd: 4 },
    line: { strokeWidth: 2 },
    point: { size: 64 },
  };
}
