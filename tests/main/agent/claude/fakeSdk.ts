import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { QueryFn, QueryLike } from '../../../../src/main/agent/claude/claudeOrchestrator';

/**
 * Hand-built SDK messages. Only the fields our code reads are filled in; the cast documents
 * that these are partial fakes (CLAUDE.md: no real API calls in tests).
 */
const msg = (m: Record<string, unknown>) => m as unknown as SDKMessage;

export const WORKSPACE = 'C:/Users/me/AppData/Roaming/DataDesk/agent-workspace';
export const PLUGIN_DIR = 'C:/Program Files/DataDesk/resources/agent-plugin';

export const sdk = {
  init: (over: Record<string, unknown> = {}) =>
    msg({
      type: 'system',
      subtype: 'init',
      session_id: 'sess-1',
      model: 'claude-sonnet-5-5',
      cwd: WORKSPACE,
      permissionMode: 'default',
      apiKeySource: 'ANTHROPIC_API_KEY',
      agents: [],
      skills: [
        'datadesk:chart-style',
        'datadesk:eda-checklist',
        'datadesk:report-format',
        'doctor',
      ],
      plugins: [
        { name: 'datadesk', path: PLUGIN_DIR },
        { name: 'cc-plugin-agents-md', path: 'builtin' },
      ],
      tools: [
        'Skill',
        'mcp__datadesk__list_datasets',
        'mcp__datadesk__get_schema',
        'mcp__datadesk__sample_rows',
        'mcp__datadesk__profile_column',
        'mcp__datadesk__run_sql',
        'mcp__datadesk__register_dataset',
      ],
      mcp_servers: [{ name: 'datadesk', status: 'connected' }],
      ...over,
    }),
  messageStart: (id: string, parent: string | null = null) =>
    msg({
      type: 'stream_event',
      parent_tool_use_id: parent,
      event: { type: 'message_start', message: { id } },
    }),
  textDelta: (text: string, parent: string | null = null) =>
    msg({
      type: 'stream_event',
      parent_tool_use_id: parent,
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    }),
  assistant: (id: string, content: Record<string, unknown>[], parent: string | null = null) =>
    msg({ type: 'assistant', parent_tool_use_id: parent, message: { id, content } }),
  toolResult: (toolUseId: string, text: string, isError = false) =>
    msg({
      type: 'user',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            is_error: isError,
            content: [{ type: 'text', text }],
          },
        ],
      },
    }),
  result: (total: number, over: Record<string, unknown> = {}) =>
    msg({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'done',
      total_cost_usd: total,
      duration_ms: 1500,
      num_turns: 2,
      ...over,
    }),
};

/**
 * A scripted Query: for every user message pulled from the prompt stream it plays the next
 * "turn" of messages. Records prompts, interrupts and closes for assertions.
 */
export function scriptedQuery(turns: SDKMessage[][], opts: { initFirst?: SDKMessage | null } = {}) {
  const calls = {
    prompts: [] as string[],
    interrupts: 0,
    closed: false,
    options: undefined as unknown,
  };
  const queryFn: QueryFn = ({ prompt, options }) => {
    calls.options = options;
    const state = { closed: false };
    const isClosed = () => state.closed;
    const iterator = async function* (): AsyncGenerator<SDKMessage> {
      let first = true;
      for await (const user of prompt) {
        if (isClosed()) return;
        const content = user.message.content;
        calls.prompts.push(typeof content === 'string' ? content : JSON.stringify(content));
        if (first && opts.initFirst !== null) yield opts.initFirst ?? sdk.init();
        first = false;
        for (const m of turns.shift() ?? [sdk.result(0)]) {
          if (isClosed()) return;
          yield m;
        }
      }
    };
    const gen = iterator();
    const q: QueryLike = {
      [Symbol.asyncIterator]: () => gen,
      interrupt: () => {
        calls.interrupts++;
        return Promise.resolve();
      },
      close: () => {
        state.closed = true;
        calls.closed = true;
      },
    };
    return q;
  };
  return { queryFn, calls };
}
