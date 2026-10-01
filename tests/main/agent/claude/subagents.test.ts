import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { autoApprovedTools, SKILL_NAMES } from '../../../../src/main/agent/claude/agentOptions';
import {
  buildSubagents,
  SUBAGENT_NAMES,
  SUBAGENT_SKILLS,
  subagentNames,
  type SubagentName,
} from '../../../../src/main/agent/claude/subagents';

const t = (name: string) => `mcp__datadesk__${name}`;
const hf = (name: string) => `mcp__hf__${name}`;

function defs(tools: { openaiTools: boolean; hfTools: boolean }) {
  const agents = buildSubagents(tools);
  return (name: SubagentName): AgentDefinition => {
    const def = agents[name];
    if (!def) throw new Error(`${name} is not defined`);
    return def;
  };
}

describe('sub-agent definitions (the scope table)', () => {
  const agent = defs({ openaiTools: false, hfTools: false });

  it('gives each sub-agent exactly its tools', () => {
    expect(agent('profiler').tools).toEqual([
      t('list_datasets'),
      t('get_schema'),
      t('sample_rows'),
      t('profile_column'),
      t('run_sql'),
    ]);
    expect(agent('sql-analyst').tools).toEqual([
      t('list_datasets'),
      t('get_schema'),
      t('sample_rows'),
      t('run_sql'),
      t('create_chart'),
    ]);
    expect(agent('report-writer').tools).toEqual([t('save_report')]);
  });

  it('report-writer gets nothing that executes SQL or reads rows', () => {
    for (const forbidden of ['run_sql', 'create_chart', 'sample_rows', 'profile_column']) {
      expect(agent('report-writer').tools).not.toContain(t(forbidden));
    }
  });

  it('no sub-agent can nest, ask the user, use built-ins, or call skills at runtime', () => {
    const all = defs({ openaiTools: true, hfTools: true });
    const autoRun = autoApprovedTools({ openaiTools: true, hfTools: true });
    for (const name of SUBAGENT_NAMES) {
      const def = all(name);
      expect(def.tools ?? []).not.toContain('Agent');
      expect(def.tools ?? []).not.toContain(t('register_dataset'));
      expect(def.tools ?? []).not.toContain(t('load_hf_dataset'));
      // Only tools the main analyst may auto-run anyway.
      for (const tool of def.tools ?? []) expect(autoRun).toContain(tool);
      expect(def.disallowedTools).toEqual(
        expect.arrayContaining([
          'Agent',
          'Task',
          'Skill',
          t('register_dataset'),
          t('load_hf_dataset'),
        ]),
      );
      // No fields that would widen a sub-agent's power or load anything from disk.
      for (const key of ['permissionMode', 'mcpServers', 'memory', 'background']) {
        expect(def).not.toHaveProperty(key);
      }
      expect(def.maxTurns).toBeGreaterThan(0);
      expect(def.omitClaudeMd).toBe(true);
    }
  });

  it('preloads only our plugin skills', () => {
    const all = defs({ openaiTools: false, hfTools: true });
    for (const name of SUBAGENT_NAMES) {
      expect(all(name).skills).toEqual([...SUBAGENT_SKILLS[name]]);
      for (const skill of all(name).skills ?? []) {
        expect(SKILL_NAMES as readonly string[]).toContain(skill);
      }
    }
  });
});

describe('dataset-scout (only with Hugging Face)', () => {
  it('does not exist without the HF server', () => {
    expect(subagentNames({ hfTools: false })).not.toContain('dataset-scout');
    expect(buildSubagents({ openaiTools: false, hfTools: false })).not.toHaveProperty(
      'dataset-scout',
    );
  });

  it('reads the Hub and the dataset list only: no rows, no SQL, no downloads', () => {
    const scout = defs({ openaiTools: true, hfTools: true })('dataset-scout');
    expect(scout.tools).toEqual([
      hf('hub_repo_search'),
      hf('hub_repo_details'),
      hf('hf_fs'),
      t('list_datasets'),
    ]);
    expect(scout.skills).toEqual(['datadesk:evaluating-datasets']);
    expect(scout.prompt).toMatch(/untrusted/);
    expect(scout.prompt).toMatch(/cannot download/);
  });

  it('is the only sub-agent with Hub tools', () => {
    const all = defs({ openaiTools: true, hfTools: true });
    for (const name of SUBAGENT_NAMES.filter((n) => n !== 'dataset-scout')) {
      expect((all(name).tools ?? []).some((tool) => tool.startsWith('mcp__hf__'))).toBe(false);
    }
  });
});
