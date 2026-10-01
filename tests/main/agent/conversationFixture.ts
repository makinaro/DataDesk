import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEventInput } from '../../../src/shared/agent';
import { sdk } from './claude/fakeSdk';
import type { FakeResponse } from './openai/fakeOpenAI';

/**
 * One mocked conversation, written once and played through both orchestrators (Phase 7 "done
 * when"). A step is one model response: optional text, then tool calls or one delegation.
 */
interface ToolStep {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  result: string;
}
interface Step {
  text?: string;
  call?: ToolStep;
  delegate?: { id: string; agent: string; prompt: string; steps: Step[] };
}

const CHART_ID = '0b6f3c1e-2d4a-4f5b-8c9d-1e2f3a4b5c6d';

export const CONVERSATION = {
  question: 'Which region sold the most units? Show a chart.',
  steps: [
    {
      text: 'I will profile the sales data first.',
      delegate: {
        id: 'call_profile',
        agent: 'profiler',
        prompt: 'Profile the sales dataset: columns, row count, nulls.',
        steps: [
          {
            call: {
              id: 'call_schema',
              tool: 'get_schema',
              input: { name: 'sales' },
              result: 'sales: 3 columns',
            },
          },
          { text: 'sales has 1,200 rows: region, units, date. No nulls.' },
        ],
      },
    },
    {
      call: {
        id: 'call_sql',
        tool: 'run_sql',
        input: { sql: 'SELECT region, sum(units) AS units FROM sales GROUP BY 1 ORDER BY 2 DESC' },
        result: '4 rows\n{"rows":[["West",512]]}',
      },
    },
    {
      call: {
        id: 'call_chart',
        tool: 'create_chart',
        input: { title: 'Units by region', sql: 'SELECT region, sum(units) FROM sales GROUP BY 1' },
        result: `Chart created: Units by region\n{"chartId":"${CHART_ID}","title":"Units by region"}`,
      },
    },
    { text: 'West sold the most units (512). [[chart:' + CHART_ID + ']]' },
  ] satisfies Step[],
};

const mcp = (tool: string) => `mcp__datadesk__${tool}`;

/** The conversation as Claude Agent SDK messages (one turn). */
export function claudeTurn(): SDKMessage[] {
  const out: SDKMessage[] = [];
  let n = 0;
  const play = (steps: Step[], parent: string | null) => {
    for (const step of steps) {
      const id = `msg_${String(++n)}`;
      const content: Record<string, unknown>[] = [];
      if (step.text) {
        out.push(sdk.messageStart(id, parent), sdk.textDelta(step.text, parent));
        content.push({ type: 'text', text: step.text });
      }
      if (step.call) {
        content.push({
          type: 'tool_use',
          id: step.call.id,
          name: mcp(step.call.tool),
          input: step.call.input,
        });
      }
      if (step.delegate) {
        content.push({
          type: 'tool_use',
          id: step.delegate.id,
          name: 'Agent',
          input: {
            subagent_type: step.delegate.agent,
            description: 'Profile',
            prompt: step.delegate.prompt,
          },
        });
      }
      out.push(sdk.assistant(id, content, parent));
      if (step.call) out.push(sdk.toolResult(step.call.id, step.call.result));
      if (step.delegate) {
        play(step.delegate.steps, step.delegate.id);
        const last = step.delegate.steps.at(-1)?.text ?? '';
        out.push(sdk.toolResult(step.delegate.id, last));
      }
    }
  };
  play(CONVERSATION.steps, null);
  out.push(sdk.result(0.02));
  return out;
}

/** The conversation as scripted OpenAI responses, per agent, plus datadesk-mcp's results. */
export function openaiScripts(): {
  scripts: Record<string, FakeResponse[]>;
  results: Record<string, string>;
} {
  const scripts: Record<string, FakeResponse[]> = {};
  const results: Record<string, string> = {};
  const play = (steps: Step[], agent: string) => {
    for (const step of steps) {
      const calls: NonNullable<FakeResponse['calls']> = [];
      if (step.call) {
        calls.push({ callId: step.call.id, name: mcp(step.call.tool), args: step.call.input });
        results[step.call.tool] = step.call.result;
      }
      if (step.delegate) {
        calls.push({
          callId: step.delegate.id,
          name: step.delegate.agent.replaceAll('-', '_'),
          args: { input: step.delegate.prompt },
        });
        play(step.delegate.steps, step.delegate.agent);
      }
      (scripts[agent] ??= []).push({ ...(step.text ? { text: step.text } : {}), calls });
    }
  };
  play(CONVERSATION.steps, 'analyst');
  return { scripts, results };
}

/**
 * What must match across providers: event kinds in order, tool names, delegations, results,
 * text and artifacts. Ids of messages, costs, timings and session details are provider-specific.
 */
export function normalize(events: AgentEventInput[]): string[] {
  return events.flatMap((e): string[] => {
    const lane = (parent: string | null) => (parent === null ? '' : ` @${parent}`);
    switch (e.kind) {
      case 'assistant_message':
        return [`message${lane(e.parentToolUseId)}: ${e.text}`];
      case 'tool_call': {
        const input = JSON.parse(e.input) as { subagent_type?: string };
        const detail = e.name === 'Agent' ? ` ${String(input.subagent_type)}` : ` ${e.input}`;
        return [`call ${e.toolUseId}${lane(e.parentToolUseId)}: ${e.name}${detail}`];
      }
      case 'tool_result':
        return [`result ${e.toolUseId}${e.isError ? ' (error)' : ''}: ${e.output}`];
      case 'artifact':
        return [`artifact ${e.artifactKind} ${e.id} ${e.title}`];
      case 'turn_complete':
        return [`turn ${e.ok ? 'ok' : 'failed'} ${e.reason}`];
      case 'error':
        return [`error ${e.message}`];
      default:
        return [];
    }
  });
}
