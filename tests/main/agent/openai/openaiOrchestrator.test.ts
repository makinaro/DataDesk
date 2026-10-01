import { describe, expect, it, vi } from 'vitest';
import { ApprovalBroker } from '../../../../src/main/agent/approvals';
import {
  OpenAIOrchestrator,
  type OpenAISessionSetup,
} from '../../../../src/main/agent/openai/openaiOrchestrator';
import type { LoadedSkill } from '../../../../src/main/agent/openai/skills';
import type { AgentEventInput } from '../../../../src/shared/agent';
import { DATADESK_TOOLS, fakeServer, scriptedModel, type FakeResponse } from './fakeOpenAI';

const SKILLS: LoadedSkill[] = [
  { name: 'datadesk:eda-checklist', description: 'EDA steps', body: 'EDA BODY' },
  { name: 'datadesk:chart-style', description: 'Chart rules', body: 'CHART BODY' },
  { name: 'datadesk:report-format', description: 'Report rules', body: 'REPORT BODY' },
];

function setup(
  scripts: Record<string, FakeResponse[]>,
  opts: {
    results?: Parameters<typeof fakeServer>[0];
    tools?: string[];
    gate?: Promise<void>;
    session?: Partial<OpenAISessionSetup>;
  } = {},
) {
  const events: AgentEventInput[] = [];
  const emit = (e: AgentEventInput) => events.push(e);
  const approvals = new ApprovalBroker(emit, 1_000);
  const { model, requests } = scriptedModel(scripts, opts.gate ? { gate: opts.gate } : {});
  const server = fakeServer(opts.results, opts.tools);
  const createSession = vi.fn(() =>
    Promise.resolve<OpenAISessionSetup>({
      modelName: 'gpt-5.4-mini',
      model,
      server: server.server,
      skills: SKILLS,
      openaiTools: true,
      maxTurns: 30,
      maxBudgetUsd: 2,
      ...opts.session,
    }),
  );
  const orchestrator = new OpenAIOrchestrator({ emit, approvals, createSession });
  const of = <K extends AgentEventInput['kind']>(kind: K) =>
    events.filter((e): e is Extract<AgentEventInput, { kind: K }> => e.kind === kind);
  const turns = async (n: number) => {
    await vi.waitFor(() => {
      expect(of('turn_complete')).toHaveLength(n);
    });
  };
  return { orchestrator, events, requests, server, approvals, createSession, of, turns };
}

const toolNames = (r: { request: { tools: { name: string }[] } } | undefined) =>
  (r?.request.tools ?? []).map((t) => t.name).sort();

