import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { preview, type AgentEventInput } from '../../../shared/agent';

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  is_error?: boolean;
  content?: string | { type: string; text?: string }[];
}

function toolResultText(block: ToolResultBlock): string {
  if (typeof block.content === 'string') return block.content;
  return (block.content ?? [])
    .map((c) => (c.type === 'text' ? (c.text ?? '') : `[${c.type}]`))
    .join('\n');
}

const ARTIFACT_TOOLS: Record<string, 'chart' | 'report'> = {
  mcp__datadesk__create_chart: 'chart',
  mcp__datadesk__save_report: 'report',
};

/**
 * datadesk-mcp's text result is a summary line followed by the structuredContent JSON
 * (src/mcp-server/server.ts `ok`). Pull the artifact id and title out of it.
 */
function artifactFromResult(
  toolName: string | undefined,
  text: string,
): AgentEventInput | undefined {
  const artifactKind = toolName === undefined ? undefined : ARTIFACT_TOOLS[toolName];
  if (!artifactKind) return undefined;
  // JSON.stringify never emits raw newlines, so the JSON starts after the last one (a title
  // in the summary line could contain a newline).
  const json = text.slice(text.lastIndexOf('\n') + 1);
  try {
    const parsed = JSON.parse(json) as { chartId?: unknown; reportId?: unknown; title?: unknown };
    const id = artifactKind === 'chart' ? parsed.chartId : parsed.reportId;
    if (typeof id !== 'string' || typeof parsed.title !== 'string') return undefined;
    return { kind: 'artifact', artifactKind, id, title: parsed.title.slice(0, 200) };
  } catch {
    return undefined;
  }
}

/**
 * Translates Claude Agent SDK messages into provider-neutral AgentEvents.
 * Stateful: it remembers which message is streaming (for text deltas), which blocks and tool
 * calls were already emitted (the SDK may repeat them), and the running cost total.
 */
export function createSdkMapper() {
  const streaming = new Map<string, string>(); // parent_tool_use_id ('' = main) → message id
  const textBlocks = new Map<string, string[]>(); // message id → text blocks seen
  const toolCalls = new Map<string, string>(); // tool_use id → tool name
  let lastTotalCostUsd = 0;
  let lastSessionId: string | undefined;
  // Whether the current turn produced any main-thread assistant text (see the result case).
  let answeredThisTurn = false;

  return (m: SDKMessage): AgentEventInput[] => {
    switch (m.type) {
      case 'system':
        // The CLI re-sends init on every turn of a streaming session; report each session once.
        if (m.subtype !== 'init' || m.session_id === lastSessionId) return [];
        lastSessionId = m.session_id;
        return [
          {
            kind: 'session',
            sessionId: m.session_id,
            model: m.model,
            tools: m.tools,
            mcpServers: m.mcp_servers.map(({ name, status }) => ({ name, status })),
          },
        ];

      case 'stream_event': {
        const key = m.parent_tool_use_id ?? '';
        const e = m.event;
        if (e.type === 'message_start') {
          streaming.set(key, e.message.id);
          return [];
        }
        if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') {
          const messageId = streaming.get(key);
          if (messageId === undefined) return [];
          return [
            {
              kind: 'text_delta',
              messageId,
              delta: e.delta.text,
              parentToolUseId: m.parent_tool_use_id,
            },
          ];
        }
        return [];
      }

      case 'assistant': {
        const out: AgentEventInput[] = [];
        const id = m.message.id;
        const seen = textBlocks.get(id) ?? [];
        let changed = false;
        for (const block of m.message.content) {
          if (block.type === 'text' && block.text && !seen.includes(block.text)) {
            seen.push(block.text);
            changed = true;
          }
          if (block.type === 'tool_use' && !toolCalls.has(block.id)) {
            toolCalls.set(block.id, block.name);
            out.push({
              kind: 'tool_call',
              toolUseId: block.id,
              name: block.name,
              input: preview(block.input),
              parentToolUseId: m.parent_tool_use_id,
            });
          }
        }
        textBlocks.set(id, seen);
        if (changed) {
          if (m.parent_tool_use_id === null) answeredThisTurn = true;
          out.unshift({
            kind: 'assistant_message',
            messageId: id,
            text: seen.join('\n\n'),
            parentToolUseId: m.parent_tool_use_id,
          });
        }
        return out;
      }

      case 'user': {
        const content = m.message.content;
        if (typeof content === 'string') return [];
        const events: AgentEventInput[] = [];
        for (const block of content) {
          if (block.type !== 'tool_result') continue;
          const b = block as ToolResultBlock;
          const text = toolResultText(b);
          const isError = b.is_error === true;
          events.push({
            kind: 'tool_result',
            toolUseId: b.tool_use_id,
            isError,
            output: preview(text),
          });
          if (!isError) {
            const artifact = artifactFromResult(toolCalls.get(b.tool_use_id), text);
            if (artifact) events.push(artifact);
          }
        }
        return events;
      }

      case 'result': {
        const total = m.total_cost_usd;
        const costUsd = Math.max(0, total - lastTotalCostUsd);
        lastTotalCostUsd = total;
        const ok = m.subtype === 'success' && !m.is_error;
        const reason = m.subtype === 'success' ? (m.is_error ? 'error' : 'success') : m.subtype;
        const events: AgentEventInput[] = [
          {
            kind: 'turn_complete',
            ok,
            reason,
            costUsd,
            sessionCostUsd: total,
            durationMs: m.duration_ms,
            numTurns: m.num_turns,
          },
        ];
        if (!ok) {
          const detail = m.subtype === 'success' ? m.result : m.errors.join('; ') || m.subtype;
          events.push({ kind: 'error', message: preview(detail, 2_000) });
        } else if (!answeredThisTurn && m.result) {
          // Turns answered without an assistant message (e.g. "/cost isn't available in this
          // environment." from a disabled slash command) would otherwise leave the chat empty.
          events.unshift({
            kind: 'assistant_message',
            messageId: `result-${m.uuid}`,
            text: m.result,
            parentToolUseId: null,
          });
        }
        answeredThisTurn = false;
        return events;
      }

      default:
        return [];
    }
  };
}
