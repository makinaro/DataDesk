import type { HookInput } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { scopeHook, scopeViolation } from '../../../../src/main/agent/claude/scopeHook';

const t = (name: string) => `mcp__datadesk__${name}`;

const pre = (tool: string, input: unknown = {}, agent?: { id?: string; type?: string }) =>
  ({
    hook_event_name: 'PreToolUse',
    session_id: 's',
    transcript_path: 't',
    cwd: 'c',
    tool_name: tool,
    tool_input: input,
    tool_use_id: 'u',
    ...(agent?.id === undefined ? {} : { agent_id: agent.id }),
    ...(agent?.type === undefined ? {} : { agent_type: agent.type }),
  }) as HookInput;
const run = (input: HookInput) => scopeHook(input, 'u', { signal: new AbortController().signal });
const denied = (reason: RegExp) => ({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: expect.stringMatching(reason) as string,
  },
});

describe('scope hook: sub-agent calls', () => {
  it('denies run_sql for report-writer even if the SDK handed it the tool', async () => {
    await expect(run(pre(t('run_sql'), {}, { id: 'a1', type: 'report-writer' }))).resolves.toEqual(
      denied(/report-writer may not use/),
    );
  });

  it('allows in-scope calls without deciding for the normal permission checks', async () => {
    await expect(
      run(pre(t('save_report'), {}, { id: 'a1', type: 'report-writer' })),
    ).resolves.toEqual({});
    await expect(run(pre(t('run_sql'), {}, { id: 'a2', type: 'sql-analyst' }))).resolves.toEqual(
      {},
    );
    for (const tool of ['mcp__hf__hub_repo_search', 'mcp__hf__hf_fs', t('list_datasets')]) {
      expect(scopeViolation({ agentId: 'a3', agentType: 'dataset-scout', toolName: tool })).toBe(
        null,
      );
    }
  });

  it.each([
    ['profiler', t('create_chart')],
    ['profiler', t('save_report')],
    ['sql-analyst', t('register_dataset')],
    ['sql-analyst', 'Skill'],
    ['report-writer', 'Agent'],
    ['general-purpose', t('list_datasets')],
    // The scout reads the Hub but never local rows, SQL or downloads; others never the Hub.
    ['dataset-scout', t('run_sql')],
    ['dataset-scout', t('sample_rows')],
    ['dataset-scout', t('load_hf_dataset')],
    ['dataset-scout', 'mcp__hf__create_repo'],
    ['sql-analyst', 'mcp__hf__hub_repo_search'],
    ['profiler', 'mcp__hf__hf_fs'],
    ['report-writer', 'mcp__hf__hub_repo_details'],
  ])('%s may not use %s', (agentType, toolName) => {
    expect(scopeViolation({ agentId: 'a', agentType, toolName })).not.toBeNull();
  });

  it('fails closed when either agent field is missing inside a sub-agent', () => {
    expect(scopeViolation({ agentId: 'a', agentType: undefined, toolName: t('run_sql') })).toMatch(
      /not a DataDesk agent/,
    );
    // A CLI that stopped sending agent_id must not turn the hook off.
    expect(
      scopeViolation({ agentId: undefined, agentType: 'report-writer', toolName: t('run_sql') }),
    ).toMatch(/report-writer may not use/);
  });
});

describe('scope hook: main-thread delegations', () => {
  const ok = { subagent_type: 'profiler', description: 'Profile sales', prompt: 'Profile it' };

  it('lets the main thread use its own tools and delegate with exactly the allowed fields', async () => {
    await expect(run(pre(t('register_dataset'), { path: 'C:/x.csv' }))).resolves.toEqual({});
    await expect(run(pre('Agent', ok))).resolves.toEqual({});
    await expect(run(pre('Task', ok))).resolves.toEqual({});
  });

  it.each([
    ['a built-in agent', { ...ok, subagent_type: 'general-purpose' }],
    ['a fork', { ...ok, subagent_type: 'fork' }],
    ['a model override', { ...ok, model: 'opus' }],
    ['a background run', { ...ok, run_in_background: true }],
    ['an isolation mode', { ...ok, isolation: 'remote' }],
    ['a named agent', { ...ok, name: 'x' }],
    ['no prompt', { subagent_type: 'profiler', description: 'd' }],
    ['a non-object input', 'profiler'],
  ])('denies a delegation with %s', async (_label, input) => {
    await expect(run(pre('Agent', input))).resolves.toEqual(
      denied(/only subagent_type \(profiler, sql-analyst, report-writer, dataset-scout\)/),
    );
  });
});
