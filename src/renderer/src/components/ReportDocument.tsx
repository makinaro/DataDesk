import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReportArtifact } from '../../../shared/artifacts';

/** Splits report markdown into text segments and [[chart:<id>]] lines. */
export function splitReport(
  markdown: string,
): ({ kind: 'md'; text: string } | { kind: 'chart'; id: string })[] {
  const parts: ({ kind: 'md'; text: string } | { kind: 'chart'; id: string })[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.join('').trim()) parts.push({ kind: 'md', text: buffer.join('\n') });
    buffer = [];
  };
  for (const line of markdown.split('\n')) {
    const match = /^\s*\[\[chart:([0-9a-f-]{36})\]\]\s*$/i.exec(line);
    if (match?.[1]) {
      flush();
      parts.push({ kind: 'chart', id: match[1].toLowerCase() });
    } else {
      buffer.push(line);
    }
  }
  flush();
  return parts;
}

/**
 * Markdown safety: react-markdown never renders raw HTML (no rehype-raw), its default URL
 * transform drops javascript:/data: links, and images are removed (reports can't load
 * anything). Links open via the window-open handler (allowlisted hosts in the browser only).
 */
export const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
};

export function ReportMarkdown({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      disallowedElements={['img']}
      unwrapDisallowed
      components={markdownComponents}
    >
      {text}
    </Markdown>
  );
}

function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/**
 * The static report used for PDF export (rendered with renderToStaticMarkup). Charts are
 * pre-rendered SVGs embedded as images: an SVG loaded as an <img> can never run script.
 */
export function ReportDocument({
  report,
  svgs,
  chartTitles,
}: {
  report: ReportArtifact;
  svgs: Record<string, string>;
  chartTitles: Record<string, string>;
}) {
  return (
    <article>
      {splitReport(report.markdown).map((part, i) =>
        part.kind === 'md' ? (
          <ReportMarkdown key={i} text={part.text} />
        ) : (
          <figure key={i}>
            {svgs[part.id] ? (
              <img src={svgDataUrl(svgs[part.id] ?? '')} alt={chartTitles[part.id] ?? 'Chart'} />
            ) : (
              <p>[Chart not available]</p>
            )}
            <figcaption>{chartTitles[part.id] ?? ''}</figcaption>
          </figure>
        ),
      )}
    </article>
  );
}
