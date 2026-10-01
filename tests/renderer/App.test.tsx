import { act, cleanup, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/App';
import { DEFAULT_SIZES } from '../../src/renderer/src/layout/panelSizes';
import type { Layout } from '../../src/shared/appearance';
import { CHART_ID, createFakeApi } from './fakeApi';
import { renderWithProviders } from './renderApp';

// Vega needs a real layout engine; charts render for real in the e2e tests.
vi.mock('../../src/renderer/src/charts/vega', () => ({
  renderChart: vi.fn(() => Promise.resolve({ dispose: vi.fn(), toPngBase64: vi.fn() })),
  chartToSvg: vi.fn(() => Promise.resolve('<svg/>')),
}));

function renderApp() {
  return renderWithProviders(<App />).user;
}

/** Renders the app with a saved layout, waiting for the stored appearance to apply. */
async function renderLayout(layout: Layout) {
  const api = createFakeApi();
  api.settings.getAppearance.mockResolvedValue({ ok: true, data: { theme: 'dark', layout } });
  const result = renderWithProviders(<App />, api);
  const sideLabel = layout === 'chat-first' ? 'Resize results' : 'Resize chat';
  await screen.findByRole('separator', { name: sideLabel });
  return result;
}

describe('App shell', () => {
  it('opens in Results-first: results in the middle, chat docked right, timeline closed', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'DataDesk' })).toBeInTheDocument();
    const results = screen.getByRole('region', { name: 'Charts & report' });
    const chat = screen.getByRole('region', { name: 'Chat' });
    expect(screen.getByRole('region', { name: 'Datasets' })).toBeInTheDocument();
    expect(results.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Agent timeline' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timeline' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('Chat-first puts the chat in the middle, results right and the timeline open', async () => {
    await renderLayout('chat-first');
    const results = screen.getByRole('region', { name: 'Charts & report' });
    const chat = screen.getByRole('region', { name: 'Chat' });
    expect(chat.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Agent timeline' })).toBeInTheDocument();
  });

  it('toggles the timeline drawer per layout', async () => {
    const user = renderApp();
    const toggle = screen.getByRole('button', { name: 'Timeline' });
    await user.click(toggle);
    expect(screen.getByRole('region', { name: 'Agent timeline' })).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(screen.queryByRole('region', { name: 'Agent timeline' })).not.toBeInTheDocument();
  });

  it('shows the tool steps for each question inline in the docked chat', async () => {
    const { api, user } = renderWithProviders(<App />);
    await user.type(screen.getByLabelText('Message'), 'Which region?{Enter}');
    act(() => {
      api.emit({ kind: 'status', status: 'running' });
      api.emit({
        kind: 'tool_call',
        toolUseId: 't1',
        name: 'mcp__datadesk__run_sql',
        input: '{"sql":"SELECT 1"}',
        parentToolUseId: null,
      });
    });
    const chat = screen.getByRole('list', { name: 'Conversation' });
    expect(within(chat).getByText('● Working · datadesk · run_sql…')).toBeInTheDocument();

    act(() => {
      api.emit({ kind: 'tool_result', toolUseId: 't1', isError: false, output: '1 row' });
      api.emit({ kind: 'status', status: 'idle' });
    });
    expect(within(chat).getByText(/^✓ 1 step · \d+\.\d s$/)).toBeInTheDocument();
    expect(within(chat).getByRole('list', { name: 'Steps' })).toHaveTextContent('1 row');
  });

  it('shows only the running turn as working, not an older stopped one', async () => {
    const { api, user } = renderWithProviders(<App />);
    const call = (id: string) => ({
      kind: 'tool_call' as const,
      toolUseId: id,
      name: 'mcp__datadesk__run_sql',
      input: '{}',
      parentToolUseId: null,
    });
    await user.type(screen.getByLabelText('Message'), 'first{Enter}');
    act(() => {
      api.emit({ kind: 'status', status: 'running' });
      api.emit(call('t1'));
      api.emit({ kind: 'status', status: 'idle' }); // stopped before t1 finished
    });
    await user.type(screen.getByLabelText('Message'), 'second{Enter}');
    act(() => {
      api.emit({ kind: 'status', status: 'running' });
      api.emit(call('t2'));
    });
    const chat = screen.getByRole('list', { name: 'Conversation' });
    expect(within(chat).getByText(/^■ 1 step/)).toBeInTheDocument();
    expect(within(chat).getAllByText(/^● Working/)).toHaveLength(1);
  });

  it('resizes panels from the keyboard and remembers the sizes per layout', async () => {
    const { user } = renderWithProviders(<App />);
    const chat = screen.getByRole('region', { name: 'Chat' });
    const before = parseInt(chat.style.width, 10);
    screen.getByRole('separator', { name: 'Resize chat' }).focus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(parseInt(chat.style.width, 10)).toBe(before + 48);

    cleanup();
    renderWithProviders(<App />, createFakeApi());
    expect(parseInt(screen.getByRole('region', { name: 'Chat' }).style.width, 10)).toBe(
      before + 48,
    );

    cleanup();
    await renderLayout('chat-first');
    const results = screen.getByRole('region', { name: 'Charts & report' });
    expect(parseInt(results.style.width, 10)).toBe(DEFAULT_SIZES['chat-first'].side);
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
