import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApprovalDialog } from '../../../src/renderer/src/components/ApprovalDialog';
import { ChatPanel } from '../../../src/renderer/src/components/ChatPanel';
import { TimelineDrawer } from '../../../src/renderer/src/components/TimelineDrawer';
import { renderWithProviders } from '../renderApp';

function renderAgentUi() {
  return renderWithProviders(
    <>
      <ChatPanel />
      <TimelineDrawer />
      <ApprovalDialog />
    </>,
  );
}

describe('ChatPanel + TimelineDrawer', () => {
  it('sends on Enter, shows the user message, and streams the answer', async () => {
    const { api, user } = renderAgentUi();
    await user.type(screen.getByLabelText('Message'), 'Which region sold most?{Enter}');
    expect(api.agent.send).toHaveBeenCalledWith('Which region sold most?');
    const convo = screen.getByRole('list', { name: 'Conversation' });
    expect(within(convo).getByText('Which region sold most?')).toBeInTheDocument();

    act(() => {
      api.emit({ kind: 'status', status: 'running' });
      api.emit({ kind: 'text_delta', messageId: 'm1', delta: 'West ', parentToolUseId: null });
      api.emit({ kind: 'text_delta', messageId: 'm1', delta: 'sold most.', parentToolUseId: null });
    });
    expect(within(convo).getByText(/West sold most\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('shows answers without a bubble, with a caret while streaming and Copy once done', async () => {
    const { api, user } = renderAgentUi();
    act(() => {
      api.emit({
        kind: 'text_delta',
        messageId: 'm1',
        delta: '**West** leads',
        parentToolUseId: null,
      });
    });
    const convo = screen.getByRole('list', { name: 'Conversation' });
    const answer = within(convo).getByText('West').closest('li');
    expect(answer).not.toHaveClass('bg-surface');
    expect(answer?.querySelector('.caret')).not.toBeNull();
    expect(within(convo).queryByRole('button', { name: 'Copy answer' })).toBeNull();

    act(() => {
      api.emit({
        kind: 'assistant_message',
        messageId: 'm1',
        text: '**West** leads.',
        parentToolUseId: null,
      });
    });
    expect(answer?.querySelector('.caret')).toBeNull();
    await user.click(within(convo).getByRole('button', { name: 'Copy answer' }));
    expect(api.clipboard.writeText).toHaveBeenCalledWith('**West** leads.');
    expect(await within(convo).findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('keeps Send disabled until there is a message', async () => {
    const { user } = renderAgentUi();
    const sendButton = screen.getByRole('button', { name: 'Send' });
    expect(sendButton).toBeDisabled();
    await user.type(screen.getByLabelText('Message'), 'hi');
    expect(sendButton).toBeEnabled();
  });

  it('Stop interrupts the running turn', async () => {
    const { api, user } = renderAgentUi();
    act(() => {
      api.emit({ kind: 'status', status: 'running' });
    });
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(api.agent.stop).toHaveBeenCalled();
  });

  it('shows why a message was not accepted (e.g. no API key)', async () => {
    const { api, user } = renderAgentUi();
    api.agent.send.mockResolvedValueOnce({
      ok: false,
      error: { code: 'UNAVAILABLE', message: 'Add your Anthropic API key in Settings.' },
    } as never);
    await user.type(screen.getByLabelText('Message'), 'hi{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Add your Anthropic API key');
  });

  it('shows tool calls with results, cost and session info in the timeline', () => {
    const { api } = renderAgentUi();
    act(() => {
      api.emit({
        kind: 'session',
        sessionId: 's1',
        model: 'claude-sonnet-5-5',
        tools: ['mcp__datadesk__run_sql'],
        mcpServers: [{ name: 'datadesk', status: 'connected' }],
      });
      api.emit({
        kind: 'tool_call',
        toolUseId: 't1',
        name: 'mcp__datadesk__run_sql',
        input: '{"sql":"SELECT 1"}',
        parentToolUseId: null,
      });
      api.emit({ kind: 'tool_result', toolUseId: 't1', isError: false, output: '1 row' });
      api.emit({
        kind: 'turn_complete',
        ok: true,
        reason: 'success',
        costUsd: 0.0123,
        sessionCostUsd: 0.0123,
        durationMs: 2500,
        numTurns: 3,
      });
    });
    const timeline = screen.getByRole('list', { name: 'Timeline' });
    expect(within(timeline).getByText(/datadesk \(connected\)/)).toBeInTheDocument();
    expect(within(timeline).getByText('datadesk · run_sql')).toBeInTheDocument();
    expect(within(timeline).getByText('1 row')).toBeInTheDocument();
    expect(within(timeline).getByText(/\$0\.0123/)).toBeInTheDocument();
    expect(screen.getByTestId('agent-status')).toHaveTextContent('claude-sonnet-5-5');
  });

  it('asks for approval and sends the answer back', async () => {
    const { api, user } = renderAgentUi();
    act(() => {
      api.emit({
        kind: 'approval_request',
        requestId: '11111111-1111-4111-8111-111111111111',
        toolName: 'mcp__datadesk__register_dataset',
        title: 'Add a dataset?',
        detail: 'C:/Users/me/Downloads/sales.csv',
      });
    });
    const dialog = screen.getByRole('alertdialog', { name: 'Add a dataset?' });
    expect(within(dialog).getByText('C:/Users/me/Downloads/sales.csv')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Deny' }));
    expect(api.agent.approve).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', false);
  });
});
