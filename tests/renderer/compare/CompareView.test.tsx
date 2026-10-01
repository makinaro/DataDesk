import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../src/renderer/src/api';
import { CompareView } from '../../../src/renderer/src/components/CompareView';
import { createFakeApi } from '../fakeApi';

function renderView(api = createFakeApi({ anthropic: true, openai: true })) {
  const view = render(
    <ApiProvider api={api}>
      <CompareView />
    </ApiProvider>,
  );
  return { api, ...view };
}

describe('CompareView', () => {
  it('runs one question on both providers and shows answer, tools, cost and latency per lane', async () => {
    const user = userEvent.setup();
    const { api } = renderView();
    await user.type(screen.getByLabelText('Question to compare'), 'Which region?{Enter}');
    expect(api.compare.run).toHaveBeenCalledWith('Which region?');

    act(() => {
      api.emitCompare('anthropic', { kind: 'status', status: 'running' });
      api.emitCompare('anthropic', {
        kind: 'session',
        sessionId: 's',
        model: 'claude-sonnet-5-5',
        tools: [],
        mcpServers: [],
      });
      api.emitCompare('anthropic', {
        kind: 'tool_call',
        toolUseId: 't1',
        name: 'mcp__datadesk__run_sql',
        input: '{"sql":"SELECT 1"}',
        parentToolUseId: null,
      });
      api.emitCompare('anthropic', {
        kind: 'tool_result',
        toolUseId: 't1',
        isError: false,
        output: '1 row',
      });
      api.emitCompare('anthropic', {
        kind: 'assistant_message',
        messageId: 'm1',
        text: 'West (Claude).',
        parentToolUseId: null,
      });
      api.emitCompare('anthropic', {
        kind: 'turn_complete',
        ok: true,
        reason: 'success',
        costUsd: 0.0123,
        sessionCostUsd: 0.0123,
        durationMs: 2_500,
        numTurns: 2,
      });
      api.emitCompare('anthropic', { kind: 'status', status: 'idle' });

      api.emitCompare('openai', { kind: 'status', status: 'running' });
      api.emitCompare('openai', {
        kind: 'tool_call',
        toolUseId: 'c1',
        name: 'Agent',
        input: '{"subagent_type":"profiler","prompt":"p"}',
        parentToolUseId: null,
      });
      api.emitCompare('openai', {
        kind: 'tool_call',
        toolUseId: 'c2',
        name: 'mcp__datadesk__get_schema',
        input: '{}',
        parentToolUseId: 'c1',
      });
      api.emitCompare('openai', {
        kind: 'assistant_message',
        messageId: 'x',
        text: 'Sub-agent text stays out of the answer.',
        parentToolUseId: 'c1',
      });
    });

    const claude = screen.getByRole('region', { name: 'Claude Agent SDK' });
    expect(within(claude).getByTestId('compare-answer')).toHaveTextContent('West (Claude).');
    expect(within(claude).getByText('$0.0123')).toBeVisible();
    expect(within(claude).getByText('2.5 s')).toBeVisible();
    expect(within(claude).getByRole('list', { name: /tool calls/ })).toHaveTextContent(
      'datadesk · run_sql',
    );
    expect(claude).toHaveTextContent('claude-sonnet-5-5 · success');

    const gpt = screen.getByRole('region', { name: 'OpenAI Agents SDK' });
    expect(within(gpt).getByTestId('compare-answer')).not.toHaveTextContent('Sub-agent text');
    const tools = within(gpt).getAllByRole('listitem');
    expect(tools.map((t) => t.textContent)).toEqual([
      expect.stringContaining('agent · profiler'),
      expect.stringContaining('datadesk · get_schema'),
    ]);
    expect(tools[1]).toHaveClass('ml-4'); // the sub-agent's own call, indented
    // OpenAI is still working: Stop is offered instead of Compare.
    expect(screen.getByRole('button', { name: 'Stop' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(api.compare.stop).toHaveBeenCalledOnce();
  });

  it('shows why a comparison cannot run (e.g. a missing key)', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    api.compare.run.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'UNAVAILABLE',
        message: 'Compare mode needs both an Anthropic and an OpenAI API key.',
      },
    } as never);
    renderView(api);
    await user.type(screen.getByLabelText('Question to compare'), 'q');
    await user.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('needs both');
  });

  it('ends both sessions when the view closes', () => {
    const { api, unmount } = renderView();
    unmount();
    expect(api.compare.reset).toHaveBeenCalledOnce();
  });
});
