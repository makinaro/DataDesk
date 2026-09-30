import type { AgentEvent, AgentStatus } from '../../../shared/agent';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Still receiving deltas. */
  streaming: boolean;
}

export interface ToolCallItem {
  kind: 'tool';
  id: string;
  name: string;
  input: string;
  parentToolUseId: string | null;
  startedAt: number;
  result?: { isError: boolean; output: string; finishedAt: number };
}

export type TimelineItem =
  | ToolCallItem
  | {
      kind: 'session';
      id: string;
      at: number;
      model: string;
      tools: string[];
      mcpServers: { name: string; status: string }[];
    }
  | {
      kind: 'turn';
      id: string;
      at: number;
      ok: boolean;
      reason: string;
      costUsd: number;
      durationMs: number;
      numTurns: number;
    }
  | { kind: 'error'; id: string; at: number; message: string }
  | { kind: 'approval'; id: string; at: number; title: string; approved: boolean | null };

export interface PendingApproval {
  requestId: string;
  toolName: string;
  title: string;
  detail: string;
}

export interface AgentState {
  status: AgentStatus;
  model: string | null;
  messages: ChatMessage[];
  timeline: TimelineItem[];
  pendingApproval: PendingApproval | null;
  sessionCostUsd: number;
  lastSeq: number;
}

export const initialAgentState: AgentState = {
  status: 'idle',
  model: null,
  messages: [],
  timeline: [],
  pendingApproval: null,
  sessionCostUsd: 0,
  lastSeq: -1,
};

export type AgentAction =
  | { type: 'event'; event: AgentEvent }
  | { type: 'user_message'; id: string; text: string }
  | { type: 'reset' };

function upsertAssistant(
  messages: ChatMessage[],
  id: string,
  update: (prev: ChatMessage) => ChatMessage,
): ChatMessage[] {
  const index = messages.findIndex((m) => m.id === id);
  if (index === -1) {
    return [...messages, update({ id, role: 'assistant', text: '', streaming: true })];
  }
  const next = [...messages];
  const prev = next[index];
  if (prev) next[index] = update(prev);
  return next;
}

/** Pure reducer from agent events to UI state (unit-tested without Electron). */
export function agentReducer(state: AgentState, action: AgentAction): AgentState {
  if (action.type === 'reset') return { ...initialAgentState, lastSeq: state.lastSeq };
  if (action.type === 'user_message') {
    return {
      ...state,
      messages: [
        ...state.messages,
        { id: action.id, role: 'user', text: action.text, streaming: false },
      ],
    };
  }

  const e = action.event;
  if (e.seq <= state.lastSeq) return state; // duplicate or out-of-order delivery
  const s = { ...state, lastSeq: e.seq };

  switch (e.kind) {
    case 'status':
      return { ...s, status: e.status };
    case 'session':
      return {
        ...s,
        model: e.model,
        timeline: [
          ...s.timeline,
          {
            kind: 'session',
            id: `session-${String(e.seq)}`,
            at: e.at,
            model: e.model,
            tools: e.tools,
            mcpServers: e.mcpServers,
          },
        ],
      };
    case 'text_delta':
      // Sub-agent text (parentToolUseId set) belongs in the timeline, not the main chat (Phase 4).
      if (e.parentToolUseId !== null) return s;
      return {
        ...s,
        messages: upsertAssistant(s.messages, e.messageId, (m) => ({
          ...m,
          text: m.text + e.delta,
          streaming: true,
        })),
      };
    case 'assistant_message':
      if (e.parentToolUseId !== null) return s;
      return {
        ...s,
        messages: upsertAssistant(s.messages, e.messageId, (m) => ({
          ...m,
          text: e.text,
          streaming: false,
        })),
      };
    case 'tool_call':
      return {
        ...s,
        timeline: [
          ...s.timeline,
          {
            kind: 'tool',
            id: e.toolUseId,
            name: e.name,
            input: e.input,
            parentToolUseId: e.parentToolUseId,
            startedAt: e.at,
          },
        ],
      };
    case 'tool_result':
      return {
        ...s,
        timeline: s.timeline.map((item) =>
          item.kind === 'tool' && item.id === e.toolUseId
            ? { ...item, result: { isError: e.isError, output: e.output, finishedAt: e.at } }
            : item,
        ),
      };
    case 'approval_request':
      return {
        ...s,
        pendingApproval: {
          requestId: e.requestId,
          toolName: e.toolName,
          title: e.title,
          detail: e.detail,
        },
        timeline: [
          ...s.timeline,
          { kind: 'approval', id: e.requestId, at: e.at, title: e.title, approved: null },
        ],
      };
    case 'approval_resolved':
      return {
        ...s,
        pendingApproval: s.pendingApproval?.requestId === e.requestId ? null : s.pendingApproval,
        timeline: s.timeline.map((item) =>
          item.kind === 'approval' && item.id === e.requestId
            ? { ...item, approved: e.approved }
            : item,
        ),
      };
    case 'turn_complete':
      return {
        ...s,
        sessionCostUsd: e.sessionCostUsd,
        messages: s.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
        timeline: [
          ...s.timeline,
          {
            kind: 'turn',
            id: `turn-${String(e.seq)}`,
            at: e.at,
            ok: e.ok,
            reason: e.reason,
            costUsd: e.costUsd,
            durationMs: e.durationMs,
            numTurns: e.numTurns,
          },
        ],
      };
    case 'error':
      return {
        ...s,
        timeline: [
          ...s.timeline,
          { kind: 'error', id: `error-${String(e.seq)}`, at: e.at, message: e.message },
        ],
      };
  }
}
