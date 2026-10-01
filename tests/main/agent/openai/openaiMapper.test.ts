import {
  Agent,
  RunItemStreamEvent,
  RunMessageOutputItem,
  RunRawModelStreamEvent,
  RunToolCallItem,
  RunToolCallOutputItem,
} from '@openai/agents-core';
import { describe, expect, it, vi } from 'vitest';
import { createOpenAIMapper } from '../../../../src/main/agent/openai/openaiMapper';

const agent = new Agent({ name: 'analyst' });

const ev = {
  started: () => new RunRawModelStreamEvent({ type: 'response_started' }),
  delta: (delta: string) => new RunRawModelStreamEvent({ type: 'output_text_delta', delta }),
  done: (inputTokens: number, outputTokens: number) =>
    new RunRawModelStreamEvent({
      type: 'response_done',
      response: {
        id: 'r',
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        output: [],
      },
    }),
  message: (text: string) =>
    new RunItemStreamEvent(
      'message_output_created',
      new RunMessageOutputItem(
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text }],
        },
        agent,
      ),
    ),
  call: (callId: string, name: string, args: unknown) =>
    new RunItemStreamEvent(
      'tool_called',
      new RunToolCallItem(
        {
          type: 'function_call',
          callId,
          name,
          arguments: JSON.stringify(args),
          status: 'completed',
        },
        agent,
      ),
    ),
  output: (callId: string, name: string, output: string) =>
    new RunItemStreamEvent(
      'tool_output',
      new RunToolCallOutputItem(
        {
          type: 'function_call_result',
          callId,
          name,
          status: 'completed',
          output: { type: 'text', text: output },
        },
        agent,
        output,
      ),
    ),
};

function setup(errors: string[] = []) {
  const onUsage = vi.fn();
  const map = createOpenAIMapper({ isError: (id) => errors.includes(id), onUsage });
  return { map, onUsage };
}

describe('createOpenAIMapper', () => {
  it('streams deltas and the final message under one message id', () => {
    const { map } = setup();
    expect(map(ev.started(), null)).toEqual([]);
    const [delta] = map(ev.delta('West'), null);
    const [message] = map(ev.message('West sold most.'), null);
    expect(delta).toMatchObject({ kind: 'text_delta', delta: 'West', parentToolUseId: null });
    expect(message).toMatchObject({ kind: 'assistant_message', text: 'West sold most.' });
    expect(delta && 'messageId' in delta && message && 'messageId' in message).toBe(true);
    expect((delta as { messageId: string }).messageId).toBe(
      (message as { messageId: string }).messageId,
    );
    map(ev.started(), null);
    const [next] = map(ev.delta('x'), null);
    expect((next as { messageId: string }).messageId).not.toBe(
      (message as { messageId: string }).messageId,
    );
  });

  it('reports a sub-agent tool as the neutral Agent delegation (sql_analyst → sql-analyst)', () => {
    const { map } = setup();
    expect(map(ev.call('c1', 'sql_analyst', { input: 'Top region?' }), null)).toEqual([
      {
        kind: 'tool_call',
        toolUseId: 'c1',
        name: 'Agent',
        input: JSON.stringify({ subagent_type: 'sql-analyst', prompt: 'Top region?' }),
        parentToolUseId: null,
      },
    ]);
  });

  it('tags sub-agent events with the delegating call and never treats them as delegations', () => {
    const { map } = setup();
    expect(map(ev.call('c2', 'profiler', { input: 'x' }), 'c1')[0]).toMatchObject({
      name: 'profiler',
      parentToolUseId: 'c1',
    });
    map(ev.started(), 'c1');
    expect(map(ev.message('sub text'), 'c1')[0]).toMatchObject({
      kind: 'assistant_message',
      parentToolUseId: 'c1',
    });
  });

  it('marks errors from the tools and emits artifacts only for successful results', () => {
    const { map } = setup(['bad']);
    const id = '0b6f3c1e-2d4a-4f5b-8c9d-1e2f3a4b5c6d';
    const text = `Chart created\n{"chartId":"${id}","title":"T"}`;
    map(ev.call('ok', 'mcp__datadesk__create_chart', {}), null);
    map(ev.call('bad', 'mcp__datadesk__create_chart', {}), null);
    expect(map(ev.output('ok', 'mcp__datadesk__create_chart', text), null)).toEqual([
      { kind: 'tool_result', toolUseId: 'ok', isError: false, output: text },
      { kind: 'artifact', artifactKind: 'chart', id, title: 'T' },
    ]);
    expect(map(ev.output('bad', 'mcp__datadesk__create_chart', text), null)).toEqual([
      { kind: 'tool_result', toolUseId: 'bad', isError: true, output: text },
    ]);
  });

  it('passes every response usage on, with its lane', () => {
    const { map, onUsage } = setup();
    map(ev.done(10, 2), null);
    map(ev.done(5, 1), 'c1');
    expect(onUsage.mock.calls).toEqual([
      [expect.objectContaining({ inputTokens: 10, outputTokens: 2 }), null],
      [expect.objectContaining({ inputTokens: 5, outputTokens: 1 }), 'c1'],
    ]);
  });
});
