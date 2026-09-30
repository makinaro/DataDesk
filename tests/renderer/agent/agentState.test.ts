import { describe, expect, it } from 'vitest';
import {
  agentReducer,
  initialAgentState,
  type AgentState,
} from '../../../src/renderer/src/agent/agentState';
import type { AgentEvent, AgentEventInput } from '../../../src/shared/agent';

let seq = 0;
const ev = (e: AgentEventInput): AgentEvent => ({ ...e, seq: seq++, at: 1000 + seq });
const run = (events: AgentEventInput[], from: AgentState = initialAgentState) =>
  events.reduce((s, e) => agentReducer(s, { type: 'event', event: ev(e) }), from);

describe('agentReducer', () => {
  it('streams deltas into one assistant message and finalizes it', () => {
    const s = run([
      { kind: 'text_delta', messageId: 'm1', delta: 'Hel', parentToolUseId: null },
      { kind: 'text_delta', messageId: 'm1', delta: 'lo', parentToolUseId: null },
    ]);
    expect(s.messages).toEqual([{ id: 'm1', role: 'assistant', text: 'Hello', streaming: true }]);
    const done = run(
      [{ kind: 'assistant_message', messageId: 'm1', text: 'Hello!', parentToolUseId: null }],
      s,
    );
    expect(done.messages[0]).toMatchObject({ text: 'Hello!', streaming: false });
  });

  it('keeps sub-agent text out of the main chat', () => {
    const s = run([
      { kind: 'text_delta', messageId: 'x', delta: 'hidden', parentToolUseId: 'toolu_1' },
    ]);
    expect(s.messages).toEqual([]);
  });

  it('pairs tool calls with their results in the timeline', () => {
    const s = run([
      {
        kind: 'tool_call',
        toolUseId: 't1',
        name: 'mcp__datadesk__run_sql',
        input: '{}',
        parentToolUseId: null,
      },
      { kind: 'tool_result', toolUseId: 't1', isError: false, output: '4 rows' },
    ]);
    expect(s.timeline).toHaveLength(1);
    const item = s.timeline[0];
    expect(item?.kind === 'tool' && item.result).toMatchObject({
      isError: false,
      output: '4 rows',
    });
  });

  it('tracks a pending approval until it is resolved', () => {
    const asked = run([
      {
        kind: 'approval_request',
        requestId: 'r1',
        toolName: 'x',
        title: 'Add file?',
        detail: 'C:/a.csv',
      },
    ]);
    expect(asked.pendingApprovals[0]).toMatchObject({ requestId: 'r1', title: 'Add file?' });
    const resolved = run([{ kind: 'approval_resolved', requestId: 'r1', approved: false }], asked);
    expect(resolved.pendingApprovals).toEqual([]);
    expect(resolved.timeline).toContainEqual(
      expect.objectContaining({ kind: 'approval', approved: false }),
    );
  });

  it('records turn cost and stops any streaming message', () => {
    const s = run([
      { kind: 'text_delta', messageId: 'm1', delta: 'partial', parentToolUseId: null },
      {
        kind: 'turn_complete',
        ok: false,
        reason: 'interrupted',
        costUsd: 0.01,
        sessionCostUsd: 0.03,
        durationMs: 1200,
        numTurns: 2,
      },
    ]);
    expect(s.sessionCostUsd).toBe(0.03);
    expect(s.messages[0]?.streaming).toBe(false);
  });

  it('ignores duplicate or out-of-order events', () => {
    const event = ev({ kind: 'status', status: 'running' });
    const once = agentReducer(initialAgentState, { type: 'event', event });
    const twice = agentReducer({ ...once, status: 'idle' }, { type: 'event', event });
    expect(twice.status).toBe('idle');
  });

  it('queues concurrent approval requests instead of overwriting them', () => {
    const s = run([
      { kind: 'approval_request', requestId: 'a', toolName: 't', title: 'A?', detail: '' },
      { kind: 'approval_request', requestId: 'b', toolName: 't', title: 'B?', detail: '' },
    ]);
    expect(s.pendingApprovals.map((a) => a.requestId)).toEqual(['a', 'b']);
    const next = run([{ kind: 'approval_resolved', requestId: 'a', approved: true }], s);
    expect(next.pendingApprovals.map((a) => a.requestId)).toEqual(['b']);
  });

  it('conversation_reset from main clears everything; late old events cannot sneak in', () => {
    // Local reset (button) followed by an in-flight delta from the old session, then the marker.
    let s = run([{ kind: 'text_delta', messageId: 'm1', delta: 'old', parentToolUseId: null }]);
    s = agentReducer(s, { type: 'reset' });
    s = run([{ kind: 'text_delta', messageId: 'm1', delta: ' late', parentToolUseId: null }], s);
    expect(s.messages).toHaveLength(1); // the stale delta landed after the local reset…
    s = run([{ kind: 'conversation_reset', reason: 'user' }], s);
    expect(s.messages).toEqual([]); // …and the marker from main clears it.
    expect(s.timeline).toEqual([]);
  });

  it('notes resets caused by settings or key changes in the timeline', () => {
    const s = run([
      { kind: 'text_delta', messageId: 'm1', delta: 'x', parentToolUseId: null },
      { kind: 'conversation_reset', reason: 'settings' },
    ]);
    expect(s.messages).toEqual([]);
    expect(s.timeline).toEqual([expect.objectContaining({ kind: 'reset', reason: 'settings' })]);
  });

  it('reset clears the conversation but keeps the event cursor', () => {
    const s = run([{ kind: 'status', status: 'running' }]);
    const r = agentReducer(s, { type: 'reset' });
    expect(r.messages).toEqual([]);
    expect(r.lastSeq).toBe(s.lastSeq);
  });
});
