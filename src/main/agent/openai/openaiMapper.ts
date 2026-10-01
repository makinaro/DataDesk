import { randomUUID } from 'node:crypto';
import type { RunStreamEvent } from '@openai/agents-core';
import { preview, type AgentEventInput } from '../../../shared/agent';
import { artifactFromResult } from '../artifactEvents';
import { subagentForTool } from './analystAgents';
import type { ResponseUsage } from './pricing';

export interface OpenAIMapperOptions {
  /** Whether a tool call's result was an error (the tools record it; outputs carry no flag). */
  isError: (callId: string) => boolean;
  /** Every model response's usage, from the analyst and its sub-agents. */
  onUsage: (usage: ResponseUsage, parentCallId: string | null) => void;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function outputText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output && typeof output === 'object' && 'text' in output && typeof output.text === 'string') {
    return output.text;
  }
  return preview(output);
}

/**
 * Translates OpenAI Agents SDK stream events into provider-neutral AgentEvents. Events from a
 * sub-agent run arrive with the analyst's call id as parent (like Claude's parent_tool_use_id).
 *
 * A sub-agent call is reported as the neutral delegation `Agent {subagent_type, prompt}` (the
 * Claude shape), so the chat, timeline lanes and tests don't care which SDK ran it.
 */
export function createOpenAIMapper({ isError, onUsage }: OpenAIMapperOptions) {
  const prefix = randomUUID().slice(0, 8);
  let counter = 0;
  const current = new Map<string, string>(); // parent ('' = analyst) → streaming message id
  const toolNames = new Map<string, string>(); // call id → tool name

  const messageId = (key: string) => {
    let id = current.get(key);
    if (id === undefined) {
      id = `${prefix}-${String(counter++)}`;
      current.set(key, id);
    }
    return id;
  };

  return (event: RunStreamEvent, parent: string | null): AgentEventInput[] => {
    const key = parent ?? '';
    if (event.type === 'raw_model_stream_event') {
      const data = event.data;
      if (data.type === 'response_started') {
        current.set(key, `${prefix}-${String(counter++)}`);
      } else if (data.type === 'output_text_delta') {
        return [
          {
            kind: 'text_delta',
            messageId: messageId(key),
            delta: data.delta,
            parentToolUseId: parent,
          },
        ];
      } else if (data.type === 'response_done') {
        onUsage(data.response.usage, parent);
      }
      return [];
    }
    if (event.type !== 'run_item_stream_event') return [];

    const item = event.item;
    if (event.name === 'message_output_created' && item.type === 'message_output_item') {
      const text = item.rawItem.content
        .map((c) => (c.type === 'output_text' ? c.text : c.type === 'refusal' ? c.refusal : ''))
        .filter(Boolean)
        .join('\n\n');
      if (!text) return [];
      return [
        { kind: 'assistant_message', messageId: messageId(key), text, parentToolUseId: parent },
      ];
    }
    if (event.name === 'tool_called' && item.type === 'tool_call_item') {
      const raw = item.rawItem;
      if (raw.type !== 'function_call') return [];
      const args = parseJson(raw.arguments);
      const delegation = parent === null ? subagentForTool(raw.name) : undefined;
      const name = delegation ? 'Agent' : raw.name;
      toolNames.set(raw.callId, name);
      const input = delegation
        ? {
            subagent_type: delegation,
            prompt: args && typeof args === 'object' && 'input' in args ? args.input : args,
          }
        : args;
      return [
        {
          kind: 'tool_call',
          toolUseId: raw.callId,
          name,
          input: preview(input),
          parentToolUseId: parent,
        },
      ];
    }
    if (event.name === 'tool_output' && item.type === 'tool_call_output_item') {
      const raw = item.rawItem;
      if (raw.type !== 'function_call_result') return [];
      const text = outputText(item.output);
      const failed = isError(raw.callId);
      const events: AgentEventInput[] = [
        { kind: 'tool_result', toolUseId: raw.callId, isError: failed, output: preview(text) },
      ];
      if (!failed) {
        const artifact = artifactFromResult(toolNames.get(raw.callId), text);
        if (artifact) events.push(artifact);
      }
      return events;
    }
    return [];
  };
}
