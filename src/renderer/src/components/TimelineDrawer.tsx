import { useAgent } from '../agent/AgentProvider';
import type { TimelineItem } from '../agent/agentState';
import { Panel } from './Panel';

/** mcp__datadesk__run_sql → datadesk · run_sql */
function toolLabel(name: string): string {
  const match = /^mcp__(.+?)__(.+)$/.exec(name);
  return match ? `${match[1] ?? ''} · ${match[2] ?? ''}` : name;
}

function Item({ item }: { item: TimelineItem }) {
  switch (item.kind) {
    case 'session':
      return (
        <li className="text-xs text-slate-500">
          Session started · {item.model} ·{' '}
          {item.mcpServers.map((s) => `${s.name} (${s.status})`).join(', ') || 'no MCP servers'} ·{' '}
          {item.tools.length} tools
        </li>
      );
    case 'tool': {
      const duration = item.result
        ? `${String(item.result.finishedAt - item.startedAt)} ms`
        : 'running…';
      const state = !item.result ? '⏳' : item.result.isError ? '✗' : '✓';
      return (
        <li>
          <details className="rounded border border-slate-800 bg-slate-900/50">
            <summary className="cursor-pointer px-2 py-1 text-xs">
              <span aria-hidden="true">{state}</span>{' '}
              <span className="font-mono">{toolLabel(item.name)}</span>{' '}
              <span className="text-slate-500">{duration}</span>
            </summary>
            <div className="space-y-1 px-2 pb-2 text-xs">
              <pre className="overflow-auto rounded bg-slate-950 p-2 whitespace-pre-wrap">
                {item.input}
              </pre>
              {item.result && (
                <pre
                  className={`max-h-48 overflow-auto rounded p-2 whitespace-pre-wrap ${
                    item.result.isError ? 'bg-red-950 text-red-200' : 'bg-slate-950'
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
    case 'turn':
      return (
        <li className="text-xs text-slate-500">
          {item.ok ? 'Turn complete' : `Turn ended: ${item.reason}`} · {item.numTurns} step(s) ·{' '}
          {(item.durationMs / 1000).toFixed(1)} s · ${item.costUsd.toFixed(4)}
        </li>
      );
    case 'approval':
      return (
        <li className="text-xs text-amber-300">
          Approval: {item.title} →{' '}
          {item.approved === null ? 'waiting' : item.approved ? 'approved' : 'denied'}
        </li>
      );
    case 'error':
      return (
        <li role="alert" className="text-xs text-red-300">
          {item.message}
        </li>
      );
  }
}

export function TimelineDrawer() {
  const { state } = useAgent();
  return (
    <Panel title="Agent timeline" className="h-56 shrink-0 border-t border-slate-800">
      {state.timeline.length === 0 ? (
        <p className="text-sm text-slate-500">
          Every tool call the analyst makes shows up here, live, with inputs, results, timing and
          cost.
        </p>
      ) : (
        <ol aria-label="Timeline" className="space-y-1">
          {state.timeline.map((item) => (
            <Item key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </ol>
      )}
    </Panel>
  );
}
