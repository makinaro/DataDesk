import type { AgentEventInput, ResetReason } from '../../shared/agent';

/**
 * The provider seam. The chat, timeline and IPC layer talk only to this interface, so the
 * OpenAI Agents SDK orchestrator (Phase 7) can be added without touching them.
 */
export interface Orchestrator {
  /** Queues a user turn. Starts the session lazily on first use. */
  send(text: string): void;
  /** Interrupts the current turn (the conversation continues). */
  stop(): Promise<void>;
  /** Ends the conversation (emits conversation_reset); the next send starts a fresh session. */
  reset(reason?: ResetReason): Promise<void>;
  dispose(): Promise<void>;
}

export type EmitAgentEvent = (event: AgentEventInput) => void;
