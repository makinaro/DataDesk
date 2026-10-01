import type { HookInput } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { AUTO_APPROVED_TOOLS, SKILL_NAMES } from '../../../../src/main/agent/claude/agentOptions';
import { scopeHook, scopeViolation } from '../../../../src/main/agent/claude/scopeHook';
import {
  buildSubagents,
  SUBAGENT_NAMES,
  SUBAGENT_SKILLS,
} from '../../../../src/main/agent/claude/subagents';

const t = (name: string) => `mcp__datadesk__${name}`;

describe('sub-agent definitions (the scope table)', () => {
  const agents = buildSubagents();

  it('gives each sub-agent exactly its tools', () => {
    expect(agents.profiler.tools).toEqual([
      t('list_datasets'),
      t('get_schema'),
      t('sample_rows'),
      t('profile_column'),
      t('run_sql'),
    ]);
    expect(agents['sql-analyst'].tools).toEqual([
      t('list_datasets'),
      t('get_schema'),
      t('sample_rows'),
      t('run_sql'),
      t('create_chart'),
    ]);
    expect(agents['report-writer'].tools).toEqual([t('save_report')]);
  });

  it('report-writer gets nothing that executes SQL or reads rows', () => {
    for (const forbidden of ['run_sql', 'create_chart', 'sample_rows', 'profile_column']) {
      expect(agents['report-writer'].tools).not.toContain(t(forbidden));
    }
  });

  it('no sub-agent can nest, ask the user, use built-ins, or call skills at runtime', () => {
    for (const name of SUBAGENT_NAMES) {
      const def = agents[name];
      expect(def.tools ?? []).not.toContain('Agent');
      expect(def.tools ?? []).not.toContain(t('register_dataset'));
      // Only DataDesk tools the main analyst may auto-run anyway.
      for (const tool of def.tools ?? []) {
        expect(AUTO_APPROVED_TOOLS as readonly string[]).toContain(tool);
      }
      expect(def.disallowedTools).toEqual(
        expect.arrayContaining(['Agent', 'Task', 'Skill', t('register_dataset')]),
      );
      // No fields that would widen a sub-agent's power or load anything from disk.
      for (const key of ['permissionMode', 'mcpServers', 'memory', 'background']) {
        expect(def).not.toHaveProperty(key);
      }
      expect(def.maxTurns).toBeGreaterThan(0);
    }
  });

  it('preloads only our plugin skills', () => {
    for (const name of SUBAGENT_NAMES) {
      expect(agents[name].skills).toEqual([...SUBAGENT_SKILLS[name]]);
      for (const skill of agents[name].skills ?? []) {
        expect(SKILL_NAMES as readonly string[]).toContain(skill);
      }
    }
  });
});

describe('scope hook (defense in depth)', () => {
  const pre = (tool: string, agent?: { id: string; type: string }) =>
    ({
      hook_event_name: 'PreToolUse',
      session_id: 's',
      transcript_path: 't',
      cwd: 'c',
      tool_name: tool,
      tool_input: {},
      tool_use_id: 'u',
      ...(agent ? { agent_id: agent.id, agent_type: agent.type } : {}),
    }) as HookInput;
  const run = (input: HookInput) => scopeHook(input, 'u', { signal: new AbortController().signal });

  it('denies run_sql for report-writer even if the SDK handed it the tool', async () => {
    await expect(run(pre(t('run_sql'), { id: 'a1', type: 'report-writer' }))).resolves.toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: expect.stringContaining('report-writer may not use') as string,
      },
    });
  });

  it('allows in-scope sub-agent calls and leaves main-thread calls alone', async () => {
    await expect(run(pre(t('save_report'), { id: 'a1', type: 'report-writer' }))).resolves.toEqual(
      {},
    );
    await expect(run(pre(t('run_sql'), { id: 'a2', type: 'sql-analyst' }))).resolves.toEqual({});
    await expect(run(pre(t('register_dataset')))).resolves.toEqual({});
  });

  it.each([
    ['profiler', t('create_chart')],
    ['profiler', t('save_report')],
    ['sql-analyst', t('register_dataset')],
    ['sql-analyst', 'Skill'],
    ['report-writer', 'Agent'],
    ['general-purpose', t('list_datasets')],
  ])('%s may not use %s', (agentType, toolName) => {
    expect(scopeViolation({ agentId: 'a', agentType, toolName })).not.toBeNull();
  });

  it('keys on agent_id: a missing agent type inside a sub-agent is blocked', () => {
    expect(scopeViolation({ agentId: 'a', agentType: undefined, toolName: t('run_sql') })).toMatch(
      /not a DataDesk agent/,
    );
  });
});
