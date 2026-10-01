import { describe, expect, it } from 'vitest';
import { AUTO_APPROVED_TOOLS, SKILL_NAMES } from '../../../../src/main/agent/claude/agentOptions';
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
      expect(def.omitClaudeMd).toBe(true);
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
