import { describe, expect, it } from 'vitest';
import type { ToolCallItem } from '../../../src/renderer/src/agent/agentState';
import { stepsSummary } from '../../../src/renderer/src/components/TurnSteps';

const call = (
  id: string,
  name: string,
  startedAt: number,
  finishedAt: number | null,
  extra: Partial<ToolCallItem> = {},
): ToolCallItem => ({
  kind: 'tool',
  id,
  name,
  input: '{}',
  parentToolUseId: null,
  turnId: 'u1',
  startedAt,
  ...(finishedAt === null ? {} : { result: { isError: false, output: '', finishedAt } }),
  ...extra,
});

describe('stepsSummary', () => {
  it('counts steps, names sub-agents and gives the wall-clock time', () => {
    const items = [
      call('a1', 'Agent', 1000, 7200, { input: '{"subagent_type":"sql-analyst"}' }),
      call('c1', 'mcp__datadesk__run_sql', 1500, 1600, { parentToolUseId: 'a1' }),
      call('c2', 'mcp__datadesk__create_chart', 7300, 7400),
    ];
    expect(stepsSummary(items, false)).toBe('✓ 3 steps · sql-analyst · 6.4 s');
  });

  it('shows the latest running step while the turn is running', () => {
    const items = [
      call('c1', 'mcp__datadesk__list_datasets', 0, 10),
      call('c2', 'mcp__datadesk__run_sql', 20, null),
    ];
    expect(stepsSummary(items, true)).toBe('● Working · datadesk · run_sql…');
  });

  it('flags errors, and steps left unfinished by a stopped turn', () => {
    const failed = call('c1', 'mcp__datadesk__run_sql', 0, 100, {
      result: { isError: true, output: 'bad sql', finishedAt: 100 },
    });
    expect(stepsSummary([failed], false)).toBe('⚠ 1 step · 0.1 s');
    expect(stepsSummary([call('c2', 'mcp__datadesk__run_sql', 0, null)], false)).toBe(
      '■ 1 step · 0.0 s',
    );
  });
});
