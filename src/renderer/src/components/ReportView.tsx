import { useCallback, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useApi } from '../api';
import { prepareSpec } from '../charts/prepareSpec';
import { chartToSvg } from '../charts/vega';
import { useIpcQuery } from '../useIpcQuery';
import { ChartView } from './ChartView';
import { ReportDocument, ReportMarkdown, splitReport } from './ReportDocument';

export function ReportView({ id }: { id: string }) {
  const api = useApi();
  const load = useCallback((key: string) => api.artifacts.getReport(key), [api]);
  const { data: report, error } = useIpcQuery(id, load);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function renderPrintBody(): Promise<string> {
    if (!report) return '';
    const svgs: Record<string, string> = {};
    const chartTitles: Record<string, string> = {};
    for (const chartId of report.chartIds) {
      const chart = await api.artifacts.getChart(chartId);
      if (!chart.ok) continue;
      chartTitles[chartId] = chart.data.title;
      const prepared = prepareSpec(chart.data.spec);
      if (prepared.ok) svgs[chartId] = await chartToSvg(prepared.spec);
    }
    return renderToStaticMarkup(
      <ReportDocument report={report} svgs={svgs} chartTitles={chartTitles} />,
    );
  }

  async function exportAs(format: 'md' | 'pdf') {
    if (!report) return;
    setBusy(true);
    setStatus(null);
    try {
      // Markdown export is built entirely in main from the stored artifacts. For PDF the
      // renderer lays out the page (charts as SVG images) and main prints it locked down.
      const bodyHtml = format === 'pdf' ? await renderPrintBody() : undefined;
      const result = await api.artifacts.exportReport({
        id: report.id,
        format,
        ...(bodyHtml === undefined ? {} : { bodyHtml }),
      });
      if (!result.ok) setStatus(result.error.message);
      else if (result.data.saved) setStatus(`Saved to ${result.data.path ?? ''}`);
    } catch (e) {
      setStatus(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    );
  }
  if (!report) return <p className="text-sm text-faint">Loading report…</p>;

  return (
    <article aria-label={`Report: ${report.title}`} className="space-y-3">
      <div className="flex items-center justify-end gap-2 text-xs">
        {status && <span className="mr-auto text-muted">{status}</span>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportAs('md')}
          className="rounded border border-strong px-2 py-1 hover:bg-raised disabled:opacity-40"
        >
          Export Markdown
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportAs('pdf')}
          className="rounded border border-strong px-2 py-1 hover:bg-raised disabled:opacity-40"
        >
          Export PDF
        </button>
      </div>
      <div className="report-prose">
        {splitReport(report.markdown).map((part, i) =>
          part.kind === 'md' ? (
            <ReportMarkdown key={i} text={part.text} />
          ) : (
            <ChartView key={i} id={part.id} />
          ),
        )}
      </div>
    </article>
  );
}
