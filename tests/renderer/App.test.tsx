import { act, cleanup, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/App';
import { CHART_ID, createFakeApi } from './fakeApi';
import { renderWithProviders } from './renderApp';

// Vega needs a real layout engine; charts render for real in the e2e tests.
vi.mock('../../src/renderer/src/charts/vega', () => ({
  renderChart: vi.fn(() => Promise.resolve(vi.fn())),
  chartToSvg: vi.fn(() => Promise.resolve('<svg/>')),
}));

function renderApp() {
  return renderWithProviders(<App />).user;
}

describe('App shell', () => {
  it('renders the four work areas', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'DataDesk' })).toBeInTheDocument();
    for (const name of ['Datasets', 'Chat', 'Charts & report', 'Agent timeline']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });

  it('brings a chart forward when its chip in an answer is clicked', async () => {
    const { api, user } = renderWithProviders(<App />);
    act(() => {
      api.emit({ kind: 'artifact', artifactKind: 'chart', id: CHART_ID, title: 'Units by region' });
      api.emit({
        kind: 'assistant_message',
        messageId: 'm1',
        text: `South leads, see [[chart:${CHART_ID}]].`,
        parentToolUseId: null,
      });
    });
    const chartTab = screen.getByRole('tab', { name: /Units by region/ });
    await user.click(screen.getByRole('tab', { name: 'Data preview' }));
    expect(chartTab).toHaveAttribute('aria-selected', 'false');

    const chat = screen.getByRole('list', { name: 'Conversation' });
    await user.click(within(chat).getByRole('button', { name: 'Show chart: Units by region' }));
    expect(chartTab).toHaveAttribute('aria-selected', 'true');
  });

  it('resizes panels from the keyboard and remembers the sizes', async () => {
    const { user } = renderWithProviders(<App />);
    const results = screen.getByRole('region', { name: 'Charts & report' });
    const before = parseInt(results.style.width, 10);
    screen.getByRole('separator', { name: 'Resize results' }).focus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(parseInt(results.style.width, 10)).toBe(before + 48);

    cleanup();
    renderWithProviders(<App />, createFakeApi());
    expect(parseInt(screen.getByRole('region', { name: 'Charts & report' }).style.width, 10)).toBe(
      before + 48,
    );
  });

  it('toggles the timeline drawer', async () => {
    const user = renderApp();
    const toggle = screen.getByRole('button', { name: 'Timeline' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(screen.queryByRole('region', { name: 'Agent timeline' })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens and closes settings', async () => {
    const user = renderApp();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('swaps the chat for compare mode and back, ending the compare sessions on leaving', async () => {
    const { api, user } = renderWithProviders(<App />);
    const toggle = screen.getByRole('button', { name: 'Compare' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Compare providers' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Chat' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Datasets' })).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument();
    expect(api.compare.reset).toHaveBeenCalledOnce();
  });
});
