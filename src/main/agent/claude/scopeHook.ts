import type { HookCallback, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';
import { isSubagentTool } from '../../../shared/agent';
import { DelegationInput, isSubagentName, SUBAGENT_NAMES, SUBAGENT_TOOLS } from './subagents';

/**
 * Decides whether a tool call is allowed by the sub-agent rules. Returns null when allowed, or
 * a reason to deny (the model reads it and can adjust).
 *
 * - Inside a sub-agent: the call must be in that agent's row of the scope table.
 * - On the main thread: a delegation (Agent/Task) must name one of our agents and carry only
 *   subagent_type, description and prompt. This is enforced here, not only in canUseTool,
 *   because hooks fire for every tool call while canUseTool only runs when the CLI asks for a
 *   permission decision (not verified for the Agent tool; D-017).
 *
 * A call counts as main-thread only when *both* agent fields are absent, so a CLI that stops
 * sending agent_id fails closed instead of skipping the scope check.
 */
export function scopeViolation(call: {
  agentId: string | undefined;
  agentType: string | undefined;
  toolName: string;
  toolInput?: unknown;
}): string | null {
  if (call.agentId === undefined && call.agentType === undefined) {
    if (!isSubagentTool(call.toolName)) return null;
    return DelegationInput.strict().safeParse(call.toolInput).success
      ? null
      : `Delegate with only subagent_type (${SUBAGENT_NAMES.join(', ')}), description and prompt.`;
  }
  if (!isSubagentName(call.agentType)) {
    return `Sub-agent "${call.agentType ?? '?'}" is not a DataDesk agent; tool calls are blocked.`;
  }
  const allowed: readonly string[] = SUBAGENT_TOOLS[call.agentType];
  return allowed.includes(call.toolName)
    ? null
    : `${call.agentType} may not use ${call.toolName}. Return what you have to the main analyst instead.`;
}

const noDecision: HookJSONOutput = {};

/**
 * PreToolUse hook enforcing the sub-agent rules (defense in depth on top of each
 * AgentDefinition's `tools` and canUseTool): e.g. report-writer can never run SQL even if the
 * SDK handed it the tool. Registered without a matcher so it sees every tool call. It never
 * returns "allow": an allowed call still goes through the normal permission checks.
 */
export const scopeHook: HookCallback = (input) => {
  if (input.hook_event_name !== 'PreToolUse') return Promise.resolve(noDecision);
  const reason = scopeViolation({
    agentId: input.agent_id,
    agentType: input.agent_type,
    toolName: input.tool_name,
    toolInput: input.tool_input,
  });
  if (reason === null) return Promise.resolve(noDecision);
  return Promise.resolve({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
};
