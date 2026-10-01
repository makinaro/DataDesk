import { useMemo, type CSSProperties } from 'react';
import { isSubagentTool as isSubagentCall } from '../../../shared/agent';
import { useAgent } from '../agent/AgentProvider';
import type { TimelineItem, ToolCallItem } from '../agent/agentState';
import { Panel } from './Panel';

function parseInput(input: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(input);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {}; // truncated preview
  }
}

/**
 * mcp__datadesk__run_sql → datadesk · run_sql; Skill {skill: 'datadesk:eda-checklist'} →
 * skill · eda-checklist; Agent {subagent_type: 'profiler'} → agent · profiler
 */
export function toolLabel(name: string, input: string): string {
  if (name === 'Skill') {
    const skill = parseInput(input).skill;
    return `skill · ${(typeof skill === 'string' ? skill : '?').replace(/^datadesk:/, '')}`;
  }
  if (isSubagentCall(name)) {
    const type = parseInput(input).subagent_type;
    return `agent · ${typeof type === 'string' ? type : '?'}`;
  }
  const match = /^mcp__(.+?)__(.+)$/.exec(name);
  return match ? `${match[1] ?? ''} · ${match[2] ?? ''}` : name;
}

function status(item: ToolCallItem): { icon: string; duration: string } {
  const duration = item.result
    ? `${String(item.result.finishedAt - item.startedAt)} ms`
    : 'running…';
  const icon = !item.result ? '⏳' : item.result.isError ? '✗' : '✓';
  return { icon, duration };
}

function ToolCall({ item }: { item: ToolCallItem }) {
  const { icon, duration } = status(item);
  return (
    <li>
      <details className="rounded border border-line bg-surface">
        <summary className="cursor-pointer px-2 py-1 text-xs">
          <span aria-hidden="true">{icon}</span>{' '}
          <span className="font-mono">{toolLabel(item.name, item.input)}</span>{' '}
          <span className="text-faint">{duration}</span>
        </summary>
        <div className="space-y-1 px-2 pb-2 text-xs">
          <pre className="overflow-auto rounded bg-canvas p-2 whitespace-pre-wrap">
            {item.input}
          </pre>
          {item.result && (
            <pre
              className={`max-h-48 overflow-auto rounded p-2 whitespace-pre-wrap ${
                item.result.isError ? 'bg-danger-soft text-danger' : 'bg-canvas'
              }`}
            >
              {item.result.output}
            </pre>
          )}
        </div>
      </details>
    </li>
  );
}

/** A sub-agent's lane: its task, its own tool calls (nested), and its latest message. */
function SubagentLane({
  item,
  childrenOf,
}: {
  item: ToolCallItem;
  childrenOf: Map<string, TimelineItem[]>;
}) {
  const { icon, duration } = status(item);
  const input = parseInput(item.input);
  const type = typeof input.subagent_type === 'string' ? input.subagent_type : 'sub-agent';
  const task = typeof input.description === 'string' ? input.description : '';
  const children = childrenOf.get(item.id) ?? [];
  return (
    <li className="rounded border border-line bg-surface p-2">
      <p className="text-xs">
        <span aria-hidden="true">{icon}</span>{' '}
        <span className="font-mono text-agent">agent · {type}</span>
        {task && <span className="text-muted"> · {task}</span>}{' '}
        <span className="text-faint">
          {duration} · {children.length} tool call(s)
        </span>
      </p>
      {children.length > 0 && (
        <ol aria-label={`${type} lane`} className="mt-1 ml-3 space-y-1 border-l border-line pl-2">
          {children.map((child) => (
            <Item key={`${child.kind}-${child.id}`} item={child} childrenOf={childrenOf} />
          ))}
        </ol>
      )}
      {item.agentText && (
        <p className="mt-1 ml-3 line-clamp-3 text-xs whitespace-pre-wrap text-muted">
          {item.agentText}
        </p>
      )}
    </li>
  );
}

function Item({
  item,
  childrenOf,
}: {
  item: TimelineItem;
  childrenOf: Map<string, TimelineItem[]>;
}) {
  switch (item.kind) {
    case 'session':
      return (
        <li className="text-xs text-faint">
          Session started · {item.model} ·{' '}
          {item.mcpServers.map((s) => `${s.name} (${s.status})`).join(', ') || 'no MCP servers'} ·{' '}
          {item.tools.length} tools
        </li>
      );
    case 'tool':
      return isSubagentCall(item.name) ? (
        <SubagentLane item={item} childrenOf={childrenOf} />
      ) : (
        <ToolCall item={item} />
      );
    case 'turn':
      return (
        <li className="text-xs text-faint">
          {item.ok ? 'Turn complete' : `Turn ended: ${item.reason}`} · {item.numTurns} step(s) ·{' '}
          {(item.durationMs / 1000).toFixed(1)} s · ${item.costUsd.toFixed(4)}
        </li>
      );
    case 'approval':
      return (
        <li className="text-xs text-warn">
          Approval: {item.title} →{' '}
          {item.approved === null ? 'waiting' : item.approved ? 'approved' : 'denied'}
        </li>
      );
    case 'reset':
      return (
        <li className="text-xs text-faint">
          New conversation (
          {item.reason === 'settings' ? 'analyst settings changed' : 'Anthropic key changed'})
        </li>
      );
    case 'error':
      return (
        <li role="alert" className="text-xs text-danger">
          {item.message}
        </li>
      );
  }
}

/**
 * Groups tool calls under the sub-agent call that made them (parentToolUseId). Only top-level
 * sub-agent calls become lanes (sub-agents can't nest), so there are no cycles; calls whose
 * parent isn't a lane stay top-level, so nothing is ever hidden.
 */
export function laneTree(timeline: readonly TimelineItem[]): {
  top: TimelineItem[];
  childrenOf: Map<string, TimelineItem[]>;
} {
  const lanes = new Set<string>();
  for (const item of timeline) {
    if (item.kind === 'tool' && item.parentToolUseId === null && isSubagentCall(item.name)) {
      lanes.add(item.id);
    }
  }
  const top: TimelineItem[] = [];
  const childrenOf = new Map<string, TimelineItem[]>();
  for (const item of timeline) {
    const parent = item.kind === 'tool' ? item.parentToolUseId : null;
    if (parent !== null && lanes.has(parent)) {
      const children = childrenOf.get(parent);
      if (children) children.push(item);
      else childrenOf.set(parent, [item]);
    } else {
      top.push(item);
    }
  }
  return { top, childrenOf };
}

/** Timeline items with sub-agent lanes; used by the drawer and by inline turn steps. */
export function TimelineList({ items, label }: { items: readonly TimelineItem[]; label: string }) {
  const { top, childrenOf } = useMemo(() => laneTree(items), [items]);
  return (
    <ol aria-label={label} className="space-y-1">
      {top.map((item) => (
        <Item key={`${item.kind}-${item.id}`} item={item} childrenOf={childrenOf} />
      ))}
    </ol>
  );
}

export function TimelineDrawer({ style }: { style?: CSSProperties }) {
  const { state } = useAgent();
  return (
    <Panel title="Agent timeline" style={style} className="shrink-0">
      {state.timeline.length === 0 ? (
        <p className="text-sm text-faint">
          Every tool call the analyst makes shows up here, live, with inputs, results, timing and
          cost. Sub-agents get their own lane.
        </p>
      ) : (
        <TimelineList items={state.timeline} label="Timeline" />
      )}
    </Panel>
  );
}
