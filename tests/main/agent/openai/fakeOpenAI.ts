import type { Model, ModelRequest, StreamEvent } from '@openai/agents-core';
import type { MCPTool } from '../../../../src/main/agent/openai/analystAgents';
import type { OpenAISessionSetup } from '../../../../src/main/agent/openai/openaiOrchestrator';

/** One scripted model response: text and/or function calls, in output order. */
export interface FakeResponse {
  text?: string;
  calls?: { callId: string; name: string; args: Record<string, unknown> }[];
  usage?: { input: number; output: number; cached?: number };
}

/** Which script a request belongs to: the analyst, or a sub-agent (by its instructions). */
export function agentOf(request: ModelRequest): string {
  const instructions = request.systemInstructions ?? '';
  const match = /^You are DataDesk's (data profiler|SQL analyst|report writer)/.exec(instructions);
  if (!match) return 'analyst';
  return {
    'data profiler': 'profiler',
    'SQL analyst': 'sql-analyst',
    'report writer': 'report-writer',
  }[match[1] as 'data profiler' | 'SQL analyst' | 'report writer'];
}

/**
 * A scripted Responses model (CLAUDE.md: no real API calls in tests). Each agent pulls the next
 * response from its own script; requests are recorded for assertions. With `gate`, a response
 * waits for it (to test stop/abort mid-turn); it honours the request's abort signal.
 */
export function scriptedModel(
  scripts: Record<string, FakeResponse[]>,
  opts: { gate?: Promise<void> } = {},
) {
  const requests: { agent: string; request: ModelRequest }[] = [];
  let n = 0;
  const model: Model = {
    getResponse: () => Promise.reject(new Error('DataDesk always streams')),
    async *getStreamedResponse(request: ModelRequest): AsyncIterable<StreamEvent> {
      const agent = agentOf(request);
      requests.push({ agent, request });
      const response = scripts[agent]?.shift() ?? { text: 'done' };
      yield { type: 'response_started' };
      if (opts.gate) {
        await Promise.race([
          opts.gate,
          new Promise<void>((_, reject) => {
            request.signal?.addEventListener('abort', () => {
              reject(new Error('aborted'));
            });
          }),
        ]);
      }
      if (response.text) yield { type: 'output_text_delta', delta: response.text };
      const output = [
        ...(response.text
          ? [
              {
                type: 'message' as const,
                id: `msg_${String(++n)}`,
                role: 'assistant' as const,
                status: 'completed' as const,
                content: [{ type: 'output_text' as const, text: response.text }],
              },
            ]
          : []),
        ...(response.calls ?? []).map((c) => ({
          type: 'function_call' as const,
          id: `fc_${c.callId}`,
          callId: c.callId,
          name: c.name,
          arguments: JSON.stringify(c.args),
          status: 'completed' as const,
        })),
      ];
      const usage = response.usage ?? { input: 1000, output: 100 };
      yield {
        type: 'response_done',
        response: {
          id: `resp_${String(++n)}`,
          usage: {
            requests: 1,
            inputTokens: usage.input,
            outputTokens: usage.output,
            totalTokens: usage.input + usage.output,
            inputTokensDetails: { cached_tokens: usage.cached ?? 0 },
          },
          output,
        },
      };
    },
  };
  return { model, requests };
}

const schema = (properties: Record<string, unknown> = {}): MCPTool['inputSchema'] => ({
  type: 'object',
  properties,
  required: [],
  additionalProperties: false,
});

/** Every tool datadesk-mcp lists with an OpenAI key and no HF token. */
export const DATADESK_TOOLS = [
  'list_datasets',
  'get_schema',
  'sample_rows',
  'profile_column',
  'run_sql',
  'create_chart',
  'save_report',
  'register_dataset',
  'search_columns',
  'second_opinion',
];

/** An in-memory datadesk-mcp: answers each tool from `results` (or "ok"), records calls. */
export function fakeServer(
  results: Record<string, string | { text: string; isError: boolean }> = {},
  tools: string[] = DATADESK_TOOLS,
) {
  const calls: { name: string; args: Record<string, unknown> | null }[] = [];
  let closed = 0;
  const server: OpenAISessionSetup['server'] = {
    listTools: () =>
      Promise.resolve(
        tools.map((name) => ({ name, description: `${name} tool`, inputSchema: schema() })),
      ),
    callTool: (name, args) => {
      calls.push({ name, args });
      const result = results[name] ?? 'ok';
      const { text, isError } =
        typeof result === 'string' ? { text: result, isError: false } : result;
      return Promise.resolve(Object.assign([{ type: 'text', text }], { isError }));
    },
    close: () => {
      closed++;
      return Promise.resolve();
    },
  };
  return { server, calls, closed: () => closed };
}
