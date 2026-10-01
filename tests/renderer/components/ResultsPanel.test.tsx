import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { splitReport } from '../../../src/renderer/src/components/ReportDocument';
import { ResultsPanel } from '../../../src/renderer/src/components/ResultsPanel';
import { CHART_ID, REPORT_ID, createFakeApi } from '../fakeApi';
import { renderWithProviders } from '../renderApp';

// Vega needs a real layout engine; the CSP-safe embed options are covered by the e2e test.
const vega = vi.hoisted(() => ({
  renderChart: vi.fn((el: HTMLElement) => {
    el.setAttribute('data-rendered', 'true');
    return Promise.resolve(vi.fn());
  }),
  chartToSvg: vi.fn(() => Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')),
}));
vi.mock('../../../src/renderer/src/charts/vega', () => ({
  renderChart: vega.renderChart,
  chartToSvg: vega.chartToSvg,
}));

beforeEach(() => {
  vega.renderChart.mockClear();
  vega.chartToSvg.mockClear();
});

function renderPanel(dataset: string | null = null) {
  return renderWithProviders(<ResultsPanel dataset={dataset} revision={0} />, createFakeApi());
}

describe('splitReport', () => {
  it('splits only whole-line chart refs', () => {
    expect(splitReport(`a\n[[chart:${CHART_ID}]]\nb [[chart:${CHART_ID}]]`)).toEqual([
      { kind: 'md', text: 'a' },
      { kind: 'chart', id: CHART_ID },
      { kind: 'md', text: `b [[chart:${CHART_ID}]]` },
    ]);
  });
});

describe('ResultsPanel', () => {
  it('shows the dataset preview until the analyst creates an artifact, then switches to it', async () => {
    const { api, user } = renderPanel('sales');
    expect(await screen.findByRole('table', { name: 'Preview of sales' })).toBeInTheDocument();

    act(() => {
      api.emit({ kind: 'artifact', artifactKind: 'chart', id: CHART_ID, title: 'Units by region' });
    });
    const chartTab = screen.getByRole('tab', { name: /Units by region/ });
    expect(chartTab).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      expect(vega.renderChart).toHaveBeenCalledTimes(1);
    });
    expect(api.artifacts.getChart).toHaveBeenCalledWith(CHART_ID);
    const [, spec] = vega.renderChart.mock.calls[0] as unknown as [HTMLElement, { data: unknown }];
    expect(spec.data).toEqual({
      values: [
        { region: 'South', units: 14 },
        { region: 'East', units: 7 },
      ],
    });

    await user.click(screen.getByRole('tab', { name: 'Data preview' }));
    expect(screen.getByRole('table', { name: 'Preview of sales' })).toBeInTheDocument();

    // A newer artifact takes over again.
    act(() => {
      api.emit({ kind: 'artifact', artifactKind: 'report', id: REPORT_ID, title: 'Sales summary' });
    });
    expect(screen.getByRole('tab', { name: /Sales summary/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('renders reports as safe markdown with embedded charts', async () => {
    const { api } = renderPanel();
    act(() => {
      api.emit({ kind: 'artifact', artifactKind: 'report', id: REPORT_ID, title: 'Sales summary' });
    });
    const report = await screen.findByRole('article', { name: 'Report: Sales summary' });
    expect(within(report).getByRole('heading', { name: 'Sales summary' })).toBeInTheDocument();
    expect(within(report).getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    await waitFor(() => {
      expect(vega.renderChart).toHaveBeenCalledTimes(1);
    });
    expect(within(report).queryByText(/\[\[chart:/)).not.toBeInTheDocument();
  });

  it('exports Markdown with chart SVGs and PDF with charts inlined as images', async () => {
    const { api, user } = renderPanel();
    act(() => {
      api.emit({ kind: 'artifact', artifactKind: 'report', id: REPORT_ID, title: 'Sales summary' });
    });
    await user.click(await screen.findByRole('button', { name: 'Export Markdown' }));
    await waitFor(() => {
      expect(api.artifacts.exportReport).toHaveBeenCalledTimes(1);
    });
    expect(api.artifacts.exportReport).toHaveBeenLastCalledWith({
      id: REPORT_ID,
      format: 'md',
      svgs: { [CHART_ID]: expect.stringContaining('<svg') as string },
    });
    expect(await screen.findByText(/Saved to/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => {
      expect(api.artifacts.exportReport).toHaveBeenCalledTimes(2);
    });
    const pdf = api.artifacts.exportReport.mock.calls[1]?.[0];
    expect(pdf?.format).toBe('pdf');
    expect(pdf?.bodyHtml).toContain('<h1>Sales summary</h1>');
    expect(pdf?.bodyHtml).toContain('src="data:image/svg+xml;base64,');
    expect(pdf?.bodyHtml).not.toContain('[[chart:');
  });

  it('never renders images or raw HTML from report markdown', async () => {
    const api = createFakeApi();
    api.artifacts.getReport.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        data: {
          id: REPORT_ID,
          kind: 'report',
          title: 'Evil',
          markdown:
            '![x](https://evil.example/t.png)\n\n<img src=x onerror=alert(1)>\n\n[link](javascript:alert(1))',
          chartIds: [],
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      }),
    );
    renderWithProviders(<ResultsPanel dataset={null} revision={0} />, api);
    act(() => {
      api.emit({ kind: 'artifact', artifactKind: 'report', id: REPORT_ID, title: 'Evil' });
    });
    const report = await screen.findByRole('article', { name: 'Report: Evil' });
    expect(report.querySelector('img')).toBeNull();
    expect(report.querySelector('[onerror]')).toBeNull();
    expect(within(report).getByText('link').getAttribute('href') ?? '').not.toContain(
      'javascript:',
    );
  });

  it('shows an error for a chart that no longer exists', async () => {
    const { api } = renderPanel();
    act(() => {
      api.emit({
        kind: 'artifact',
        artifactKind: 'chart',
        id: '99999999-9999-4999-8999-999999999999',
        title: 'Gone',
      });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('That chart no longer exists.');
    expect(vega.renderChart).not.toHaveBeenCalled();
  });
});
