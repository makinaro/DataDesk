import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AgentProvider, useAgent } from '../../../src/renderer/src/agent/AgentProvider';
import { useResultTabs } from '../../../src/renderer/src/results/useResultTabs';
import { ApiProvider } from '../../../src/renderer/src/api';
import { AppearanceProvider } from '../../../src/renderer/src/appearance/AppearanceProvider';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { splitReport } from '../../../src/renderer/src/components/ReportDocument';
import { ResultsPanel } from '../../../src/renderer/src/components/ResultsPanel';
import { CHART_ID, REPORT_ID, createFakeApi } from '../fakeApi';
import { renderWithProviders } from '../renderApp';

// Vega needs a real layout engine; the CSP-safe embed options are covered by the e2e test.
const vega = vi.hoisted(() => ({
  renderChart: vi.fn((el: HTMLElement, _spec: unknown, theme: string) => {
    el.setAttribute('data-rendered', theme);
    return Promise.resolve({
      dispose: vi.fn(),
      toPngBase64: () => Promise.resolve('iVBORw0KGgo='),
    });
  }),
  chartToSvg: vi.fn(() => Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')),
}));
vi.mock('../../../src/renderer/src/charts/vega', () => ({
  renderChart: vega.renderChart,
  chartToSvg: vega.chartToSvg,
}));

/** Owns the tabs the way App does. */
function HostedPanel({ dataset, revision }: { dataset: string | null; revision: number }) {
  const { state } = useAgent();
  const [tabs, setTabs] = useResultTabs(state.artifacts, dataset, null);
  return <ResultsPanel dataset={dataset} revision={revision} tabs={tabs} setTabs={setTabs} />;
}

beforeEach(() => {
  vega.renderChart.mockClear();
  vega.chartToSvg.mockClear();
});

function renderPanel(dataset: string | null = null) {
  return renderWithProviders(<HostedPanel dataset={dataset} revision={0} />, createFakeApi());
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

describe('ChartView toolbar', () => {
  async function openChart() {
    const result = renderPanel('sales');
    act(() => {
      result.api.emit({
        kind: 'artifact',
        artifactKind: 'chart',
        id: CHART_ID,
        title: 'Units by region',
      });
    });
    await waitFor(() => {
      expect(vega.renderChart).toHaveBeenCalledTimes(1);
    });
    return { ...result, figure: screen.getByRole('figure', { name: 'Chart: Units by region' }) };
  }

  it('renders in the current theme', async () => {
    await openChart();
    expect(vega.renderChart.mock.calls[0]?.[2]).toBe('dark');
  });

  it('saves a PNG of what is on screen and an SVG that main renders in the theme', async () => {
    const { api, user, figure } = await openChart();
    await user.click(within(figure).getByRole('button', { name: 'Save PNG' }));
    expect(api.artifacts.exportChart).toHaveBeenCalledWith({
      id: CHART_ID,
      format: 'png',
      pngBase64: 'iVBORw0KGgo=',
    });
    expect(await within(figure).findByRole('status')).toHaveTextContent(
      'Saved to C:/out/chart.png',
    );

    await user.click(within(figure).getByRole('button', { name: 'Save SVG' }));
    expect(api.artifacts.exportChart).toHaveBeenLastCalledWith({
      id: CHART_ID,
      format: 'svg',
      theme: 'dark',
    });
  });

  it('Reset view draws the chart again from its spec', async () => {
    const { user, figure } = await openChart();
    await user.click(within(figure).getByRole('button', { name: 'Reset view' }));
    await waitFor(() => {
      expect(vega.renderChart).toHaveBeenCalledTimes(2);
    });
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

  it('exports Markdown via main only, and PDF with charts inlined as images', async () => {
    const { api, user } = renderPanel();
    act(() => {
      api.emit({ kind: 'artifact', artifactKind: 'report', id: REPORT_ID, title: 'Sales summary' });
    });
    await user.click(await screen.findByRole('button', { name: 'Export Markdown' }));
    await waitFor(() => {
      expect(api.artifacts.exportReport).toHaveBeenCalledTimes(1);
    });
    expect(api.artifacts.exportReport).toHaveBeenLastCalledWith({ id: REPORT_ID, format: 'md' });
    expect(vega.chartToSvg).not.toHaveBeenCalled();
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
            '![x](https://evil.example/t.png)\n\n<img src=x onerror=alert(1)>\n\n[link](javascript:alert(1)) [site](https://github.com/x)',
          chartIds: [],
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      }),
    );
    renderWithProviders(<HostedPanel dataset={null} revision={0} />, api);
    act(() => {
      api.emit({ kind: 'artifact', artifactKind: 'report', id: REPORT_ID, title: 'Evil' });
    });
    const report = await screen.findByRole('article', { name: 'Report: Evil' });
    expect(report.querySelector('img')).toBeNull();
    expect(report.querySelector('[onerror]')).toBeNull();
    expect(report.querySelector('a')).toBeNull(); // links are unwrapped to their text
    expect(within(report).getByText(/link site/)).toBeInTheDocument();
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

  it('auto-shows new artifacts again after a conversation reset', () => {
    const { api } = renderPanel();
    act(() => {
      api.emit({ kind: 'artifact', artifactKind: 'chart', id: CHART_ID, title: 'Units by region' });
      api.emit({ kind: 'conversation_reset', reason: 'user' });
    });
    expect(screen.getByRole('tab', { name: 'Data preview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    act(() => {
      api.emit({ kind: 'artifact', artifactKind: 'report', id: REPORT_ID, title: 'Sales summary' });
    });
    expect(screen.getByRole('tab', { name: /Sales summary/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('picking another dataset shows its preview; a later artifact takes over again', async () => {
    const api = createFakeApi();
    const ui = (dataset: string) => (
      <ApiProvider api={api}>
        <AppearanceProvider>
          <AgentProvider>
            <HostedPanel dataset={dataset} revision={0} />
          </AgentProvider>
        </AppearanceProvider>
      </ApiProvider>
    );
    const { rerender } = render(ui('sales'));
    act(() => {
      api.emit({ kind: 'artifact', artifactKind: 'chart', id: CHART_ID, title: 'Units by region' });
    });
    expect(screen.getByRole('tab', { name: /Units by region/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    rerender(ui('events'));
    expect(screen.getByRole('tab', { name: 'Data preview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByRole('table', { name: 'Preview of events' })).toBeInTheDocument();
    act(() => {
      api.emit({ kind: 'artifact', artifactKind: 'report', id: REPORT_ID, title: 'Sales summary' });
    });
    expect(screen.getByRole('tab', { name: /Sales summary/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('closable tabs', () => {
  function openBoth() {
    const result = renderPanel('sales');
    act(() => {
      result.api.emit({
        kind: 'artifact',
        artifactKind: 'chart',
        id: CHART_ID,
        title: 'Units by region',
      });
      result.api.emit({
        kind: 'artifact',
        artifactKind: 'report',
        id: REPORT_ID,
        title: 'Sales summary',
      });
    });
    return result;
  }
  const tabNames = () => screen.queryAllByRole('tab').map((t) => t.textContent);

  it('the close button closes a tab and selects its neighbour', async () => {
    const { user } = openBoth();
    expect(tabNames()).toEqual([
      'Data preview',
      'Chart · Units by region',
      'Report · Sales summary',
    ]);
    await user.click(screen.getByRole('button', { name: 'Close Sales summary' }));
    expect(tabNames()).toEqual(['Data preview', 'Chart · Units by region']);
    expect(screen.getByRole('tab', { name: /Units by region/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('Delete closes the focused tab; arrows move between tabs', async () => {
    const { user } = openBoth();
    const report = screen.getByRole('tab', { name: /Sales summary/ });
    report.focus();
    await user.keyboard('{ArrowLeft}');
    const chart = screen.getByRole('tab', { name: /Units by region/ });
    expect(chart).toHaveFocus();
    expect(chart).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Delete}');
    expect(tabNames()).toEqual(['Data preview', 'Report · Sales summary']);
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Sales summary/ })).toHaveFocus();
    });
  });

  it('middle-click closes a tab', () => {
    openBoth();
    fireEvent(
      screen.getByRole('tab', { name: 'Data preview' }),
      new MouseEvent('auxclick', { bubbles: true, button: 1 }),
    );
    expect(tabNames()).toEqual(['Chart · Units by region', 'Report · Sales summary']);
  });

  it('with every tab closed it says what to do; picking a dataset reopens the preview', async () => {
    const api = createFakeApi();
    const ui = (dataset: string | null) => (
      <ApiProvider api={api}>
        <AppearanceProvider>
          <AgentProvider>
            <HostedPanel dataset={dataset} revision={0} />
          </AgentProvider>
        </AppearanceProvider>
      </ApiProvider>
    );
    const { rerender } = render(ui(null));
    fireEvent.click(screen.getByRole('button', { name: 'Close Data preview' }));
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing open/)).toBeInTheDocument();
    rerender(ui('sales'));
    expect(screen.getByRole('tab', { name: 'Data preview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByRole('table', { name: 'Preview of sales' })).toBeInTheDocument();
  });
});
