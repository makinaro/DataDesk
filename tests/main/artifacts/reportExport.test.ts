import { describe, expect, it } from 'vitest';
import {
  buildMarkdownExport,
  buildPrintDocument,
  safeFileStem,
} from '../../../src/main/artifacts/reportExport';
import type { ReportArtifact } from '../../../src/shared/artifacts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '33333333-3333-4333-8333-333333333333';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/></svg>';

const report: ReportArtifact = {
  id: '22222222-2222-4222-8222-222222222222',
  kind: 'report',
  title: 'Sales',
  markdown: `# Sales\n\n[[chart:${A}]]\n\ntext\n\n[[chart:${B.toUpperCase()}]]`,
  chartIds: [A, B],
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('safeFileStem', () => {
  it('removes characters Windows forbids in file names', () => {
    expect(safeFileStem('Q3: sales/region?\u0001 "final"')).toBe('Q3 sales region final');
    expect(safeFileStem('***')).toBe('report');
    expect(safeFileStem('CON')).toBe('CON-report');
    expect(safeFileStem('nul')).toBe('nul-report');
    expect(safeFileStem('Summary...  ')).toBe('Summary');
    expect(safeFileStem('x'.repeat(200))).toHaveLength(80);
  });
});

describe('buildMarkdownExport', () => {
  it('replaces chart refs with sibling SVG image links, case-insensitively', () => {
    const out = buildMarkdownExport(
      report,
      { [A]: 'Units [by] region', [B]: 'Trend' },
      { [A]: SVG, [B]: SVG },
      'my report',
    );
    expect(out.files).toEqual([
      { name: 'my report-chart-1.svg', content: SVG },
      { name: 'my report-chart-2.svg', content: SVG },
    ]);
    expect(out.markdown).toContain('![Units by region](my%20report-chart-1.svg)');
    expect(out.markdown).toContain('![Trend](my%20report-chart-2.svg)');
  });

  it('marks charts that could not be rendered as unavailable', () => {
    const out = buildMarkdownExport(report, { [A]: 'A' }, {}, 's');
    expect(out.files).toEqual([]);
    expect(out.markdown).toContain('*[A: chart not available]*');
    expect(out.markdown).toContain('*[Chart: chart not available]*');
  });

  it('ignores SVGs for charts the stored report does not reference', () => {
    const other = '44444444-4444-4444-8444-444444444444';
    const out = buildMarkdownExport(report, {}, { [other]: SVG }, 's');
    expect(out.files).toEqual([]);
  });
});

describe('buildPrintDocument', () => {
  it('puts a no-script, no-network CSP before the body and escapes the title', () => {
    const html = buildPrintDocument('<b>Sales</b> & "more"', '<p>body</p>');
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1];
    expect(csp).toBe("default-src 'none'; img-src data:; style-src 'unsafe-inline'");
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<body>'));
    expect(html).toContain('<title>&#60;b&#62;Sales&#60;/b&#62; &#38; &#34;more&#34;</title>');
    expect(html).toContain('<body><p>body</p></body>');
  });
});
