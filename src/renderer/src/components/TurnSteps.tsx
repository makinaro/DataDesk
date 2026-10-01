import { isSubagentTool } from '../../../shared/agent';
import type { ToolCallItem } from '../agent/agentState';
import { TimelineList, toolLabel } from './TimelineDrawer';

function subagentType(item: ToolCallItem): string | null {
  if (!isSubagentTool(item.name)) return null;
  return toolLabel(item.name, item.input).replace(/^agent · /, '');
}

/** One-line summary of a turn's tool calls, e.g. "✓ 5 steps · sql-analyst · 6.2 s". */
export function stepsSummary(items: readonly ToolCallItem[], running: boolean): string {
  const pending = items.filter((i) => !i.result);
  if (running && pending.length > 0) {
    const latest = pending.at(-1);
    return `● Working · ${latest ? toolLabel(latest.name, latest.input) : ''}…`;
  }
  const agents = [...new Set(items.map(subagentType).filter((t): t is string => t !== null))];
  const start = Math.min(...items.map((i) => i.startedAt));
  const end = Math.max(...items.map((i) => i.result?.finishedAt ?? i.startedAt));
  const icon = pending.length > 0 ? '■' : items.some((i) => i.result?.isError) ? '⚠' : '✓';
  const count = `${String(items.length)} step${items.length === 1 ? '' : 's'}`;
  return [`${icon} ${count}`, ...agents, `${((end - start) / 1000).toFixed(1)} s`].join(' · ');
}

/** A turn's tool calls, folded under the question in the chat (Results-first layout). */
export function TurnSteps({ items, running }: { items: ToolCallItem[]; running: boolean }) {
  if (items.length === 0) return null;
  return (
    <li className="mb-3">
      <details className="rounded-lg border border-line text-xs">
        <summary className="cursor-pointer list-none px-2.5 py-1 text-muted hover:text-fg">
          {stepsSummary(items, running)}
        </summary>
        <div className="max-h-72 overflow-auto border-t border-line p-2">
          <TimelineList items={items} label="Steps" />
        </div>
      </details>
    </li>
  );
}
