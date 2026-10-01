import type { CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalBroker } from '../../../../src/main/agent/approvals';
import { ClaudeOrchestrator } from '../../../../src/main/agent/claude/claudeOrchestrator';
import type { AgentEventInput } from '../../../../src/shared/agent';
import { PLUGIN_DIR, scriptedQuery, sdk, WORKSPACE } from './fakeSdk';

function setup(
  turns: Parameters<typeof scriptedQuery>[0],
  opts: Parameters<typeof scriptedQuery>[1] = {},
  approvalTimeoutMs = 1_000,
) {
  const events: AgentEventInput[] = [];
  const emit = (e: AgentEventInput) => events.push(e);
  const approvals = new ApprovalBroker(emit, approvalTimeoutMs);
  const { queryFn, calls } = scriptedQuery(turns, opts);
  let canUseTool: CanUseTool | undefined;
  const createSession = vi.fn(({ canUseTool: c }: { canUseTool: CanUseTool }) => {
    canUseTool = c;
    return Promise.resolve({
      options: { cwd: WORKSPACE },
      workspaceDir: WORKSPACE,
      pluginDir: PLUGIN_DIR,
      openaiTools: false,
      hfTools: false,
    });
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
    async function gate(approvalTimeoutMs?: number) {
      const t = setup([[]], {}, approvalTimeoutMs);
      t.orchestrator.send('x');
      await t.until(() => t.canUse() !== undefined);
      const canUseTool = t.canUse();
      if (!canUseTool) throw new Error('no gate');
      const call = (tool: string, input: Record<string, unknown>, agentID?: string) =>
        canUseTool(tool, input, {
          signal: new AbortController().signal,
          toolUseID: 't',
          requestId: 'r',
          ...(agentID === undefined ? {} : { agentID }),
        });
      return { t, call };
    }

    it('denies any tool that is not explicitly handled', async () => {
      const { call } = await gate();
      await expect(call('Bash', { command: 'dir' })).resolves.toMatchObject({ behavior: 'deny' });
      await expect(call('mcp__evil__x', {})).resolves.toMatchObject({ behavior: 'deny' });
    });

    describe('load_hf_dataset (always asks; D-020)', () => {
      const LOAD = 'mcp__datadesk__load_hf_dataset';
      const input = { repo_id: 'scikit-learn/iris', path: 'Iris.csv' };
      const request = (t: Awaited<ReturnType<typeof gate>>['t']) => {
        const req = t.events.findLast((e) => e.kind === 'approval_request');
        if (req?.kind !== 'approval_request') throw new Error('no approval request');
        return req;
      };

      it('shows what will be downloaded, under which name, with the size limit; allow passes it on', async () => {
        const { t, call } = await gate();
        const pending = call(LOAD, input);
        await t.until(() => t.kinds().includes('approval_request'));
        const req = request(t);
        expect(req.title).toBe('Download a dataset from Hugging Face?');
        expect(req.detail).toContain('scikit-learn/iris');
        expect(req.detail).toContain('https://huggingface.co/datasets/scikit-learn/iris');
        expect(req.detail).toContain('Iris.csv');
        expect(req.detail).toContain('Revision: main');
        expect(req.detail).toMatch(/hf_iris \(replaces any dataset with this name\)/);
        expect(req.detail).toMatch(/500 MB/);
        t.approvals.respond(req.requestId, true);
        // Exactly the validated input goes to the tool: what the user saw is what runs.
        await expect(pending).resolves.toEqual({ behavior: 'allow', updatedInput: input });
      });

      it('deny: the tool does not run and the analyst is told not to retry', async () => {
        const { t, call } = await gate();
        const pending = call(LOAD, input);
        await t.until(() => t.kinds().includes('approval_request'));
        t.approvals.respond(request(t).requestId, false);
        await expect(pending).resolves.toMatchObject({
          behavior: 'deny',
          message: expect.stringMatching(/declined.*Do not retry/) as unknown,
        });
      });

      it('timeout: no answer is a denial', async () => {
        const { t, call } = await gate(50);
        const result = await call(LOAD, input);
        expect(result).toMatchObject({ behavior: 'deny' });
        expect(t.events).toContainEqual(
          expect.objectContaining({ kind: 'approval_resolved', approved: false }),
        );
      });

      it('sub-agents can never ask, and invalid input is denied without asking', async () => {
        const { t, call } = await gate();
        await expect(call(LOAD, input, 'agent-1')).resolves.toMatchObject({ behavior: 'deny' });
        for (const bad of [
          { ...input, path: '../../keys.json' },
          { ...input, path: 'model.safetensors' },
          { ...input, repo_id: 'https://evil.example' },
          { ...input, extra: 'x' },
        ]) {
          await expect(call(LOAD, bad)).resolves.toMatchObject({ behavior: 'deny' });
        }
        expect(t.kinds()).not.toContain('approval_request');
      });
    });

    it('denies HF tools outside the allowlist, e.g. one added mid-session (D-019)', async () => {
      const { t, call } = await gate();
      for (const tool of ['mcp__hf__create_repo', 'mcp__hf__hf_jobs', 'mcp__hf__hf_whoami']) {
        await expect(call(tool, { name: 'x' })).resolves.toMatchObject({ behavior: 'deny' });
      }
      expect(t.kinds()).not.toContain('approval_request');
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

    it('denies invalid register_dataset input without asking the user', async () => {
      const { t, call } = await gate();
      await expect(
        call('mcp__datadesk__register_dataset', { path: 'C:/x.csv', name: 'Bad Name; DROP' }),
      ).resolves.toMatchObject({ behavior: 'deny' });
      await expect(call('mcp__datadesk__register_dataset', {})).resolves.toMatchObject({
        behavior: 'deny',
      });
      expect(t.kinds()).not.toContain('approval_request');
    });

    it('allows delegations to our sub-agents, stripped to type, description and prompt', async () => {
      const { call } = await gate();
      for (const tool of ['Agent', 'Task']) {
        await expect(
          call(tool, {
            subagent_type: 'profiler',
            description: 'Profile sales',
            prompt: 'Profile the sales dataset',
            run_in_background: true,
            model: 'opus',
            isolation: 'worktree',
            name: 'p1',
            mode: 'bypassPermissions',
          }),
        ).resolves.toEqual({
          behavior: 'allow',
          updatedInput: {
            subagent_type: 'profiler',
            description: 'Profile sales',
            prompt: 'Profile the sales dataset',
          },
        });
      }
    });

    it.each([
      ['a built-in agent', { subagent_type: 'general-purpose', description: 'd', prompt: 'p' }],
      ['a fork', { subagent_type: 'fork', description: 'd', prompt: 'p' }],
      ['no agent type', { description: 'd', prompt: 'p' }],
      ['an empty prompt', { subagent_type: 'sql-analyst', description: 'd', prompt: '' }],
    ])('denies delegating to %s', async (_label, input) => {
      const { call } = await gate();
      await expect(call('Agent', input)).resolves.toMatchObject({
        behavior: 'deny',
        message: expect.stringContaining('profiler, sql-analyst, report-writer') as string,
      });
    });

    it('denies sub-agents spawning sub-agents or asking the user to add files', async () => {
      const { t, call } = await gate();
      await expect(
        call('Agent', { subagent_type: 'profiler', description: 'd', prompt: 'p' }, 'agent-1'),
      ).resolves.toMatchObject({ behavior: 'deny' });
      await expect(
        call('mcp__datadesk__register_dataset', { path: 'C:/data/x.csv' }, 'agent-1'),
      ).resolves.toMatchObject({ behavior: 'deny' });
      expect(t.kinds()).not.toContain('approval_request');
    });

    it('shows path, name and sheet as separate fields', async () => {
      const { t, call } = await gate();
      void call('mcp__datadesk__register_dataset', {
        path: 'C:/data/q1.xlsx',
        name: 'q1',
        sheet: 'Orders',
      });
      await t.until(() => t.kinds().includes('approval_request'));
      const req = t.events.find((e) => e.kind === 'approval_request');
      const detail = req?.kind === 'approval_request' ? req.detail : '';
      expect(detail).toContain('File:  C:/data/q1.xlsx');
      expect(detail).toContain('Name:  q1 (replaces any dataset with this name)');
      expect(detail).toContain('Sheet: Orders');
    });
  });
});

describe('ClaudeOrchestrator lifecycle (review regressions)', () => {
  it('reset emits a boundary marker and nothing from the old session follows it', async () => {
    // A turn that keeps streaming until closed.
    const endless = Array.from({ length: 50 }, (_, i) => sdk.textDelta(`chunk${String(i)} `));
    const t = setup([[sdk.messageStart('m1'), ...endless]]);
    t.orchestrator.send('stream please');
    await t.until(() => t.kinds().includes('text_delta'));
    await t.orchestrator.reset('user');
    const markerIndex = t.events.findIndex((e) => e.kind === 'conversation_reset');
    expect(markerIndex).toBeGreaterThan(-1);
    const after = t.events.slice(markerIndex + 1).map((e) => e.kind);
    expect(after.filter((k) => k !== 'status')).toEqual([]);
  });

  it('a reset while the session is still starting closes it and emits no error', async () => {
    const t = setup([[sdk.result(0.01)]]);
    let release: () => void = () => undefined;
    t.createSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve({
              options: { cwd: WORKSPACE },
              workspaceDir: WORKSPACE,
              pluginDir: PLUGIN_DIR,
              openaiTools: false,
              hfTools: false,
            });
          };
        }),
    );
    t.orchestrator.send('hello');
    await t.orchestrator.reset('settings');
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(t.kinds()).not.toContain('error');
    expect(t.calls.prompts).toEqual([]); // the superseded session never received the message
    // The next message starts a fresh session.
    t.orchestrator.send('again');
    await t.until(() => t.calls.prompts.includes('again'));
  });

  it('fails closed if the model produces output before init was verified', async () => {
    const t = setup([[sdk.assistant('m1', [{ type: 'text', text: 'hi' }]), sdk.result(0)]], {
      initFirst: null,
    });
    t.orchestrator.send('x');
    await t.until(() => t.kinds().includes('error'));
    const error = t.events.find((e) => e.kind === 'error');
    expect(error?.kind === 'error' && error.message).toMatch(/before its session was verified/);
    expect(t.kinds()).not.toContain('assistant_message');
  });

  it('stop returns the UI to idle even if no result message follows', async () => {
    const t = setup([[]]);
    t.orchestrator.send('x');
    await t.until(() => t.calls.prompts.length === 1);
    await t.orchestrator.stop();
    expect(t.events.at(-1)).toEqual({ kind: 'status', status: 'idle' });
  });

  it('truncates long error messages instead of dropping them', async () => {
    const t = setup([]);
    t.createSession.mockRejectedValueOnce(new Error('x'.repeat(5_000)));
    t.orchestrator.send('hi');
    await t.until(() => t.kinds().includes('error'));
    const error = t.events.find((e) => e.kind === 'error');
    expect(error?.kind === 'error' && error.message.length).toBeLessThanOrEqual(2_000);
  });
});