describe('OpenAIOrchestrator', () => {
  it('gives the analyst only DataDesk tools, skills and the three sub-agents', async () => {
    const t = setup({ analyst: [{ text: 'hi' }] });
    t.orchestrator.send('hello');
    await t.turns(1);
    expect(toolNames(t.requests[0])).toEqual(
      [
        'Skill',
        'profiler',
        'sql_analyst',
        'report_writer',
        ...[
          'list_datasets',
          'get_schema',
          'sample_rows',
          'profile_column',
          'run_sql',
          'create_chart',
          'save_report',
          'search_columns',
          'second_opinion',
          'register_dataset',
        ].map((n) => `mcp__datadesk__${n}`),
      ].sort(),
    );
    const session = t.of('session')[0];
    expect(session?.model).toBe('gpt-5.4-mini');
    expect(session?.tools.sort()).toEqual(toolNames(t.requests[0]));
  });

  it('never hands the model a datadesk-mcp tool outside the allowlist', async () => {
    const t = setup(
      { analyst: [{ text: 'hi' }] },
      { tools: [...DATADESK_TOOLS, 'drop_everything'] },
    );
    t.orchestrator.send('hello');
    await t.turns(1);
    expect(toolNames(t.requests[0])).not.toContain('mcp__datadesk__drop_everything');
  });

  it('scopes each sub-agent to its scope-table row (no register, no nesting)', async () => {
    const t = setup({
      analyst: [
        {
          calls: [
            { callId: 'a', name: 'profiler', args: { input: 'p' } },
            { callId: 'b', name: 'sql_analyst', args: { input: 'q' } },
            { callId: 'c', name: 'report_writer', args: { input: 'r' } },
          ],
        },
        { text: 'done' },
      ],
    });
    t.orchestrator.send('analyze');
    await t.turns(1);
    const byAgent = (agent: string) => toolNames(t.requests.find((r) => r.agent === agent));
    const mcp = (...n: string[]) => n.map((x) => `mcp__datadesk__${x}`).sort();
    expect(byAgent('profiler')).toEqual(
      mcp(
        'list_datasets',
        'get_schema',
        'sample_rows',
        'profile_column',
        'run_sql',
        'search_columns',
      ),
    );
    expect(byAgent('sql-analyst')).toEqual(
      mcp(
        'list_datasets',
        'get_schema',
        'sample_rows',
        'run_sql',
        'create_chart',
        'search_columns',
        'second_opinion',
      ),
    );
    expect(byAgent('report-writer')).toEqual(mcp('save_report'));
    // Preloaded skills, like the Claude sub-agents' `skills`.
    expect(t.requests.find((r) => r.agent === 'profiler')?.request.systemInstructions).toContain(
      'EDA BODY',
    );
    expect(
      t.requests.find((r) => r.agent === 'report-writer')?.request.systemInstructions,
    ).toContain('REPORT BODY');
  });

  it('keeps requests out of OpenAI storage and tracing, for the analyst and its sub-agents', async () => {
    const t = setup({
      analyst: [
        { calls: [{ callId: 'a', name: 'profiler', args: { input: 'p' } }] },
        { text: 'done' },
      ],
    });
    t.orchestrator.send('hello');
    await t.turns(1);
    expect(t.requests.length).toBeGreaterThan(1);
    for (const { request } of t.requests) {
      expect(request.modelSettings.store).toBe(false);
      expect(request.modelSettings.providerData).toEqual({
        include: ['reasoning.encrypted_content'],
      });
      expect(request.tracing).toBe(false);
    }
  });

  it('replays the conversation history on the next message', async () => {
    const t = setup({ analyst: [{ text: 'West.' }, { text: 'Yes.' }] });
    t.orchestrator.send('Which region?');
    await t.turns(1);
    t.orchestrator.send('Are you sure?');
    await t.turns(2);
    expect(t.createSession).toHaveBeenCalledTimes(1);
    const input = JSON.stringify(t.requests[1]?.request.input);
    expect(input).toContain('Which region?');
    expect(input).toContain('West.');
    expect(input).toContain('Are you sure?');
  });

  it('serves a skill through the Skill tool', async () => {
    const t = setup({
      analyst: [
        { calls: [{ callId: 's', name: 'Skill', args: { skill: 'datadesk:chart-style' } }] },
        { text: 'ok' },
      ],
    });
    t.orchestrator.send('chart it');
    await t.turns(1);
    expect(t.of('tool_result')[0]).toMatchObject({ toolUseId: 's', isError: false });
    expect(t.of('tool_result')[0]?.output).toContain('CHART BODY');
  });

  it('reports cost from the price table and the duration', async () => {
    const t = setup({
      analyst: [
        {
          calls: [{ callId: 'q', name: 'mcp__datadesk__run_sql', args: { sql: 'SELECT 1' } }],
          usage: { input: 1_000_000, output: 0 },
        },
        { text: 'ok', usage: { input: 1_000_000, output: 100_000, cached: 1_000_000 } },
      ],
    });
    t.orchestrator.send('cost?');
    await t.turns(1);
    const turn = t.of('turn_complete')[0];
    // gpt-5.4-mini: $0.75/M input, $0.075/M cached input, $4.50/M output.
    expect(turn?.costUsd).toBeCloseTo(0.75 + 0.075 + 0.45, 6);
    expect(turn?.sessionCostUsd).toBeCloseTo(turn?.costUsd ?? -1, 6);
    expect(turn).toMatchObject({ ok: true, reason: 'success', numTurns: 2 });
  });

  it('flags tool errors and invalid input as errors', async () => {
    const t = setup(
      {
        analyst: [
          {
            calls: [
              { callId: 'bad', name: 'mcp__datadesk__run_sql', args: { sql: 'DROP TABLE x' } },
            ],
          },
          { text: 'sorry' },
        ],
      },
      { results: { run_sql: { text: 'Only SELECT is allowed', isError: true } } },
    );
    t.orchestrator.send('drop it');
    await t.turns(1);
    expect(t.of('tool_result')[0]).toMatchObject({
      toolUseId: 'bad',
      isError: true,
      output: 'Only SELECT is allowed',
    });
  });

  describe('register_dataset (always asks the user; D-010)', () => {
    const call = (args: Record<string, unknown>) => ({
      analyst: [
        { calls: [{ callId: 'reg', name: 'mcp__datadesk__register_dataset', args }] },
        { text: 'done' },
      ],
    });

    it('asks, and on approval calls the tool with the validated input', async () => {
      const t = setup(call({ path: 'C:/data/sales.csv', name: 'sales' }));
      t.orchestrator.send('add it');
      await vi.waitFor(() => {
        expect(t.of('approval_request')).toHaveLength(1);
      });
      expect(t.server.calls).toEqual([]);
      const ask = t.of('approval_request')[0];
      expect(ask?.detail).toContain('C:/data/sales.csv');
      t.approvals.respond(ask?.requestId ?? '', true);
      await t.turns(1);
      expect(t.server.calls).toEqual([
        { name: 'register_dataset', args: { path: 'C:/data/sales.csv', name: 'sales' } },
      ]);
    });

    it('a denial reaches the model as an error, and nothing is registered', async () => {
      const t = setup(call({ path: 'C:/data/sales.csv' }));
      t.orchestrator.send('add it');
      await vi.waitFor(() => {
        expect(t.of('approval_request')).toHaveLength(1);
      });
      t.approvals.respond(t.of('approval_request')[0]?.requestId ?? '', false);
      await t.turns(1);
      expect(t.server.calls).toEqual([]);
      expect(t.of('tool_result')[0]).toMatchObject({ isError: true });
      expect(t.of('tool_result')[0]?.output).toContain('declined');
    });

    it('strips keys the dialog would not show before calling the tool', async () => {
      const t = setup(call({ path: 'C:/data/a.csv', allowDirs: ['C:/'] }));
      t.orchestrator.send('add it');
      await vi.waitFor(() => {
        expect(t.of('approval_request')).toHaveLength(1);
      });
      t.approvals.respond(t.of('approval_request')[0]?.requestId ?? '', true);
      await t.turns(1);
      expect(t.server.calls).toEqual([
        { name: 'register_dataset', args: { path: 'C:/data/a.csv' } },
      ]);
    });

    it('never asks for input the tool would reject', async () => {
      const t = setup(call({ name: 'no path' }));
      t.orchestrator.send('add it');
      await t.turns(1);
      expect(t.of('approval_request')).toEqual([]);
      expect(t.of('tool_result')[0]).toMatchObject({ isError: true });
    });
  });

  it('stops at the spend cap and refuses further turns in that conversation', async () => {
    const t = setup(
      {
        analyst: [
          {
            calls: [{ callId: 'q', name: 'mcp__datadesk__run_sql', args: { sql: 'SELECT 1' } }],
            usage: { input: 1_000_000, output: 0 },
          },
          { text: 'never reached' },
        ],
      },
      { session: { maxBudgetUsd: 0.5 } },
    );
    t.orchestrator.send('expensive');
    await t.turns(1);
    expect(t.of('turn_complete')[0]).toMatchObject({ ok: false, reason: 'error_max_budget_usd' });
    expect(t.of('assistant_message')).toEqual([]);
    t.orchestrator.send('again');
    await t.turns(2);
    expect(t.of('turn_complete')[1]).toMatchObject({
      ok: false,
      reason: 'error_max_budget_usd',
      costUsd: 0,
    });
    expect(t.requests).toHaveLength(1);
  });

  it('stops after maxTurns model calls with a readable error', async () => {
    const loop = { calls: [{ callId: 'l', name: 'mcp__datadesk__list_datasets', args: {} }] };
    const t = setup(
      { analyst: [loop, { ...loop }, { ...loop }, { ...loop }] },
      { session: { maxTurns: 2 } },
    );
    t.orchestrator.send('loop');
    await t.turns(1);
    expect(t.of('turn_complete')[0]).toMatchObject({ ok: false, reason: 'error_max_turns' });
    expect(t.of('error').at(-1)?.message).toMatch(/maximum number of steps/);
    expect(t.of('status').at(-1)?.status).toBe('idle');
  });

  it('stop() interrupts the turn; the stopped turn is not kept in the history', async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const t = setup({ analyst: [{ text: 'slow' }, { text: 'second' }] }, { gate });
    t.orchestrator.send('first');
    await vi.waitFor(() => {
      expect(t.requests).toHaveLength(1);
    });
    await t.orchestrator.stop();
    await t.turns(1);
    expect(t.of('turn_complete')[0]).toMatchObject({ ok: false, reason: 'interrupted' });
    expect(t.of('error')).toEqual([]);
    expect(t.of('status').map((s) => s.status)).toContain('stopping');
    expect(t.of('status').at(-1)?.status).toBe('idle');
    open();
    t.orchestrator.send('second question');
    await t.turns(2);
    expect(JSON.stringify(t.requests[1]?.request.input)).not.toContain('first');
  });

  it('reset() emits the boundary, closes datadesk-mcp, and nothing old follows', async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const t = setup({ analyst: [{ text: 'old answer' }, { text: 'new answer' }] }, { gate });
    t.orchestrator.send('old');
    await vi.waitFor(() => {
      expect(t.requests).toHaveLength(1);
    });
    await t.orchestrator.reset('settings');
    const marker = t.events.length;
    expect(t.events[marker - 2]).toEqual({ kind: 'conversation_reset', reason: 'settings' });
    expect(t.server.closed()).toBe(1);
    open();
    await new Promise((r) => setTimeout(r, 50));
    expect(t.events.slice(marker)).toEqual([]);
    t.orchestrator.send('new');
    await vi.waitFor(() => {
      expect(t.of('assistant_message').map((m) => m.text)).toEqual(['new answer']);
    });
    expect(t.createSession).toHaveBeenCalledTimes(2);
  });

  it('fails clearly when datadesk-mcp lacks an expected tool, and closes it', async () => {
    const t = setup({}, { tools: DATADESK_TOOLS.filter((n) => n !== 'run_sql') });
    t.orchestrator.send('hello');
    await vi.waitFor(() => {
      expect(t.of('status').at(-1)?.status).toBe('error');
    });
    expect(t.of('error')[0]?.message).toMatch(
      /Could not start the analyst: .*missing tools: mcp__datadesk__run_sql/,
    );
    expect(t.server.closed()).toBe(1);
    expect(t.requests).toEqual([]);
  });

  it('reports a session that cannot start (e.g. no key) and retries on the next message', async () => {
    const t = setup({ analyst: [{ text: 'ok' }] });
    t.createSession.mockRejectedValueOnce(new Error('Add your OpenAI API key in Settings.'));
    t.orchestrator.send('hello');
    await vi.waitFor(() => {
      expect(t.of('error')).toHaveLength(1);
    });
    expect(t.of('error')[0]?.message).toBe(
      'Could not start the analyst: Add your OpenAI API key in Settings.',
    );
    t.orchestrator.send('again');
    await t.turns(1);
    expect(t.of('turn_complete')[0]).toMatchObject({ ok: true });
  });
});
