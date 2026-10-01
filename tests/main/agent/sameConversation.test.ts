import { describe, expect, it, vi } from 'vitest';
import { ApprovalBroker } from '../../../src/main/agent/approvals';
import { ClaudeOrchestrator } from '../../../src/main/agent/claude/claudeOrchestrator';
import { OpenAIOrchestrator } from '../../../src/main/agent/openai/openaiOrchestrator';
import type { AgentEventInput } from '../../../src/shared/agent';
import { PLUGIN_DIR, scriptedQuery, sdk, WORKSPACE } from './claude/fakeSdk';
import { claudeTurn, CONVERSATION, normalize, openaiScripts } from './conversationFixture';
import { fakeServer, scriptedModel } from './openai/fakeOpenAI';

async function runClaude(): Promise<AgentEventInput[]> {
  const events: AgentEventInput[] = [];
  const emit = (e: AgentEventInput) => events.push(e);
  const { queryFn } = scriptedQuery([claudeTurn()], {
    initFirst: sdk.init({ agents: ['profiler', 'sql-analyst', 'report-writer'] }),
  });
  const orchestrator = new ClaudeOrchestrator({
    emit,
    query: queryFn,
    approvals: new ApprovalBroker(emit),
    createSession: () =>
      Promise.resolve({
        options: { cwd: WORKSPACE },
        workspaceDir: WORKSPACE,
        pluginDir: PLUGIN_DIR,
        openaiTools: false,
        hfTools: false,
      }),
  });
  orchestrator.send(CONVERSATION.question);
  await vi.waitFor(() => {
    expect(events.some((e) => e.kind === 'turn_complete')).toBe(true);
  });
  await orchestrator.dispose();
  return events;
}

async function runOpenAI(): Promise<AgentEventInput[]> {
  const events: AgentEventInput[] = [];
  const emit = (e: AgentEventInput) => events.push(e);
  const { scripts, results } = openaiScripts();
  const { model } = scriptedModel(scripts);
  const orchestrator = new OpenAIOrchestrator({
    emit,
    approvals: new ApprovalBroker(emit),
    createSession: () =>
      Promise.resolve({
        modelName: 'gpt-5.4-mini',
        model,
        server: fakeServer(results).server,
        skills: [],
        openaiTools: true,
        maxTurns: 30,
        maxBudgetUsd: 2,
      }),
  });
  orchestrator.send(CONVERSATION.question);
  await vi.waitFor(() => {
    expect(events.some((e) => e.kind === 'turn_complete')).toBe(true);
  });
  await orchestrator.dispose();
  return events;
}

describe('the same mocked conversation through both orchestrators', () => {
  it('produces the same provider-neutral events', async () => {
    const claude = normalize(await runClaude());
    const openai = normalize(await runOpenAI());

    expect(openai).toEqual(claude);
    // And it is the conversation we scripted (guards against both being equally empty).
    expect(claude).toEqual([
      'message: I will profile the sales data first.',
      'call call_profile: Agent profiler',
      'call call_schema @call_profile: mcp__datadesk__get_schema {"name":"sales"}',
      'result call_schema: sales: 3 columns',
      'message @call_profile: sales has 1,200 rows: region, units, date. No nulls.',
      'result call_profile: sales has 1,200 rows: region, units, date. No nulls.',
      expect.stringMatching(/^call call_sql: mcp__datadesk__run_sql /),
      'result call_sql: 4 rows\n{"rows":[["West",512]]}',
      expect.stringMatching(/^call call_chart: mcp__datadesk__create_chart /),
      expect.stringMatching(/^result call_chart: Chart created/),
      'artifact chart 0b6f3c1e-2d4a-4f5b-8c9d-1e2f3a4b5c6d Units by region',
      'message: West sold the most units (512). [[chart:0b6f3c1e-2d4a-4f5b-8c9d-1e2f3a4b5c6d]]',
      'turn ok success',
    ]);
  });

  it('streams the same statuses and a session event on both', async () => {
    const statuses = (events: AgentEventInput[]) =>
      events.flatMap((e) =>
        e.kind === 'status' ? [e.status] : e.kind === 'session' ? ['session'] : [],
      );
    const claude = statuses(await runClaude());
    const openai = statuses(await runOpenAI());
    // Disposal adds a final idle after the turn's own idle on both.
    expect(openai).toEqual(claude);
    expect(claude.slice(0, 4)).toEqual(['starting', 'running', 'session', 'idle']);
  });
});
