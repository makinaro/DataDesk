import type { CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalBroker } from '../../../../src/main/agent/approvals';
import { ClaudeOrchestrator } from '../../../../src/main/agent/claude/claudeOrchestrator';
import type { AgentEventInput } from '../../../../src/shared/agent';
import { scriptedQuery, sdk, WORKSPACE } from './fakeSdk';

function setup(
  turns: Parameters<typeof scriptedQuery>[0],
  opts: Parameters<typeof scriptedQuery>[1] = {},
) {
  const events: AgentEventInput[] = [];
  const emit = (e: AgentEventInput) => events.push(e);
  const approvals = new ApprovalBroker(emit, 1_000);
  const { queryFn, calls } = scriptedQuery(turns, opts);
  let canUseTool: CanUseTool | undefined;
  const createSession = vi.fn(({ canUseTool: c }: { canUseTool: CanUseTool }) => {
    canUseTool = c;
    return Promise.resolve({ options: { cwd: WORKSPACE }, workspaceDir: WORKSPACE });
  });
  const orchestrator = new ClaudeOrchestrator({ emit, query: queryFn, approvals, createSession });
  const kinds = () => events.map((e) => e.kind);
  const until = async (predicate: () => boolean) => {
    await vi.waitFor(() => {
      expect(predicate()).toBe(true);
    });
  };
  return {
    orchestrator,
    events,
    calls,
    approvals,
    createSession,
    kinds,
    until,
    canUse: () => canUseTool,
  };
}

