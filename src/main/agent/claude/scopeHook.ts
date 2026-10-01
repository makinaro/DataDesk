import type { HookCallback, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';
import { isSubagentName, SUBAGENT_TOOLS } from './subagents';

/**
 * Decides whether a tool call made inside a sub-agent is within that agent's scope.
 * Returns null when allowed, or a reason to deny. Main-thread calls (no agent id) are not this
 * hook's business: the main thread's tools are enforced by the options, the init guard and
 * canUseTool.
 */
export function scopeViolation(call: {
  agentId: string | undefined;
  agentType: string | undefined;
  toolName: string;
}): string | null {
  if (call.agentId === undefined) return null;
  if (!isSubagentName(call.agentType)) {
    return `Sub-agent "${call.agentType ?? '?'}" is not a DataDesk agent; tool calls are blocked.`;
  }
  const allowed: readonly string[] = SUBAGENT_TOOLS[call.agentType];
  return allowed.includes(call.toolName)
    ? null
    : `${call.agentType} may not use ${call.toolName}. Return what you have to the main analyst instead.`;
}

const allow: HookJSONOutput = {};

/**
 * PreToolUse hook enforcing the sub-agent scope table (defense in depth on top of each
 * AgentDefinition's `tools`): e.g. report-writer can never run SQL even if the SDK handed it
 * the tool. Registered without a matcher so it sees every tool call.
 */
export const scopeHook: HookCallback = (input) => {
  if (input.hook_event_name !== 'PreToolUse') return Promise.resolve(allow);
  const reason = scopeViolation({
    agentId: input.agent_id,
    agentType: input.agent_type,
    toolName: input.tool_name,
  });
  if (reason === null) return Promise.resolve(allow);
  return Promise.resolve({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
};
