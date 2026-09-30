import { z } from 'zod';

/**
 * Events streamed from the agent runtime (main) to the renderer on the `agent:event` channel.
 * Provider-neutral on purpose: the Claude orchestrator (Phase 2) and the OpenAI one (Phase 7)
 * both emit these, and the chat + timeline only ever consume these.
 */

const Base = {
  /** Monotonic per app run, so the renderer can order and de-duplicate. */
  seq: z.number().int().nonnegative(),
  at: z.number(),
};

/** Tool inputs/results are shown in the timeline; long values are truncated in main. */
const Preview = z.string().max(4_000);

export const AgentStatusSchema = z.enum(['idle', 'starting', 'running', 'stopping', 'error']);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentEventSchema = z.discriminatedUnion('kind', [
  z.object({ ...Base, kind: z.literal('status'), status: AgentStatusSchema }),
  z.object({
    ...Base,
    kind: z.literal('session'),
    sessionId: z.string(),
    model: z.string(),
    tools: z.array(z.string()).max(500),
    mcpServers: z.array(z.object({ name: z.string(), status: z.string() })).max(50),
  }),
  z.object({
    ...Base,
    kind: z.literal('text_delta'),
    messageId: z.string(),
    delta: z.string().max(100_000),
    parentToolUseId: z.string().nullable(),
  }),
  z.object({
    ...Base,
    kind: z.literal('assistant_message'),
    messageId: z.string(),
    text: z.string().max(1_000_000),
    parentToolUseId: z.string().nullable(),
  }),
  z.object({
    ...Base,
    kind: z.literal('tool_call'),
    toolUseId: z.string(),
    name: z.string(),
    input: Preview,
    parentToolUseId: z.string().nullable(),
  }),
  z.object({
    ...Base,
    kind: z.literal('tool_result'),
    toolUseId: z.string(),
    isError: z.boolean(),
    output: Preview,
  }),
  z.object({
    ...Base,
    kind: z.literal('approval_request'),
    requestId: z.string(),
    toolName: z.string(),
    title: z.string().max(200),
    detail: Preview,
  }),
  z.object({
    ...Base,
    kind: z.literal('approval_resolved'),
    requestId: z.string(),
    approved: z.boolean(),
  }),
  z.object({
    ...Base,
    kind: z.literal('turn_complete'),
    ok: z.boolean(),
    /** e.g. success, error_max_turns, error_max_budget_usd, interrupted */
    reason: z.string(),
    costUsd: z.number().nonnegative(),
    sessionCostUsd: z.number().nonnegative(),
    durationMs: z.number().nonnegative(),
    numTurns: z.number().int().nonnegative(),
  }),
  z.object({ ...Base, kind: z.literal('error'), message: z.string().max(2_000) }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentEventKind = AgentEvent['kind'];

/** An event before main stamps `seq` and `at`. */
export type AgentEventInput = AgentEvent extends infer E
  ? E extends AgentEvent
    ? Omit<E, 'seq' | 'at'>
    : never
  : never;

export const AgentSettingsSchema = z.strictObject({
  /** Model alias or full ID passed to the provider. */
  model: z.string().min(1).max(100),
  /** Hard cap on spend per conversation. */
  maxBudgetUsd: z.number().min(0.01).max(100),
  /** Agentic turns per user message. */
  maxTurns: z.number().int().min(1).max(200),
});
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  model: 'sonnet',
  maxBudgetUsd: 2,
  maxTurns: 30,
};

/** Truncates long strings for timeline previews (keeps IPC payloads bounded). */
export function preview(value: unknown, max = 4_000): string {
  const text =
    typeof value === 'string'
      ? value // JSON.stringify is typed as string but returns undefined for undefined/functions.
      : ((JSON.stringify(value) as string | undefined) ?? String(value));
  return text.length > max
    ? `${text.slice(0, max - 20)}… [+${String(text.length - max + 20)}]`
    : text;
}