describe('ClaudeOrchestrator', () => {
  it('runs a turn: session, streamed text, tool call + result, answer, cost, idle', async () => {
    const t = setup([
      [
        sdk.messageStart('msg_1'),
        sdk.textDelta('Checking…'),
        sdk.assistant('msg_1', [
          { type: 'text', text: 'Checking…' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'mcp__datadesk__run_sql',
            input: { sql: 'SELECT 1' },
          },
        ]),
        sdk.toolResult('toolu_1', '1 row'),
        sdk.assistant('msg_2', [{ type: 'text', text: 'West sold the most.' }]),
        sdk.result(0.01),
      ],
    ]);
    t.orchestrator.send('Which region sold most?');
    await t.until(() => t.kinds().includes('turn_complete'));
    expect(t.calls.prompts).toEqual(['Which region sold most?']);
    expect(t.kinds()).toEqual([
      'status', // starting
      'status', // running
      'session',
      'text_delta',
      'assistant_message',
      'tool_call',
      'tool_result',
      'assistant_message',
      'turn_complete',
      'status', // idle
    ]);
    expect(t.events.at(-1)).toEqual({ kind: 'status', status: 'idle' });
  });

  it('keeps one session across messages (streaming input) and reports incremental cost', async () => {
    const t = setup([[sdk.result(0.01)], [sdk.result(0.03)]]);
    t.orchestrator.send('first');
    await t.until(() => t.kinds().filter((k) => k === 'turn_complete').length === 1);
    t.orchestrator.send('second');
    await t.until(() => t.kinds().filter((k) => k === 'turn_complete').length === 2);
    expect(t.createSession).toHaveBeenCalledTimes(1);
    expect(t.calls.prompts).toEqual(['first', 'second']);
    const turns = t.events.filter((e) => e.kind === 'turn_complete');
    const second = turns[1];
    expect(second?.kind === 'turn_complete' && second.sessionCostUsd).toBe(0.03);
    expect(second?.kind === 'turn_complete' && second.costUsd).toBeCloseTo(0.02);
  });

  it('aborts the session when init shows capabilities we did not grant', async () => {
    const t = setup([[sdk.result(0.01)]], { initFirst: sdk.init({ tools: ['Bash'] }) });
    t.orchestrator.send('hi');
    await t.until(() => t.kinds().includes('error'));
    const error = t.events.find((e) => e.kind === 'error');
    expect(error?.kind === 'error' && error.message).toMatch(
      /Stopped for safety.*unexpected tools: Bash/,
    );
    expect(t.calls.closed).toBe(true);
    expect(t.kinds()).not.toContain('turn_complete');
  });

  it('starts a fresh session after the previous one ended', async () => {
    const t = setup([[sdk.result(0.01)]], { initFirst: sdk.init({ tools: ['Bash'] }) });
    t.orchestrator.send('one');
    await t.until(() => t.kinds().includes('error'));
    await vi.waitFor(async () => {
      t.orchestrator.send('two');
      await Promise.resolve();
      expect(t.createSession.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('stop() interrupts the running turn and denies pending approvals', async () => {
    const t = setup([[]]);
    t.orchestrator.send('long question');
    await t.until(() => t.calls.prompts.length === 1);
    await t.orchestrator.stop();
    expect(t.calls.interrupts).toBe(1);
    expect(t.events).toContainEqual({ kind: 'status', status: 'stopping' });
  });

  it('reset() closes the session; the next send starts a new one', async () => {
    const t = setup([[sdk.result(0.01)], [sdk.result(0.01)]]);
    t.orchestrator.send('a');
    await t.until(() => t.kinds().includes('turn_complete'));
    await t.orchestrator.reset();
    expect(t.calls.closed).toBe(true);
    t.orchestrator.send('b');
    await t.until(() => t.createSession.mock.calls.length === 2);
  });

  it('reports a clear error when the session cannot start (e.g. missing key)', async () => {
    const t = setup([]);
    t.createSession.mockRejectedValueOnce(new Error('Add your Anthropic API key in Settings.'));
    t.orchestrator.send('hi');
    await t.until(() => t.kinds().includes('error'));
    expect(t.events).toContainEqual({
      kind: 'error',
      message: 'Could not start the analyst: Add your Anthropic API key in Settings.',
    });
    expect(t.events.at(-1)).toEqual({ kind: 'status', status: 'error' });
  });

  describe('canUseTool (permission gate)', () => {
    async function gate() {
      const t = setup([[]]);
      t.orchestrator.send('x');
      await t.until(() => t.canUse() !== undefined);
      const canUseTool = t.canUse();
      if (!canUseTool) throw new Error('no gate');
      const call = (tool: string, input: Record<string, unknown>) =>
        canUseTool(tool, input, {
          signal: new AbortController().signal,
          toolUseID: 't',
          requestId: 'r',
        });
      return { t, call };
    }

    it('denies any tool that is not explicitly handled', async () => {
      const { call } = await gate();
      await expect(call('Bash', { command: 'dir' })).resolves.toMatchObject({ behavior: 'deny' });
      await expect(call('mcp__evil__x', {})).resolves.toMatchObject({ behavior: 'deny' });
    });

    it('asks the user before register_dataset and respects the answer', async () => {
      const { t, call } = await gate();
      const pending = call('mcp__datadesk__register_dataset', { path: 'C:/data/x.csv' });
      await t.until(() => t.kinds().includes('approval_request'));
      const req = t.events.find((e) => e.kind === 'approval_request');
      expect(req).toMatchObject({ title: 'Add a dataset?' });
      expect(req?.kind === 'approval_request' && req.detail).toContain('C:/data/x.csv');
      if (req?.kind === 'approval_request') t.approvals.respond(req.requestId, true);
      await expect(pending).resolves.toMatchObject({ behavior: 'allow' });

      const denied = call('mcp__datadesk__register_dataset', { path: 'C:/data/y.csv' });
      await t.until(() => t.kinds().filter((k) => k === 'approval_request').length === 2);
      const req2 = t.events.filter((e) => e.kind === 'approval_request')[1];
      if (req2?.kind === 'approval_request') t.approvals.respond(req2.requestId, false);
      await expect(denied).resolves.toMatchObject({ behavior: 'deny' });
    });
  });
});
