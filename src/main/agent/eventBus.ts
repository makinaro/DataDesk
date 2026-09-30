import { AgentEventSchema, type AgentEvent, type AgentEventInput } from '../../shared/agent';

/**
 * Stamps agent events with `seq`/`at`, validates them against the shared schema, and forwards
 * them to the renderer. An event that fails validation is dropped (and logged): a mapping bug
 * must never push unvalidated data across the process boundary.
 */
export function createEventBus(
  deliver: (event: AgentEvent) => void,
  logError: (message: string, detail?: unknown) => void = () => undefined,
  now: () => number = Date.now,
) {
  let seq = 0;
  return (input: AgentEventInput): void => {
    const parsed = AgentEventSchema.safeParse({ ...input, seq: seq++, at: now() });
    if (!parsed.success) {
      logError(`dropping invalid agent event (${input.kind})`, parsed.error.issues);
      return;
    }
    deliver(parsed.data);
  };
}
