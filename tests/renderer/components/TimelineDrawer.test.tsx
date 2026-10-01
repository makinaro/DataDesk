import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatPanel } from '../../../src/renderer/src/components/ChatPanel';
import {
  laneTree,
  TimelineDrawer,
  toolLabel,
} from '../../../src/renderer/src/components/TimelineDrawer';
import type { TimelineItem } from '../../../src/renderer/src/agent/agentState';
import { renderWithProviders } from '../renderApp';

const tool = (id: string, name: string, parentToolUseId: string | null): TimelineItem => ({
  kind: 'tool',
  id,
  name,
  input: '{}',
  parentToolUseId,
  turnId: null,
  startedAt: 0,
});

describe('laneTree', () => {
  it('nests calls under the sub-agent call that made them, keeping orphans top-level', () => {
    const items = [
      tool('a1', 'Agent', null),
      tool('c1', 'mcp__datadesk__run_sql', 'a1'),
      tool('t1', 'Task', null),
      tool('c2', 'mcp__datadesk__save_report', 't1'),
      tool('orphan', 'mcp__datadesk__get_schema', 'gone'),
      tool('main', 'mcp__datadesk__list_datasets', null),
    ];
    const { top, childrenOf } = laneTree(items);
    expect(top.map((i) => i.id)).toEqual(['a1', 't1', 'orphan', 'main']);
    expect(childrenOf.get('a1')?.map((i) => i.id)).toEqual(['c1']);
    expect(childrenOf.get('t1')?.map((i) => i.id)).toEqual(['c2']);
  });

  it('never hides items in a parent cycle (only top-level sub-agent calls are lanes)', () => {
    const items = [tool('a', 'Agent', 'b'), tool('b', 'Agent', 'a'), tool('c', 'Task', 'a')];
    const { top, childrenOf } = laneTree(items);
    expect(top.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(childrenOf.size).toBe(0);
  });

  it('labels sub-agent calls by agent type', () => {
    expect(toolLabel('Agent', JSON.stringify({ subagent_type: 'profiler' }))).toBe(
      'agent · profiler',
    );
    expect(toolLabel('Task', '{"subagent_type": "sql-an')).toBe('agent · ?'); // truncated
  });
});

describe('TimelineDrawer sub-agent lanes', () => {
  it('shows each sub-agent as a lane with its own tool calls and its message, not in chat', () => {
    const { api } = renderWithProviders(
      <>
        <ChatPanel />
        <TimelineDrawer />
      </>,
    );
    act(() => {
      api.emit({
        kind: 'tool_call',
        toolUseId: 'toolu_agent',
        name: 'Agent',
        input: JSON.stringify({
          subagent_type: 'profiler',
          description: 'Profile sales',
          prompt: 'Profile the sales dataset',
        }),
        parentToolUseId: null,
      });
      api.emit({
        kind: 'tool_call',
        toolUseId: 'toolu_inner',
        name: 'mcp__datadesk__profile_column',
        input: '{"dataset":"sales","column":"units"}',
        parentToolUseId: 'toolu_agent',
      });
      api.emit({
        kind: 'assistant_message',
        messageId: 'sub-1',
        text: 'units has no nulls; median 9',
        parentToolUseId: 'toolu_agent',
      });
    });

    const lane = screen.getByRole('list', { name: 'profiler lane' });
    expect(within(lane).getByText('datadesk · profile_column')).toBeInTheDocument();
    const timeline = screen.getByRole('list', { name: 'Timeline' });
    expect(within(timeline).getByText('agent · profiler')).toBeInTheDocument();
    expect(within(timeline).getByText(/Profile sales/)).toBeInTheDocument();
    expect(within(timeline).getByText('units has no nulls; median 9')).toBeInTheDocument();
    // The sub-agent's text stays out of the main conversation.
    const convo = screen.getByRole('list', { name: 'Conversation' });
    expect(within(convo).queryByText('units has no nulls; median 9')).not.toBeInTheDocument();
  });
});
