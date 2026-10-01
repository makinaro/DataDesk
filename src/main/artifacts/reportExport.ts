import { CHART_REF, type ReportArtifact } from '../../shared/artifacts';

/** Device names Windows reserves regardless of extension (CON.md is still CON). */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** A default file name from a model-written title: no path characters, no reserved names. */
export function safeFileStem(title: string): string {
  const stem = Array.from(title)
    .map((ch) => (ch.charCodeAt(0) < 0x20 || '<>:"/\\|?*'.includes(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim()
    .replace(/[. ]+$/, '');
  if (!stem) return 'report';
  return RESERVED.test(stem) ? `${stem}-report` : stem;
}

export interface MarkdownExport {
  markdown: string;
  /** Sibling files (chart SVGs) to write next to the .md file. */
  files: { name: string; content: string }[];
}

/**
 * Markdown export, built only from stored artifacts: the report text plus SVGs main rendered
 * from the stored charts. Each [[chart:<id>]] line becomes an image link to a sibling SVG file.
 */
export function buildMarkdownExport(
  report: ReportArtifact,
  chartTitles: Record<string, string>,
  svgs: Record<string, string>,
  stem: string,
): MarkdownExport {
  const files: MarkdownExport['files'] = [];
  const fileFor = new Map<string, string>();
  report.chartIds.forEach((id, i) => {
    const svg = svgs[id];
    if (svg === undefined) return;
    const name = `${stem}-chart-${String(i + 1)}.svg`;
    fileFor.set(id, name);
    files.push({ name, content: svg });
  });
  const markdown = report.markdown.replace(CHART_REF, (_match, rawId: string) => {
    const id = rawId.toLowerCase();
    const title = (chartTitles[id] ?? 'Chart').replace(/[[\]]/g, '');
    const file = fileFor.get(id);
    return file ? `![${title}](${encodeURI(file)})` : `*[${title}: chart not available]*`;
  });
  return { markdown, files };
}

const PRINT_CSS = `
  body { font: 11pt/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 8pt; }
  h2 { font-size: 14pt; margin: 18pt 0 6pt; border-bottom: 1px solid #ddd; padding-bottom: 2pt; }
  h3 { font-size: 12pt; margin: 14pt 0 4pt; }
  table { border-collapse: collapse; margin: 8pt 0; font-size: 10pt; }
  th, td { border: 1px solid #ccc; padding: 3pt 6pt; text-align: left; }
  th { background: #f3f4f6; }
  code { font-family: Consolas, monospace; font-size: 9.5pt; background: #f3f4f6; padding: 0 2pt; }
  figure { margin: 10pt 0; page-break-inside: avoid; }
  figure img { max-width: 100%; }
  figcaption { font-size: 9pt; color: #555; }
`;

/**
 * The page that gets printed. The renderer supplies only the body; main adds a CSP that allows
 * no scripts, no network and only data: images, and the window prints with JavaScript off.
 */
export function buildPrintDocument(title: string, bodyHtml: string): string {
  const escapedTitle = title.replace(/[<>&"]/g, (c) => `&#${String(c.charCodeAt(0))};`);
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>${escapedTitle}</title><style>${PRINT_CSS}</style></head>
<body>${bodyHtml}</body></html>`;
}
