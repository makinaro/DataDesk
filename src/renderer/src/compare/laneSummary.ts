import type { AgentState } from '../agent/agentState';
import { toolLabel } from '../components/TimelineDrawer';

export interface LaneTool {
  id: string;
  label: string;
  /** Called by a sub-agent (shown indented). */
  nested: boolean;
  /** null while running. */
  ms: number | null;
  isError: boolean;
}

/** What compare mode shows for one provider: answer, tool calls, cost and latency. */
export interface LaneSummary {
  model: string | null;
  busy: boolean;
  answer: string;
  tools: LaneTool[];
  costUsd: number;
  /** Turn time the provider's SDK reports (null until the turn ends). */
  turnMs: number | null;
  /** Model calls by the analyst in this turn. */
  steps: number | null;
  outcome: { ok: boolean; reason: string } | null;
  /** When the turn finished (main's clock), for time-to-answer from the click. */
  finishedAt: number | null;
  errors: string[];
}

const BUSY = new Set(['starting', 'running', 'stopping']);

/**
 * Reduces one lane's agent state (the chat's own reducer, fed with that lane's events) to the
 * comparison. Pure, so both lanes are summarized the same way whichever SDK ran them.
 */
export function summarizeLane(state: AgentState): LaneSummary {
  const turn = state.timeline.findLast((item) => item.kind === 'turn');
  return {
    model: state.model,
    busy: BUSY.has(state.status),
    answer: state.messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.text)
      .join('\n\n'),
    tools: state.timeline.flatMap((item) =>
      item.kind === 'tool'
        ? [
            {
              id: item.id,
              label: toolLabel(item.name, item.input),
              nested: item.parentToolUseId !== null,
              ms: item.result ? item.result.finishedAt - item.startedAt : null,
              isError: item.result?.isError ?? false,
            },
          ]
        : [],
    ),
    costUsd: state.sessionCostUsd,
    turnMs: turn?.durationMs ?? null,
    steps: turn?.numTurns ?? null,
    outcome: turn ? { ok: turn.ok, reason: turn.reason } : null,
    finishedAt: turn?.at ?? null,
    errors: state.timeline.flatMap((item) => (item.kind === 'error' ? [item.message] : [])),
  };
}
